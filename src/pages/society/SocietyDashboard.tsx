import { Building2, DoorOpen, FileText, IndianRupee, Landmark, MessageSquareWarning, Users, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { blobSrc, getSocietyStats, type Society } from "@/api/society";
import type { SocietyMenuKey } from "@/components/layout/nav";
import { DataTable, ErrorState, PageHeader, StatCard, type Column } from "@/components/ui/data";
import { Badge, Card, CardHeader, KV } from "@/components/ui/primitives";
import { allows, useProject } from "@/context/project";
import { t } from "@/i18n";
import { money, num } from "@/lib/format";

import { useSociety, useSocietyQuery } from "./state";

export function SocietyDashboard() {
  const { project, menus } = useProject();
  const { societies, current, select } = useSociety();
  const navigate = useNavigate();
  const stats = useSocietyQuery("stats", getSocietyStats);
  const s = stats.data;
  const go = (to: SocietyMenuKey) => (allows(menus, to) ? () => navigate(`/s/${project.id}/${to}`) : undefined);
  const soc = current!;
  const logo = blobSrc(soc.logo);

  const columns: Column<Society>[] = [
    {
      key: "name",
      header: t("soc.col.society"),
      cell: (x) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{x.name}</p>
          <p className="truncate font-mono text-[11px] text-muted">{x.code}</p>
        </div>
      ),
    },
    { key: "city", header: t("soc.col.city"), hideSm: true, cell: (x) => <span className="text-muted">{[x.city, x.state].filter(Boolean).join(", ") || "—"}</span> },
    { key: "flats", header: t("soc.col.flats"), cell: (x) => <span className="tabular">{num(x.totalFlats)}</span> },
    { key: "balance", header: t("soc.col.balance"), cell: (x) => <span className="font-semibold tabular">{money(x.cash + x.bank)}</span> },
    {
      key: "current",
      header: "",
      cell: (x) => (x.code === soc.code ? <Badge tone="accent" dot>{t("soc.picker.current")}</Badge> : null),
    },
  ];

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {logo ? (
              <img src={logo} alt="" className="size-9 rounded-xl object-cover ring-1 ring-border" />
            ) : (
              <span className="flex size-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Building2 className="size-5" />
              </span>
            )}
            {soc.name}
          </span>
        }
        description={[soc.address, soc.city].filter(Boolean).join(" · ") || t("soc.dash.desc")}
      />

      {stats.error ? (
        <ErrorState error={stats.error} onRetry={stats.refetch} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard index={0} label={t("soc.stat.members")} value={num(s?.members)} icon={<Users className="size-4" />} loading={stats.isLoading} onClick={go("residents")} />
          <StatCard index={1} tone="red" label={t("soc.stat.dues")} value={money(s?.dues)} icon={<IndianRupee className="size-4" />} loading={stats.isLoading} onClick={go("residents")} />
          <StatCard index={2} tone="amber" label={t("soc.queue.unpaid")} value={num(s?.unpaidBills)} icon={<FileText className="size-4" />} loading={stats.isLoading} onClick={go("bills")} />
          <StatCard index={3} tone="violet" label={t("soc.stat.openComplaints")} value={num(s?.openComplaints)} icon={<MessageSquareWarning className="size-4" />} loading={stats.isLoading} onClick={go("complaints")} />
          <StatCard index={4} tone="blue" label={t("soc.queue.inside")} value={num(s?.visitorsInside)} icon={<DoorOpen className="size-4" />} loading={stats.isLoading} onClick={go("visitors")} />
          <StatCard index={5} tone="green" label={t("soc.stat.balance")} value={money(soc.cash + soc.bank)} icon={<Wallet className="size-4" />} onClick={go("finance")} />
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title={t("soc.dash.profile")} />
          <div className="divide-y divide-border px-5 pb-3">
            <KV label={t("soc.field.code")}>
              <span className="font-mono">{soc.code}</span>
            </KV>
            <KV label={t("soc.field.registration")}>{soc.registrationNumber || "—"}</KV>
            <KV label={t("soc.field.wingsFlats")}>
              {num(soc.totalWings)} / {num(soc.totalFlats)}
            </KV>
            <KV label={t("soc.field.cash")}>{money(soc.cash)}</KV>
            <KV label={t("soc.field.bank")}>{money(soc.bank)}</KV>
            <KV label={t("soc.field.contact")}>{soc.contactNumber || "—"}</KV>
            <KV label={t("soc.field.email")}>{soc.email || "—"}</KV>
          </div>
        </Card>

        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Landmark className="size-4 text-muted" />
            {t("soc.dash.all", { n: societies.length })}
          </div>
          <DataTable columns={columns} rows={societies} rowKey={(x) => x.code} onRowClick={(x) => select(x.code)} />
        </div>
      </div>
    </>
  );
}
