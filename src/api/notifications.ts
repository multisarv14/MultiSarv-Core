import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
  type Query,
} from "firebase/firestore";

import type { ProjectDef } from "@/config/projects";
import type { Lang } from "@/i18n";
import { callFn, services } from "@/lib/firebase";

import { fromDoc, num } from "./convert";
import type { Role } from "./types";

// ── Types (noai/functions/src/broadcast.ts sobat match) ─────────────

export type NewTaskAudience = "none" | "partners" | "skilled" | "city" | "all";

export interface NotificationSettings {
  newTaskAudience: NewTaskAudience;
  adminOnNewUser: boolean;
  adminOnNewTask: boolean;
}

export interface Audience {
  roles?: Exclude<Role, "admin">[];
  skill?: string | null;
  city?: string | null;
  phones?: string[];
  uids?: string[];
}

export type DeliveryStatus = "sent" | "partial" | "failed" | "noToken" | "error";
export type BroadcastType = "announcement" | "newTask" | "test";
export type NoticeText = Partial<Record<Lang, { title: string; body: string }>>;

export interface BroadcastStats {
  targeted: number;
  sent: number;
  partial: number;
  failed: number;
  noToken: number;
  error: number;
  devices: number;
}

export interface Broadcast {
  id: string;
  type: BroadcastType;
  title: string;
  body: string;
  audience: Audience;
  taskId?: string;
  createdBy: string;
  status: "queued" | "sending" | "done" | "failed";
  stats: BroadcastStats;
  createdAt: Date | null;
  finishedAt: Date | null;
  failure?: string;
}

export interface Recipient {
  id: string;
  name: string;
  phone: string;
  roles: Role[];
  language: Lang;
  status: DeliveryStatus;
  devices: number;
  delivered: number;
  error: string | null;
}

export interface InboxItem {
  id: string;
  title: string;
  body: string;
  kind: string;
  taskId: string | null;
  isRead: boolean;
  createdAt: Date | null;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  newTaskAudience: "skilled",
  adminOnNewUser: true,
  adminOnNewTask: false,
};

const db = (p: ProjectDef) => services(p).db;

function toBroadcast(b: Partial<Broadcast> & { id: string }): Broadcast {
  const s = (b.stats ?? {}) as Partial<BroadcastStats>;
  return {
    ...b,
    type: b.type ?? "announcement",
    title: b.title ?? "",
    body: b.body ?? "",
    audience: b.audience ?? {},
    createdBy: b.createdBy ?? "",
    status: b.status ?? "queued",
    createdAt: b.createdAt ?? null,
    finishedAt: b.finishedAt ?? null,
    stats: {
      targeted: num(s.targeted),
      sent: num(s.sent),
      partial: num(s.partial),
      failed: num(s.failed),
      noToken: num(s.noToken),
      error: num(s.error),
      devices: num(s.devices),
    },
  };
}

// ── Settings ─────────────────────────────────────────────────────────

export async function getNotificationSettings(p: ProjectDef): Promise<NotificationSettings> {
  const snap = await getDoc(doc(db(p), "config", "notifications"));
  return { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<NotificationSettings> | undefined) };
}

export const updateNotificationSettings = (p: ProjectDef, patch: Partial<NotificationSettings>) =>
  callFn<NotificationSettings>(p, "updateNotificationSettings", patch);

// ── Broadcasts ───────────────────────────────────────────────────────

export const sendBroadcast = (p: ProjectDef, text: NoticeText, audience: Audience, test = false) =>
  callFn<{ id: string }>(p, "sendBroadcast", { text, audience, test });

export async function listBroadcasts(p: ProjectDef, type?: BroadcastType): Promise<Broadcast[]> {
  const c = collection(db(p), "broadcasts");
  const q = type
    ? query(c, where("type", "==", type), limit(100))
    : query(c, orderBy("createdAt", "desc"), limit(100));
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => toBroadcast(fromDoc(d)));
  // Type filter sobat orderBy = composite index; 100 items client var sort.
  return items.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

/** Pathavtana live progress (queued → sending → done). */
export function watchBroadcast(p: ProjectDef, id: string, cb: (b: Broadcast) => void) {
  return onSnapshot(doc(db(p), "broadcasts", id), (s) => s.exists() && cb(toBroadcast(fromDoc(s))));
}

export async function listRecipients(
  p: ProjectDef,
  id: string,
  status?: DeliveryStatus,
): Promise<Recipient[]> {
  const c = collection(db(p), "broadcasts", id, "recipients");
  const snap = await getDocs(status ? query(c, where("status", "==", status), limit(1000)) : query(c, limit(1000)));
  return snap.docs
    .map((d) => {
      const r = fromDoc<Partial<Recipient> & { id: string }>(d);
      return {
        id: r.id,
        name: r.name ?? "",
        phone: r.phone ?? "",
        roles: r.roles ?? [],
        language: r.language ?? "en",
        status: r.status ?? "error",
        devices: num(r.devices),
        delivered: num(r.delivered),
        error: r.error ?? null,
      } satisfies Recipient;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Audience kiti users — role filter sathi count query (swasta).
 * Skill / city / phones sathi server var ch kalel → null.
 */
export async function estimateAudience(p: ProjectDef, a: Audience): Promise<number | null> {
  if (a.phones?.length) return a.phones.length;
  if (a.skill || a.city) return null;
  // Blocked users server vagalto — ha andaz (≈), composite index nako mhanun.
  const users = collection(db(p), "users");
  let q: Query = users;
  if (a.roles?.length === 1) q = query(users, where("availableRoles", "array-contains", a.roles[0]));
  else if (a.roles?.length) q = query(users, where("availableRoles", "array-contains-any", a.roles));
  return (await getCountFromServer(q)).data().count;
}

// ── Admin inbox (bell) ───────────────────────────────────────────────

export function watchInbox(p: ProjectDef, uid: string, cb: (items: InboxItem[]) => void, onError?: (e: unknown) => void) {
  const q = query(
    collection(db(p), "users", uid, "notifications"),
    orderBy("createdAt", "desc"),
    limit(30),
  );
  return onSnapshot(
    q,
    (snap) =>
      cb(
        snap.docs.map((d) => {
          const n = fromDoc<Partial<InboxItem> & { id: string }>(d);
          return {
            id: n.id,
            title: n.title ?? "",
            body: n.body ?? "",
            kind: n.kind ?? "system",
            taskId: n.taskId ?? null,
            isRead: n.isRead === true,
            createdAt: n.createdAt ?? null,
          };
        }),
      ),
    onError,
  );
}

export const markRead = (p: ProjectDef, uid: string, id: string) =>
  updateDoc(doc(db(p), "users", uid, "notifications", id), { isRead: true });

export async function markAllRead(p: ProjectDef, uid: string, ids: string[]) {
  if (ids.length === 0) return;
  const batch = writeBatch(db(p));
  ids.slice(0, 450).forEach((id) => batch.update(doc(db(p), "users", uid, "notifications", id), { isRead: true }));
  await batch.commit();
}

export const registerAdminDevice = (p: ProjectDef, data: { token?: string; language?: Lang }) =>
  callFn<{ ok: boolean }>(p, "registerAdminDevice", data);
