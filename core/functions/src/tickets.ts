/**
 * Client Tickets (CLT-000001) ani Dev Tickets (DEV-000001).
 *
 * Sagle writes ithe — ID counter transaction madhe (unique, kramane),
 * status workflow ani Module Access permissions server var tapasle jatat.
 * Panel fakt vachto (core Firestore rules).
 */
import { logger } from "firebase-functions";
import type { CallableRequest } from "firebase-functions/v2/https";

import { getProject, MULTISARV_ID } from "./projects.js";
import { pushTo } from "./push.js";
import { callable, db, fail, hasModule, loadAdmin, now, str, type AdminDoc } from "./shared.js";

const KINDS = {
  client: { prefix: "CLT", module: "clientTickets", path: "/client-tickets", label: "Client ticket" },
  dev: { prefix: "DEV", module: "devTickets", path: "/dev-tickets", label: "Dev ticket" },
} as const;
type Kind = keyof typeof KINDS;

type Status = "open" | "inProcess" | "uat" | "closed" | "hold";

/** Open → In Process → UAT → Closed; UAT → In Process (fail); In Process / UAT ⇄ Hold. */
const NEXT: Record<Status, Status[]> = {
  open: ["inProcess"],
  inProcess: ["uat", "hold"],
  uat: ["inProcess", "closed", "hold"],
  closed: [],
  hold: ["inProcess"],
};

/** Dropdown kram: Medium (default), Low, High, Critical, Showstopper. */
const PRIORITIES = ["medium", "low", "high", "critical", "showstopper"] as const;
type Priority = (typeof PRIORITIES)[number];

const priorityOf = (v: unknown): Priority => {
  if (v === undefined || v === null || v === "") return "medium";
  if (!PRIORITIES.includes(v as Priority)) fail("invalid-argument", "badPriority");
  return v as Priority;
};

/**
 * Module = tya project che app menus (core `projects` → `menus`, NOAI che
 * MARKETPLACE_MENUS). Multisarv (core) la app modules nahit → nehmi null.
 */
async function moduleOf(projectId: string, v: unknown): Promise<string | null> {
  if (v === undefined || v === null || v === "") return null;
  const p = projectId === MULTISARV_ID ? null : await getProject(projectId);
  if (!p || typeof v !== "string" || !p.menus.includes(v)) fail("invalid-argument", "badModule");
  return v as string;
}

interface Person {
  uid: string;
  name: string;
  email: string;
}

const person = (uid: string, a: AdminDoc): Person => ({ uid, name: a.name, email: a.email });

function kindOf(v: unknown): Kind {
  if (v !== "client" && v !== "dev") fail("invalid-argument", "badTicketKind");
  return v as Kind;
}

async function requirePerm(req: CallableRequest<unknown>, kind: Kind, perm: string) {
  const uid = req.auth?.uid;
  if (!uid) fail("unauthenticated", "signIn");
  const me = await loadAdmin(uid!);
  if (!me?.active) fail("permission-denied", "disabled");
  if (!hasModule(me, KINDS[kind].module, perm)) fail("permission-denied", "ticketDenied");
  return { uid: uid!, me: me!, by: person(uid!, me!) };
}

// ── Dev Tickets scope (firestore.rules `devScope` sobat same) ──────────
//
// Super admin: sagle. Itar: ticket cha project tyala allowed (Module Access
// madhe menus, kinva Multisarv — sagle Core users) AANI (assign permission,
// kinva swatahla assigned, kinva swatah raise kelela). Client Tickets la lagu nahi.

/** Ha project ya admin la allowed (Multisarv sagle Core users sathi). */
const projectOk = (a: AdminDoc, projectId: string) => projectId === MULTISARV_ID || !!a.projects?.[projectId]?.length;

type TicketData = { kind?: string; projectId?: string; assignedTo?: Person | null; raisedBy?: Person | null };

export function devVisible(uid: string, me: AdminDoc, t: TicketData): boolean {
  if (t.kind !== "dev" || me.role === "superAdmin") return true;
  if (!projectOk(me, String(t.projectId ?? ""))) return false;
  return hasModule(me, "devTickets", "assign") || t.assignedTo?.uid === uid || t.raisedBy?.uid === uid;
}

