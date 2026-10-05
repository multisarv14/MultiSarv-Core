import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  IndianRupee,
  Landmark,
  ListChecks,
  Scale,
  ShieldAlert,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DayPoint } from "@/api/types";
import { ErrorState, PageHeader, StatCard } from "@/components/ui/data";
import { CountUp, rise } from "@/components/ui/motion";
import { Card, CardHeader, EmptyState, Segmented, Skeleton } from "@/components/ui/primitives";
import { roleLabel, taskLabel } from "@/components/ui/status";
import { useProject } from "@/context/project";
import { useDashboard } from "@/hooks/queries";
import { t, type MsgKey } from "@/i18n";
import { dayLabel, money, moneyCompact, num } from "@/lib/format";
import { cn } from "@/lib/utils";

type Range = "7" | "30" | "90";
type Metric = "gmv" | "revenue" | "tasks" | "signups";

const METRICS: { value: Metric; label: MsgKey; money: boolean }[] = [
  { value: "gmv", label: "dash.metric.gmv", money: true },
  { value: "revenue", label: "dash.metric.revenue", money: true },
  { value: "tasks", label: "dash.metric.tasks", money: false },
  { value: "signups", label: "dash.metric.signups", money: false },
];

const day = (iso: string) => dayLabel(new Date(`${iso}T12:00:00`));

