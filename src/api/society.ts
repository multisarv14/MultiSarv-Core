import {
  collection,
  deleteDoc,
  doc,
  getAggregateFromServer,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  sum,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentSnapshot,
  type Query,
} from "firebase/firestore";

import type { ProjectDef } from "@/config/projects";
import { services } from "@/lib/firebase";

/**
 * SocietySarv data — `societies/{code}/<subcollection>` (named DB, project cha `databaseId`).
 * Field naav ani enum strings Flutter app chya `firestore_mappers.dart` sobat same;
 * panel tech lihito je app swatah lihito (complaint status, PIN), mhanje app la farak padat nahi.
 */

const db = (p: ProjectDef) => services(p).db;
const societies = (p: ProjectDef) => collection(db(p), "societies");
const sub = (p: ProjectDef, code: string, name: string) => collection(db(p), "societies", code, name);

/** Ekhadya list madhe jastit jast rows — base64 photos mule docs jad astat. */
export const LIST_LIMIT = 500;

const count = async (q: Query) => (await getCountFromServer(q)).data().count;
const total = async (q: Query, field: string) => Number((await getAggregateFromServer(q, { s: sum(field) })).data().s ?? 0);

// ── Enums (app `models.dart` sobat same) ─────────────────────────────

export const PAYMENT_STATUSES = ["PAID", "PARTIAL", "UNPAID"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const VISITOR_STATUSES = ["INSIDE", "EXITED", "PRE_APPROVED", "REJECTED"] as const;
export type VisitorStatus = (typeof VISITOR_STATUSES)[number];
export const STAFF_ROLES = ["GUARD", "HOUSEKEEPING", "MAINTENANCE_STAFF", "ACCOUNTANT", "MANAGER"];
export const COMMITTEE_ROLES = ["CHAIRMAN", "SECRETARY", "TREASURER", "COMMITTEE"];
/** Member unit la milnare roles (committee kinva sabhasad) — app `MEMBER_ROLES`. */
export const MEMBER_ROLES = [...COMMITTEE_ROLES, "RESIDENT", "TENANT"];
/** Society staff role la deta yenare screens — app `ROLE_MENU_KEYS` (bottom bar tabs). */
export const ROLE_MENU_KEYS = ["DASHBOARD", "ACCOUNTS", "MAINTENANCE", "GATE", "COMMUNITY"] as const;
export type RoleMenuKey = (typeof ROLE_MENU_KEYS)[number];

// ── Normalizers (app sarkhe safe defaults) ───────────────────────────

type Raw = Record<string, unknown>;
const str = (m: Raw, k: string, fb = "") => (typeof m[k] === "string" ? (m[k] as string) : fb);
const numOf = (m: Raw, k: string, fb = 0) => (typeof m[k] === "number" ? (m[k] as number) : fb);
const bool = (m: Raw, k: string, fb = false) => (typeof m[k] === "boolean" ? (m[k] as boolean) : fb);
const pick = <T extends string>(values: readonly T[], v: unknown, fb: T): T => (values.includes(v as T) ? (v as T) : fb);
const data = (s: DocumentSnapshot) => (s.data() ?? {}) as Raw;

/** Base64 JPEG (app `ImageBlob`) → `<img src>`. */
export const blobSrc = (b64: string) => (b64 ? (b64.startsWith("data:") ? b64 : `data:image/jpeg;base64,${b64}`) : null);

export interface Society {
  code: string;
  name: string;
  registrationNumber: string;
  address: string;
  city: string;
  state: string;
  contactNumber: string;
  email: string;
  totalWings: number;
  totalFlats: number;
  cash: number;
  bank: number;
  logo: string;
}

const toSociety = (s: DocumentSnapshot): Society => {
  const m = data(s);
  return {
    code: s.id,
    name: str(m, "name", s.id),
    registrationNumber: str(m, "registrationNumber"),
    address: str(m, "address"),
    city: str(m, "city"),
    state: str(m, "state"),
    contactNumber: str(m, "contactNumber"),
    email: str(m, "email"),
    totalWings: numOf(m, "totalWings"),
    totalFlats: numOf(m, "totalFlats"),
    cash: numOf(m, "currentBalanceCash"),
    bank: numOf(m, "currentBalanceBank"),
    logo: str(m, "logoBase64"),
  };
};

export interface Resident {
  docId: string;
  flatNumber: string;
  wing: string;
  ownerName: string;
  tenantName: string;
  contactNumber: string;
  email: string;
  role: string;
  hasPin: boolean;
  familyMemberCount: number;
  parkingSlot: string;
  unitType: string;
  balanceDue: number;
  advanceBalance: number;
  isOwnerLiving: boolean;
  isActive: boolean;
  staffDesignation: string;
  photo: string;
  /** Society cha swatahcha staff role (`roles/{id}`), asel tar. */
  customRoleId: string;
  customRoleName: string;
}

const toResident = (s: DocumentSnapshot): Resident => {
  const m = data(s);
  return {
    docId: s.id,
    flatNumber: str(m, "flatNumber", s.id),
    wing: str(m, "wing"),
    ownerName: str(m, "ownerName"),
    tenantName: str(m, "tenantName"),
    contactNumber: str(m, "contactNumber"),
    email: str(m, "email"),
    role: str(m, "role", "RESIDENT"),
    // PIN panel la kadhich dakhavat nahi — fakt set aahe ka.
    hasPin: str(m, "pin").trim().length > 0,
    familyMemberCount: numOf(m, "familyMemberCount"),
    parkingSlot: str(m, "parkingSlot"),
    unitType: str(m, "unitType") || str(m, "flatType").replace(/_/g, " "),
    balanceDue: numOf(m, "balanceDue"),
    advanceBalance: numOf(m, "advanceBalance"),
    isOwnerLiving: bool(m, "isOwnerLiving", true),
    isActive: bool(m, "isActive", true),
    staffDesignation: str(m, "staffDesignation"),
    photo: str(m, "photoBase64"),
    customRoleId: str(m, "customRoleId"),
    customRoleName: str(m, "customRoleName"),
  };
};

export interface Bill {
  docId: string;
  id: number;
  flatNumber: string;
  residentName: string;
  billMonth: string;
  totalAmount: number;
  amountPaid: number;
  lateFeeAmount: number;
  status: PaymentStatus;
  dueDate: string;
  paidDate: string;
  paymentMode: string;
  transactionRef: string;
  receiptNumber: string;
}

const toBill = (s: DocumentSnapshot): Bill => {
  const m = data(s);
  return {
    docId: s.id,
    id: numOf(m, "id"),
    flatNumber: str(m, "flatNumber"),
    residentName: str(m, "residentName"),
    billMonth: str(m, "billMonth"),
    totalAmount: numOf(m, "totalAmount"),
    amountPaid: numOf(m, "amountPaid"),
    lateFeeAmount: numOf(m, "lateFeeAmount"),
    status: pick(PAYMENT_STATUSES, m.status, "UNPAID"),
    dueDate: str(m, "dueDate"),
    paidDate: str(m, "paidDate"),
    paymentMode: str(m, "paymentMode"),
    transactionRef: str(m, "transactionRef"),
    receiptNumber: str(m, "receiptNumber"),
  };
};

export interface Expense {
  docId: string;
  id: number;
  title: string;
  category: string;
  amount: number;
  date: string;
  vendorName: string;
  paymentMode: string;
  approvedBy: string;
  receiptNumber: string;
  notes: string;
}

const toExpense = (s: DocumentSnapshot): Expense => {
  const m = data(s);
  return {
    docId: s.id,
    id: numOf(m, "id"),
    title: str(m, "title"),
    category: str(m, "category", "MISCELLANEOUS"),
    amount: numOf(m, "amount"),
    date: str(m, "date"),
    vendorName: str(m, "vendorName"),
    paymentMode: str(m, "paymentMode", "BANK_TRANSFER"),
    approvedBy: str(m, "approvedBy"),
    receiptNumber: str(m, "receiptNumber"),
    notes: str(m, "notes"),
  };
};

export interface Revenue {
  docId: string;
  id: number;
  title: string;
  source: string;
  amount: number;
  date: string;
  payerName: string;
  flatNumber: string;
  paymentMode: string;
  receiptNumber: string;
}

const toRevenue = (s: DocumentSnapshot): Revenue => {
  const m = data(s);
  return {
    docId: s.id,
    id: numOf(m, "id"),
    title: str(m, "title"),
    source: str(m, "sourceCategory", "PENALTY_FINE"),
    amount: numOf(m, "amount"),
    date: str(m, "date"),
    payerName: str(m, "payerName"),
    flatNumber: str(m, "flatNumber"),
    paymentMode: str(m, "paymentMode", "UPI"),
    receiptNumber: str(m, "receiptNumber"),
  };
};

export interface Visitor {
  docId: string;
  id: number;
  visitorName: string;
  phone: string;
  flatNumber: string;
  purpose: string;
  vehicleNumber: string;
  entryTime: string;
  exitTime: string;
  status: VisitorStatus;
  guardName: string;
}

const toVisitor = (s: DocumentSnapshot): Visitor => {
  const m = data(s);
  return {
    docId: s.id,
    id: numOf(m, "id"),
    visitorName: str(m, "visitorName"),
    phone: str(m, "phone"),
    flatNumber: str(m, "flatNumber"),
    purpose: str(m, "purpose", "OTHER"),
    vehicleNumber: str(m, "vehicleNumber"),
    entryTime: str(m, "entryTime"),
    exitTime: str(m, "exitTime"),
    status: pick(VISITOR_STATUSES, m.status, "INSIDE"),
    guardName: str(m, "guardName"),
  };
};

export interface Notice {
  docId: string;
  id: number;
  title: string;
  content: string;
  publishedDate: string;
  isPinned: boolean;
  category: string;
  authorRole: string;
}

const toNotice = (s: DocumentSnapshot): Notice => {
  const m = data(s);
  return {
    docId: s.id,
    id: numOf(m, "id"),
    title: str(m, "title"),
    content: str(m, "content"),
    publishedDate: str(m, "publishedDate"),
    isPinned: bool(m, "isPinned"),
    category: str(m, "category", "GENERAL"),
    authorRole: str(m, "authorRole"),
  };
};

export interface Complaint {
  docId: string;
  id: number;
  flatNumber: string;
  residentName: string;
  category: string;
  description: string;
  filedDate: string;
  status: TicketStatus;
  resolutionNotes: string;
  attachment: string;
}

const toComplaint = (s: DocumentSnapshot): Complaint => {
  const m = data(s);
  return {
    docId: s.id,
    id: numOf(m, "id"),
    flatNumber: str(m, "flatNumber"),
    residentName: str(m, "residentName"),
    category: str(m, "category", "OTHER"),
    description: str(m, "description"),
    filedDate: str(m, "filedDate"),
    status: pick(TICKET_STATUSES, m.status, "OPEN"),
    resolutionNotes: str(m, "resolutionNotes"),
    attachment: str(m, "attachmentBase64"),
  };
};

export interface Contact {
  docId: string;
  id: number;
  titleEn: string;
  titleMr: string;
  name: string;
  phoneNumber: string;
  category: string;
}

const toContact = (s: DocumentSnapshot): Contact => {
  const m = data(s);
  return {
    docId: s.id,
    id: numOf(m, "id"),
    titleEn: str(m, "titleEn"),
    titleMr: str(m, "titleMr"),
    name: str(m, "name"),
    phoneNumber: str(m, "phoneNumber"),
    category: str(m, "category"),
  };
};

// ── Reads ────────────────────────────────────────────────────────────

export async function listSocieties(p: ProjectDef): Promise<Society[]> {
  const snap = await getDocs(societies(p));
  return snap.docs.map(toSociety).sort((a, b) => a.name.localeCompare(b.name));
}

/** App sarkhach `orderBy("id", desc)` — single-field index, composite lagat nahi. */
const recent = <T>(p: ProjectDef, code: string, name: string, map: (s: DocumentSnapshot) => T) => async () =>
  (await getDocs(query(sub(p, code, name), orderBy("id", "desc"), limit(LIST_LIMIT)))).docs.map(map);

export async function listResidents(p: ProjectDef, code: string): Promise<Resident[]> {
  // Composite index (wing + flatNumber) var avalambun naye — client var sort.
  const snap = await getDocs(query(sub(p, code, "residents"), limit(LIST_LIMIT * 2)));
  return snap.docs
    .map(toResident)
    .sort((a, b) => a.wing.localeCompare(b.wing) || a.flatNumber.localeCompare(b.flatNumber, undefined, { numeric: true }));
}

export const listBills = (p: ProjectDef, code: string) => recent(p, code, "maintenance_bills", toBill)();
export const listExpenses = (p: ProjectDef, code: string) => recent(p, code, "expense_records", toExpense)();
export const listRevenues = (p: ProjectDef, code: string) => recent(p, code, "non_fee_revenues", toRevenue)();
export const listVisitors = (p: ProjectDef, code: string) => recent(p, code, "visitor_logs", toVisitor)();
export const listComplaints = (p: ProjectDef, code: string) => recent(p, code, "complaints", toComplaint)();

export async function listNotices(p: ProjectDef, code: string): Promise<Notice[]> {
  const list = await recent(p, code, "notices", toNotice)();
  return list.sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.id - a.id);
}

