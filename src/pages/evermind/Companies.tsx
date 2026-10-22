import { useQueryClient } from "@tanstack/react-query";
import { Building2, Download, Gift, Repeat } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { grantCredits, listCompanies, PLANS, setCompanyPlan, type Company, type PlanId } from "@/api/evermind";
import { DataTable, ErrorState, PageHeader, type Column } from "@/components/ui/data";
import { Modal } from "@/components/ui/overlay";
import { Avatar, Badge, Button, EmptyState, Input, Label, Segmented, Select } from "@/components/ui/primitives";
import { useProject } from "@/context/project";
import { t } from "@/i18n";
import { errorMessage } from "@/lib/firebase";
import { date, num } from "@/lib/format";
import { cn, downloadCsv } from "@/lib/utils";

import { BillingBadge, matches, PlanBadge, planLabel, useEmQuery } from "./parts";

/** EverMind `MAX_GRANT` sobat same. */
const MAX_GRANT = 100_000_000;

type Action = { kind: "plan" | "credits"; company: Company } | null;

function PlanDialog({ company, onClose }: { company: Company | null; onClose: () => void }) {
  const { project } = useProject();
  const qc = useQueryClient();
  const [plan, setPlan] = useState<PlanId>("pro");
  const [busy, setBusy] = useState(false);
  const [shownFor, setShownFor] = useState<string | null>(null);

  // Navin company ughadli ki tyacha sadhya plan (kinva magitlela) default.
  if (company && shownFor !== company.id) {
    setShownFor(company.id);
    setPlan(((company.requestedPlan ?? company.plan) as PlanId) || "free");
  }

  const save = async () => {
    if (!company) return;
    setBusy(true);
    try {
      const res = await setCompanyPlan(project, company.id, plan);
      toast.success(t("em.plan.done", { name: company.name, plan: planLabel(plan) }));
      if (res.warning) toast.warning(res.warning, { duration: 10_000 });
      qc.invalidateQueries({ queryKey: [project.id, "em"] });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!company}
      onClose={busy ? () => {} : onClose}
      size="sm"
      title={t("em.plan.title")}
      description={company?.name}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("act.cancel")}
          </Button>
          <Button variant="primary" loading={busy} disabled={!company || plan === company.plan} onClick={save}>
            {t("act.save")}
          </Button>
        </>
      }
    >
      <Label>{t("em.col.plan")}</Label>
      <Select value={plan} onChange={(e) => setPlan(e.target.value as PlanId)}>
        {PLANS.map((p) => (
          <option key={p} value={p}>
            {planLabel(p)}
          </option>
        ))}
      </Select>
      <p className="mt-3 text-xs leading-relaxed text-muted">{t("em.plan.note")}</p>
    </Modal>
  );
}

function CreditsDialog({ company, onClose }: { company: Company | null; onClose: () => void }) {
  const { project } = useProject();
  const qc = useQueryClient();
  const [credits, setCredits] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const n = Number(credits);
  const valid = Number.isInteger(n) && n > 0 && n <= MAX_GRANT;

  const close = () => {
    if (busy) return;
    setCredits("");
    setNote("");
    onClose();
  };

  const save = async () => {
    if (!company || !valid) return;
    setBusy(true);
    try {
      await grantCredits(project, company.id, n, note.trim());
      toast.success(t("em.credits.done", { n: num(n), name: company.name }));
      qc.invalidateQueries({ queryKey: [project.id, "em"] });
      setCredits("");
      setNote("");
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!company}
      onClose={close}
      size="sm"
      title={t("em.credits.title")}
      description={company?.name}
      footer={
        <>
          <Button onClick={close} disabled={busy}>
            {t("act.cancel")}
          </Button>
          <Button variant="primary" loading={busy} disabled={!valid} onClick={save}>
            {t("em.credits.give")}
          </Button>
        </>
      }
    >
      <Label hint={t("em.credits.hint", { max: num(MAX_GRANT) })}>{t("em.col.credits")}</Label>
      <Input
        autoFocus
        inputMode="numeric"
        className="font-mono"
        value={credits}
        placeholder="100000"
        onChange={(e) => setCredits(e.target.value.replace(/\D/g, "").slice(0, 9))}
        onKeyDown={(e) => e.key === "Enter" && save()}
      />
      <div className="mt-3">
        <Label hint={t("word.optional")}>{t("em.credits.note")}</Label>
        <Input value={note} maxLength={200} placeholder={t("em.credits.notePlaceholder")} onChange={(e) => setNote(e.target.value)} />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">{t("em.credits.validity")}</p>
    </Modal>
  );
}

