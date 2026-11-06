/**
 * Corporate Affairs — MultiSarv Pvt. Ltd. che confidential legal / ownership records
 * (company profile, directors, shareholders, capital, investors, documents, meetings,
 * compliance, assets & IP, related parties).
 *
 * Access FAKT super admin (`requireSuper`: claim + active `admins` doc). Firestore rules
 * `corp_*` la client access detch nahit — sagle reads / writes ya callables madhun.
 * Pratyek badal `corp_history` madhe (kon, kevha, kay badalla, snapshot); delete nahi —
 * archive / restore, mhanun shareholding, investment ani company badalancha itihas tikto.
 */
import { randomUUID } from "node:crypto";

import { Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { KIND_MAP, KINDS, PATTERNS, SECTIONS, type Field, type Kind, type KindDef } from "./corporateSchema.js";
import { callable, db, fail, now, requireSuper, type AdminDoc } from "./shared.js";

type By = { uid: string; me: AdminDoc };
type Data = Record<string, unknown>;
type Row = Data & { id: string };

const SINGLETON_ID = "profile";
const MAX_FILES = 50;
/** Storage rules sobat same. */
const MAX_FILE_MB = 25;
/** Ek kind che kamal records ekdach vachto (filter / search / report memory madhe). */
const LOAD_LIMIT = 5000;

const col = (kind: Kind) => db.collection(`corp_${kind}`);
const history = db.collection("corp_history");

function kindOf(v: unknown): KindDef {
  const def = typeof v === "string" ? KIND_MAP[v as Kind] : undefined;
  if (!def) fail("invalid-argument", "corpBadKind");
  return def!;
}

function idOf(v: unknown): string {
  if (typeof v !== "string" || !/^[\w-]{1,64}$/.test(v)) fail("invalid-argument", "corpNotFound");
  return v as string;
}

/** Field chuk — client field cha naav dakhavto (`details.field`). */
const badField = (field: string): never => {
  throw new HttpsError("invalid-argument", "core.err.corpBadField", { field });
};

// ── Dates (IST) ──────────────────────────────────────────────────────

/** Aajchi tarikh IST madhe `YYYY-MM-DD`. */
const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const daysBetween = (from: string, to: string) => Math.round((dayMs(to) - dayMs(from)) / 86_400_000);

function addMonths(d: string, months: number): string {
  const [y, m, day] = d.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  // 31 Jan + 1 mahina = 28/29 Feb (mahinyacha shevatcha divas).
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

/** Indian FY (April–March) cha pahila divas. */
function fyStart(today: string): string {
  const [y, m] = today.split("-").map(Number);
  return `${m >= 4 ? y : y - 1}-04-01`;
}

// ── Validation ───────────────────────────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s()-]{6,20}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Ek field — rikama = null; chuk = `corpBadField`. */
function parseField(f: Field, raw: unknown): unknown {
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    if (f.required && f.type !== "bool") badField(f.key);
    return f.type === "bool" ? false : null;
  }
  switch (f.type) {
    case "text":
    case "textarea": {
      if (typeof raw !== "string") return badField(f.key);
      let s = raw.trim();
      if (s.length > (f.max ?? (f.type === "text" ? 200 : 5000))) badField(f.key);
      if (f.pattern) {
        s = s.toUpperCase().replace(/\s+/g, "");
        if (!new RegExp(PATTERNS[f.pattern]).test(s)) badField(f.key);
      }
      return s;
    }
    case "email": {
      const s = String(raw).trim().toLowerCase();
      if (s.length > 120 || !EMAIL.test(s)) badField(f.key);
      return s;
    }
    case "phone": {
      const s = String(raw).trim();
      if (!PHONE.test(s)) badField(f.key);
      return s;
    }
    case "url": {
      let s = String(raw).trim();
      if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
      if (s.length > 300 || !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(s)) badField(f.key);
      return s;
    }
    case "number":
    case "money":
    case "percent": {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
      if (!Number.isFinite(n) || n < 0 || n > 1e15) badField(f.key);
      if (f.type === "percent" && n > 100) badField(f.key);
      return f.type === "money" ? Math.round(n * 100) / 100 : n;
    }
    case "date": {
      const s = String(raw).trim();
      if (!DATE.test(s) || Number.isNaN(dayMs(s)) || new Date(dayMs(s)).toISOString().slice(0, 10) !== s) badField(f.key);
      return s;
    }
    case "select": {
      if (!f.options?.some((o) => o.value === raw)) badField(f.key);
      return raw;
    }
    case "bool":
      return raw === true || raw === "true";
    case "ref":
      return idOf(raw);
  }
}

function parseData(def: KindDef, input: unknown): Data {
  const src = (input && typeof input === "object" ? input : {}) as Data;
  const out: Data = {};
  for (const f of def.fields) out[f.key] = parseField(f, src[f.key]);
  return out;
}

/** Ref fields — record asla pahije ani archive nasla pahije. */
async function checkRefs(def: KindDef, data: Data) {
  await Promise.all(
    def.fields
      .filter((f) => f.type === "ref" && data[f.key])
      .map(async (f) => {
        const snap = await col(f.ref!).doc(String(data[f.key])).get();
        if (!snap.exists || snap.get("archived") === true) badField(f.key);
      }),
  );
}

// ── Shares (cap table) ───────────────────────────────────────────────

interface Txn {
  id: string;
  type: string;
  fromHolder: string | null;
  toHolder: string | null;
  shares: number;
  shareClass: string;
  amount: number;
  date: string;
}

async function loadTxns(): Promise<Txn[]> {
  const snap = await col("shareTxns").where("archived", "==", false).limit(LOAD_LIMIT).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Txn, "id">) }));
}

