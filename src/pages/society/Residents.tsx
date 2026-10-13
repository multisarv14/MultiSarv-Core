import { useQueryClient } from "@tanstack/react-query";
import { Download, KeyRound, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { isPin, listResidents, resetResidentPin, type Resident } from "@/api/society";
import { DataTable, ErrorState, PageHeader, type Column } from "@/components/ui/data";
import { Modal } from "@/components/ui/overlay";
import { Avatar, Badge, Button, EmptyState, Input, Label, Segmented } from "@/components/ui/primitives";
import { allows, useProject } from "@/context/project";
import { t } from "@/i18n";
import { errorMessage } from "@/lib/firebase";
import { money } from "@/lib/format";
import { cn, downloadCsv } from "@/lib/utils";

import { matches, roleGroup, SearchBox, SocietyRoleBadge, Totals, type RoleGroup } from "./parts";
import { useSociety, useSocietyQuery } from "./state";

function PinDialog({ resident, onClose }: { resident: Resident | null; onClose: () => void }) {
  const { project } = useProject();
  const { current } = useSociety();
  const qc = useQueryClient();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (busy) return;
    setPin("");
    onClose();
  };

  const save = async () => {
    if (!resident || !current || !isPin(pin)) return;
    setBusy(true);
    try {
      await resetResidentPin(project, current.code, resident, pin);
      toast.success(t("soc.pin.done", { flat: resident.flatNumber }));
      qc.invalidateQueries({ queryKey: [project.id, "soc", current.code, "residents"] });
      setPin("");
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!resident}
      onClose={close}
      size="sm"
      title={t("soc.pin.title")}
      description={resident ? `${resident.flatNumber} · ${resident.ownerName}` : undefined}
      footer={
        <>
          <Button onClick={close} disabled={busy}>
            {t("act.cancel")}
          </Button>
          <Button variant="primary" loading={busy} disabled={!isPin(pin)} onClick={save}>
            {t("soc.pin.save")}
          </Button>
        </>
      }
    >
      <Label hint={t("soc.pin.hint")}>{t("soc.pin.label")}</Label>
      <Input
        autoFocus
        inputMode="numeric"
        maxLength={4}
        className="font-mono tracking-[0.5em]"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
        onKeyDown={(e) => e.key === "Enter" && save()}
      />
      <p className="mt-3 text-xs text-muted">{t("soc.pin.note")}</p>
    </Modal>
  );
}

export function Residents() {
  const { menus } = useProject();
  const list = useSocietyQuery("residents", listResidents);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<RoleGroup | "all">("all");
  const [pinFor, setPinFor] = useState<Resident | null>(null);
  const canEdit = allows(menus, "residents");

  const all = list.data ?? [];
  const rows = all.filter(
    (r) => (group === "all" || roleGroup(r.role) === group) && matches(q, r.flatNumber, r.ownerName, r.tenantName, r.contactNumber, r.wing),
  );
  const countOf = (g: RoleGroup) => all.filter((r) => roleGroup(r.role) === g).length;

  const columns: Column<Resident>[] = [
    {
      key: "flat",
      header: t("soc.col.flat"),
      cell: (r) => (
        <div>
          <p className="font-mono font-semibold">{r.flatNumber}</p>
          <p className="text-[11px] text-muted">{[r.wing, r.unitType].filter(Boolean).join(" · ")}</p>
        </div>
      ),
    },
    {
      key: "name",
      header: t("soc.col.name"),
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={r.ownerName} seed={r.docId} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium">{r.ownerName || "—"}</p>
            {r.tenantName && <p className="truncate text-[11px] text-muted">{t("soc.col.tenant")}: {r.tenantName}</p>}
            {r.staffDesignation && <p className="truncate text-[11px] text-muted">{r.staffDesignation}</p>}
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: t("soc.col.role"),
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          <SocietyRoleBadge role={r.role} />
          {!r.isActive && <Badge tone="red">{t("soc.inactive")}</Badge>}
        </div>
      ),
    },
    { key: "phone", header: t("soc.col.phone"), hideSm: true, cell: (r) => <span className="font-mono text-xs">{r.contactNumber || "—"}</span> },
    {
      key: "dues",
      header: t("soc.col.dues"),
      cell: (r) => (
        <span className={cn("font-semibold tabular", r.balanceDue > 0 && "text-rose-600 dark:text-rose-400")}>{money(r.balanceDue)}</span>
      ),
    },
    {
      key: "pin",
      header: t("soc.col.login"),
      hideSm: true,
      cell: (r) =>
        r.hasPin ? <Badge tone="green">{t("soc.pin.set")}</Badge> : <Badge tone="amber">{t("soc.pin.notSet")}</Badge>,
    },
    ...(canEdit
      ? [
          {
            key: "act",
            header: "",
            className: "text-right",
            cell: (r: Resident) => (
              <Button size="sm" variant="ghost" icon={<KeyRound className="size-3.5" />} onClick={() => setPinFor(r)}>
                {t("soc.pin.reset")}
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title={t("soc.nav.residents")}
        description={t("soc.residents.desc")}
        actions={
          <>
            <SearchBox value={q} onChange={setQ} placeholder={t("soc.residents.search")} />
            <Button
              icon={<Download className="size-4" />}
              disabled={rows.length === 0}
              onClick={() =>
                downloadCsv(
                  "residents.csv",
                  rows.map((r) => ({
                    flat: r.flatNumber,
                    wing: r.wing,
                    owner: r.ownerName,
                    tenant: r.tenantName,
                    role: r.role,
                    phone: r.contactNumber,
                    email: r.email,
                    unitType: r.unitType,
                    parking: r.parkingSlot,
                    family: r.familyMemberCount,
                    balanceDue: r.balanceDue,
                    advance: r.advanceBalance,
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
          { label: t("soc.stat.members"), value: all.length },
          { label: t("soc.group.committee"), value: countOf("committee") },
          { label: t("soc.group.staff"), value: countOf("staff") },
          {
            label: t("soc.stat.dues"),
            value: money(all.reduce((n, r) => n + r.balanceDue, 0)),
            tone: "text-rose-600 dark:text-rose-400",
          },
        ]}
      />
      <Segmented
        className="mb-3"
        value={group}
        onChange={setGroup}
        options={[
          { value: "all", label: t("soc.filter.all"), count: all.length },
          { value: "committee", label: t("soc.group.committee"), count: countOf("committee") },
          { value: "members", label: t("soc.group.members"), count: countOf("members") },
          { value: "staff", label: t("soc.group.staff"), count: countOf("staff") },
        ]}
      />
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.docId}
          loading={list.isLoading}
          empty={<EmptyState icon={<Users className="size-5" />} title={t("soc.residents.empty")} />}
        />
      )}
      <PinDialog resident={pinFor} onClose={() => setPinFor(null)} />
    </>
  );
}
