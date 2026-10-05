import { AlertTriangle, Banknote, Check, Copy, Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { Payout, PayoutStatus } from "@/api/types";
import { DataTable, ErrorState, PageHeader, type Column } from "@/components/ui/data";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { Avatar, Button, Card, EmptyState, Input, Label, Segmented } from "@/components/ui/primitives";
import { KycBadge, PayoutBadge, payoutLabel } from "@/components/ui/status";
import { useProject } from "@/context/project";
import { usePayouts, useQueueCounts, useSettlePayout } from "@/hooks/queries";
import { useDrawerParam } from "@/hooks/useDrawer";
import { t } from "@/i18n";
import { ago, dateTime, money } from "@/lib/format";
import { copyText, downloadCsv } from "@/lib/utils";

/** UPI var paise pathavlyavar UTR sobat "paid" mark. */
function PaidModal({ payout, onClose }: { payout: Payout | null; onClose: () => void }) {
  const [utr, setUtr] = useState("");
  const settle = useSettlePayout();
  useEffect(() => setUtr(""), [payout]);
  if (!payout) return null;

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t("finance.paid.title")}
      description={`${money(payout.amount)} → ${payout.upiId}`}
      footer={
        <>
          <Button onClick={onClose}>{t("act.cancel")}</Button>
          <Button
            variant="success"
            icon={<Check className="size-4" />}
            loading={settle.isPending}
            disabled={utr.trim().length < 6}
            onClick={() => settle.mutate({ payoutId: payout.id, success: true, utr: utr.trim() }, { onSuccess: onClose })}
          >
            {t("finance.paid.confirm")}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
        <AlertTriangle className="mt-px size-4 shrink-0" />
        {t("finance.paid.warning")}
      </div>
      <Label>{t("finance.paid.utrLabel")}</Label>
      <Input
        autoFocus
        value={utr}
        maxLength={64}
        placeholder={t("finance.paid.utrPlaceholder", { example: "427812345678" })}
        onChange={(e) => setUtr(e.target.value)}
      />
    </Modal>
  );
}

export function Payouts() {
  const { project } = useProject();
  const [status, setStatus] = useState<PayoutStatus>("requested");
  const { data, isLoading, error, refetch } = usePayouts(status);
  const { data: queues } = useQueueCounts();
  const [, openUser] = useDrawerParam("user");
  const [paying, setPaying] = useState<Payout | null>(null);
  const [failing, setFailing] = useState<Payout | null>(null);
  const settle = useSettlePayout();

  const rows = data ?? [];
  const totalAmount = rows.reduce((s, p) => s + p.amount, 0);

  const columns: Column<Payout>[] = [
    {
      key: "user",
      header: t("finance.payouts.col.user"),
      cell: (p) => (
        <button onClick={() => openUser(p.uid)} className="flex items-center gap-3 text-left">
          <Avatar name={p.user?.businessName || p.user?.name || "?"} seed={p.uid} />
          <div className="min-w-0">
            <p className="truncate font-medium hover:text-accent">{p.user?.businessName || p.user?.name || p.uid.slice(0, 10)}</p>
            <p className="text-xs text-muted tabular">
              {p.user?.phone ? `${project.phonePrefix} ${p.user.phone}` : "—"}
            </p>
          </div>
        </button>
      ),
    },
    {
      key: "amount",
      header: t("finance.payouts.col.amount"),
      cell: (p) => <span className="font-semibold tabular">{money(p.amount)}</span>,
    },
    {
      key: "upi",
      header: "UPI",
      cell: (p) => (
        <button
          className="inline-flex items-center gap-1.5 font-mono text-xs hover:text-accent"
          onClick={async () => (await copyText(p.upiId)) && toast.success(t("finance.payouts.upiCopied"))}
        >
          {p.upiId} <Copy className="size-3" />
        </button>
      ),
    },
    { key: "kyc", header: "KYC", hideSm: true, cell: (p) => (p.user ? <KycBadge status={p.user.kycStatus} /> : "—") },
    {
      key: "when",
      header: status === "requested" ? t("finance.payouts.col.requested") : t("finance.payouts.col.settled"),
      hideSm: true,
      cell: (p) => (
        <span className="text-muted" title={dateTime(status === "requested" ? p.requestedAt : p.settledAt)}>
          {ago(status === "requested" ? p.requestedAt : p.settledAt)}
        </span>
      ),
    },
    status === "requested"
      ? {
          key: "actions",
          header: "",
          className: "text-right",
          cell: (p) => (
            <div className="flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" title={t("finance.payouts.markFailed")} onClick={() => setFailing(p)}>
                <X className="size-3.5" />
              </Button>
              <Button size="sm" variant="success" icon={<Check className="size-3.5" />} onClick={() => setPaying(p)}>
                {t("finance.payouts.paid")}
              </Button>
            </div>
          ),
        }
      : {
          key: "result",
          header: t("finance.payouts.col.result"),
          cell: (p) => (
            <div>
              <PayoutBadge status={p.status} />
              {p.utr && <p className="mt-1 font-mono text-[11px] text-muted">UTR {p.utr}</p>}
            </div>
          ),
        },
  ];

  return (
    <>
      <PageHeader
        title={t("nav.payouts")}
        description={t("finance.payouts.desc")}
        actions={
          <>
            <Segmented
              value={status}
              onChange={setStatus}
              options={[
                { value: "requested", label: t("finance.payouts.tab.pending"), count: queues?.payouts },
                { value: "paid", label: payoutLabel("paid") },
                { value: "failed", label: payoutLabel("failed") },
              ]}
            />
            <Button
              icon={<Download className="size-4" />}
              disabled={rows.length === 0}
              onClick={() =>
                downloadCsv(
                  `payouts-${status}.csv`,
                  rows.map((p) => ({
                    payoutId: p.id,
                    name: p.user?.businessName || p.user?.name || "",
                    phone: p.user?.phone ?? "",
                    upi: p.upiId,
                    amount: p.amount,
                    status: p.status,
                    utr: p.utr ?? "",
                    requestedAt: p.requestedAt,
                    settledAt: p.settledAt ?? "",
                  })),
                )
              }
            >
              CSV
            </Button>
          </>
        }
      />

      {status === "requested" && rows.length > 0 && (
        <Card className="mb-4 flex items-center gap-4 p-4">
          <span className="flex size-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
            <Banknote className="size-5" />
          </span>
          <div>
            <p className="text-xs text-muted">{t("finance.payouts.totalToTransfer")}</p>
            <p className="text-xl font-semibold tabular">{money(totalAmount)}</p>
          </div>
          <p className="ml-auto text-xs text-muted">{t("finance.payouts.requestsOldest", { n: rows.length })}</p>
        </Card>
      )}

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id}
          loading={isLoading}
          empty={
            <EmptyState
              icon={<Banknote className="size-5" />}
              title={status === "requested" ? t("finance.payouts.emptyPending") : t("table.empty")}
            />
          }
        />
      )}

      <PaidModal payout={paying} onClose={() => setPaying(null)} />
      <ConfirmDialog
        open={!!failing}
        onClose={() => setFailing(null)}
        tone="danger"
        title={t("finance.payouts.failTitle")}
        description={failing ? t("finance.payouts.failDesc", { amount: money(failing.amount) }) : ""}
        confirmLabel={t("finance.payouts.markFailed")}
        loading={settle.isPending}
        onConfirm={() =>
          failing && settle.mutate({ payoutId: failing.id, success: false, utr: "" }, { onSuccess: () => setFailing(null) })
        }
      />
    </>
  );
}