/** Holder → class → shares. */
function balances(txns: Txn[]) {
  const out = new Map<string, Map<string, number>>();
  const add = (h: string | null, cls: string, n: number) => {
    if (!h) return;
    const m = out.get(h) ?? new Map<string, number>();
    m.set(cls, (m.get(cls) ?? 0) + n);
    out.set(h, m);
  };
  for (const t of txns) {
    add(t.toHolder, t.shareClass, t.shares);
    add(t.fromHolder, t.shareClass, -t.shares);
  }
  return out;
}

/** Badal kelyavar kontyahi holder che shares minus hou naye (transfer > holding). */
function assertBalances(txns: Txn[]) {
  for (const m of balances(txns).values()) for (const n of m.values()) if (n < 0) fail("failed-precondition", "corpShareBalance");
}

// ── Per-kind rules ───────────────────────────────────────────────────

async function applyRules(def: KindDef, data: Data, id: string | null) {
  switch (def.kind) {
    case "directors":
      if (data.resignationDate && data.appointmentDate && String(data.resignationDate) < String(data.appointmentDate)) badField("resignationDate");
      if (data.resignationDate && data.status === "active") data.status = "resigned";
      break;
    case "shareTxns": {
      const n = Number(data.shares);
      if (!Number.isInteger(n) || n <= 0) badField("shares");
      const type = String(data.type);
      const needsFrom = ["transfer", "transmission", "buyback"].includes(type);
      const needsTo = type !== "buyback";
      if (needsFrom && !data.fromHolder) badField("fromHolder");
      if (!needsFrom) data.fromHolder = null;
      if (needsTo && !data.toHolder) badField("toHolder");
      if (!needsTo) data.toHolder = null;
      if (data.fromHolder && data.fromHolder === data.toHolder) badField("toHolder");
      if (data.distinctiveFrom != null && data.distinctiveTo != null && Number(data.distinctiveTo) < Number(data.distinctiveFrom)) badField("distinctiveTo");
      if (data.amount == null && data.pricePerShare != null) data.amount = Math.round(n * Number(data.pricePerShare) * 100) / 100;
      const txns = (await loadTxns()).filter((t) => t.id !== id);
      assertBalances([...txns, { id: id ?? "new", ...(data as Omit<Txn, "id">) }]);
      break;
    }
    case "capital":
      if (Number(data.paidUpCapital) > Number(data.authorizedCapital)) badField("paidUpCapital");
      break;
    case "investorPayments":
      if (!(Number(data.amount) > 0)) badField("amount");
      break;
    case "compliance": {
      const days = data.reminderDays == null ? 7 : Number(data.reminderDays);
      if (!Number.isInteger(days) || days > 365) badField("reminderDays");
      data.reminderDays = days;
      if (data.status === "filed" && !data.filedDate) data.filedDate = todayIst();
      if (!data.recurrence) data.recurrence = "none";
      break;
    }
    case "assets":
      if (data.renewalDate && data.registrationDate && String(data.renewalDate) < String(data.registrationDate)) badField("renewalDate");
      break;
    case "documents":
      if (data.expiryDate && data.issueDate && String(data.expiryDate) < String(data.issueDate)) badField("expiryDate");
      break;
    default:
      break;
  }
}

// ── Serialization / display ──────────────────────────────────────────

const millis = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : typeof v === "number" ? v : null);

function serialize(id: string, d: Data): Row {
  const files = Array.isArray(d.files)
    ? (d.files as Data[]).map((f) => ({ ...f, uploadedAt: millis(f.uploadedAt) }))
    : [];
  return { ...d, id, files, createdAt: millis(d.createdAt), updatedAt: millis(d.updatedAt), archivedAt: millis(d.archivedAt) };
}

const optionLabel = (f: Field | undefined, v: unknown) => f?.options?.find((o) => o.value === v)?.label ?? String(v ?? "");

/** Record che naav — list, ref dropdown, history. */
function titleOf(def: KindDef, d: Data): string {
  const f = def.fields.find((x) => x.key === def.titleField);
  const v = d[def.titleField];
  const main = f?.type === "select" ? optionLabel(f, v) : String(v ?? "").trim();
  if (def.kind === "shareTxns") {
    const type = optionLabel(def.fields.find((x) => x.key === "type"), d.type);
    return [type, `${Number(d.shares ?? 0).toLocaleString("en-IN")} shares`, d.date, main && `#${main}`].filter(Boolean).join(" · ");
  }
  if (def.kind === "investorPayments" || def.kind === "rpTransactions") {
    const amt = `₹${Number(d.amount ?? 0).toLocaleString("en-IN")}`;
    return [amt, d.date, main].filter(Boolean).join(" · ");
  }
  if (def.kind === "capital" || def.kind === "valuations") return [main, d.date].filter(Boolean).join(" · ");
  if (def.kind === "resolutions" && d.number) return `${d.number} — ${main}`;
  return main || def.singular;
}