export async function listContacts(p: ProjectDef, code: string): Promise<Contact[]> {
  const snap = await getDocs(query(sub(p, code, "emergency_contacts"), limit(LIST_LIMIT)));
  return snap.docs.map(toContact).sort((a, b) => a.id - b.id);
}

export interface SocietyStats {
  members: number;
  dues: number;
  openComplaints: number;
  unpaidBills: number;
  visitorsInside: number;
}

/** Ek society che counts — aggregation queries (single-field filters, index nako). */
export async function getSocietyStats(p: ProjectDef, code: string): Promise<SocietyStats> {
  const residents = sub(p, code, "residents");
  const [members, dues, openComplaints, unpaidBills, visitorsInside] = await Promise.all([
    count(residents),
    total(residents, "balanceDue"),
    count(query(sub(p, code, "complaints"), where("status", "in", ["OPEN", "IN_PROGRESS"]))),
    count(query(sub(p, code, "maintenance_bills"), where("status", "in", ["UNPAID", "PARTIAL"]))),
    count(query(sub(p, code, "visitor_logs"), where("status", "==", "INSIDE"))),
  ]);
  return { members, dues, openComplaints, unpaidBills, visitorsInside };
}

export interface SocietyOverview extends SocietyStats {
  societies: number;
}

/** Sagle societies milun — control center / projects page che queues. */
export async function getSocietyOverview(p: ProjectDef): Promise<SocietyOverview> {
  const list = await listSocieties(p);
  const stats = await Promise.all(list.map((s) => getSocietyStats(p, s.code)));
  const sumOf = (k: keyof SocietyStats) => stats.reduce((n, s) => n + s[k], 0);
  return {
    societies: list.length,
    members: sumOf("members"),
    dues: sumOf("dues"),
    openComplaints: sumOf("openComplaints"),
    unpaidBills: sumOf("unpaidBills"),
    visitorsInside: sumOf("visitorsInside"),
  };
}

