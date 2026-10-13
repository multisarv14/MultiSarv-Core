import { DoorOpen, Download } from "lucide-react";
import { useState } from "react";

import { listVisitors, VISITOR_STATUSES, type Visitor, type VisitorStatus } from "@/api/society";
import { DataTable, ErrorState, PageHeader, type Column } from "@/components/ui/data";
import { Button, EmptyState, Segmented } from "@/components/ui/primitives";
import { t } from "@/i18n";
import { downloadCsv } from "@/lib/utils";

import { matches, SearchBox, VisitorBadge, visitorLabel } from "./parts";
import { enumLabel, useSocietyQuery } from "./state";

export function Visitors() {
  const list = useSocietyQuery("visitors", listVisitors);
  const [status, setStatus] = useState<VisitorStatus | "all">("all");
  const [q, setQ] = useState("");

  const all = list.data ?? [];
  const rows = all.filter(
    (v) => (status === "all" || v.status === status) && matches(q, v.visitorName, v.phone, v.flatNumber, v.vehicleNumber),
  );

  const columns: Column<Visitor>[] = [
    {
      key: "name",
      header: t("soc.col.visitor"),
      cell: (v) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{v.visitorName || "—"}</p>
          <p className="truncate font-mono text-[11px] text-muted">{v.phone}</p>
        </div>
      ),
    },
    { key: "flat", header: t("soc.col.flat"), cell: (v) => <span className="font-mono font-semibold">{v.flatNumber || "—"}</span> },
    { key: "purpose", header: t("soc.col.purpose"), hideSm: true, cell: (v) => <span className="text-muted">{enumLabel(v.purpose)}</span> },
    { key: "vehicle", header: t("soc.col.vehicle"), hideSm: true, cell: (v) => <span className="font-mono text-xs">{v.vehicleNumber || "—"}</span> },
    {
      key: "time",
      header: t("soc.col.inOut"),
      cell: (v) => (
        <div className="text-xs whitespace-nowrap">
          <p>{v.entryTime || "—"}</p>
          <p className="text-muted">{v.exitTime || "—"}</p>
        </div>
      ),
    },
    { key: "status", header: t("soc.col.status"), cell: (v) => <VisitorBadge status={v.status} /> },
    { key: "guard", header: t("soc.col.guard"), hideSm: true, cell: (v) => <span className="text-muted">{v.guardName || "—"}</span> },
  ];

  return (
    <>
      <PageHeader
        title={t("soc.nav.visitors")}
        description={t("soc.visitors.desc")}
        actions={
          <>
            <SearchBox value={q} onChange={setQ} placeholder={t("soc.visitors.search")} />
            <Button
              icon={<Download className="size-4" />}
              disabled={rows.length === 0}
              onClick={() =>
                downloadCsv(
                  "visitors.csv",
                  rows.map((v) => ({
                    name: v.visitorName,
                    phone: v.phone,
                    flat: v.flatNumber,
                    purpose: v.purpose,
                    vehicle: v.vehicleNumber,
                    entry: v.entryTime,
                    exit: v.exitTime,
                    status: v.status,
                    guard: v.guardName,
                  })),
                )
              }
            >
              CSV
            </Button>
          </>
        }
      />
      <Segmented
        className="mb-3"
        value={status}
        onChange={setStatus}
        options={[
          { value: "all" as const, label: t("soc.filter.all"), count: all.length },
          ...VISITOR_STATUSES.map((s) => ({ value: s, label: visitorLabel(s), count: all.filter((v) => v.status === s).length })),
        ]}
      />
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(v) => v.docId}
          loading={list.isLoading}
          empty={<EmptyState icon={<DoorOpen className="size-5" />} title={t("soc.visitors.empty")} />}
        />
      )}
    </>
  );
}
