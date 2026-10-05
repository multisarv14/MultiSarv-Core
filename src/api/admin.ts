import {
  collection,
  doc,
  documentId,
  getAggregateFromServer,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  sum,
  Timestamp,
  where,
  type DocumentSnapshot,
  type Query,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";

import type { ProjectDef } from "@/config/projects";
import { callFn, services } from "@/lib/firebase";
import { chunk } from "@/lib/utils";

import { fromDoc, num } from "./convert";
import {
  LIVE_STATUSES,
  TASK_STATUSES,
  type Category,
  type ChatMessage,
  type DashboardStats,
  type DayPoint,
  type Dispute,
  type DisputeStatus,
  type Escrow,
  type KycDoc,
  type KycStatus,
  type Payout,
  type PayoutStatus,
  type Role,
  type Task,
  type TaskStatus,
  type Transaction,
  type TxnType,
  type User,
  type UserChanges,
  type Wallet,
} from "./types";

export type Cursor = QueryDocumentSnapshot | null;
export interface Page<T> {
  items: T[];
  cursor: Cursor;
}

const db = (p: ProjectDef) => services(p).db;
const col = (p: ProjectDef, name: string) => collection(db(p), name);

const count = async (q: Query) => (await getCountFromServer(q)).data().count;
const total = async (q: Query, field: string) =>
  num((await getAggregateFromServer(q, { s: sum(field) })).data().s);

const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// ── Normalizers (juna / adhura data asla tari UI tutnar nahi) ───────────

function toUser(snap: DocumentSnapshot): User {
  const u = fromDoc<Partial<User> & { id: string }>(snap);
  return {
    ...u,
    name: u.name || "Unnamed",
    phone: u.phone ?? "",
    activeRole: u.activeRole ?? "customer",
    availableRoles: u.availableRoles ?? [],
    kycStatus: u.kycStatus ?? "notSubmitted",
    isBlocked: u.isBlocked === true,
    rating: num(u.rating),
    ratingCount: num(u.ratingCount),
    completedJobs: num(u.completedJobs),
    skills: u.skills ?? [],
    joinedAt: u.joinedAt ?? null,
  };
}

function toTask(snap: DocumentSnapshot): Task {
  const t = fromDoc<Partial<Task> & { id: string }>(snap);
  return {
    ...t,
    title: t.title ?? "Untitled",
    description: t.description ?? "",
    categoryId: t.categoryId ?? "",
    categoryName: t.categoryName ?? "",
    customerId: t.customerId ?? "",
    customerName: t.customerName ?? "Customer",
    workerId: t.workerId ?? null,
    workerName: t.workerName ?? null,
    businessId: t.businessId ?? null,
    workerIsEmployee: t.workerIsEmployee === true,
    budget: num(t.budget),
    status: t.status ?? "posted",
    isUrgent: t.isUrgent === true,
    location: t.location ?? {},
    createdAt: t.createdAt ?? null,
    scheduledAt: t.scheduledAt ?? null,
    statusHistory: t.statusHistory ?? {},
  };
}

// ── Dashboard ─────────────────────────────────────────────────────────

export async function getDashboard(p: ProjectDef, days: number): Promise<DashboardStats> {
  const users = col(p, "users");
  const tasks = col(p, "tasks");
  const escrows = col(p, "escrows");
  const txns = col(p, "transactions");
  const payouts = col(p, "payouts");

  const start = startOfDay(new Date(Date.now() - (days - 1) * 86400_000));
  const since = Timestamp.fromDate(start);

  // Sagle aggregation queries ekach veli — 1 read / 1000 index entries, swasta.
  const [
    [totalUsers, workers, businesses, customers, newUsersInRange, pendingKyc, blockedUsers],
    [liveTasks, openTasks, completedTasks, openDisputes, pendingPayouts],
    [escrowHeld, releasedInRange, feesInRange, feesLifetime, pendingPayoutAmount],
    statusCounts,
    trendSnap,
    signupSnap,
    taskSnap,
    feeSnap,
  ] = await Promise.all([
    Promise.all([
      count(users),
      count(query(users, where("availableRoles", "array-contains", "worker"))),
      count(query(users, where("availableRoles", "array-contains", "business"))),
      count(query(users, where("availableRoles", "array-contains", "customer"))),
      count(query(users, where("joinedAt", ">=", since))),
      count(query(users, where("kycStatus", "==", "pending"))),
      count(query(users, where("isBlocked", "==", true))),
    ]),
    Promise.all([
      count(query(tasks, where("status", "in", LIVE_STATUSES))),
      count(query(tasks, where("status", "==", "posted"))),
      count(query(tasks, where("status", "==", "paid"))),
      count(query(col(p, "disputes"), where("status", "in", ["open", "underReview"]))),
      count(query(payouts, where("status", "==", "requested"))),
    ]),
    Promise.all([
      total(query(escrows, where("status", "==", "held")), "amount"),
      total(
        query(escrows, where("status", "==", "released"), where("releasedAt", ">=", since)),
        "amount",
      ),
      total(query(txns, where("type", "==", "platformFee"), where("createdAt", ">=", since)), "amount"),
      total(query(txns, where("type", "==", "platformFee")), "amount"),
      total(query(payouts, where("status", "==", "requested")), "amount"),
    ]),
    Promise.all(TASK_STATUSES.map((s) => count(query(tasks, where("status", "==", s))))),
    getDocs(query(escrows, where("heldAt", ">=", since), limit(5000))),
    getDocs(query(users, where("joinedAt", ">=", since), limit(5000))),
    getDocs(query(tasks, where("createdAt", ">=", since), limit(5000))),
    getDocs(query(txns, where("type", "==", "platformFee"), where("createdAt", ">=", since), limit(5000))),
  ]);

  const keyOf = (d: Date) => {
    const x = startOfDay(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  };
  const buckets = new Map<string, DayPoint>();
  for (let i = 0; i < days; i++) {
    const key = keyOf(new Date(start.getTime() + i * 86400_000 + 12 * 3600_000));
    buckets.set(key, { day: key, gmv: 0, holds: 0, revenue: 0, tasks: 0, signups: 0 });
  }
  const bucket = (field: string, snap: { docs: DocumentSnapshot[] }, add: (b: DayPoint, d: DocumentSnapshot) => void) => {
    for (const d of snap.docs) {
      const at = (d.get(field) as Timestamp | undefined)?.toDate();
      const b = at && buckets.get(keyOf(at));
      if (b) add(b, d);
    }
  };
  bucket("heldAt", trendSnap, (b, d) => {
    b.gmv += num(d.get("amount"));
    b.holds += 1;
  });
  bucket("createdAt", feeSnap, (b, d) => (b.revenue += num(d.get("amount"))));
  bucket("createdAt", taskSnap, (b) => (b.tasks += 1));
  bucket("joinedAt", signupSnap, (b) => (b.signups += 1));

  // Categories / cities / funnel — range madhle tasks.
  const cats = new Map<string, { count: number; budget: number }>();
  const cities = new Map<string, { name: string; count: number }>();
  const funnel = { posted: taskSnap.size, accepted: 0, completed: 0, cancelled: 0 };
  for (const d of taskSnap.docs) {
    const name = (d.get("categoryName") as string) || "—";
    const c = cats.get(name) ?? { count: 0, budget: 0 };
    c.count += 1;
    c.budget += num(d.get("budget"));
    cats.set(name, c);
    const city = String(d.get("location.city") ?? "").trim();
    if (city) {
      const k = city.toLowerCase();
      const e = cities.get(k) ?? { name: city, count: 0 };
      e.count += 1;
      cities.set(k, e);
    }
    const status = d.get("status") as string;
    const history = (d.get("statusHistory") ?? {}) as Record<string, unknown>;
    if (status === "cancelled") funnel.cancelled += 1;
    if (history.accepted || !["posted", "cancelled"].includes(status)) funnel.accepted += 1;
    if (status === "paid") funnel.completed += 1;
  }
  const newUsersByRole = { customer: 0, worker: 0, business: 0 };
  for (const d of signupSnap.docs) {
    const r = d.get("activeRole") as keyof typeof newUsersByRole;
    if (r in newUsersByRole) newUsersByRole[r] += 1;
  }

  return {
    totalUsers,
    workers,
    businesses,
    customers,
    newUsersInRange,
    liveTasks,
    openTasks,
    completedTasks,
    pendingKyc,
    openDisputes,
    pendingPayouts,
    pendingPayoutAmount,
    blockedUsers,
    escrowHeld,
    releasedInRange,
    feesInRange,
    feesLifetime,
    statusBreakdown: TASK_STATUSES.map((status, i) => ({ status, count: statusCounts[i] })),
    trend: [...buckets.values()],
    topCategories: [...cats.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    topCities: [...cities.values()].sort((a, b) => b.count - a.count).slice(0, 6),
    funnel,
    newUsersByRole,
  };
}

/** Sidebar badges — halke count queries. */
export async function getQueueCounts(p: ProjectDef) {
  const [kyc, disputes, payouts] = await Promise.all([
    count(query(col(p, "users"), where("kycStatus", "==", "pending"))),
    count(query(col(p, "disputes"), where("status", "in", ["open", "underReview"]))),
    count(query(col(p, "payouts"), where("status", "==", "requested"))),
  ]);
  return { kyc, disputes, payouts };
}

// ── Users ─────────────────────────────────────────────────────────────

export interface UserFilter {
  role?: Role;
  kyc?: KycStatus;
  blocked?: boolean;
}

export async function listUsers(
  p: ProjectDef,
  filter: UserFilter,
  cursor: Cursor,
  pageSize = 50,
): Promise<Page<User>> {
  const c: QueryConstraint[] = [];
  if (filter.role) c.push(where("availableRoles", "array-contains", filter.role));
  if (filter.kyc) c.push(where("kycStatus", "==", filter.kyc));
  if (filter.blocked !== undefined) c.push(where("isBlocked", "==", filter.blocked));
  // Filter asla tar documentId order — composite index lagat nahi (single-field merge).
  c.push(c.length ? orderBy(documentId()) : orderBy("joinedAt", "desc"));
  if (cursor) c.push(startAfter(cursor));
  c.push(limit(pageSize));

  const snap = await getDocs(query(col(p, "users"), ...c));
  return {
    items: snap.docs.map(toUser),
    cursor: snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null,
  };
}

/** 10-digit phone kinva exact uid ne server-side shodh. */
export async function findUsers(p: ProjectDef, term: string): Promise<User[]> {
  const t = term.trim();
  const digits = t.replace(/\D/g, "");
  const found = new Map<string, User>();
  const jobs: Promise<void>[] = [];
  if (digits.length >= 10) {
    const phone = digits.slice(-10);
    jobs.push(
      getDocs(query(col(p, "users"), where("phone", "==", phone), limit(5))).then((s) =>
        s.docs.forEach((d) => found.set(d.id, toUser(d))),
      ),
    );
  }
  if (/^[A-Za-z0-9]{20,40}$/.test(t)) {
    jobs.push(
      getDoc(doc(db(p), "users", t)).then((d) => {
        if (d.exists()) found.set(d.id, toUser(d));
      }),
    );
  }
  await Promise.all(jobs);
  return [...found.values()];
}

export async function getUser(p: ProjectDef, uid: string): Promise<User | null> {
  const snap = await getDoc(doc(db(p), "users", uid));
  return snap.exists() ? toUser(snap) : null;
}

export async function getUserDetail(p: ProjectDef, uid: string) {
  const d = db(p);
  const [user, wallet, kyc, txns, asCustomer, asWorker] = await Promise.all([
    getUser(p, uid),
    getDoc(doc(d, "wallets", uid)),
    getDoc(doc(d, "kyc", uid)),
    getDocs(query(col(p, "transactions"), where("userId", "==", uid), orderBy("createdAt", "desc"), limit(20))),
    getDocs(query(col(p, "tasks"), where("customerId", "==", uid), orderBy("createdAt", "desc"), limit(10))),
    getDocs(query(col(p, "tasks"), where("workerId", "==", uid), orderBy("createdAt", "desc"), limit(10))),
  ]);
  const w = wallet.data() ?? {};
  return {
    user,
    wallet: {
      balance: num(w.balance),
      escrowHeld: num(w.escrowHeld),
      pendingPayout: num(w.pendingPayout),
      lifetimeEarned: num(w.lifetimeEarned),
      lifetimeSpent: num(w.lifetimeSpent),
      upiId: w.upiId,
    } satisfies Wallet,
    kyc: kyc.exists() ? fromDoc<KycDoc>(kyc) : null,
    transactions: txns.docs.map((x) => fromDoc<Transaction>(x)),
    tasks: [...asCustomer.docs, ...asWorker.docs]
      .map(toTask)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)),
  };
}

/** Users batch (payouts / tasks sathi) — `in` query 30 ids paryant. */
export async function getUsersByIds(p: ProjectDef, ids: string[]): Promise<Map<string, User>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, User>();
  await Promise.all(
    chunk(unique, 30).map(async (ids) => {
      const snap = await getDocs(query(col(p, "users"), where(documentId(), "in", ids)));
      snap.docs.forEach((d) => out.set(d.id, toUser(d)));
    }),
  );
  return out;
}

