import { Download, Wallet } from "lucide-react";
import { useState } from "react";

import { listExpenses, listRevenues, type Expense, type Revenue } from "@/api/society";
import { DataTable, ErrorState, PageHeader, type Column } from "@/components/ui/data";
import { Badge, Button, EmptyState, Segmented } from "@/components/ui/primitives";
import { t } from "@/i18n";
import { money } from "@/lib/format";
import { downloadCsv } from "@/lib/utils";

import { matches, SearchBox, Totals } from "./parts";
import { enumLabel, useSociety, useSocietyQuery } from "./state";

type Tab = "expenses" | "revenue";

export function Finance() {
  const { current } = useSociety();
  const expenses = useSocietyQuery("expenses", listExpenses);
  const revenues = useSocietyQuery("revenues", listRevenues);
  const [tab, setTab] = useState<Tab>("expenses");
  const [q, setQ] = useState("");

  const ex = (expenses.data ?? []).filter((e) => matches(q, e.title, e.vendorName, e.category, e.receiptNumber));
  const rv = (revenues.data ?? []).filter((r) => matches(q, r.title, r.payerName, r.flatNumber, r.source, r.receiptNumber));
  const spent = (expenses.data ?? []).reduce((n, e) => n + e.amount, 0);
  const earned = (revenues.data ?? []).reduce((n, r) => n + r.amount, 0);

  const exCols: Column<Expense>[] = [
    { key: "date", header: t("soc.col.date"), cell: (e) => <span className="whitespace-nowrap text-muted">{e.date || "—"}</span> },
    {
      key: "title",
      header: t("soc.col.title"),
      cell: (e) => (
        <div className="min-w-0 max-w-xs">
          <p className="truncate font-medium">{e.title}</p>
          <p className="truncate text-[11px] text-muted">{e.vendorName}</p>
        </div>
      ),
    },
    { key: "cat", header: t("soc.col.category"), hideSm: true, cell: (e) => <Badge>{enumLabel(e.category)}</Badge> },
    { key: "amount", header: t("soc.col.amount"), cell: (e) => <span className="font-semibold tabular text-rose-600 dark:text-rose-400">{money(e.amount)}</span> },
    { key: "mode", header: t("soc.col.mode"), hideSm: true, cell: (e) => <span className="text-muted">{enumLabel(e.paymentMode)}</span> },
    { key: "approved", header: t("soc.col.approvedBy"), hideSm: true, cell: (e) => <span className="text-muted">{e.approvedBy || "—"}</span> },
  ];

  const rvCols: Column<Revenue>[] = [
    { key: "date", header: t("soc.col.date"), cell: (r) => <span className="whitespace-nowrap text-muted">{r.date || "—"}</span> },
    {
      key: "title",
      header: t("soc.col.title"),
      cell: (r) => (
        <div className="min-w-0 max-w-xs">
          <p className="truncate font-medium">{r.title}</p>
          <p className="truncate text-[11px] text-muted">{[r.payerName, r.flatNumber].filter(Boolean).join(" · ")}</p>
        </div>
      ),
    },
    { key: "src", header: t("soc.col.category"), hideSm: true, cell: (r) => <Badge>{enumLabel(r.source)}</Badge> },
    { key: "amount", header: t("soc.col.amount"), cell: (r) => <span className="font-semibold tabular text-emerald-600 dark:text-emerald-400">{money(r.amount)}</span> },
    { key: "mode", header: t("soc.col.mode"), hideSm: true, cell: (r) => <span className="text-muted">{enumLabel(r.paymentMode)}</span> },
    { key: "receipt", header: t("soc.col.receipt"), hideSm: true, cell: (r) => <span className="font-mono text-xs">{r.receiptNumber || "—"}</span> },
  ];

  const active = tab === "expenses" ? expenses : revenues;
  const csv = () =>
    tab === "expenses"
      ? downloadCsv(
          "expenses.csv",
          ex.map((e) => ({ date: e.date, title: e.title, category: e.category, amount: e.amount, vendor: e.vendorName, mode: e.paymentMode, approvedBy: e.approvedBy, receipt: e.receiptNumber, notes: e.notes })),
        )
      : downloadCsv(
          "revenue.csv",
          rv.map((r) => ({ date: r.date, title: r.title, source: r.source, amount: r.amount, payer: r.payerName, flat: r.flatNumber, mode: r.paymentMode, receipt: r.receiptNumber })),
        );

  return (
    <>
      <PageHeader
        title={t("soc.nav.finance")}
        description={t("soc.finance.desc")}
        actions={
          <>
            <SearchBox value={q} onChange={setQ} placeholder={t("soc.finance.search")} />
            <Button icon={<Download className="size-4" />} disabled={(tab === "expenses" ? ex : rv).length === 0} onClick={csv}>
              CSV
            </Button>
          </>
        }
      />
      <Totals
        items={[
          { label: t("soc.field.cash"), value: money(current?.cash) },
          { label: t("soc.field.bank"), value: money(current?.bank) },
          { label: t("soc.finance.spent"), value: money(spent), tone: "text-rose-600 dark:text-rose-400" },
          { label: t("soc.finance.earned"), value: money(earned), tone: "text-emerald-600 dark:text-emerald-400" },
        ]}
      />
      <Segmented
        className="mb-3"
        value={tab}
        onChange={setTab}
        options={[
          { value: "expenses", label: t("soc.finance.expenses"), count: expenses.data?.length },
          { value: "revenue", label: t("soc.finance.revenue"), count: revenues.data?.length },
        ]}
      />
      {active.error ? (
        <ErrorState error={active.error} onRetry={active.refetch} />
      ) : tab === "expenses" ? (
        <DataTable
          columns={exCols}
          rows={ex}
          rowKey={(e) => e.docId}
          loading={expenses.isLoading}
          empty={<EmptyState icon={<Wallet className="size-5" />} title={t("soc.finance.emptyExpenses")} />}
        />
      ) : (
        <DataTable
          columns={rvCols}
          rows={rv}
          rowKey={(r) => r.docId}
          loading={revenues.isLoading}
          empty={<EmptyState icon={<Wallet className="size-5" />} title={t("soc.finance.emptyRevenue")} />}
        />
      )}
    </>
  );
}
