import { Bot, Building2, CircleArrowUp, Coins, IndianRupee, TrendingUp, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { getOverview, getReport, PLANS, type ReportRow } from "@/api/evermind";
import type { EverMindMenuKey } from "@/components/layout/nav";
import { DataTable, ErrorState, PageHeader, StatCard, type Column } from "@/components/ui/data";
import { Card, CardHeader, EmptyState, Input } from "@/components/ui/primitives";
import { allows, useProject } from "@/context/project";
import { t } from "@/i18n";
import { money, num } from "@/lib/format";
import { cn, downloadCsv } from "@/lib/utils";

import { PlanBadge, planLabel, thisMonth, useEmQuery } from "./parts";

export function EverMindDashboard() {
  const { project, menus } = useProject();
  const navigate = useNavigate();
  const overview = useEmQuery(["overview"], getOverview);
  const [month, setMonth] = useState(thisMonth);
  const report = useEmQuery(["report", month], (p) => getReport(p, month));
  const o = overview.data;
  const go = (to: EverMindMenuKey) => (allows(menus, to) ? () => navigate(`/e/${project.id}/${to}`) : undefined);

  const columns: Column<ReportRow>[] = [
    {
      key: "company",
      header: t("em.col.company"),
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.company}</p>
          <PlanBadge plan={r.plan} />
        </div>
      ),
    },
    { key: "calls", header: t("em.col.calls"), hideSm: true, cell: (r) => <span className="tabular">{num(r.calls)}</span> },
    { key: "credits", header: t("em.col.credits"), hideSm: true, cell: (r) => <span className="tabular">{num(r.credits)}</span> },
    { key: "cost", header: t("em.col.aiCost"), cell: (r) => <span className="tabular">{money(r.aiCostInr)}</span> },
    { key: "revenue", header: t("em.col.revenue"), cell: (r) => <span className="tabular">{money(r.revenueInr)}</span> },
    {
      key: "margin",
      header: t("em.col.margin"),
      cell: (r) => (
        <span className={cn("font-semibold tabular", r.marginInr < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
          {money(r.marginInr)}
        </span>
      ),
    },
  ];

  const rows = report.data?.rows ?? [];

  return (
    <>
      <PageHeader title={project.name} description={t("em.dash.desc")} />

      {overview.error ? (
        <ErrorState error={overview.error} onRetry={overview.refetch} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard index={0} label={t("em.stat.companies")} value={num(o?.companies)} icon={<Building2 className="size-4" />} loading={overview.isLoading} onClick={go("companies")} />
          <StatCard index={1} tone="blue" label={t("em.stat.users")} value={num(o?.users)} icon={<Users className="size-4" />} loading={overview.isLoading} onClick={go("users")} />
          <StatCard index={2} tone="amber" label={t("em.nav.upgrades")} value={num(o?.upgradeRequests)} icon={<CircleArrowUp className="size-4" />} loading={overview.isLoading} onClick={go("upgrades")} />
          <StatCard index={3} tone="violet" label={t("em.stat.calls")} value={num(o?.month.calls)} icon={<Bot className="size-4" />} loading={overview.isLoading} />
          <StatCard index={4} tone="red" label={t("em.stat.aiCost")} value={money(o?.month.aiCostInr)} icon={<Coins className="size-4" />} loading={overview.isLoading} />
          <StatCard index={5} tone="green" label={t("em.stat.revenue")} value={money(o?.month.revenueInr)} icon={<IndianRupee className="size-4" />} loading={overview.isLoading} />
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title={t("em.dash.plans")} />
          <div className="space-y-3 px-5 pb-5">
            {PLANS.map((plan) => {
              const n = o?.plans[plan] ?? 0;
              const pct = o?.companies ? Math.round((n / o.companies) * 100) : 0;
              return (
                <div key={plan}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{planLabel(plan)}</span>
                    <span className="text-muted tabular">
                      {num(n)} · {pct}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="lg:col-span-2">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <TrendingUp className="size-4 text-muted" />
            <p className="flex-1 text-sm font-semibold">{t("em.dash.report")}</p>
            <Input type="month" className="w-40" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} />
            <button
              type="button"
              className="text-xs font-medium text-accent hover:underline disabled:opacity-40"
              disabled={rows.length === 0}
              onClick={() => downloadCsv(`evermind-${month}.csv`, rows.map((r) => ({ ...r })))}
            >
              CSV
            </button>
          </div>
          {report.error ? (
            <ErrorState error={report.error} onRetry={report.refetch} />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.companyId}
              loading={report.isLoading}
              empty={<EmptyState icon={<Bot className="size-5" />} title={t("em.dash.reportEmpty")} />}
            />
          )}
        </div>
      </div>
    </>
  );
}