/** Assign fakt tya module cha "view" asnarya active admin la (Dev: tya project cha access pan). */
async function assignee(kind: Kind, uid: unknown, projectId: string): Promise<Person | null> {
  if (uid === null || uid === undefined || uid === "") return null;
  const id = str(uid, "badAssignee", 1, 128);
  const a = await loadAdmin(id);
  if (!hasModule(a, KINDS[kind].module, "view")) fail("failed-precondition", "badAssignee");
  if (kind === "dev" && a!.role !== "superAdmin" && !projectOk(a!, projectId)) fail("failed-precondition", "badAssignee");
  return person(id, a!);
}

/** Multisarv (master panel swatah) kinva core la mahit asleli project. */
async function project(v: unknown): Promise<string> {
  if (v === MULTISARV_ID) return MULTISARV_ID;
  const p = await getProject(v);
  if (!p) fail("invalid-argument", "badProject");
  return p!.id;
}

const ticketRef = (id: unknown) => db.collection("tickets").doc(str(id, "ticketNotFound", 5, 20));

async function loadTicket(id: unknown, kind?: Kind) {
  const ref = ticketRef(id);
  const snap = await ref.get();
  if (!snap.exists || (kind && snap.get("kind") !== kind)) fail("not-found", "ticketNotFound");
  return { ref, data: snap.data()!, kind: snap.get("kind") as Kind };
}

/** Ticket + permission + Dev scope — ID badalun dusra ticket ughadta yet nahi. */
async function ticketFor(req: CallableRequest<unknown>, id: unknown, perm: string) {
  const t = await loadTicket(id);
  const p = await requirePerm(req, t.kind, perm);
  if (!devVisible(p.uid, p.me, t.data)) fail("permission-denied", "ticketDenied");
  return { ...t, ...p };
}

/** Comments / Updates thread — `type` comment kinva system update. */
const log = (
  ref: FirebaseFirestore.DocumentReference,
  by: Person,
  entry: { type: "created" | "comment" | "status" | "assign" | "edit"; text?: string; from?: string; to?: string },
) =>
  ref.collection("comments").add({
    // undefined (udaharanartha pahilya assign la `from`) Firestore la chalat nahi.
    ...Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined)),
    by,
    at: now(),
  });

// ── Notifications (bell inbox `admins/{uid}/inbox` + push) ──────────

const STATUS_LABEL: Record<Status, string> = { open: "Open", inProcess: "In Process", uat: "UAT", closed: "Closed", hold: "Hold" };
const PRIORITY_LABEL: Record<Priority, string> = { medium: "Medium", low: "Low", high: "High", critical: "Critical", showstopper: "Showstopper" };
/** Project menus (`projects.ts`) → naav. */
const MENU_LABEL: Record<string, string> = {
  dashboard: "Dashboard",
  users: "Users",
  kyc: "KYC",
  tasks: "Tasks",
  disputes: "Disputes",
  payouts: "Payouts",
  ledger: "Ledger",
  notifications: "Notifications",
  catalog: "Catalog",
  residents: "Residents",
  bills: "Maintenance bills",
  finance: "Expenses & income",
  visitors: "Visitors",
  notices: "Notices",
  complaints: "Complaints",
  contacts: "Emergency contacts",
};
const statusName = (s: unknown) => STATUS_LABEL[s as Status] ?? String(s ?? "");
const priorityName = (p: unknown) => PRIORITY_LABEL[p as Priority] ?? "Medium";
const moduleName = (m: unknown) => (typeof m === "string" && m ? (MENU_LABEL[m] ?? m) : "—");

async function projectName(id: unknown) {
  if (id === MULTISARV_ID) return "MultiSarv Core";
  return (await getProject(id))?.name ?? String(id ?? "");
}

type FullTicket = TicketData & { title?: string; priority?: string; module?: string | null; status?: string };