export const toggleBlock = (p: ProjectDef, userId: string) =>
  callFn<{ isBlocked: boolean }>(p, "toggleBlockUser", { userId });

/** Profile fields badal — server validate karto ani user la notification pathavto. */
export const updateUser = (p: ProjectDef, userId: string, changes: UserChanges) =>
  callFn<{ ok: boolean }>(p, "adminUpdateUser", { userId, changes });

/** Kayamcha delete — wallet rikama ani chalu tasks nasel tarach (server tapasto). */
export const deleteUser = (p: ProjectDef, userId: string) =>
  callFn<{ ok: boolean }>(p, "adminDeleteUser", { userId });

// ── KYC ───────────────────────────────────────────────────────────────

export interface KycItem {
  user: User;
  kyc: KycDoc | null;
}

export async function listKyc(p: ProjectDef, status: KycStatus): Promise<KycItem[]> {
  const snap = await getDocs(query(col(p, "users"), where("kycStatus", "==", status), limit(100)));
  const users = snap.docs.map(toUser);
  const docs = await Promise.all(users.map((u) => getDoc(doc(db(p), "kyc", u.id))));
  return users
    .map((user, i) => ({ user, kyc: docs[i].exists() ? fromDoc<KycDoc>(docs[i]) : null }))
    .sort((a, b) => (a.kyc?.submittedAt?.getTime() ?? 0) - (b.kyc?.submittedAt?.getTime() ?? 0));
}