// ── Writes (app jase lihito tasech) ──────────────────────────────────

/** App `updateComplaintStatus` sarkhe — notes rikame tar juna note tasach. */
export async function updateComplaintStatus(p: ProjectDef, code: string, c: Complaint, status: TicketStatus, notes: string) {
  await updateDoc(doc(sub(p, code, "complaints"), c.docId), {
    status,
    resolutionNotes: notes.trim() ? notes.trim() : c.resolutionNotes,
  });
}

export const isPin = (pin: string) => /^[0-9]{4}$/.test(pin);

/** App `resetResidentPin` sarkhe — fakt `pin` field. */
export async function resetResidentPin(p: ProjectDef, code: string, r: Resident, pin: string) {
  if (!isPin(pin)) throw new Error("PIN");
  await updateDoc(doc(sub(p, code, "residents"), r.docId), { pin });
}

// ── Member roles (app `roles_screen.dart` sobat same) ───────────────

const timeOf = (m: Raw, k: string): Date | null => (m[k] instanceof Timestamp ? (m[k] as Timestamp).toDate() : null);

export interface SocietyRole {
  id: string;
  name: string;
  description: string;
  /** App madhla built-in staff role — juna app hach vaparto. */
  baseRole: string;
  menus: RoleMenuKey[];
  isActive: boolean;
}