/** Ha user ha ticket pahu shakto ka — module "view" + Dev scope (rules / `ticketFor` sobat same). */
const canSee = (uid: string, a: AdminDoc | undefined, kind: Kind, t: FullTicket) => !!a && hasModule(a, KINDS[kind].module, "view") && devVisible(uid, a, t);

/**
 * Ticket badalla — sambandhit lokanna bell (inbox) + push. Recipients: raise karnara, assignee,
 * `extra` (juna assignee, mention), comment kelele; navin ticket la triage sathi `assign` permission
 * asnare. Pratyekache access tapasun — ticket disat nasel tar kahich nahi. Karnaryala nahi.
 */
async function notifyTicket(opts: {
  kind: Kind;
  id: string;
  ticket: FullTicket;
  by: Person;
  headline: string;
  /** "Amit changed the status from Open → In Process" */
  line: string;
  extra?: string[];
  triage?: boolean;
  /** uid → hyala vegla line (udaharanartha "assigned this ticket to you", "mentioned you"). */
  personal?: Record<string, string>;
}) {
  const { kind, id, ticket, by } = opts;
  try {
    const want = new Set<string>([...(opts.extra ?? []), ...Object.keys(opts.personal ?? {})]);
    if (ticket.raisedBy?.uid) want.add(ticket.raisedBy.uid);
    if (ticket.assignedTo?.uid) want.add(ticket.assignedTo.uid);
    // Charchet asnare (comment kelele).
    const comments = await db.collection("tickets").doc(id).collection("comments").where("type", "==", "comment").limit(300).get();
    for (const c of comments.docs) {
      const u = (c.get("by") as Person | undefined)?.uid;
      if (u) want.add(u);
    }

    const admins = await db.collection("admins").where("active", "==", true).get();
    const byId = new Map(admins.docs.map((d) => [d.id, d.data() as AdminDoc]));
    if (opts.triage) for (const [u, a] of byId) if (hasModule(a, KINDS[kind].module, "assign")) want.add(u);
    want.delete(by.uid);

    const recipients = [...want].filter((u) => canSee(u, byId.get(u), kind, ticket));
    if (!recipients.length) return;

    const project = await projectName(ticket.projectId);
    const details = [
      `Project: ${project}`,
      `Module: ${moduleName(ticket.module)}`,
      `Priority: ${priorityName(ticket.priority)}`,
      `Status: ${statusName(ticket.status)}`,
      `Assigned to: ${ticket.assignedTo?.name ?? "Unassigned"}`,
    ].join("\n");
    const title = `${opts.headline} — #${id}`;
    const link = `${KINDS[kind].path}/${id}`;

    for (let i = 0; i < recipients.length; i += 450) {
      const batch = db.batch();
      for (const u of recipients.slice(i, i + 450)) {
        const line = opts.personal?.[u] ?? opts.line;
        batch.set(db.collection("admins").doc(u).collection("inbox").doc(), {
          title,
          body: `${line}\n${ticket.title ?? ""}\n${details}`,
          byName: by.name,
          isRead: false,
          createdAt: now(),
          type: "ticket",
          ticketKind: kind,
          ticketId: id,
          link,
        });
      }
      await batch.commit();
    }
    await Promise.all(
      recipients.map((u) =>
        pushTo(u, {
          kind: "ticket",
          title,
          body: `${opts.personal?.[u] ?? opts.line} · ${ticket.title ?? ""}`.slice(0, 180),
          link,
          tag: `ticket-${id}`,
          ticketId: id,
        }),
      ),
    );
  } catch (err) {
    // Notification fail zala tari ticket che kaam zale ahe.
    logger.warn("ticket notify failed", { id, err });
  }
}

const readTicket = async (ref: FirebaseFirestore.DocumentReference) => (await ref.get()).data() as FullTicket;

// ── Callables ────────────────────────────────────────────────────────