type TitleMaps = Partial<Record<Kind, Map<string, string>>>;

async function titleMaps(kinds: Kind[]): Promise<TitleMaps> {
  const out: TitleMaps = {};
  await Promise.all(
    [...new Set(kinds)].map(async (k) => {
      const snap = await col(k).limit(LOAD_LIMIT).get();
      out[k] = new Map(snap.docs.map((d) => [d.id, titleOf(KIND_MAP[k], d.data())]));
    }),
  );
  return out;
}

/** Server ne mojlele fields (shares %, received, overdue …) ani ref che naav (`_refs`). */
async function decorate(def: KindDef, rows: Row[]): Promise<Row[]> {
  const refKinds = def.fields.filter((f) => f.type === "ref").map((f) => f.ref!);
  const maps = await titleMaps(refKinds);
  const today = todayIst();

  let extra: (r: Row) => Data = () => ({});
  if (def.kind === "shareholders") {
    const txns = await loadTxns();
    const bal = balances(txns);
    const total = [...bal.values()].reduce((s, m) => s + [...m.values()].reduce((a, b) => a + b, 0), 0);
    const invested = new Map<string, number>();
    for (const t of txns) if (t.toHolder && t.type !== "bonus") invested.set(t.toHolder, (invested.get(t.toHolder) ?? 0) + Number(t.amount ?? 0));
    extra = (r) => {
      const m = bal.get(r.id);
      const shares = m ? [...m.values()].reduce((a, b) => a + b, 0) : 0;
      return {
        shares,
        percent: total ? Math.round((shares / total) * 10000) / 100 : 0,
        invested: invested.get(r.id) ?? 0,
        byClass: m ? Object.fromEntries(m) : {},
      };
    };
  } else if (def.kind === "investors") {
    const pays = await col("investorPayments").where("archived", "==", false).limit(LOAD_LIMIT).get();
    const got = new Map<string, number>();
    for (const p of pays.docs) if (p.get("status") === "received") got.set(p.get("investor"), (got.get(p.get("investor")) ?? 0) + Number(p.get("amount") ?? 0));
    extra = (r) => {
      const received = got.get(r.id) ?? 0;
      return { received, pending: Math.max(0, Number(r.commitment ?? 0) - received) };
    };
  } else if (def.kind === "relatedParties") {
    const txns = await col("rpTransactions").where("archived", "==", false).limit(LOAD_LIMIT).get();
    const sum = new Map<string, number>();
    for (const t of txns.docs) sum.set(t.get("party"), (sum.get(t.get("party")) ?? 0) + Number(t.get("amount") ?? 0));
    extra = (r) => ({ totalAmount: sum.get(r.id) ?? 0 });
  } else if (def.kind === "compliance") {
    extra = (r) => {
      const due = typeof r.dueDate === "string" ? r.dueDate : null;
      const daysLeft = due ? daysBetween(today, due) : null;
      return { daysLeft, overdue: r.status === "pending" && daysLeft !== null && daysLeft < 0 };
    };
  } else if (def.kind === "assets") {
    extra = (r) => ({ daysToRenewal: typeof r.renewalDate === "string" ? daysBetween(today, r.renewalDate) : null });
  }

  return rows.map((r) => {
    const refs: Record<string, string> = {};
    for (const f of def.fields) if (f.type === "ref" && r[f.key]) refs[f.key] = maps[f.ref!]?.get(String(r[f.key])) ?? "—";
    return { ...r, ...extra(r), _title: titleOf(def, r), _refs: refs };
  });
}

// ── History ──────────────────────────────────────────────────────────

const comparable = (v: unknown) => JSON.stringify(v ?? null);

function diff(def: KindDef, before: Data | null, after: Data) {
  return def.fields
    .filter((f) => comparable(before?.[f.key] ?? (f.type === "bool" ? false : null)) !== comparable(after[f.key]))
    .filter((f) => before || (after[f.key] !== null && after[f.key] !== false))
    .map((f) => ({ field: f.key, from: before?.[f.key] ?? null, to: after[f.key] ?? null }));
}

function logHistory(
  by: By,
  def: KindDef,
  recordId: string,
  title: string,
  action: string,
  extra: { changes?: unknown[]; snapshot?: Data; reason?: string; file?: Data } = {},
) {
  return history.add({
    kind: def.kind,
    section: def.section,
    recordId,
    recordTitle: title,
    action,
    changes: extra.changes ?? [],
    snapshot: extra.snapshot ?? null,
    reason: extra.reason ?? null,
    file: extra.file ?? null,
    by: by.uid,
    byName: by.me.name,
    byEmail: by.me.email,
    at: now(),
  });
}

const serializeHistory = (d: FirebaseFirestore.QueryDocumentSnapshot) => {
  const x = d.data();
  return { id: d.id, ...x, at: millis(x.at), snapshot: undefined };
};

