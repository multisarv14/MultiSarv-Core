/**
 * Client Tickets (CLT-000001) ani Dev Tickets (DEV-000001).
 *
 * Sagle writes ithe — ID counter transaction madhe (unique, kramane),
 * status workflow ani Module Access permissions server var tapasle jatat.
 * Panel fakt vachto (core Firestore rules).
 */
import type { CallableRequest } from "firebase-functions/v2/https";

import { getProject, MULTISARV_ID } from "./projects.js";
import { callable, db, fail, hasModule, loadAdmin, now, str, type AdminDoc } from "./shared.js";

const KINDS = {
  client: { prefix: "CLT", module: "clientTickets" },
  dev: { prefix: "DEV", module: "devTickets" },
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
    await ref.update({
      title: str(req.data.title, "badTitle", 3, 150),
      description: str(req.data.description, "badDescription", 3, 5000),
      projectId,
      // Juna client priority / module pathavat nasel tar te tasech rahtat.
      ...(req.data.priority !== undefined && { priority: priorityOf(req.data.priority) }),
      ...(req.data.module !== undefined && { module: await moduleOf(projectId, req.data.module) }),
      updatedAt: now(),
    });
    await log(ref, by, { type: "edit" });
    return { ok: true };
  },
);

export const assignTicket = callable<{ id?: string; assignee?: string | null }>(async (req) => {
  const { ref, data, kind, by } = await ticketFor(req, req.data.id, "assign");
  const next = await assignee(kind, req.data.assignee, String(data.projectId));
  const prev = (data.assignedTo as Person | null)?.uid ?? null;
  if ((next?.uid ?? null) === prev) return { ok: true };
  await ref.update({ assignedTo: next, updatedAt: now() });
  await log(ref, by, { type: "assign", from: (data.assignedTo as Person | null)?.name, to: next?.name });
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
  return { ok: true };
});

/**
 * Comment save zalyavar: assignee ne comment kela ani ticket ajun Open asel tar
 * apoaap In Process (kaam suru). UAT / Closed / Hold / In Process la haat lavat nahi.
 */
export const addTicketComment = callable<{ id?: string; text?: string }>(async (req) => {
  const { ref, uid, by } = await ticketFor(req, req.data.id, "view");
  await log(ref, by, { type: "comment", text: str(req.data.text, "badComment", 1, 2000) });

  const started = await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const auto = cur.get("status") === "open" && (cur.get("assignedTo") as Person | null)?.uid === uid;
    tx.update(ref, auto ? { status: "inProcess" satisfies Status, updatedAt: now() } : { updatedAt: now() });
    return auto;
  });
  if (started) await log(ref, by, { type: "status", from: "open", to: "inProcess" });
  return { ok: true, status: started ? "inProcess" : null };
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