export const raiseTicket = callable<{
  kind?: string;
  title?: string;
  description?: string;
  projectId?: string;
  assignee?: string | null;
  priority?: string;
  module?: string | null;
}>(async (req) => {
  const kind = kindOf(req.data.kind);
  const { me, by } = await requirePerm(req, kind, "raise");
  const title = str(req.data.title, "badTitle", 3, 150);
  const description = str(req.data.description, "badDescription", 3, 5000);
  const projectId = await project(req.data.projectId);
  if (kind === "dev" && me.role !== "superAdmin" && !projectOk(me, projectId)) fail("permission-denied", "badProject");
  const priority = priorityOf(req.data.priority);
  const module = await moduleOf(projectId, req.data.module);
  // Raise kartana assign — fakt assign permission asel tar.
  const assigned =
    req.data.assignee && hasModule(me, KINDS[kind].module, "assign") ? await assignee(kind, req.data.assignee, projectId) : null;

  const { prefix } = KINDS[kind];
  const counter = db.collection("counters").doc(`${kind}Tickets`);
  const id = await db.runTransaction(async (tx) => {
    const n = ((await tx.get(counter)).get("next") as number | undefined) ?? 1;
    const code = `${prefix}-${String(n).padStart(6, "0")}`;
    tx.set(counter, { next: n + 1 }, { merge: true });
    // Doc id = ticket ID → create() duplicate asel tar fail (unique guarantee).
    tx.create(db.collection("tickets").doc(code), {
      kind,
      number: n,
      title,
      description,
      projectId,
      priority,
      module,
      status: "open" satisfies Status,
      raisedBy: by,
      assignedTo: assigned,
      createdAt: now(),
      updatedAt: now(),
    });
    return code;
  });

  const ref = db.collection("tickets").doc(id);
  await log(ref, by, { type: "created" });
  if (assigned) await log(ref, by, { type: "assign", to: assigned.name });
  await notifyTicket({
    kind,
    id,
    ticket: await readTicket(ref),
    by,
    headline: "New Ticket Created",
    line: `${by.name} created a new ticket`,
    triage: true,
    personal: assigned && assigned.uid !== by.uid ? { [assigned.uid]: `${by.name} created a new ticket and assigned it to you` } : {},
  });
  return { id };
});

export const updateTicket = callable<{
  id?: string;
  title?: string;
  description?: string;
  projectId?: string;
  priority?: string;
  module?: string | null;
}>(
  async (req) => {
    const { ref, data, kind, me, by } = await ticketFor(req, req.data.id, "edit");
    const projectId = await project(req.data.projectId);
    if (kind === "dev" && projectId !== data.projectId) {
      // Navin project: editor la allowed, ani assignee la pan tyacha access.
      if (me.role !== "superAdmin" && !projectOk(me, projectId)) fail("permission-denied", "badProject");
      const a = (data.assignedTo as Person | null)?.uid;
      if (a) await assignee(kind, a, projectId);
    }
    const patch = {
      title: str(req.data.title, "badTitle", 3, 150),
      description: str(req.data.description, "badDescription", 3, 5000),
      projectId,
      // Juna client priority / module pathavat nasel tar te tasech rahtat.
      ...(req.data.priority !== undefined && { priority: priorityOf(req.data.priority) }),
      ...(req.data.module !== undefined && { module: await moduleOf(projectId, req.data.module) }),
    };
    await ref.update({ ...patch, updatedAt: now() });
    await log(ref, by, { type: "edit" });

    // Kay badalla — notification sathi.
    const changes: string[] = [];
    if (patch.title !== data.title) changes.push(`renamed the ticket from "${data.title}" to "${patch.title}"`);
    if (patch.description !== data.description) changes.push("updated the description");
    if (patch.projectId !== data.projectId) changes.push(`moved it from ${await projectName(data.projectId)} → ${await projectName(patch.projectId)}`);
    if (patch.priority !== undefined && patch.priority !== (data.priority ?? "medium")) {
      changes.push(`changed the priority from ${priorityName(data.priority)} → ${priorityName(patch.priority)}`);
    }
    if (patch.module !== undefined && (patch.module ?? null) !== (data.module ?? null)) {
      changes.push(`changed the module from ${moduleName(data.module)} → ${moduleName(patch.module)}`);
    }
    if (changes.length) {
      await notifyTicket({ kind, id: ref.id, ticket: await readTicket(ref), by, headline: "Ticket Updated", line: `${by.name} ${changes.join("; ")}` });
    }
    return { ok: true };
  },
);

