import { useQueryClient } from "@tanstack/react-query";
import { Download, KeyRound, UserCog, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  changeRoles,
  isPin,
  listResidents,
  listRoles,
  MEMBER_ROLES,
  resetResidentPin,
  STAFF_ROLES,
  type Resident,
  type RoleAssignment,
} from "@/api/society";
import { DataTable, ErrorState, PageHeader, type Column } from "@/components/ui/data";
import { Modal } from "@/components/ui/overlay";
import { Avatar, Badge, Button, EmptyState, Input, Label, Segmented, Select } from "@/components/ui/primitives";
import { allows, useProject } from "@/context/project";
import { useAdmin } from "@/context/session";
import { t } from "@/i18n";
import { errorMessage } from "@/lib/firebase";
import { money } from "@/lib/format";
import { cn, downloadCsv } from "@/lib/utils";

import { matches, roleGroup, SearchBox, SocietyRoleBadge, Totals, type RoleGroup } from "./parts";
import { roleName } from "./Roles";
import { enumLabel, useSociety, useSocietyQuery } from "./state";

/** Picker value: built-in role (`SECRETARY`) kinva society role (`custom:<id>`). */
const CUSTOM = "custom:";

/**
 * Member / staff cha role tyach record var badalto — member ani staff kadhich ekmekat
 * badlat nahit (duplicate record nako). Chairman navin konala kela tar juna chairman
 * kay hoil te vicharto, mhanje society la nehmi ek chairman rahto.
 */
function RoleDialog({ resident, all, onClose }: { resident: Resident | null; all: Resident[]; onClose: () => void }) {
  const { project } = useProject();
  const { current } = useSociety();
  const me = useAdmin();
  const qc = useQueryClient();
  const roles = useSocietyQuery("roles", listRoles);
  const [pick, setPick] = useState("");
  const [prevRole, setPrevRole] = useState("COMMITTEE");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!resident) return;
    setPick(resident.customRoleId ? CUSTOM + resident.customRoleId : resident.role);
    setPrevRole("COMMITTEE");
  }, [resident]);

  if (!resident) return <Modal open={false} onClose={onClose} title="" />;

  const isStaff = STAFF_ROLES.includes(resident.role);
  const custom = pick.startsWith(CUSTOM) ? (roles.data ?? []).find((r) => r.id === pick.slice(CUSTOM.length)) ?? null : null;
  const role = custom?.baseRole ?? pick;
  const sitting = all.filter((r) => r.role === "CHAIRMAN" && r.docId !== resident.docId);
  const becomingChairman = role === "CHAIRMAN" && resident.role !== "CHAIRMAN";
  const losingChairman = resident.role === "CHAIRMAN" && role !== "CHAIRMAN";
  const vacant = !isStaff && !resident.ownerName.trim() && role !== "RESIDENT";
  const unchanged = role === resident.role && (custom?.id ?? "") === resident.customRoleId;

  const problem = vacant
    ? t("soc.role.vacant")
    : losingChairman && sitting.length === 0
      ? t("soc.role.chairmanKeep")
      : unchanged
        ? t("soc.role.unchanged")
        : null;

  const save = async () => {
    if (!current || problem) return;
    setBusy(true);
    try {
      const changes: RoleAssignment[] = [{ resident, role, custom }];
      if (becomingChairman) for (const c of sitting) changes.push({ resident: c, role: prevRole, custom: null });
      await changeRoles(project, current.code, changes, me.email);
      toast.success(t("soc.role.changed", { flat: resident.flatNumber }));
      qc.invalidateQueries({ queryKey: [project.id, "soc", current.code] });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      size="sm"
      title={t("soc.role.change")}
      description={`${resident.flatNumber} · ${resident.ownerName || "—"}`}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("act.cancel")}
          </Button>
          <Button variant="primary" loading={busy} disabled={!!problem} onClick={save}>
            {t("act.save")}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-muted">
        {t("soc.role.current")}: <span className="font-medium text-text">{roleName(resident.role, resident.customRoleName)}</span>
      </p>
      <Label>{t("soc.role.new")}</Label>
      <Select value={pick} onChange={(e) => setPick(e.target.value)}>
        {(isStaff ? STAFF_ROLES : MEMBER_ROLES).map((r) => (
          <option key={r} value={r}>
            {enumLabel(r)}
          </option>
        ))}
        {isStaff &&
          (roles.data ?? [])
            .filter((r) => r.isActive || r.id === resident.customRoleId)
            .map((r) => (
              <option key={r.id} value={CUSTOM + r.id}>
                {r.name}
              </option>
            ))}
      </Select>
      {becomingChairman &&
        sitting.map((c) => (
          <div key={c.docId} className="mt-4">
            <Label>{t("soc.role.chairmanHandover", { name: c.ownerName, flat: c.flatNumber })}</Label>
            <Select value={prevRole} onChange={(e) => setPrevRole(e.target.value)}>
              {MEMBER_ROLES.filter((r) => r !== "CHAIRMAN").map((r) => (
                <option key={r} value={r}>
                  {enumLabel(r)}
                </option>
              ))}
            </Select>
          </div>
        ))}
      {problem && !unchanged && <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{problem}</p>}
      <p className="mt-3 text-xs text-muted">{t("soc.role.sync")}</p>
    </Modal>
  );
}

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
  const [roleFor, setRoleFor] = useState<Resident | null>(null);
  const canEdit = allows(menus, "residents");
  const canChangeRole = allows(menus, "roles");

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
          <SocietyRoleBadge role={r.role} label={r.customRoleName || undefined} />
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
    ...(canEdit || canChangeRole
      ? [
          {
            key: "act",
            header: "",
            className: "text-right",
            cell: (r: Resident) => (
              <div className="flex justify-end gap-1">
                {canChangeRole && (
                  <Button size="sm" variant="ghost" icon={<UserCog className="size-3.5" />} onClick={() => setRoleFor(r)}>
                    {t("soc.role.change")}
                  </Button>
                )}
                {canEdit && (
                  <Button size="sm" variant="ghost" icon={<KeyRound className="size-3.5" />} onClick={() => setPinFor(r)}>
                    {t("soc.pin.reset")}
                  </Button>
                )}
              </div>
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
                    role: r.customRoleName || r.role,
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
      <RoleDialog resident={roleFor} all={all} onClose={() => setRoleFor(null)} />
    </>
  );
}
