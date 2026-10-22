import type { ProjectDef } from "@/config/projects";
import { t } from "@/i18n";
import { services } from "@/lib/firebase";

/**
 * EverMind data — Firestore madhun nahi (tithe rules sagla nakartat ani `users` madhe password hash aahe),
 * tar EverMind app chya `/api/admin/*` madhun. Panel cha EverMind ID token (core ne dilela, `menus` claim
 * sobat) `Authorization: Bearer` mhanun jato; EverMind `src/lib/admin.ts` to tapasto.
 */

type Method = "GET" | "POST" | "PATCH" | "DELETE";

async function call<T>(p: ProjectDef, path: string, method: Method = "GET", body?: Record<string, unknown>): Promise<T> {
  if (!p.apiUrl) throw new Error(t("em.err.noApiUrl", { name: p.name }));
  const user = services(p).auth.currentUser;
  if (!user) throw new Error(t("em.err.signedOut"));
  const token = await user.getIdToken();

  let res: Response;
  try {
    res = await fetch(`${p.apiUrl}/api/admin/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Network / CORS — EverMind chya PANEL_ORIGINS madhe ha site nasel tar pan ithech.
    throw new Error(t("em.err.unreachable", { url: p.apiUrl }));
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    if (res.status === 403) throw new Error(t("em.err.noSection"));
    throw new Error(data.error || t("em.err.status", { status: res.status }));
  }
  return data;
}

const toDate = (v: unknown) => (typeof v === "string" || typeof v === "number" ? new Date(v) : null);

// ── Plans (EverMind `src/lib/plans.ts` sobat same) ───────────────────

export const PLANS = ["free", "pro", "business"] as const;
export type PlanId = (typeof PLANS)[number];

// ── Overview + month report ──────────────────────────────────────────

export interface Overview {
  companies: number;
  users: number;
  plans: Record<PlanId, number>;
  upgradeRequests: number;
  month: { month: string; calls: number; credits: number; aiCostInr: number; revenueInr: number };
}

export const getOverview = (p: ProjectDef) => call<Overview>(p, "overview");

export interface ReportRow {
  companyId: string;
  company: string;
  plan: string;
  calls: number;
  credits: number;
  aiCostInr: number;
  revenueInr: number;
  marginInr: number;
}

/** AI cost vs revenue per company for one month (`YYYY-MM`). */
export const getReport = (p: ProjectDef, month: string) =>
  call<{ month: string; usdToInr: number; rows: ReportRow[] }>(p, `report?month=${encodeURIComponent(month)}`);

// ── Companies ────────────────────────────────────────────────────────

export interface Company {
  id: string;
  name: string;
  owner: string | null;
  industry: string | null;
  teamSize: string;
  /** Saved plan; `effectivePlan` = what applies now (a lapsed subscription falls back to free). */
  plan: string;
  effectivePlan: string;
  members: number;
  seats: number;
  creditsUsed: number;
  allowance: number;
  packBalance: number;
  billingStatus: "active" | "past_due" | "cancelled" | null;
  requestedPlan: string | null;
  createdAt: Date | null;
}

export async function listCompanies(p: ProjectDef): Promise<{ rows: Company[]; truncated: boolean }> {
  const res = await call<{ companies: (Omit<Company, "createdAt"> & { createdAt: unknown })[]; truncated: boolean }>(p, "companies");
  return { rows: res.companies.map((c) => ({ ...c, createdAt: toDate(c.createdAt) })), truncated: res.truncated };
}

/** Plan by hand (no payment) — also closes the company's upgrade request. Returns EverMind's warning, if any. */
export const setCompanyPlan = (p: ProjectDef, companyId: string, plan: PlanId) =>
  call<{ ok: true; warning: string | null }>(p, `companies/${encodeURIComponent(companyId)}`, "PATCH", { plan });

/** Free credits, valid 12 months, used after the monthly allowance. */
export const grantCredits = (p: ProjectDef, companyId: string, credits: number, note: string) =>
  call<{ ok: true }>(p, `companies/${encodeURIComponent(companyId)}/credits`, "POST", { credits, note });

// ── Users ────────────────────────────────────────────────────────────

export interface EmUser {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member" | "viewer" | null;
  companyId: string | null;
  company: string | null;
  platformAdmin: boolean;
  createdAt: Date | null;
  passwordChangedAt: Date | null;
}

export async function listUsers(p: ProjectDef): Promise<{ rows: EmUser[]; truncated: boolean }> {
  const res = await call<{ users: (Omit<EmUser, "createdAt" | "passwordChangedAt"> & { createdAt: unknown; passwordChangedAt: unknown })[]; truncated: boolean }>(
    p,
    "users",
  );
  return {
    rows: res.users.map((u) => ({ ...u, createdAt: toDate(u.createdAt), passwordChangedAt: toDate(u.passwordChangedAt) })),
    truncated: res.truncated,
  };
}

/** One-hour reset link, emailed to the user and returned (to pass on when email isn't working). */
export const sendResetLink = (p: ProjectDef, userId: string) =>
  call<{ link: string; emailed: boolean }>(p, `users/${encodeURIComponent(userId)}/reset`, "POST");

// ── Upgrade requests ─────────────────────────────────────────────────

export interface UpgradeRequest {
  id: string;
  companyId: string;
  company: string;
  currentPlan: string | null;
  plan: string;
  note: string;
  requestedBy: { name: string; email: string } | null;
  createdAt: Date | null;
}

export async function listUpgradeRequests(p: ProjectDef): Promise<UpgradeRequest[]> {
  const res = await call<{ requests: (Omit<UpgradeRequest, "createdAt"> & { createdAt: unknown })[] }>(p, "upgrade-requests");
  return res.requests.map((r) => ({ ...r, createdAt: toDate(r.createdAt) }));
}

/** Approve = plan change (also closes the request). */
export const approveUpgrade = (p: ProjectDef, r: UpgradeRequest) => setCompanyPlan(p, r.companyId, r.plan as PlanId);

export const dismissUpgrade = (p: ProjectDef, id: string) => call<{ ok: true }>(p, `upgrade-requests/${encodeURIComponent(id)}`, "DELETE");