export async function getKycImages(p: ProjectDef, uid: string) {
  const url = (name: string) =>
    getDownloadURL(ref(services(p).storage, `kyc/${uid}/${name}`)).catch(() => null);
  const [front, back] = await Promise.all([url("front.jpg"), url("back.jpg")]);
  return { front, back };
}

/** Approve, kinva `reason` sobat user la "return for correction". */
export const reviewKyc = (p: ProjectDef, userId: string, approve: boolean, reason = "") =>
  callFn<{ status: KycStatus }>(p, "reviewKyc", { userId, approve, ...(approve ? {} : { reason }) });

// ── Tasks ─────────────────────────────────────────────────────────────

export async function listTasks(
  p: ProjectDef,
  status: TaskStatus | "live" | undefined,
  cursor: Cursor,
  pageSize = 50,
): Promise<Page<Task>> {
  const c: QueryConstraint[] = [];
  if (status === "live") c.push(where("status", "in", LIVE_STATUSES));
  else if (status) c.push(where("status", "==", status));
  c.push(orderBy("createdAt", "desc"));
  if (cursor) c.push(startAfter(cursor));
  c.push(limit(pageSize));
  const snap = await getDocs(query(col(p, "tasks"), ...c));
  return {
    items: snap.docs.map(toTask),
    cursor: snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null,
  };
}

