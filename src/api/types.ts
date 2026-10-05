/**
 * Shared schema — NOAI (ani same-structure projects) che Firestore documents.
 * Field names `noai/functions/src/*.ts` shi match aahet.
 */

export type Role = "customer" | "worker" | "business" | "admin";
export const ROLES: Role[] = ["customer", "worker", "business", "admin"];

export type KycStatus = "notSubmitted" | "pending" | "verified" | "rejected";
export const KYC_STATUSES: KycStatus[] = ["notSubmitted", "pending", "verified", "rejected"];

export type TaskStatus =
  | "posted"
  | "accepted"
  | "navigating"
  | "arrived"
  | "inProgress"
  | "proofUploaded"
  | "submitted"
  | "paid"
  | "cancelled"
  | "disputed";

export const TASK_STATUSES: TaskStatus[] = [
  "posted",
  "accepted",
  "navigating",
  "arrived",
  "inProgress",
  "proofUploaded",
  "submitted",
  "paid",
  "cancelled",
  "disputed",
];

/** App madhla `JobStatus.isActiveJob`. */
export const LIVE_STATUSES: TaskStatus[] = [
  "accepted",
  "navigating",
  "arrived",
  "inProgress",
  "proofUploaded",
  "submitted",
  "disputed",
];

export type DisputeStatus = "open" | "underReview" | "resolvedCustomer" | "resolvedWorker" | "closed";

export type TxnType = "escrowHold" | "escrowRelease" | "payout" | "refund" | "topUp" | "platformFee";
export const TXN_TYPES: TxnType[] = [
  "topUp",
  "escrowHold",
  "escrowRelease",
  "platformFee",
  "refund",
  "payout",
];

export type PayoutStatus = "requested" | "paid" | "failed";

export interface Location {
  latitude?: number;
  longitude?: number;
  address?: string;
  landmark?: string;
  city?: string;
  pincode?: string;
}

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  activeRole: Role;
  availableRoles: Role[];
  kycStatus: KycStatus;
  isBlocked: boolean;
  isOnline?: boolean;
  rating: number;
  ratingCount: number;
  completedJobs: number;
  skills: string[];
  businessName?: string | null;
  gstin?: string | null;
  upiId?: string | null;
  language?: string;
  location?: Location | null;
  joinedAt: Date | null;
  /** Profile photo (`users/{uid}/avatar.jpg`). */
  photoUrl?: string | null;
  /** Admin ne KYC return kela tar karan. */
  kycRejectReason?: string | null;
}

/** Admin panel madhun badalta yenare fields (`adminUpdateUser`). */
export interface UserChanges {
  name?: string;
  email?: string;
  businessName?: string;
  upiId?: string;
  city?: string;
  skills?: string[];
  availableRoles?: Role[];
}

export interface Wallet {
  balance: number;
  escrowHeld: number;
  pendingPayout: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  upiId?: string;
}

export interface KycDoc {
  uid: string;
  documentType: string;
  documentNumber: string;
  gstin: string | null;
  status: KycStatus;
  submittedAt: Date | null;
  reviewedAt?: Date | null;
  rejectionReason?: string | null;
}

export interface TaskProof {
  photoLabels: string[];
  photoUrls: Record<string, string>;
  notes: string;
  checklist: Record<string, boolean>;
  uploadedAt: Date | null;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  categoryName: string;
  customerId: string;
  customerName: string;
  workerId: string | null;
  workerName: string | null;
  businessId: string | null;
  workerIsEmployee: boolean;
  budget: number;
  status: TaskStatus;
  isUrgent: boolean;
  location: Location;
  createdAt: Date | null;
  scheduledAt: Date | null;
  acceptedAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  cancelReason?: string;
  estimatedDurationMins?: number;
  statusHistory: Partial<Record<TaskStatus, Date | null>>;
  proof?: TaskProof | null;
  customerRating?: number | null;
  customerReview?: string | null;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  isSystem: boolean;
  sentAt: Date | null;
}

export interface Escrow {
  taskId: string;
  customerId: string;
  amount: number;
  status: "held" | "released" | "refunded";
  heldAt: Date | null;
  releasedAt?: Date | null;
  refundedAt?: Date | null;
}

export interface Dispute {
  id: string;
  taskId: string;
  taskTitle: string;
  raisedBy: string;
  raisedByName: string;
  raisedByRole: string;
  againstName: string;
  reason: string;
  amountInEscrow: number;
  status: DisputeStatus;
  resolutionNote?: string;
  createdAt: Date | null;
  resolvedAt?: Date | null;
}

export interface Transaction {
  id: string;
  userId: string;
  type: TxnType;
  amount: number;
  reference: string;
  counterparty: string;
  taskId: string | null;
  taskTitle: string | null;
  isSettled: boolean;
  createdAt: Date | null;
}

export interface Payout {
  id: string;
  uid: string;
  amount: number;
  upiId: string;
  status: PayoutStatus;
  utr?: string;
  transactionId: string;
  requestedAt: Date | null;
  settledAt?: Date | null;
  user?: Pick<User, "name" | "phone" | "businessName" | "kycStatus"> | null;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  startingPrice: number;
  subCategories: string[];
  activeJobs: number;
  sortOrder?: number;
  colorValue?: number;
  parentId?: string | null;
}

export interface DashboardStats {
  totalUsers: number;
  workers: number;
  businesses: number;
  customers: number;
  newUsersInRange: number;
  liveTasks: number;
  openTasks: number;
  completedTasks: number;
  pendingKyc: number;
  openDisputes: number;
  pendingPayouts: number;
  pendingPayoutAmount: number;
  blockedUsers: number;
  escrowHeld: number;
  releasedInRange: number;
  feesInRange: number;
  feesLifetime: number;
  statusBreakdown: { status: TaskStatus; count: number }[];
  /** Divasa-pramane (day = ISO yyyy-mm-dd; label render veli current bhashet). */
  trend: DayPoint[];
  topCategories: { name: string; count: number; budget: number }[];
  topCities: { name: string; count: number }[];
  /** Range madhe post zalele tasks kuthparyant pohochle. */
  funnel: { posted: number; accepted: number; completed: number; cancelled: number };
  newUsersByRole: { customer: number; worker: number; business: number };
}

export interface DayPoint {
  day: string;
  /** Escrow madhe aalele paise (GMV). */
  gmv: number;
  holds: number;
  revenue: number;
  tasks: number;
  signups: number;
}