export const assignTicket = callable<{ id?: string; assignee?: string | null }>(async (req) => {
  const { ref, data, kind, by } = await ticketFor(req, req.data.id, "assign");
  const next = await assignee(kind, req.data.assignee, String(data.projectId));
  const prev = (data.assignedTo as Person | null)?.uid ?? null;
  if ((next?.uid ?? null) === prev) return { ok: true };
  await ref.update({ assignedTo: next, updatedAt: now() });
  const before = data.assignedTo as Person | null;
  await log(ref, by, { type: "assign", from: before?.name, to: next?.name });
  const line = !next
    ? `${by.name} unassigned ${before?.name ?? "the ticket"}`
    : before
      ? `${by.name} reassigned the ticket from ${before.name} → ${next.name}`
      : `${by.name} assigned the ticket to ${next.name}`;
  await notifyTicket({
    kind,
    id: ref.id,
    ticket: await readTicket(ref),
    by,
    headline: before && next ? "Ticket Reassigned" : next ? "Ticket Assigned" : "Ticket Unassigned",
    line,
    // Juna assignee — ajun ticket disat asel tarach (canSee tapasto).
    extra: before ? [before.uid] : [],
    personal: {
      ...(next && next.uid !== by.uid && { [next.uid]: `${by.name} assigned this ticket to you` }),
      ...(before && before.uid !== by.uid && next && { [before.uid]: `${by.name} reassigned this ticket from you to ${next.name}` }),
    },
  });
  return { ok: true };
});

export const setTicketStatus = callable<{ id?: string; status?: string }>(async (req) => {
  const { ref, by } = await ticketFor(req, req.data.id, "status");
  const to = req.data.status as Status;
  const from = await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).get("status") as Status;
    if (!NEXT[cur]?.includes(to)) fail("failed-precondition", "badStatusMove");
    tx.update(ref, { status: to, updatedAt: now() });
    return cur;
  });
  await log(ref, by, { type: "status", from, to });
  const headline =
    to === "closed" ? "Ticket Closed" : to === "hold" ? "Ticket On Hold" : from === "hold" ? "Ticket Resumed" : from === "uat" && to === "inProcess" ? "Ticket Reopened" : "Ticket Status Changed";
  await notifyTicket({
    kind: (await ref.get()).get("kind") as Kind,
    id: ref.id,
    ticket: await readTicket(ref),
    by,
    headline,
    line: `${by.name} changed the status from ${statusName(from)} → ${statusName(to)}`,
  });
  return { ok: true };
});

/**
 * Comment save zalyavar: assignee ne comment kela ani ticket ajun Open asel tar
 * apoaap In Process (kaam suru). UAT / Closed / Hold / In Process la haat lavat nahi.
 */
export const addTicketComment = callable<{ id?: string; text?: string; mentions?: string[] }>(async (req) => {
  const { ref, uid, by, kind, data } = await ticketFor(req, req.data.id, "view");
  const text = str(req.data.text, "badComment", 1, 2000);
  // Mention — fakt ha ticket pahu shaknare (itar gal).
  const wanted = Array.isArray(req.data.mentions)
    ? [...new Set(req.data.mentions.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 128))].slice(0, 20)
    : [];
  const people = wanted.length ? await db.getAll(...wanted.map((u) => db.collection("admins").doc(u))) : [];
  const mentions = people
    .filter((d) => d.exists && d.id !== uid && d.get("active") === true && canSee(d.id, d.data() as AdminDoc, kind, data))
    .map((d) => ({ uid: d.id, name: String(d.get("name") ?? "") }));
  await ref.collection("comments").add({ type: "comment", text, mentions, by, at: now() });

  const started = await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const auto = cur.get("status") === "open" && (cur.get("assignedTo") as Person | null)?.uid === uid;
    tx.update(ref, auto ? { status: "inProcess" satisfies Status, updatedAt: now() } : { updatedAt: now() });
    return auto;
  });
  if (started) await log(ref, by, { type: "status", from: "open", to: "inProcess" });

  const quote = `"${text.length > 120 ? `${text.slice(0, 120)}…` : text}"`;
  await notifyTicket({
    kind,
    id: ref.id,
    ticket: await readTicket(ref),
    by,
    headline: mentions.length ? "Ticket Comment" : "New Comment on Ticket",
    line: `${by.name} commented: ${quote}${started ? " (status → In Process)" : ""}`,
    personal: Object.fromEntries(mentions.map((m) => [m.uid, `${by.name} mentioned you: ${quote}`])),
  });
  return { ok: true, status: started ? "inProcess" : null };
});

