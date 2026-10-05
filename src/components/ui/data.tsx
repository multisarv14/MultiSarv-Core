import { AlertTriangle, ArrowDownRight, ArrowUpRight, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { t } from "@/i18n";
import { errorMessage } from "@/lib/firebase";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Button, Card, EmptyState, Skeleton } from "./primitives";

// ── Stat card ─────────────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  icon,
  hint,
  tone = "accent",
  loading,
  onClick,
  trend,
  spark,
  index,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  hint?: ReactNode;
  tone?: "accent" | "green" | "amber" | "red" | "blue" | "violet";
  loading?: boolean;
  onClick?: () => void;
  trend?: { value: number; label?: string };
  /** Chhoti trend line (divasa-pramane) — card cha khalcha bhag. */
  spark?: number[];
  /** Stagger animation index. */
  index?: number;
}) {
  const toneCls = {
    accent: "bg-accent/10 text-accent",
    green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    red: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    blue: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  }[tone];
  return (
    <Card
      onClick={onClick}
      style={index !== undefined ? { ["--i" as string]: index } : undefined}
      className={cn(
        "group relative overflow-hidden p-4 transition duration-300",
        index !== undefined && "animate-rise",
        spark && spark.length > 1 && "pb-8",
        onClick && "cursor-pointer hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-pop",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted">{label}</p>
        <span className={cn("flex size-8 items-center justify-center rounded-lg", toneCls)}>{icon}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <p className="mt-1 text-2xl font-semibold tracking-tight tabular">{value}</p>
      )}
      <div className="mt-1 flex min-h-4 items-center gap-2 text-[11px] text-muted">
        {trend && !loading && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              trend.value >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
            )}
          >
            {trend.value >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {trend.label ?? trend.value}
          </span>
        )}
        {hint}
      </div>
      {spark && spark.length > 1 && !loading && <Sparkline values={spark} />}
    </Card>
  );
}

/** Card chya talashi halki area line — fakt disha dakhavte, axis nahi. */
function Sparkline({ values }: { values: number[] }) {
  const w = 100;
  const h = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 2 - ((v - min) / span) * (h - 6)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-7 w-full opacity-60 transition-opacity group-hover:opacity-100"
      aria-hidden
    >
      <path d={`${line}L${w},${h}L0,${h}Z`} fill="currentColor" className="text-accent/10" />
      <path
        d={line}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
        pathLength={1}
        className="[stroke-dasharray:1] [stroke-dashoffset:1] motion-safe:animate-[draw_1.1s_ease-out_0.2s_forwards] motion-reduce:[stroke-dashoffset:0]"
      />
    </svg>
  );
}

// ── Table ─────────────────────────────────────────────────────────────

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Mobile var lapva. */
  hideSm?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  empty,
  footer,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2/60 text-left">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "px-3 py-2.5 text-[11px] font-semibold sm:px-4 tracking-wide whitespace-nowrap text-muted uppercase",
                    c.hideSm && "hidden md:table-cell",
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && rows.length === 0
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c.key} className={cn("px-3 py-3.5 sm:px-4", c.hideSm && "hidden md:table-cell")}>
                        <Skeleton className="h-4 w-full max-w-36" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn("transition-colors", onRowClick && "cursor-pointer hover:bg-surface-2/70")}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn("px-3 py-3 align-middle sm:px-4", c.hideSm && "hidden md:table-cell", c.className)}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 && (empty ?? <EmptyState title={t("table.empty")} />)}
      {footer}
    </Card>
  );
}

export function LoadMore({
  hasMore,
  loading,
  onClick,
  shown,
}: {
  hasMore: boolean;
  loading: boolean;
  onClick: () => void;
  shown: number;
}) {
  if (shown === 0) return null;
  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted">
      <span className="tabular">{t("table.shown", { n: num(shown) })}</span>
      {hasMore ? (
        <Button size="sm" variant="ghost" loading={loading} onClick={onClick}>
          {t("act.loadMore")}
        </Button>
      ) : (
        <span>{t("table.end")}</span>
      )}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Card>
      <EmptyState
        icon={<AlertTriangle className="size-5 text-rose-500" />}
        title={t("state.loadFailed")}
        description={errorMessage(error)}
        action={
          onRetry && (
            <Button size="sm" icon={<RefreshCw className="size-3.5" />} onClick={onRetry}>
              {t("act.retry")}
            </Button>
          )
        }
      />
    </Card>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