/** Fakt olakhiche screens, bottom bar chya kramane, ani kadhich rikame nahi (app `normaliseRoleMenus`). */
export const normaliseRoleMenus = (menus: readonly string[]): RoleMenuKey[] => {
  const wanted = new Set(menus.map((m) => m.trim().toUpperCase()));
  const out = ROLE_MENU_KEYS.filter((k) => wanted.has(k));
  return out.length ? out : ["COMMUNITY"];
};

const toRole = (s: DocumentSnapshot): SocietyRole => {
  const m = data(s);
  return {
    id: s.id,
    name: str(m, "name", s.id),
    description: str(m, "description"),
    baseRole: pick(STAFF_ROLES, m.baseRole, "MANAGER"),
    menus: normaliseRoleMenus(Array.isArray(m.menus) ? m.menus.filter((x): x is string => typeof x === "string") : []),
    isActive: bool(m, "isActive", true),
  };
};

export async function listRoles(p: ProjectDef, code: string): Promise<SocietyRole[]> {
  const snap = await getDocs(sub(p, code, "roles"));
  return snap.docs.map(toRole).sort((a, b) => a.name.localeCompare(b.name));
}

/** Role save + tyacha role asnarya members che naav / base role ekach batch madhe (app `saveRole`). */
export async function saveRole(p: ProjectDef, code: string, role: SocietyRole, holders: Resident[]) {
  const ref = role.id ? doc(sub(p, code, "roles"), role.id) : doc(sub(p, code, "roles"));
  const batch = writeBatch(db(p));
  batch.set(
    ref,
    {
      name: role.name.trim(),
      description: role.description.trim(),
      baseRole: role.baseRole,
      menus: normaliseRoleMenus(role.menus),
      isActive: role.isActive,
      updatedAt: serverTimestamp(),
      ...(role.id ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true },
  );
  for (const r of holders) {
    batch.update(doc(sub(p, code, "residents"), r.docId), { role: role.baseRole, customRoleName: role.name.trim() });
  }
  await batch.commit();
}

export async function deleteRole(p: ProjectDef, code: string, id: string) {
  await deleteDoc(doc(sub(p, code, "roles"), id));
}

export interface RoleChange {
  id: string;
  flatNumber: string;
  memberName: string;
  fromRole: string;
  toRole: string;
  fromCustomRoleName: string;
  toCustomRoleName: string;
  changedBy: string;
  source: "app" | "core";
  at: Date | null;
}

const toRoleChange = (s: DocumentSnapshot): RoleChange => {
  const m = data(s);
  return {
    id: s.id,
    flatNumber: str(m, "flatNumber"),
    memberName: str(m, "memberName"),
    fromRole: str(m, "fromRole"),
    toRole: str(m, "toRole"),
    fromCustomRoleName: str(m, "fromCustomRoleName"),
    toCustomRoleName: str(m, "toCustomRoleName"),
    changedBy: str(m, "changedBy"),
    source: str(m, "source") === "core" ? "core" : "app",
    at: timeOf(m, "at"),
  };
};

export async function listRoleHistory(p: ProjectDef, code: string): Promise<RoleChange[]> {
  const snap = await getDocs(query(sub(p, code, "role_history"), orderBy("at", "desc"), limit(200)));
  return snap.docs.map(toRoleChange);
}

/** Ek role badal — member record var fakt role fields, ani history entry, ekach batch madhe. */
export interface RoleAssignment {
  resident: Resident;
  role: string;
  custom: SocietyRole | null;
}

/**
 * Panel madhun role badal. Chairman navin konala kela tar juna chairman `demote` madhe
 * yeto — society la ek ani ekach chairman rahto (app `handOverChairman` sarkhe).
 */
export async function changeRoles(p: ProjectDef, code: string, changes: RoleAssignment[], changedBy: string) {
  const batch = writeBatch(db(p));
  for (const { resident: r, role, custom } of changes) {
    batch.update(doc(sub(p, code, "residents"), r.docId), {
      role: custom?.baseRole ?? role,
      customRoleId: custom?.id ?? "",
      customRoleName: custom?.name.trim() ?? "",
    });
    batch.set(doc(sub(p, code, "role_history")), {
      flatNumber: r.flatNumber,
      memberName: r.ownerName,
      fromRole: r.role,
      toRole: custom?.baseRole ?? role,
      fromCustomRoleName: r.customRoleName,
      toCustomRoleName: custom?.name.trim() ?? "",
      changedBy,
      source: "core",
      at: serverTimestamp(),
    });
  }
  await batch.commit();
}

// ── SocietySarv plans ani subscription ─────────────────────────────

/** Top-level `subscription_plans/{id}` — sagle societies sathi ek catalogue, fakt Core lihito. */
export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  durationMonths: number;
  features: string[];
  isActive: boolean;
  sortOrder: number;
}

