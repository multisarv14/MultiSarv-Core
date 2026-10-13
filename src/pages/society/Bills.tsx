import { Download, FileText } from "lucide-react";
import { useState } from "react";

import { listBills, PAYMENT_STATUSES, type Bill, type PaymentStatus } from "@/api/society";
import { DataTable, ErrorState, PageHeader, type Column } from "@/components/ui/data";
import { Button, EmptyState, Segmented, Select } from "@/components/ui/primitives";
import { t } from "@/i18n";
import { money } from "@/lib/format";
import { downloadCsv } from "@/lib/utils";

import { BillBadge, billLabel, matches, SearchBox, Totals } from "./parts";
import { enumLabel, useSocietyQuery } from "./state";

export function Bills() {
  const list = useSocietyQuery("bills", listBills);
  const [status, setStatus] = useState<PaymentStatus | "all">("all");
  const [month, setMonth] = useState("");
  const [q, setQ] = useState("");

  const all = list.data ?? [];
  const months = [...new Set(all.map((b) => b.billMonth).filter(Boolean))];
  const inMonth = all.filter((b) => !month || b.billMonth === month);
  const rows = inMonth.filter((b) => (status === "all" || b.status === status) && matches(q, b.flatNumber, b.residentName, b.receiptNumber));
  const billed = inMonth.reduce((n, b) => n + b.totalAmount, 0);
  const collected = inMonth.reduce((n, b) => n + b.amountPaid, 0);

  const columns: Column<Bill>[] = [
    { key: "month", header: t("soc.col.month"), cell: (b) => <span className="whitespace-nowrap">{b.billMonth || "—"}</span> },
    {
      key: "flat",
      header: t("soc.col.flat"),
      cell: (b) => (
        <div className="min-w-0">
          <p className="font-mono font-semibold">{b.flatNumber}</p>
          <p className="truncate text-[11px] text-muted">{b.residentName}</p>
        </div>
      ),
    },
    { key: "total", header: t("soc.col.total"), cell: (b) => <span className="font-semibold tabular">{money(b.totalAmount)}</span> },
    { key: "paid", header: t("soc.col.paid"), cell: (b) => <span className="tabular">{money(b.amountPaid)}</span> },
    { key: "status", header: t("soc.col.status"), cell: (b) => <BillBadge status={b.status} /> },
    { key: "due", header: t("soc.col.due"), hideSm: true, cell: (b) => <span className="text-muted">{b.dueDate || "—"}</span> },
    {
      key: "receipt",
      header: t("soc.col.receipt"),
      hideSm: true,
      cell: (b) =>
        b.receiptNumber ? (
          <div className="min-w-0">
            <p className="font-mono text-xs">{b.receiptNumber}</p>
            <p className="text-[11px] text-muted">
              {[b.paidDate, b.paymentMode && enumLabel(b.paymentMode)].filter(Boolean).join(" · ")}
            </p>
          </div>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("soc.nav.bills")}
        description={t("soc.bills.desc")}
        actions={
          <>
            <SearchBox value={q} onChange={setQ} placeholder={t("soc.bills.search")} />
            <Select className="min-w-0 flex-1 sm:w-40 sm:flex-none" value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">{t("soc.filter.allMonths")}</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
            <Button
              icon={<Download className="size-4" />}
              disabled={rows.length === 0}
              onClick={() =>
                downloadCsv(
                  "maintenance-bills.csv",
                  rows.map((b) => ({
                    month: b.billMonth,
                    flat: b.flatNumber,
                    resident: b.residentName,
                    total: b.totalAmount,
                    paid: b.amountPaid,
                    lateFee: b.lateFeeAmount,
                    status: b.status,
                    dueDate: b.dueDate,
                    paidDate: b.paidDate,
                    mode: b.paymentMode,
                    reference: b.transactionRef,
                    receipt: b.receiptNumber,
                  })),
                )
              }
            >
              CSV
            </Button>
          </>
        }
      />
      <Totals
        items={[
          { label: t("soc.bills.billed"), value: money(billed) },
          { label: t("soc.bills.collected"), value: money(collected), tone: "text-emerald-600 dark:text-emerald-400" },
          { label: t("soc.bills.outstanding"), value: money(billed - collected), tone: "text-rose-600 dark:text-rose-400" },
          { label: t("soc.bills.count"), value: inMonth.length },
        ]}
      />
      <Segmented
        className="mb-3"
        value={status}
        onChange={setStatus}
        options={[
          { value: "all" as const, label: t("soc.filter.all"), count: inMonth.length },
          ...PAYMENT_STATUSES.map((s) => ({ value: s, label: billLabel(s), count: inMonth.filter((b) => b.status === s).length })),
        ]}
      />
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(b) => b.docId}
          loading={list.isLoading}
          empty={<EmptyState icon={<FileText className="size-5" />} title={t("soc.bills.empty")} />}
        />
      )}
    </>
  );
}