// ── Callables ────────────────────────────────────────────────────────

/** Forms / tables sathi schema (web ani phone app). */
export const corpSchema = callable(async (req) => {
  await requireSuper(req);
  return { sections: SECTIONS, kinds: KINDS, patterns: PATTERNS };
});

async function loadAll(def: KindDef, archived: boolean): Promise<Row[]> {
  const snap = await col(def.kind).where("archived", "==", archived).limit(LOAD_LIMIT).get();
  return snap.docs.map((d) => serialize(d.id, d.data()));
}

const searchable = (def: KindDef) => def.fields.filter((f) => ["text", "textarea", "email", "phone", "url", "select"].includes(f.type));

/**
 * List — search (text fields + ref naave), filters, date range, archived, sort, page.
 * `limit` 100 paryant; `all: true` = CSV export (filter lavlele sagle).
 */
export const corpList = callable<{
  kind?: string;
  q?: string;
  filters?: Record<string, unknown>;
  from?: string;
  to?: string;
  archived?: boolean;
  sort?: string;
  dir?: "asc" | "desc";
  offset?: number;
  limit?: number;
  all?: boolean;
}>(async (req) => {
  await requireSuper(req);
  const def = kindOf(req.data.kind);
  let rows = await decorate(def, await loadAll(def, req.data.archived === true));

  const q = typeof req.data.q === "string" ? req.data.q.trim().toLowerCase() : "";
  if (q) {
    const fields = searchable(def);
    rows = rows.filter((r) => {
      const hay = [
        r.id,
        r._title,
        ...fields.map((f) => (f.type === "select" ? optionLabel(f, r[f.key]) : r[f.key])),
        ...Object.values((r._refs ?? {}) as Record<string, string>),
      ];
      return hay.some((v) => typeof v === "string" && v.toLowerCase().includes(q));
    });
  }

  const filters = req.data.filters && typeof req.data.filters === "object" ? req.data.filters : {};
  for (const [key, want] of Object.entries(filters)) {
    if (want === undefined || want === null || want === "") continue;
    const f = def.fields.find((x) => x.key === key && x.filter);
    const c = def.computed?.find((x) => x.key === key && x.type === "bool");
    if (!f && !c) continue;
    const isBool = (f?.type ?? c?.type) === "bool";
    rows = rows.filter((r) => (isBool ? (r[key] === true) === (want === true || want === "true") : r[key] === want));
  }

  if (def.dateField) {
    const from = typeof req.data.from === "string" && DATE.test(req.data.from) ? req.data.from : null;
    const to = typeof req.data.to === "string" && DATE.test(req.data.to) ? req.data.to : null;
    if (from || to) {
      const k = def.dateField;
      rows = rows.filter((r) => typeof r[k] === "string" && (!from || (r[k] as string) >= from) && (!to || (r[k] as string) <= to));
    }
  }

  const sortKey =
    typeof req.data.sort === "string" && [...def.fields, ...(def.computed ?? [])].some((f) => f.key === req.data.sort) ? req.data.sort : def.sortField;
  const dir = req.data.dir === "asc" ? 1 : req.data.dir === "desc" ? -1 : def.dateField || def.sortField !== def.titleField ? -1 : 1;
  rows.sort((a, b) => {
    const x = a[sortKey];
    const y = b[sortKey];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en", { numeric: true });
    return c * dir;
  });

  const totals: Record<string, number> = {};
  for (const f of [...def.fields, ...(def.computed ?? [])]) {
    if (f.type === "money") totals[f.key] = rows.reduce((s, r) => s + (Number(r[f.key]) || 0), 0);
  }
  if (def.kind === "shareTxns" || def.kind === "shareholders") totals.shares = rows.reduce((s, r) => s + (Number(r.shares) || 0), 0);

  const total = rows.length;
  if (req.data.all === true) return { rows: rows.slice(0, LOAD_LIMIT), total, offset: 0, totals };
  const limit = Math.min(Math.max(Number(req.data.limit) || 25, 1), 100);
  const offset = Math.max(Number(req.data.offset) || 0, 0);
  return { rows: rows.slice(offset, offset + limit), total, offset, totals };
});

/** Ref dropdown — active records che id + naav. */
export const corpOptions = callable<{ kind?: string }>(async (req) => {
  await requireSuper(req);
  const def = kindOf(req.data.kind);
  const snap = await col(def.kind).where("archived", "==", false).limit(LOAD_LIMIT).get();
  return snap.docs.map((d) => ({ id: d.id, title: titleOf(def, d.data()) })).sort((a, b) => a.title.localeCompare(b.title));
});