const plans = (p: ProjectDef) => collection(db(p), "subscription_plans");

const toPlan = (s: DocumentSnapshot): SubscriptionPlan => {
  const m = data(s);
  return {
    id: s.id,
    name: str(m, "name", s.id),
    description: str(m, "description"),
    price: numOf(m, "price"),
    durationMonths: numOf(m, "durationMonths", 12),
    features: Array.isArray(m.features) ? m.features.filter((x): x is string => typeof x === "string") : [],
    isActive: bool(m, "isActive", true),
    sortOrder: numOf(m, "sortOrder"),
  };
};

export async function listPlans(p: ProjectDef): Promise<SubscriptionPlan[]> {
  const snap = await getDocs(plans(p));
  return snap.docs.map(toPlan).sort((a, b) => a.sortOrder - b.sortOrder || a.price - b.price);
}

export async function savePlan(p: ProjectDef, plan: SubscriptionPlan) {
  const ref = plan.id ? doc(plans(p), plan.id) : doc(plans(p));
  const batch = writeBatch(db(p));
  batch.set(
    ref,
    {
      name: plan.name.trim(),
      description: plan.description.trim(),
      price: Number(plan.price) || 0,
      durationMonths: Math.max(1, Math.round(plan.durationMonths)),
      features: plan.features.map((f) => f.trim()).filter(Boolean),
      isActive: plan.isActive,
      sortOrder: Math.round(plan.sortOrder) || 0,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await batch.commit();
}

/** `societies/{code}/subscription/current` — plan assign zala tevha chi kimat / features copy. */
export interface SocietySubscription {
  planId: string;
  planName: string;
  price: number;
  durationMonths: number;
  features: string[];
  startDate: string;
  expiryDate: string;
  updatedBy: string;
}

export type SubscriptionStatus = "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "NONE";
/** App `SUBSCRIPTION_EXPIRY_WARNING_DAYS` sobat same. */
export const EXPIRY_WARNING_DAYS = 15;

const dayOf = (iso: string) => {
  const [y, mo, d] = iso.split("-").map(Number);
  return y && mo && d ? Date.UTC(y, mo - 1, d) : NaN;
};
/** `yyyy-MM-dd` (local date). */
export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Expiry cha divas pan covered (app `subscriptionStatusOf` sarkhe). */
export function daysLeft(s: SocietySubscription, today = new Date()): number {
  return Math.round((dayOf(s.expiryDate) - dayOf(isoDay(today))) / 86_400_000);
}

export function subscriptionStatus(s: SocietySubscription | null, today = new Date()): SubscriptionStatus {
  if (!s || !s.planId.trim() || Number.isNaN(dayOf(s.expiryDate))) return "NONE";
  const left = daysLeft(s, today);
  if (left < 0) return "EXPIRED";
  return left <= EXPIRY_WARNING_DAYS ? "EXPIRING_SOON" : "ACTIVE";
}

/** Plan `start` pasun `months` mahine — shevatcha divas (start + months − 1 day). */
export function expiryFor(start: string, months: number): string {
  const [y, m, d] = start.split("-").map(Number);
  const end = new Date(y, m - 1 + months, d);
  end.setDate(end.getDate() - 1);
  return isoDay(end);
}

const toSubscription = (s: DocumentSnapshot): SocietySubscription => {
  const m = data(s);
  return {
    planId: str(m, "planId"),
    planName: str(m, "planName"),
    price: numOf(m, "price"),
    durationMonths: numOf(m, "durationMonths"),
    features: Array.isArray(m.features) ? m.features.filter((x): x is string => typeof x === "string") : [],
    startDate: str(m, "startDate"),
    expiryDate: str(m, "expiryDate"),
    updatedBy: str(m, "updatedBy"),
  };
};

const currentSub = (p: ProjectDef, code: string) => doc(sub(p, code, "subscription"), "current");

export async function getSubscription(p: ProjectDef, code: string): Promise<SocietySubscription | null> {
  const s = await getDoc(currentSub(p, code));
  return s.exists() ? toSubscription(s) : null;
}

export interface SubscriptionHistoryEntry extends SocietySubscription {
  id: string;
  action: "ASSIGNED" | "RENEWED" | "CHANGED" | "CANCELLED";
  at: Date | null;
}

export async function listSubscriptionHistory(p: ProjectDef, code: string): Promise<SubscriptionHistoryEntry[]> {
  const snap = await getDocs(query(sub(p, code, "subscription_history"), orderBy("at", "desc"), limit(100)));
  return snap.docs.map((d) => {
    const m = data(d);
    const action = str(m, "action");
    return {
      ...toSubscription(d),
      id: d.id,
      action: (["ASSIGNED", "RENEWED", "CHANGED", "CANCELLED"].includes(action) ? action : "ASSIGNED") as SubscriptionHistoryEntry["action"],
      at: timeOf(m, "at"),
    };
  });
}

export const REQUEST_STATUSES = ["PENDING", "DONE", "REJECTED"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export interface SubscriptionRequest {
  id: string;
  planId: string;
  planName: string;
  requestedBy: string;
  requestedFlat: string;
  contactNumber: string;
  note: string;
  status: RequestStatus;
  adminNote: string;
  createdAt: Date | null;
}

export async function listSubscriptionRequests(p: ProjectDef, code: string): Promise<SubscriptionRequest[]> {
  const snap = await getDocs(query(sub(p, code, "subscription_requests"), orderBy("createdAt", "desc"), limit(50)));
  return snap.docs.map((d) => {
    const m = data(d);
    return {
      id: d.id,
      planId: str(m, "planId"),
      planName: str(m, "planName"),
      requestedBy: str(m, "requestedBy"),
      requestedFlat: str(m, "requestedFlat"),
      contactNumber: str(m, "contactNumber"),
      note: str(m, "note"),
      status: pick(REQUEST_STATUSES, m.status, "PENDING"),
      adminNote: str(m, "adminNote"),
      createdAt: timeOf(m, "createdAt"),
    };
  });
}

/**
 * Society la plan dene / renew / badalne: `current`, history entry ani (asel tar) request
 * `DONE` — ekach batch madhe, mhanje app la nehmi purna mahiti disel.
 */
export async function assignSubscription(
  p: ProjectDef,
  code: string,
  plan: SubscriptionPlan,
  startDate: string,
  by: string,
  previous: SocietySubscription | null,
  requestId?: string,
) {
  const record = {
    planId: plan.id,
    planName: plan.name,
    price: plan.price,
    durationMonths: plan.durationMonths,
    features: plan.features,
    startDate,
    expiryDate: expiryFor(startDate, plan.durationMonths),
    updatedBy: by,
  };
  const action = !previous || subscriptionStatus(previous) === "NONE" ? "ASSIGNED" : previous.planId === plan.id ? "RENEWED" : "CHANGED";
  const batch = writeBatch(db(p));
  batch.set(currentSub(p, code), { ...record, updatedAt: serverTimestamp() });
  batch.set(doc(sub(p, code, "subscription_history")), { ...record, action, at: serverTimestamp() });
  if (requestId) {
    batch.update(doc(sub(p, code, "subscription_requests"), requestId), { status: "DONE", adminNote: "", closedBy: by, closedAt: serverTimestamp() });
  }
  await batch.commit();
}

/** Plan band — `current` kadhla jato, history madhe `CANCELLED` nond. */
export async function cancelSubscription(p: ProjectDef, code: string, previous: SocietySubscription, by: string) {
  const batch = writeBatch(db(p));
  batch.delete(currentSub(p, code));
  batch.set(doc(sub(p, code, "subscription_history")), { ...previous, updatedBy: by, action: "CANCELLED", at: serverTimestamp() });
  await batch.commit();
}

export async function closeSubscriptionRequest(p: ProjectDef, code: string, id: string, status: Exclude<RequestStatus, "PENDING">, note: string, by: string) {
  await updateDoc(doc(sub(p, code, "subscription_requests"), id), { status, adminNote: note.trim(), closedBy: by, closedAt: serverTimestamp() });
}
