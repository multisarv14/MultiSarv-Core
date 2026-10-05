import { Info, LayoutGrid } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { ErrorState, PageHeader } from "@/components/ui/data";
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { useCategories } from "@/hooks/queries";
import { t } from "@/i18n";
import { money } from "@/lib/format";

/** Flutter `Color.value` (ARGB int) → CSS hex. */
const argb = (v?: number) => (v ? `#${(v & 0xffffff).toString(16).padStart(6, "0")}` : "var(--accent)");

const Code = ({ children }: { children: ReactNode }) => <code className="rounded bg-surface-2 px-1">{children}</code>;

/** Translated vakyat `{name}` jagi code snippet (JSX) bhara. */
const fill = (text: string, nodes: Record<string, ReactNode>) =>
  text.split(/\{(\w+)\}/).map((part, i) => <Fragment key={i}>{i % 2 ? nodes[part] : part}</Fragment>);

export function Catalog() {
  const { data, isLoading, error, refetch } = useCategories();

  return (
    <>
      <PageHeader title={t("nav.catalog")} description={t("finance.catalog.desc")} />
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-border bg-surface p-3 text-xs text-muted">
        <Info className="mt-px size-4 shrink-0 text-accent" />
        <span>
          {fill(t("finance.catalog.readOnly"), {
            file: <Code>functions/scripts/categories.json</Code>,
            cmd: <Code>npm run seed</Code>,
          })}
        </span>
      </div>
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : !data?.length ? (
        <Card>
          <EmptyState
            icon={<LayoutGrid className="size-5" />}
            title={t("finance.catalog.empty")}
            description={t("finance.catalog.emptyHint", { cmd: "npm run seed" })}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((c) => (
            <Card key={c.id} className="relative overflow-hidden p-5">
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: argb(c.colorValue) }} />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{c.name}</h3>
                  <p className="mt-0.5 text-xs text-muted">{c.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-muted">{t("finance.catalog.from")}</p>
                  <p className="font-semibold tabular">{money(c.startingPrice)}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {(c.subCategories ?? []).map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
              <p className="mt-3 font-mono text-[10px] text-muted/70">{c.id}</p>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