/** Ek record + tyacha itihas + tyala jodlele records (shareholder → transactions …). */
export const corpGet = callable<{ kind?: string; id?: string }>(async (req) => {
  await requireSuper(req);
  const def = kindOf(req.data.kind);
  const id = def.singleton ? SINGLETON_ID : idOf(req.data.id);
  const snap = await col(def.kind).doc(id).get();
  if (!snap.exists) {
    if (def.singleton) return { record: null, history: [], related: [] };
    fail("not-found", "corpNotFound");
  }
  const [record] = await decorate(def, [serialize(snap.id, snap.data()!)]);

  const hist = await history.where("recordId", "==", id).limit(500).get();
  const items = hist.docs
    .filter((d) => d.get("kind") === def.kind)
    .map(serializeHistory)
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));

  const related = await Promise.all(
    KINDS.flatMap((k) => k.fields.filter((f) => f.type === "ref" && f.ref === def.kind).map((f) => ({ k, f }))).map(async ({ k, f }) => {
      const s = await col(k.kind).where(f.key, "==", id).limit(500).get();
      const rows = s.docs.map((d) => serialize(d.id, d.data())).filter((r) => r.archived !== true);
      return { kind: k.kind, field: f.key, rows: await decorate(k, rows) };
    }),
  );
  return { record, history: items, related: related.filter((r) => r.rows.length) };
});

/** Navin / edit. Company Profile = ekach record. */
export const corpSave = callable<{ kind?: string; id?: string | null; data?: unknown }>(async (req) => {
  const by = await requireSuper(req);
  const def = kindOf(req.data.kind);
  const data = parseData(def, req.data.data);
  const id = def.singleton ? SINGLETON_ID : req.data.id ? idOf(req.data.id) : null;

  const ref = id ? col(def.kind).doc(id) : col(def.kind).doc();
  const snap = id ? await ref.get() : null;
  if (id && !def.singleton && !snap?.exists) fail("not-found", "corpNotFound");
  if (snap?.exists && snap.get("archived") === true) fail("failed-precondition", "corpArchived");
  const before = snap?.exists ? (snap.data() as Data) : null;

  await checkRefs(def, data);
  await applyRules(def, data, id);

  const changes = diff(def, before, data);
  if (before && !changes.length) return { id: ref.id, changed: false };

  const meta = { updatedAt: now(), updatedBy: by.uid, updatedByName: by.me.name };
  if (before) await ref.set({ ...data, ...meta }, { merge: true });
  else await ref.set({ ...data, ...meta, files: [], archived: false, createdAt: now(), createdBy: by.uid, createdByName: by.me.name });

  const title = titleOf(def, data);
  await logHistory(by, def, ref.id, title, before ? "update" : "create", { changes, snapshot: data });

  // Recurring compliance — filed zala ki pudhcha due item apoaap.
  let nextId: string | null = null;
  if (def.kind === "compliance" && data.status === "filed" && before?.status !== "filed" && data.recurrence && data.recurrence !== "none") {
    const months = { monthly: 1, quarterly: 3, halfYearly: 6, yearly: 12 }[String(data.recurrence)] ?? 0;
    if (months) {
      const next: Data = {
        ...Object.fromEntries(def.fields.map((f) => [f.key, f.type === "bool" ? false : null])),
        title: data.title,
        form: data.form,
        authority: data.authority,
        responsible: data.responsible,
        reminderDays: data.reminderDays,
        recurrence: data.recurrence,
        fees: data.fees,
        dueDate: addMonths(String(data.dueDate), months),
        status: "pending",
        notes: `Auto-created after filing of "${title}" (${data.dueDate}).`,
      };
      const nref = col("compliance").doc();
      await nref.set({ ...next, ...meta, files: [], archived: false, createdAt: now(), createdBy: by.uid, createdByName: by.me.name });
      await logHistory(by, def, nref.id, String(next.title), "create", { changes: diff(def, null, next), snapshot: next, reason: "recurrence" });
      nextId = nref.id;
    }
  }
  return { id: ref.id, changed: true, nextId };
});

/** Archive (delete aivaji) / restore — itihas tikto. Vapar chalu asel tar archive nahi. */
export const corpArchive = callable<{ kind?: string; id?: string; archived?: boolean; reason?: string }>(async (req) => {
  const by = await requireSuper(req);
  const def = kindOf(req.data.kind);
  if (def.singleton) fail("failed-precondition", "corpNotPossible");
  const id = idOf(req.data.id);
  const archived = req.data.archived !== false;
  const reason = typeof req.data.reason === "string" ? req.data.reason.trim().slice(0, 300) : "";
  const ref = col(def.kind).doc(id);
  const snap = await ref.get();
  if (!snap.exists) fail("not-found", "corpNotFound");
  const d = snap.data() as Data;
  if ((d.archived === true) === archived) return { ok: true };

  if (archived) {
    // He record dusre active records vaparat asel (shareholder → transactions) tar adhi te.
    for (const k of KINDS) {
      for (const f of k.fields.filter((x) => x.type === "ref" && x.ref === def.kind)) {
        const used = await col(k.kind).where(f.key, "==", id).where("archived", "==", false).limit(1).get();
        if (!used.empty) fail("failed-precondition", "corpInUse");
      }
    }
  } else {
    await checkRefs(def, d);
  }
  if (def.kind === "shareTxns") {
    const txns = (await loadTxns()).filter((t) => t.id !== id);
    assertBalances(archived ? txns : [...txns, { id, ...(d as Omit<Txn, "id">) }]);
  }

  await ref.set(
    archived
      ? { archived: true, archivedAt: now(), archivedBy: by.uid, archiveReason: reason || null, updatedAt: now(), updatedBy: by.uid, updatedByName: by.me.name }
      : { archived: false, archivedAt: null, archivedBy: null, archiveReason: null, updatedAt: now(), updatedBy: by.uid, updatedByName: by.me.name },
    { merge: true },
  );
  await logHistory(by, def, id, titleOf(def, d), archived ? "archive" : "restore", { reason });
  return { ok: true };
});