export function Companies() {
  const list = useEmQuery(["companies"], listCompanies);
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState<PlanId | "all">("all");
  const [action, setAction] = useState<Action>(null);

  const all = list.data?.rows ?? [];
  const rows = all.filter((c) => (plan === "all" || c.effectivePlan === plan) && matches(q, c.name, c.owner, c.industry, c.id));
  const countOf = (p: PlanId) => all.filter((c) => c.effectivePlan === p).length;

  const columns: Column<Company>[] = [
    {
      key: "name",
      header: t("em.col.company"),
      cell: (c) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={c.name} seed={c.id} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium">{c.name}</p>
            <p className="truncate text-[11px] text-muted">{c.owner ?? "—"}</p>
          </div>
        </div>
      ),
    },
    {
      key: "plan",
      header: t("em.col.plan"),
      cell: (c) => (
        <div className="flex flex-wrap items-center gap-1">
          <PlanBadge plan={c.effectivePlan} />
          {c.effectivePlan !== c.plan && <span className="text-[11px] text-muted">({planLabel(c.plan)})</span>}
          {c.requestedPlan && (
            <Badge tone="amber" dot>
              {t("em.requested", { plan: planLabel(c.requestedPlan) })}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "members",
      header: t("em.col.members"),
      hideSm: true,
      cell: (c) => (
        <span className={cn("tabular", c.members >= c.seats && "font-semibold text-amber-600 dark:text-amber-400")}>
          {num(c.members)} / {num(c.seats)}
        </span>
      ),
    },
    {
      key: "usage",
      header: t("em.col.usage"),
      cell: (c) => {
        const pct = c.allowance ? Math.min(100, Math.round((c.creditsUsed / c.allowance) * 100)) : 0;
        return (
          <div className="w-32">
            <p className="text-xs tabular">
              {num(c.creditsUsed)} / {num(c.allowance)}
            </p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className={cn("h-full rounded-full", pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-accent")} style={{ width: `${pct}%` }} />
            </div>
            {c.packBalance > 0 && <p className="mt-0.5 text-[11px] text-muted">{t("em.extraCredits", { n: num(c.packBalance) })}</p>}
          </div>
        );
      },
    },
    { key: "billing", header: t("em.col.billing"), hideSm: true, cell: (c) => <BillingBadge status={c.billingStatus} /> },
    { key: "created", header: t("em.col.created"), hideSm: true, cell: (c) => <span className="text-xs text-muted">{date(c.createdAt)}</span> },
    {
      key: "act",
      header: "",
      className: "text-right",
      cell: (c) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" icon={<Repeat className="size-3.5" />} onClick={() => setAction({ kind: "plan", company: c })}>
            {t("em.plan.change")}
          </Button>
          <Button size="sm" variant="ghost" icon={<Gift className="size-3.5" />} onClick={() => setAction({ kind: "credits", company: c })}>
            {t("em.credits.short")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("em.nav.companies")}
        description={t("em.companies.desc")}
        actions={
          <>
            <Input className="min-w-0 flex-1 sm:w-64 sm:flex-none" value={q} placeholder={t("em.companies.search")} onChange={(e) => setQ(e.target.value)} />
            <Button
              icon={<Download className="size-4" />}
              disabled={rows.length === 0}
              onClick={() =>
                downloadCsv(
                  "evermind-companies.csv",
                  rows.map((c) => ({
                    id: c.id,
                    name: c.name,
                    owner: c.owner,
                    industry: c.industry,
                    teamSize: c.teamSize,
                    plan: c.plan,
                    effectivePlan: c.effectivePlan,
                    members: c.members,
                    seats: c.seats,
                    creditsUsed: c.creditsUsed,
                    allowance: c.allowance,
                    extraCredits: c.packBalance,
                    billing: c.billingStatus,
                    requestedPlan: c.requestedPlan,
                    created: c.createdAt?.toISOString() ?? "",
                  })),
                )
              }
            >
              CSV
            </Button>
          </>
        }
      />
      <Segmented
        className="mb-3"
        value={plan}
        onChange={setPlan}
        options={[
          { value: "all", label: t("word.all"), count: all.length },
          ...PLANS.map((p) => ({ value: p, label: planLabel(p), count: countOf(p) })),
        ]}
      />
      {list.data?.truncated && <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">{t("em.truncated", { n: num(all.length) })}</p>}
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          loading={list.isLoading}
          empty={<EmptyState icon={<Building2 className="size-5" />} title={t("em.companies.empty")} />}
        />
      )}
      <PlanDialog company={action?.kind === "plan" ? action.company : null} onClose={() => setAction(null)} />
      <CreditsDialog company={action?.kind === "credits" ? action.company : null} onClose={() => setAction(null)} />
    </>
  );
}
