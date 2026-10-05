import { Download, ReceiptText, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { TXN_TYPES, type Transaction, type TxnType } from "@/api/types";
import { DataTable, ErrorState, LoadMore, PageHeader, type Column } from "@/components/ui/data";
import { Badge, Button, EmptyState, Select } from "@/components/ui/primitives";
import { TXN_META, TxnBadge, txnLabel } from "@/components/ui/status";
import { useTransactions } from "@/hooks/queries";
import { useDrawerParam } from "@/hooks/useDrawer";
import { t } from "@/i18n";
import { dateTime, money } from "@/lib/format";
import { cn, downloadCsv } from "@/lib/utils";

export function Ledger() {
  const [params, setParams] = useSearchParams();
  const [, openUser] = useDrawerParam("user");
  const [, openTask] = useDrawerParam("task");
  const type = (params.get("type") as TxnType) || undefined;
  const userId = params.get("userId") || undefined;
  const list = useTransactions({ type, userId });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  const setParam = (key: string, value: string) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (value) n.set(key, value);
      else n.delete(key);
      return n;
    });

  const columns: Column<Transaction>[] = [
    { key: "type", header: t("finance.ledger.col.type"), cell: (x) => <TxnBadge type={x.type} /> },
    {
      key: "amount",
      header: t("finance.payouts.col.amount"),
      cell: (x) => (
        <span className={cn("font-semibold tabular", TXN_META[x.type]?.credit && "text-emerald-600 dark:text-emerald-400")}>
          {money(x.amount)}
        </span>
      ),
    },
    {
      key: "detail",
      header: t("finance.ledger.col.detail"),
      cell: (x) => (
        <div className="min-w-0 max-w-xs">
          {x.taskId ? (
            <button onClick={() => openTask(x.taskId!)} className="truncate text-left hover:text-accent">
              {x.taskTitle || x.taskId}
            </button>
          ) : (
            <p className="truncate">{x.counterparty}</p>
          )}
          <p className="truncate font-mono text-[11px] text-muted">{x.reference}</p>
        </div>
      ),
    },
    {
      key: "user",
      header: t("finance.payouts.col.user"),
      hideSm: true,
      cell: (x) => (
        <button onClick={() => openUser(x.userId)} className="font-mono text-xs text-muted hover:text-accent">
          {x.userId.slice(0, 10)}…
        </button>
      ),
    },
    {
      key: "settled",
      header: t("finance.payouts.col.settled"),
      hideSm: true,
      cell: (x) =>
        x.isSettled ? <Badge tone="green">{t("word.yes")}</Badge> : <Badge tone="amber">{t("status.kyc.pending")}</Badge>,
    },
    {
      key: "at",
      header: t("finance.ledger.col.when"),
      hideSm: true,
      cell: (x) => <span className="text-muted">{dateTime(x.createdAt)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title={t("nav.ledger")}
        description={t("finance.ledger.desc")}
        actions={
          <>
            {userId && (
              <Button size="sm" variant="secondary" onClick={() => setParam("userId", "")}>
                {t("finance.ledger.userFilter", { id: `${userId.slice(0, 8)}…` })} <X className="size-3.5" />
              </Button>
            )}
            <Select className="min-w-0 flex-1 sm:w-44 sm:flex-none" value={type ?? ""} onChange={(e) => setParam("type", e.target.value)}>
              <option value="">{t("finance.ledger.allTypes")}</option>
              {TXN_TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {txnLabel(ty)}
                </option>
              ))}
            </Select>
            <Button
              icon={<Download className="size-4" />}
              disabled={rows.length === 0}
              onClick={() =>
                downloadCsv(
                  "ledger.csv",
                  rows.map((x) => ({
                    id: x.id,
                    type: x.type,
                    amount: x.amount,
                    userId: x.userId,
                    taskId: x.taskId ?? "",
                    taskTitle: x.taskTitle ?? "",
                    reference: x.reference,
                    counterparty: x.counterparty,
                    settled: x.isSettled,
                    createdAt: x.createdAt,
                  })),
                )
              }
            >
              CSV
            </Button>
          </>
        }
      />
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(x) => x.id}
          loading={list.isLoading}
          empty={<EmptyState icon={<ReceiptText className="size-5" />} title={t("finance.ledger.empty")} />}
          footer={
            <LoadMore
              shown={rows.length}
              hasMore={!!list.hasNextPage}
              loading={list.isFetchingNextPage}
              onClick={() => list.fetchNextPage()}
            />
          }
        />
      )}
    </>
  );
}