/** Comment madhe `@mention` sathi — fakt ha ticket pahu shaknare active users (mi sodun). */
export const listTicketPeople = callable<{ id?: string }>(async (req) => {
  const { uid, kind, data } = await ticketFor(req, req.data.id, "view");
  const snap = await db.collection("admins").where("active", "==", true).get();
  return snap.docs
    .filter((d) => d.id !== uid && canSee(d.id, d.data() as AdminDoc, kind, data))
    .map((d) => person(d.id, d.data() as AdminDoc))
    .sort((a, b) => a.name.localeCompare(b.name));
});

/** Assign karta yenare users — tya module cha "view" asnare active admins (Dev: `projectId` cha access asnare). */
export const listTicketAssignees = callable<{ kind?: string; projectId?: string }>(async (req) => {
  const kind = kindOf(req.data.kind);
  await requirePerm(req, kind, "view");
  const projectId = typeof req.data.projectId === "string" ? req.data.projectId : "";
  const snap = await db.collection("admins").where("active", "==", true).get();
  return snap.docs
    .filter((d) => {
      const a = d.data() as AdminDoc;
      if (!hasModule(a, KINDS[kind].module, "view")) return false;
      return kind !== "dev" || !projectId || a.role === "superAdmin" || projectOk(a, projectId);
    })
    .map((d) => person(d.id, d.data() as AdminDoc))
    .sort((a, b) => a.name.localeCompare(b.name));
});

/**
 * Dev Tickets list (non-super) — server var scope lavun fakt allowed tickets.
 * Firestore rules non-super la `tickets` (dev) chi thet list query deny kartat.
 */
export const listDevTickets = callable(async (req) => {
  const { uid, me } = await requirePerm(req, "dev", "view");
  const col = db.collection("tickets").where("kind", "==", "dev");
  let docs: FirebaseFirestore.QueryDocumentSnapshot[];
  if (me.role === "superAdmin") {
    docs = (await col.orderBy("createdAt", "desc").limit(1000).get()).docs;
  } else if (hasModule(me, "devTickets", "assign")) {
    // Allowed projects che sagle (`in` max 30 — tukde).
    const ids = [MULTISARV_ID, ...Object.keys(me.projects ?? {}).filter((id) => me.projects[id]?.length)];
    const parts = await Promise.all(
      Array.from({ length: Math.ceil(ids.length / 30) }, (_, i) => col.where("projectId", "in", ids.slice(i * 30, i * 30 + 30)).limit(1000).get()),
    );
    docs = parts.flatMap((p) => p.docs);
  } else {
    const [mine, raised] = await Promise.all([
      col.where("assignedTo.uid", "==", uid).limit(1000).get(),
      col.where("raisedBy.uid", "==", uid).limit(1000).get(),
    ]);
    docs = [...new Map([...mine.docs, ...raised.docs].map((d) => [d.id, d])).values()];
  }
  const ms = (v: unknown) => (v && typeof (v as { toMillis?: () => number }).toMillis === "function" ? (v as { toMillis: () => number }).toMillis() : null);
  return docs
    .filter((d) => devVisible(uid, me, d.data()))
    .map((d) => {
      const x = d.data();
      return { ...x, id: d.id, createdAt: ms(x.createdAt), updatedAt: ms(x.updatedAt) };
    })
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
});