function ChartTip({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-pop">{children}</div>;
}

/** Ekach hue chi bar list — magnitude sathi (10 rang na vaparta). */
function BarList({
  rows,
  onClick,
}: {
  rows: { label: string; value: number; key: string; extra?: string }[];
  onClick?: (key: string) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-1">
      {rows.map((r, i) => (
        <li key={r.key} className="animate-rise" style={rise(i)}>
          <button
            onClick={onClick ? () => onClick(r.key) : undefined}
            className={cn(
              "group relative flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-sm",
              onClick && "hover:bg-surface-2",
            )}
            title={`${r.label}: ${num(r.value)}`}
          >
            <span
              className="absolute inset-y-0.5 left-0 rounded-[4px] bg-accent/15 transition-all duration-700 ease-out group-hover:bg-accent/25"
              style={{ width: `${Math.max(r.value > 0 ? 2 : 0, (r.value / max) * 100)}%` }}
            />
            <span className="relative truncate">{r.label}</span>
            <span className="relative flex shrink-0 items-baseline gap-2">
              {r.extra && <span className="text-[11px] text-muted">{r.extra}</span>}
              <span className="font-medium tabular">{num(r.value)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function TrendChart({ data, metric }: { data: DayPoint[]; metric: (typeof METRICS)[number] }) {
  const fmt = (v: number) => (metric.money ? moneyCompact(v) : num(v));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="day"
          tickFormatter={day}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          minTickGap={24}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          allowDecimals={false}
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          tickFormatter={fmt}
        />
        <Tooltip
          cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as DayPoint;
            return (
              <ChartTip>
                <p className="mb-1 font-medium text-muted">{day(p.day)}</p>
                <p className="font-semibold tabular">{metric.money ? money(p[metric.value]) : num(p[metric.value])}</p>
                {metric.value === "gmv" && <p className="text-muted tabular">{t("dash.trend.holds", { n: num(p.holds) })}</p>}
              </ChartTip>
            );
          }}
        />
        <Area
          key={metric.value}
          type="monotone"
          dataKey={metric.value}
          stroke="var(--accent)"
          strokeWidth={2}
          fill="url(#trendFill)"
          animationDuration={900}
          activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const ROLE_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];

function RoleDonut({
  rows,
  onClick,
}: {
  rows: { key: string; label: string; value: number; fresh: number }[];
  onClick: (key: string) => void;
}) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative size-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={total > 0 ? 2 : 0}
              stroke="var(--surface)"
              strokeWidth={2}
              cornerRadius={4}
              animationDuration={900}
              onClick={(d) => onClick((d as unknown as { key: string }).key)}
              className="cursor-pointer"
            >
              {rows.map((r, i) => (
                <Cell key={r.key} fill={ROLE_COLORS[i]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <ChartTip>
                    <p className="font-medium">{payload[0].name}</p>
                    <p className="tabular">{num(payload[0].value as number)}</p>
                  </ChartTip>
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular">
            <CountUp value={total} format={num} />
          </span>
          <span className="text-[11px] text-muted">{t("word.total")}</span>
        </div>
      </div>
      <ul className="w-full flex-1 space-y-1.5">
        {rows.map((r, i) => (
          <li key={r.key} className="animate-rise" style={rise(i + 2)}>
            <button
              onClick={() => onClick(r.key)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-surface-2"
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: ROLE_COLORS[i] }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{r.label}</span>
                <span className="block text-[11px] text-muted tabular">
                  {total ? Math.round((r.value / total) * 100) : 0}%
                  {r.fresh > 0 && (
                    <span className="ml-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                      {t("dash.roles.new", { n: num(r.fresh) })}
                    </span>
                  )}
                </span>
              </span>
              <span className="font-semibold tabular">{num(r.value)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Funnel({ f }: { f: { posted: number; accepted: number; completed: number; cancelled: number } }) {
  const steps = [
    { label: t("dash.funnel.posted"), value: f.posted, shade: "bg-accent/30" },
    { label: t("dash.funnel.accepted"), value: f.accepted, shade: "bg-accent/55" },
    { label: t("dash.funnel.completed"), value: f.completed, shade: "bg-accent" },
  ];
  const base = Math.max(1, f.posted);
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={s.label} className="animate-rise" style={rise(i)}>
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span>{s.label}</span>
            <span className="flex items-baseline gap-2">
              <span className="font-semibold tabular">{num(s.value)}</span>
              <span className="w-10 text-right text-[11px] text-muted tabular">
                {Math.round((s.value / base) * 100)}%
              </span>
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className={cn("h-full rounded-full transition-[width] duration-1000 ease-out", s.shade)}
              style={{ width: `${(s.value / base) * 100}%` }}
            />
          </div>
        </div>
      ))}
      {f.posted > 0 && (
        <p className="pt-1 text-xs text-muted">
          {t("dash.funnel.cancelRate", { pct: Math.round((f.cancelled / f.posted) * 100) })}
        </p>
      )}
    </div>
  );
}

export function Dashboard() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useState<Range>("30");
  const [metricKey, setMetricKey] = useState<Metric>("gmv");
  const { data, isLoading, error, refetch } = useDashboard(Number(range));
  const base = `/p/${project.id}`;

  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const loading = isLoading || !data;
  const series = (k: Metric) => data?.trend.map((d) => d[k]) ?? [];
  const sum = (k: Metric) => series(k).reduce((s, v) => s + v, 0);
  const metric = METRICS.find((m) => m.value === metricKey)!;
  const metricTotal = sum(metricKey);
  const peak = data?.trend.reduce<DayPoint | null>((best, d) => (!best || d[metricKey] > best[metricKey] ? d : best), null);
  const days = Number(range);

  const queues = [
    { label: t("dash.attention.kyc"), value: data?.pendingKyc, icon: BadgeCheck, to: "kyc", tone: "text-amber-500" },
    { label: t("dash.attention.disputes"), value: data?.openDisputes, icon: Scale, to: "disputes", tone: "text-rose-500" },
    {
      label: t("dash.attention.payouts"),
      value: data?.pendingPayouts,
      icon: Banknote,
      to: "payouts",
      tone: "text-cyan-500",
      extra: data && data.pendingPayoutAmount > 0 ? t("dash.attention.toSettle", { amount: money(data.pendingPayoutAmount) }) : undefined,
    },
  ];
  const allClear = data && !data.pendingKyc && !data.openDisputes && !data.pendingPayouts;

  return (
    <>
      <PageHeader
        title={t("nav.dashboard")}
        description={t("dash.subtitle", { project: project.name })}
        actions={
          <Segmented
            value={range}
            onChange={setRange}
            options={(["7", "30", "90"] as const).map((v) => ({ value: v, label: t(`dash.range.${v}`) }))}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          index={0}
          label={t("dash.kpi.gmv")}
          value={<CountUp value={sum("gmv")} format={moneyCompact} />}
          icon={<IndianRupee className="size-4" />}
          loading={loading}
          hint={t("time.lastDays", { n: days })}
          spark={series("gmv")}
        />
        <StatCard
          index={1}
          label={t("dash.kpi.revenue")}
          value={<CountUp value={data?.feesInRange ?? 0} format={moneyCompact} />}
          icon={<TrendingUp className="size-4" />}
          tone="green"
          loading={loading}
          hint={data && t("dash.kpi.lifetime", { amount: moneyCompact(data.feesLifetime) })}
          spark={series("revenue")}
        />
        <StatCard
          index={2}
          label={t("dash.kpi.escrow")}
          value={<CountUp value={data?.escrowHeld ?? 0} format={moneyCompact} />}
          icon={<Landmark className="size-4" />}
          tone="amber"
          loading={loading}
          hint={t("dash.kpi.liability")}
        />
        <StatCard
          index={3}
          label={t("dash.kpi.released")}
          value={<CountUp value={data?.releasedInRange ?? 0} format={moneyCompact} />}
          icon={<Wallet className="size-4" />}
          tone="violet"
          loading={loading}
          hint={t("time.lastDays", { n: days })}
        />
        <StatCard
          index={4}
          label={t("dash.kpi.live")}
          value={<CountUp value={data?.liveTasks ?? 0} format={num} />}
          icon={<ListChecks className="size-4" />}
          tone="blue"
          loading={loading}
          hint={data && t("dash.kpi.openToAccept", { n: num(data.openTasks) })}
          onClick={() => navigate(`${base}/tasks?status=live`)}
          spark={series("tasks")}
        />
        <StatCard
          index={5}
          label={t("dash.kpi.users")}
          value={<CountUp value={data?.totalUsers ?? 0} format={num} />}
          icon={<Users className="size-4" />}
          loading={loading}
          trend={data && data.newUsersInRange > 0 ? { value: data.newUsersInRange, label: `+${num(data.newUsersInRange)}` } : undefined}
          hint={t("dash.kpi.newIn", { n: days })}
          onClick={() => navigate(`${base}/users`)}
          spark={series("signups")}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="animate-rise lg:col-span-2" style={rise(3)}>
          <CardHeader
            title={t("dash.trend.title")}
            subtitle={
              loading
                ? undefined
                : `${t("dash.trend.subtitle", { total: metric.money ? money(metricTotal) : num(metricTotal) })}${
                    peak && peak[metricKey] > 0 ? ` · ${t("dash.trend.peak", { day: day(peak.day) })}` : ""
                  }`
            }
            action={
              <Segmented
                value={metricKey}
                onChange={setMetricKey}
                options={METRICS.map((m) => ({ value: m.value, label: t(m.label) }))}
              />
            }
          />
          <div className="h-72 px-2 pb-3">
            {loading ? <Skeleton className="mx-3 h-full" /> : <TrendChart data={data.trend} metric={metric} />}
          </div>
        </Card>

        <Card className="animate-rise" style={rise(4)}>
          <CardHeader title={t("dash.attention.title")} subtitle={t("dash.attention.subtitle")} />
          <div className="space-y-2 px-5 pb-5">
            {queues.map((q, i) => (
              <Link
                key={q.to}
                to={`${base}/${q.to}`}
                style={rise(i + 5)}
                className="animate-rise group flex items-center gap-3 rounded-xl border border-border p-3 transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-surface-2/50"
              >
                <span className={cn("relative flex size-9 items-center justify-center rounded-lg bg-surface-2", q.tone)}>
                  <q.icon className="size-4" />
                  {!loading && (q.value ?? 0) > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
                      <span className="animate-ping-soft absolute inset-0 rounded-full bg-rose-500/70" />
                      <span className="relative size-2.5 rounded-full bg-rose-500" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{q.label}</span>
                  {q.extra && <span className="block text-[11px] text-muted tabular">{q.extra}</span>}
                </span>
                {loading ? (
                  <Skeleton className="h-6 w-8" />
                ) : (
                  <span className="text-xl font-semibold tabular">
                    <CountUp value={q.value ?? 0} format={num} />
                  </span>
                )}
                <ArrowRight className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" />
              </Link>
            ))}
            {allClear && (
              <p className="flex items-center gap-2 px-1 pt-1 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5" />
                {t("dash.attention.clear")}
              </p>
            )}
            {data && data.blockedUsers > 0 && (
              <Link
                to={`${base}/users?blocked=1`}
                className="flex items-center gap-2 rounded-lg px-1 pt-1 text-xs text-muted hover:text-text"
              >
                <ShieldAlert className="size-3.5 text-rose-500" />
                {t("dash.attention.blocked", { n: num(data.blockedUsers) })}
              </Link>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="animate-rise" style={rise(5)}>
          <CardHeader title={t("dash.roles.title")} subtitle={t("dash.roles.subtitle")} />
          <div className="px-5 pb-5">
            {loading ? (
              <Skeleton className="h-40" />
            ) : (
              <RoleDonut
                rows={(["customer", "worker", "business"] as const).map((r) => ({
                  key: r,
                  label: roleLabel(r),
                  value: { customer: data.customers, worker: data.workers, business: data.businesses }[r],
                  fresh: data.newUsersByRole[r],
                }))}
                onClick={(role) => navigate(`${base}/users?role=${role}`)}
              />
            )}
          </div>
        </Card>

        <Card className="animate-rise" style={rise(6)}>
          <CardHeader title={t("dash.funnel.title")} subtitle={t("dash.funnel.subtitle")} />
          <div className="px-5 pb-5">{loading ? <Skeleton className="h-36" /> : <Funnel f={data.funnel} />}</div>
        </Card>

        <Card className="animate-rise" style={rise(7)}>
          <CardHeader title={t("dash.city.title")} subtitle={t("dash.city.subtitle")} />
          <div className="px-3 pb-4">
            {loading ? (
              <Skeleton className="mx-2 h-36" />
            ) : data.topCities.length === 0 ? (
              <EmptyState title={t("dash.noData")} className="py-8" />
            ) : (
              <BarList rows={data.topCities.map((c) => ({ key: c.name, label: c.name, value: c.count }))} />
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="animate-rise" style={rise(8)}>
          <CardHeader title={t("dash.cat.title")} subtitle={t("dash.cat.subtitle")} />
          <div className="px-3 pb-4">
            {loading ? (
              <Skeleton className="mx-2 h-48" />
            ) : data.topCategories.length === 0 ? (
              <EmptyState title={t("dash.noData")} />
            ) : (
              <BarList
                rows={data.topCategories.map((c) => ({
                  key: c.name,
                  label: c.name,
                  value: c.count,
                  extra: t("dash.cat.avg", { amount: moneyCompact(c.budget / Math.max(1, c.count)) }),
                }))}
              />
            )}
          </div>
        </Card>

        <Card className="animate-rise" style={rise(9)}>
          <CardHeader title={t("dash.status.title")} subtitle={t("dash.status.subtitle")} />
          <div className="px-3 pb-4">
            {loading ? (
              <Skeleton className="mx-2 h-64" />
            ) : (
              <BarList
                rows={data.statusBreakdown.map((s) => ({ key: s.status, label: taskLabel(s.status), value: s.count }))}
                onClick={(status) => navigate(`${base}/tasks?status=${status}`)}
              />
            )}
            {data && (
              <div className="mt-4 grid grid-cols-2 gap-2 px-2">
                <div className="rounded-xl bg-surface-2/60 p-3">
                  <p className="text-[11px] text-muted">{t("dash.completedTasks")}</p>
                  <p className="text-lg font-semibold tabular">
                    <CountUp value={data.completedTasks} format={num} />
                  </p>
                </div>
                <div className="rounded-xl bg-surface-2/60 p-3">
                  <p className="text-[11px] text-muted">{t("dash.feeRate")}</p>
                  <p className="text-lg font-semibold tabular">{project.platformFeePercent}%</p>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