/** Audit log — sagle Corporate Affairs badal (filter: kind / record / action / kon / tarikh). */
export const corpHistory = callable<{
  kind?: string;
  id?: string;
  action?: string;
  by?: string;
  q?: string;
  from?: string;
  to?: string;
  offset?: number;
  limit?: number;
}>(async (req) => {
  await requireSuper(req);
  const snap = req.data.id
    ? await history.where("recordId", "==", idOf(req.data.id)).limit(2000).get()
    : await history.orderBy("at", "desc").limit(3000).get();
  let rows = snap.docs.map(serializeHistory).sort((a, b) => (b.at ?? 0) - (a.at ?? 0)) as (Data & { at: number | null })[];
  if (typeof req.data.kind === "string" && req.data.kind) rows = rows.filter((r) => r.kind === req.data.kind);
  if (typeof req.data.action === "string" && req.data.action) rows = rows.filter((r) => r.action === req.data.action);
  if (typeof req.data.by === "string" && req.data.by) rows = rows.filter((r) => r.by === req.data.by);
  const q = typeof req.data.q === "string" ? req.data.q.trim().toLowerCase() : "";
  if (q) rows = rows.filter((r) => [r.recordTitle, r.byName, r.byEmail, r.recordId].some((v) => typeof v === "string" && v.toLowerCase().includes(q)));
  const from = typeof req.data.from === "string" && DATE.test(req.data.from) ? dayMs(req.data.from) - 5.5 * 3600_000 : null;
  const to = typeof req.data.to === "string" && DATE.test(req.data.to) ? dayMs(req.data.to) + 86_400_000 - 5.5 * 3600_000 : null;
  if (from !== null) rows = rows.filter((r) => (r.at ?? 0) >= from);
  if (to !== null) rows = rows.filter((r) => (r.at ?? 0) < to);
  const limit = Math.min(Math.max(Number(req.data.limit) || 50, 1), 500);
  const offset = Math.max(Number(req.data.offset) || 0, 0);
  return { rows: rows.slice(offset, offset + limit), total: rows.length, offset };
});

// ── Files (Storage `corporate/{kind}/{id}/…`) ────────────────────────

/** Client ne upload kelela file record la jodto (path / size server tapasto). */
export const corpAttach = callable<{ kind?: string; id?: string; path?: string; name?: string }>(async (req) => {
  const by = await requireSuper(req);
  const def = kindOf(req.data.kind);
  const id = def.singleton ? SINGLETON_ID : idOf(req.data.id);
  const path = typeof req.data.path === "string" ? req.data.path : "";
  if (!path.startsWith(`corporate/${def.kind}/${id}/`) || path.includes("..")) fail("invalid-argument", "corpBadFile");
  const ref = col(def.kind).doc(id);
  const snap = await ref.get();
  if (!snap.exists) fail("not-found", "corpNotFound");
  if (snap.get("archived") === true) fail("failed-precondition", "corpArchived");
  const files = (snap.get("files") as Data[] | undefined) ?? [];
  if (files.length >= MAX_FILES) fail("failed-precondition", "corpTooManyFiles");
  if (files.some((f) => f.path === path)) return { ok: true };

  const object = getStorage().bucket().file(path);
  const [exists] = await object.exists();
  if (!exists) fail("invalid-argument", "corpBadFile");
  const [meta] = await object.getMetadata();
  const size = Number(meta.size ?? 0);
  if (!size || size > MAX_FILE_MB * 1024 * 1024) fail("invalid-argument", "corpBadFile");
  const name = (typeof req.data.name === "string" && req.data.name.trim() ? req.data.name.trim() : path.split("/").pop()!).slice(0, 200);

  const file = { id: randomUUID(), name, path, size, type: String(meta.contentType ?? "application/octet-stream"), uploadedAt: Timestamp.now(), by: by.uid, byName: by.me.name };
  await ref.update({ files: [...files, file], updatedAt: now(), updatedBy: by.uid, updatedByName: by.me.name });
  await logHistory(by, def, id, titleOf(def, snap.data()!), "fileAdd", { file: { name, size, type: file.type } });
  return { ok: true, fileId: file.id };
});

export const corpDetach = callable<{ kind?: string; id?: string; fileId?: string }>(async (req) => {
  const by = await requireSuper(req);
  const def = kindOf(req.data.kind);
  const id = def.singleton ? SINGLETON_ID : idOf(req.data.id);
  const ref = col(def.kind).doc(id);
  const snap = await ref.get();
  if (!snap.exists) fail("not-found", "corpNotFound");
  if (snap.get("archived") === true) fail("failed-precondition", "corpArchived");
  const files = (snap.get("files") as Data[] | undefined) ?? [];
  const file = files.find((f) => f.id === req.data.fileId);
  if (!file) fail("not-found", "corpBadFile");
  await ref.update({ files: files.filter((f) => f !== file), updatedAt: now(), updatedBy: by.uid, updatedByName: by.me.name });
  await getStorage()
    .bucket()
    .file(String(file!.path))
    .delete()
    .catch((err) => logger.warn("corp file delete failed", { path: file!.path, err }));
  await logHistory(by, def, id, titleOf(def, snap.data()!), "fileRemove", { file: { name: file!.name, size: file!.size, type: file!.type } });
  return { ok: true };
});

