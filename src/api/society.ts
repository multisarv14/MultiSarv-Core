import {
  collection,
  doc,
  getAggregateFromServer,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  sum,
  updateDoc,
  where,
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
