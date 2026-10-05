import { ArrowRight, Gavel, Scale } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { Dispute, DisputeStatus } from "@/api/types";
import { ErrorState, PageHeader } from "@/components/ui/data";
import { Modal } from "@/components/ui/overlay";
import { Button, Card, EmptyState, Label, Segmented, Skeleton, Textarea } from "@/components/ui/primitives";
import { DisputeBadge, roleLabel } from "@/components/ui/status";
import { useDisputes, useResolveDispute } from "@/hooks/queries";
import { useDrawerParam } from "@/hooks/useDrawer";
import { t } from "@/i18n";
import { ago, money } from "@/lib/format";
import { cn } from "@/lib/utils";

type Resolution = Exclude<DisputeStatus, "open">;

/** Function — labels render veli current bhashet. */
const options = (): { value: Resolution; title: string; detail: string; tone: string }[] => [
  {
    value: "resolvedCustomer",
    title: t("tasks.dispute.opt.customer"),
    detail: t("tasks.dispute.opt.customerDetail"),
    tone: "border-sky-500/40 bg-sky-500/5",
  },
  {
    value: "resolvedWorker",
    title: t("tasks.dispute.opt.worker"),
    detail: t("tasks.dispute.opt.workerDetail"),
    tone: "border-emerald-500/40 bg-emerald-500/5",
  },
  {
    value: "closed",
    title: t("tasks.dispute.opt.close"),
    detail: t("tasks.dispute.opt.closeDetail"),
    tone: "border-border",
  },
  {
    value: "underReview",
    title: t("tasks.dispute.opt.review"),
    detail: t("tasks.dispute.opt.reviewDetail"),
    tone: "border-amber-500/40 bg-amber-500/5",
  },
];

function ResolveModal({ dispute, onClose }: { dispute: Dispute | null; onClose: () => void }) {
  const [resolution, setResolution] = useState<Resolution>("resolvedCustomer");
  const [note, setNote] = useState("");
  const resolve = useResolveDispute();

  useEffect(() => {
    if (dispute) {
      setResolution("resolvedCustomer");
      setNote("");
    }
  }, [dispute]);

  if (!dispute) return null;
  const needsNote = resolution !== "underReview";

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t("tasks.dispute.resolveTitle")}
      description={`${dispute.taskTitle} · ${t("tasks.dispute.amountInEscrow", { amount: money(dispute.amountInEscrow) })}`}
      footer={
        <>
          <Button onClick={onClose}>{t("act.cancel")}</Button>
          <Button
            variant="primary"
            icon={<Gavel className="size-4" />}
            loading={resolve.isPending}
            disabled={needsNote && note.trim().length < 5}
            onClick={() =>
              resolve.mutate({ disputeId: dispute.id, resolution, note: note.trim() }, { onSuccess: onClose })
            }
          >
            {t("tasks.dispute.apply")}
          </Button>
        </>
      }
    >
      <div className="mb-4 rounded-xl bg-surface-2/60 p-3 text-sm">
        <p className="text-xs text-muted">
          {t("tasks.dispute.vs", { a: dispute.raisedByName, role: roleLabel(dispute.raisedByRole), b: dispute.againstName })}
        </p>
        <p className="mt-1 leading-relaxed">{dispute.reason}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {options().filter((o) => !(o.value === "underReview" && dispute.status === "underReview")).map((o) => (
          <button
            key={o.value}
            onClick={() => setResolution(o.value)}
            className={cn(
              "rounded-xl border p-3 text-left transition",
              resolution === o.value ? cn(o.tone, "ring-2 ring-accent") : "border-border hover:bg-surface-2/60",
            )}
          >
            <p className="text-sm font-semibold">{o.title}</p>
            <p className="mt-0.5 text-xs text-muted">{o.detail}</p>
          </button>
        ))}
      </div>
      <div className="mt-4">
        <Label hint={needsNote ? t("tasks.dispute.required") : t("word.optional")}>{t("tasks.dispute.note")}</Label>
        <Textarea
          value={note}
          maxLength={1000}
          placeholder={t("tasks.dispute.notePh")}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Modal>
  );
}

export function Disputes() {
  const [params] = useSearchParams();
  const [, openTask] = useDrawerParam("task");
  const { data, isLoading, error, refetch } = useDisputes();
  const [tab, setTab] = useState<"open" | "resolved" | "all">("open");
  const [active, setActive] = useState<Dispute | null>(null);

  const isOpen = (d: Dispute) => d.status === "open" || d.status === "underReview";
  const list = useMemo(
    () => (data ?? []).filter((d) => (tab === "all" ? true : tab === "open" ? isOpen(d) : !isOpen(d))),
    [data, tab],
  );
  const openCount = data?.filter(isOpen).length ?? 0;
  const highlight = params.get("id");

  return (
    <>
      <PageHeader
        title={t("tasks.dispute.title")}
        description={t("tasks.dispute.desc")}
        actions={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "open", label: t("tasks.dispute.tab.open"), count: openCount },
              { value: "resolved", label: t("tasks.dispute.tab.resolved") },
              { value: "all", label: t("word.all") },
            ]}
          />
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Scale className="size-5" />}
            title={tab === "open" ? t("tasks.dispute.emptyOpen") : t("table.empty")}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((d) => (
            <Card key={d.id} className={cn("p-4 sm:p-5", highlight === d.id && "ring-2 ring-accent")}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <DisputeBadge status={d.status} />
                    <span className="text-xs text-muted">{ago(d.createdAt)}</span>
                  </div>
                  <button
                    onClick={() => openTask(d.taskId)}
                    className="mt-2 inline-flex items-center gap-1 text-left font-semibold hover:text-accent"
                  >
                    {d.taskTitle} <ArrowRight className="size-3.5" />
                  </button>
                  <p className="mt-0.5 text-xs text-muted">
                    {t("tasks.dispute.raisedBy", {
                      by: d.raisedByName,
                      role: roleLabel(d.raisedByRole),
                      against: d.againstName,
                    })}
                  </p>
                  <p className="mt-3 rounded-lg bg-surface-2/60 p-3 text-sm leading-relaxed">{d.reason}</p>
                  {d.resolutionNote && (
                    <p className="mt-2 text-xs text-muted">
                      <span className="font-medium">{t("tasks.dispute.resolution")}</span> {d.resolutionNote}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end">
                  <div className="sm:text-right">
                    <p className="text-[11px] text-muted">{t("tasks.dispute.inEscrow")}</p>
                    <p className="text-lg font-semibold tabular">{money(d.amountInEscrow)}</p>
                  </div>
                  {isOpen(d) && (
                    <Button variant="primary" size="sm" icon={<Gavel className="size-3.5" />} onClick={() => setActive(d)}>
                      {t("tasks.dispute.resolve")}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <ResolveModal dispute={active} onClose={() => setActive(null)} />
    </>
  );
}