/** File ughadnyaadhi — kon kevha pahila te audit madhe; client mag Storage (rules: super admin) madhun vachto. */
export const corpFileOpen = callable<{ kind?: string; id?: string; fileId?: string }>(async (req) => {
  const by = await requireSuper(req);
  const def = kindOf(req.data.kind);
  const id = def.singleton ? SINGLETON_ID : idOf(req.data.id);
  const snap = await col(def.kind).doc(id).get();
  if (!snap.exists) fail("not-found", "corpNotFound");
  const file = ((snap.get("files") as Data[] | undefined) ?? []).find((f) => f.id === req.data.fileId);
  if (!file) fail("not-found", "corpBadFile");
  await logHistory(by, def, id, titleOf(def, snap.data()!), "fileView", { file: { name: file!.name, size: file!.size, type: file!.type } });
  return { path: file!.path, name: file!.name, type: file!.type, size: file!.size };
});

// ── Reports ──────────────────────────────────────────────────────────

/** Overview / reports — cap table, capital, investors, compliance, renewals, RPT, recent activity. */
export const corpReport = callable(async (req) => {
  await requireSuper(req);
  const today = todayIst();
  const fy = fyStart(today);
  const active = async (k: Kind) => decorate(KIND_MAP[k], await loadAll(KIND_MAP[k], false));

  const [company, directors, shareholders, txns, capital, valuations, investors, compliance, assets, documents, rpts, meetings, recent] = await Promise.all([
    col("company").doc(SINGLETON_ID).get(),
    active("directors"),
    active("shareholders"),
    active("shareTxns"),
    active("capital"),
    active("valuations"),
    active("investors"),
    active("compliance"),
    active("assets"),
    active("documents"),
    active("rpTransactions"),
    active("meetings"),
    history.orderBy("at", "desc").limit(15).get(),
  ]);

  const byDateDesc = (a: Row, b: Row, k = "date") => String(b[k] ?? "").localeCompare(String(a[k] ?? ""));
  const totalShares = shareholders.reduce((s, r) => s + Number(r.shares ?? 0), 0);
  const classTotals: Record<string, number> = {};
  for (const r of shareholders) for (const [c, n] of Object.entries((r.byClass ?? {}) as Record<string, number>)) classTotals[c] = (classTotals[c] ?? 0) + n;

  const instr: Record<string, number> = {};
  for (const i of investors) instr[String(i.instrument)] = (instr[String(i.instrument)] ?? 0) + Number(i.commitment ?? 0);

  const rptFy = rpts.filter((r) => String(r.date ?? "") >= fy);
  const rptByNature: Record<string, number> = {};
  for (const r of rptFy) rptByNature[String(r.nature)] = (rptByNature[String(r.nature)] ?? 0) + Number(r.amount ?? 0);

  const pick = (r: Row, keys: string[]) => ({ id: r.id, _title: r._title, ...Object.fromEntries(keys.map((k) => [k, r[k] ?? null])) });

  return {
    today,
    fyStart: fy,
    company: company.exists ? { name: company.get("name") ?? "", cin: company.get("cin") ?? "", incorporationDate: company.get("incorporationDate") ?? null } : null,
    counts: {
      directors: directors.filter((d) => d.status === "active").length,
      shareholders: shareholders.filter((s) => Number(s.shares) > 0).length,
      investors: investors.filter((i) => i.status === "active").length,
      documents: documents.length,
      meetings: meetings.length,
      assets: assets.length,
    },
    capTable: {
      totalShares,
      classTotals,
      rows: shareholders
        .filter((s) => Number(s.shares) > 0)
        .sort((a, b) => Number(b.shares) - Number(a.shares))
        .map((s) => pick(s, ["name", "holderType", "shares", "percent", "invested", "byClass"])),
    },
    shareHistory: txns.sort((a, b) => byDateDesc(a, b)).slice(0, 20).map((t) => pick(t, ["type", "date", "shares", "shareClass", "amount", "_refs"])),
    capital: {
      latest: capital.sort((a, b) => byDateDesc(a, b))[0] ?? null,
      history: capital.slice(0, 50).map((c) => pick(c, ["date", "event", "authorizedCapital", "paidUpCapital", "faceValue"])),
    },
    valuation: {
      latest: valuations.sort((a, b) => byDateDesc(a, b))[0] ?? null,
      series: [...valuations].reverse().map((v) => ({ date: v.date, valuation: v.valuation, pricePerShare: v.pricePerShare ?? null })),
    },
    investors: {
      commitment: investors.reduce((s, i) => s + Number(i.commitment ?? 0), 0),
      received: investors.reduce((s, i) => s + Number(i.received ?? 0), 0),
      pending: investors.reduce((s, i) => s + Number(i.pending ?? 0), 0),
      byInstrument: instr,
    },
    compliance: {
      overdue: compliance.filter((c) => c.overdue).sort((a, b) => Number(a.daysLeft) - Number(b.daysLeft)).map((c) => pick(c, ["title", "form", "authority", "dueDate", "daysLeft"])),
      upcoming: compliance
        .filter((c) => c.status === "pending" && Number(c.daysLeft) >= 0 && Number(c.daysLeft) <= 30)
        .sort((a, b) => Number(a.daysLeft) - Number(b.daysLeft))
        .map((c) => pick(c, ["title", "form", "authority", "dueDate", "daysLeft"])),
      pending: compliance.filter((c) => c.status === "pending").length,
      filedThisFy: compliance.filter((c) => c.status === "filed" && String(c.filedDate ?? "") >= fy).length,
    },
    directors: {
      kycDue: directors.filter((d) => d.status === "active" && d.kycStatus !== "completed").map((d) => pick(d, ["name", "din", "kycStatus"])),
    },
    renewals: [
      ...assets
        .filter((a) => a.daysToRenewal !== null && Number(a.daysToRenewal) <= 60 && ["active", "pending"].includes(String(a.status)))
        .map((a) => ({ kind: "assets", id: a.id, _title: a._title, date: a.renewalDate, days: a.daysToRenewal, type: a.type })),
      ...documents
        .filter((d) => typeof d.expiryDate === "string" && daysBetween(today, d.expiryDate) <= 60)
        .map((d) => ({ kind: "documents", id: d.id, _title: d._title, date: d.expiryDate, days: daysBetween(today, String(d.expiryDate)), type: d.category })),
    ].sort((a, b) => Number(a.days) - Number(b.days)),
    relatedParty: { fyTotal: rptFy.reduce((s, r) => s + Number(r.amount ?? 0), 0), byNature: rptByNature, count: rptFy.length },
    recent: recent.docs.map(serializeHistory),
  };
});

