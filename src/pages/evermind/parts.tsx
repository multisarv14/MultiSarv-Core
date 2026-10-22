import { useQuery } from "@tanstack/react-query";

import type { Company, EmUser } from "@/api/evermind";
import { Badge, type Tone } from "@/components/ui/primitives";
import type { ProjectDef } from "@/config/projects";
import { useProject } from "@/context/project";
import { t, type MsgKey } from "@/i18n";

/**
 * EverMind query. Key `[project.id, "em", ...key]` — header cha Refresh (`[project.id]`) sagla punha load
 * karto. EverMind server sagla ekdach deto (≤ 500 companies / 1000 users), mhanun filter browser madhe.
 */
export function useEmQuery<T>(key: (string | number)[], fn: (p: ProjectDef) => Promise<T>) {
  const { project } = useProject();
  return useQuery({ queryKey: [project.id, "em", ...key], queryFn: () => fn(project), staleTime: 30_000 });
}

const PLAN_TONE: Record<string, Tone> = { free: "neutral", pro: "violet", business: "blue" };
export const planLabel = (plan: string) => (["free", "pro", "business"].includes(plan) ? t(`em.plan.${plan}` as MsgKey) : plan);
export const PlanBadge = ({ plan }: { plan: string }) => <Badge tone={PLAN_TONE[plan] ?? "neutral"}>{planLabel(plan)}</Badge>;

const BILLING: Record<NonNullable<Company["billingStatus"]>, { tone: Tone; label: MsgKey }> = {
  active: { tone: "green", label: "em.billing.active" },
  past_due: { tone: "amber", label: "em.billing.past_due" },
  cancelled: { tone: "neutral", label: "em.billing.cancelled" },
};
export const BillingBadge = ({ status }: { status: Company["billingStatus"] }) =>
  status ? <Badge tone={BILLING[status].tone}>{t(BILLING[status].label)}</Badge> : <span className="text-xs text-muted">{t("em.billing.none")}</span>;

const ROLE_TONE: Record<NonNullable<EmUser["role"]>, Tone> = { owner: "violet", admin: "blue", member: "neutral", viewer: "neutral" };
export const roleLabel = (role: EmUser["role"]) => (role ? t(`em.role.${role}` as MsgKey) : "—");
export const RoleBadge = ({ role }: { role: EmUser["role"] }) => (role ? <Badge tone={ROLE_TONE[role]}>{roleLabel(role)}</Badge> : null);

/** Text madhe shodh — sagle dilele fields. */
export const matches = (q: string, ...fields: (string | number | null | undefined)[]) => {
  const s = q.trim().toLowerCase();
  return !s || fields.some((f) => String(f ?? "").toLowerCase().includes(s));
};

/** `2026-10` (this month, local). */
export const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
