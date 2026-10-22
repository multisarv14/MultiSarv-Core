import { useQueryClient } from "@tanstack/react-query";
import { Check, CircleArrowUp, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { approveUpgrade, dismissUpgrade, listUpgradeRequests, type UpgradeRequest } from "@/api/evermind";
import { DataTable, ErrorState, PageHeader, type Column } from "@/components/ui/data";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Button, EmptyState } from "@/components/ui/primitives";
import { useProject } from "@/context/project";
import { t } from "@/i18n";
import { errorMessage } from "@/lib/firebase";
import { ago } from "@/lib/format";

import { PlanBadge, planLabel, useEmQuery } from "./parts";

type Pending = { kind: "approve" | "dismiss"; request: UpgradeRequest } | null;

export function Upgrades() {
  const { project } = useProject();
  const qc = useQueryClient();
  const list = useEmQuery(["upgrades"], listUpgradeRequests);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!pending) return;
    const { kind, request: r } = pending;
    setBusy(true);
    try {
      if (kind === "approve") {
        const res = await approveUpgrade(project, r);
        toast.success(t("em.plan.done", { name: r.company, plan: planLabel(r.plan) }));
        if (res.warning) toast.warning(res.warning, { duration: 10_000 });
      } else {
        await dismissUpgrade(project, r.id);
        toast.success(t("em.upgrades.dismissed", { name: r.company }));
      }
      qc.invalidateQueries({ queryKey: [project.id, "em"] });
      setPending(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<UpgradeRequest>[] = [
    {
      key: "company",
      header: t("em.col.company"),
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.company}</p>
          {r.requestedBy && (
            <p className="truncate text-[11px] text-muted">
              {r.requestedBy.name} · {r.requestedBy.email}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "plan",
      header: t("em.col.change"),
      cell: (r) => (
        <div className="flex items-center gap-1.5">
          {r.currentPlan && <PlanBadge plan={r.currentPlan} />}
          <span className="text-muted">→</span>
          <PlanBadge plan={r.plan} />
        </div>
      ),
    },
    { key: "note", header: t("em.col.note"), hideSm: true, cell: (r) => <span className="line-clamp-2 text-xs text-muted">{r.note || "—"}</span> },
    { key: "when", header: t("em.col.requested"), hideSm: true, cell: (r) => <span className="text-xs text-muted">{ago(r.createdAt)}</span> },
    {
      key: "act",
      header: "",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => setPending({ kind: "dismiss", request: r })}>
            {t("em.upgrades.dismiss")}
          </Button>
          <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} onClick={() => setPending({ kind: "approve", request: r })}>
            {t("em.upgrades.approve")}
          </Button>
        </div>
      ),
    },
  ];

  const r = pending?.request;

  return (
    <>
      <PageHeader title={t("em.nav.upgrades")} description={t("em.upgrades.desc")} />
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : (
        <DataTable
          columns={columns}
          rows={list.data ?? []}
          rowKey={(x) => x.id}
          loading={list.isLoading}
          empty={<EmptyState icon={<CircleArrowUp className="size-5" />} title={t("em.upgrades.empty")} description={t("em.upgrades.emptyDesc")} />}
        />
      )}
      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={run}
        loading={busy}
        tone={pending?.kind === "approve" ? "success" : "danger"}
        title={pending?.kind === "approve" ? t("em.upgrades.approveTitle") : t("em.upgrades.dismissTitle")}
        description={
          r
            ? pending?.kind === "approve"
              ? t("em.upgrades.approveDesc", { name: r.company, plan: planLabel(r.plan) })
              : t("em.upgrades.dismissDesc", { name: r.company })
            : undefined
        }
        confirmLabel={pending?.kind === "approve" ? t("em.upgrades.approve") : t("em.upgrades.dismiss")}
      />
    </>
  );
}