// ── Reminders ────────────────────────────────────────────────────────

/**
 * Roj 9 vajta (IST) — due / overdue compliance, renewals, expiring documents, director KYC.
 * Sagle active super admins chya inbox madhe ek digest (divasala ekach — id = tarikh).
 */
export const corpReminders = onSchedule({ schedule: "0 9 * * *", timeZone: "Asia/Kolkata", region: "asia-south1", timeoutSeconds: 120 }, async () => {
  const today = todayIst();
  const [compliance, assets, documents, directors] = await Promise.all(
    (["compliance", "assets", "documents", "directors"] as Kind[]).map(async (k) => decorate(KIND_MAP[k], await loadAll(KIND_MAP[k], false))),
  );
  const fmt = (d: unknown) => (typeof d === "string" ? new Date(dayMs(d)).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }) : "");

  const overdue = compliance.filter((c) => c.overdue);
  const due = compliance.filter((c) => c.status === "pending" && !c.overdue && Number(c.daysLeft) <= Number(c.reminderDays ?? 7));
  const renewals = assets.filter((a) => a.daysToRenewal !== null && Number(a.daysToRenewal) >= 0 && Number(a.daysToRenewal) <= 30 && a.status === "active");
  const expiring = documents.filter((d) => typeof d.expiryDate === "string" && daysBetween(today, d.expiryDate) >= 0 && daysBetween(today, d.expiryDate) <= 30);
  const kyc = directors.filter((d) => d.status === "active" && (d.kycStatus === "pending" || d.kycStatus === "expired"));
  if (!overdue.length && !due.length && !renewals.length && !expiring.length && !kyc.length) return;

  const parts = [
    overdue.length && `Overdue: ${overdue.map((c) => `${c.form || c._title} (${fmt(c.dueDate)})`).join(", ")}`,
    due.length && `Due soon: ${due.map((c) => `${c.form || c._title} (${fmt(c.dueDate)})`).join(", ")}`,
    renewals.length && `Renewals: ${renewals.map((a) => `${a._title} (${fmt(a.renewalDate)})`).join(", ")}`,
    expiring.length && `Expiring documents: ${expiring.map((d) => `${d._title} (${fmt(d.expiryDate)})`).join(", ")}`,
    kyc.length && `Director KYC pending: ${kyc.map((d) => d._title).join(", ")}`,
  ].filter(Boolean) as string[];
  let body = parts.join(" · ");
  if (body.length > 500) body = body.slice(0, 497) + "…";
  const title = overdue.length ? `Corporate compliance: ${overdue.length} overdue` : "Corporate compliance reminder";

  const supers = await db.collection("admins").where("role", "==", "superAdmin").where("active", "==", true).get();
  const batch = db.batch();
  for (const s of supers.docs) {
    batch.set(s.ref.collection("inbox").doc(`corp-${today}`), {
      title,
      body,
      byName: "Corporate Affairs",
      type: "notice",
      link: overdue.length || due.length ? "/corporate/compliance" : "/corporate",
      isRead: false,
      createdAt: now(),
    });
  }
  await batch.commit();
  logger.info("corp reminders sent", { today, to: supers.size, overdue: overdue.length, due: due.length });
});