export async function getTask(p: ProjectDef, id: string): Promise<Task | null> {
  const snap = await getDoc(doc(db(p), "tasks", id));
  return snap.exists() ? toTask(snap) : null;
}

export async function getTaskDetail(p: ProjectDef, id: string) {
  const d = db(p);
  const [task, escrow, messages, disputes] = await Promise.all([
    getTask(p, id),
    getDoc(doc(d, "escrows", id)),
    getDocs(query(collection(d, "tasks", id, "messages"), orderBy("sentAt", "asc"), limit(300))),
    getDocs(query(col(p, "disputes"), where("taskId", "==", id), limit(5))),
  ]);
  return {
    task,
    escrow: escrow.exists() ? fromDoc<Escrow>(escrow) : null,
    messages: messages.docs.map((m) => fromDoc<ChatMessage>(m)),
    disputes: disputes.docs.map((x) => fromDoc<Dispute>(x)),
  };
}

export const cancelTask = (p: ProjectDef, taskId: string, reason: string) =>
  callFn(p, "cancelTask", { taskId, reason });

// ── Disputes ──────────────────────────────────────────────────────────

export async function listDisputes(p: ProjectDef): Promise<Dispute[]> {
  const snap = await getDocs(query(col(p, "disputes"), orderBy("createdAt", "desc"), limit(300)));
  return snap.docs.map((x) => fromDoc<Dispute>(x));
}

export const resolveDispute = (
  p: ProjectDef,
  disputeId: string,
  resolution: Exclude<DisputeStatus, "open">,
  note: string,
) => callFn(p, "resolveDispute", { disputeId, resolution, note });

// ── Payouts ───────────────────────────────────────────────────────────

export async function listPayouts(p: ProjectDef, status: PayoutStatus): Promise<Payout[]> {
  // Single-field filter — composite index nako; sort client var.
  const snap = await getDocs(query(col(p, "payouts"), where("status", "==", status), limit(300)));
  const payouts = snap.docs.map((x) => fromDoc<Payout>(x));
  const users = await getUsersByIds(p, payouts.map((x) => x.uid));
  return payouts
    .map((x) => ({ ...x, amount: num(x.amount), user: users.get(x.uid) ?? null }))
    .sort((a, b) =>
      status === "requested"
        ? (a.requestedAt?.getTime() ?? 0) - (b.requestedAt?.getTime() ?? 0)
        : (b.settledAt?.getTime() ?? 0) - (a.settledAt?.getTime() ?? 0),
    );
}

export const settlePayout = (p: ProjectDef, payoutId: string, success: boolean, utr: string) =>
  callFn(p, "settlePayout", { payoutId, success, utr });

// ── Ledger ────────────────────────────────────────────────────────────

export async function listTransactions(
  p: ProjectDef,
  filter: { type?: TxnType; userId?: string },
  cursor: Cursor,
  pageSize = 50,
): Promise<Page<Transaction>> {
  const c: QueryConstraint[] = [];
  // userId + type donhi index madhe nahit — userId asel tar type client var.
  if (filter.userId) c.push(where("userId", "==", filter.userId));
  else if (filter.type) c.push(where("type", "==", filter.type));
  c.push(orderBy("createdAt", "desc"));
  if (cursor) c.push(startAfter(cursor));
  c.push(limit(pageSize));
  const snap = await getDocs(query(col(p, "transactions"), ...c));
  let items = snap.docs.map((x) => {
    const t = fromDoc<Transaction>(x);
    return { ...t, amount: num(t.amount) };
  });
  if (filter.userId && filter.type) items = items.filter((t) => t.type === filter.type);
  return { items, cursor: snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null };
}

// ── Catalog ───────────────────────────────────────────────────────────

export async function listCategories(p: ProjectDef): Promise<Category[]> {
  const snap = await getDocs(col(p, "categories"));
  return snap.docs
    .map((x) => fromDoc<Category>(x))
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.name.localeCompare(b.name));
}
