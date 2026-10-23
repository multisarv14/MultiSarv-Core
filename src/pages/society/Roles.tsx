import { useQueryClient } from "@tanstack/react-query";
import { History, IdCard, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  listResidents,
  listRoleHistory,
  listRoles,
  deleteRole,
  normaliseRoleMenus,
  ROLE_MENU_KEYS,
  saveRole,
  STAFF_ROLES,
  type RoleChange,
  type RoleMenuKey,
  type SocietyRole,
} from "@/api/society";
import { DataTable, ErrorState, PageHeader, type Column } from "@/components/ui/data";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Label, Select, Skeleton, Toggle } from "@/components/ui/primitives";
import { allows, useProject } from "@/context/project";
import { t, type MsgKey } from "@/i18n";
import { errorMessage } from "@/lib/firebase";
import { dateTime } from "@/lib/format";

import { useSociety, useSocietyQuery, enumLabel } from "./state";

const screenLabel = (k: RoleMenuKey) => t(`soc.screen.${k}` as MsgKey);

/** Built-in role kinva society role che naav (history / lists sathi). */
export const roleName = (role: string, custom: string) => (custom.trim() ? custom.trim() : enumLabel(role));

const blank = (): SocietyRole => ({ id: "", name: "", description: "", baseRole: "MANAGER", menus: ["DASHBOARD", "ACCOUNTS", "MAINTENANCE", "COMMUNITY"], isActive: true });

function RoleEditor({ role, roles, onClose }: { role: SocietyRole | null; roles: SocietyRole[]; onClose: () => void }) {
  const { project } = useProject();
  const { current } = useSociety();
  const residents = useSocietyQuery("residents", listResidents);
  const qc = useQueryClient();
  const [form, setForm] = useState<SocietyRole>(blank());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (role) setForm(role.id ? role : blank());
  }, [role]);

  const name = form.name.trim();
  const clash = roles.some((r) => r.id !== form.id && r.name.trim().toLowerCase() === name.toLowerCase());
  const toggle = (k: RoleMenuKey) =>
    setForm((f) => ({ ...f, menus: f.menus.includes(k) ? f.menus.filter((m) => m !== k) : [...f.menus, k] }));

  const save = async () => {
    if (!current || !name || clash) return;
    setBusy(true);
    try {
      const holders = form.id ? (residents.data ?? []).filter((r) => r.customRoleId === form.id) : [];
      await saveRole(project, current.code, { ...form, menus: normaliseRoleMenus(form.menus) }, holders);
      toast.success(t("soc.roles.saved"));
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
      open={!!role}
      onClose={busy ? () => {} : onClose}
      title={form.id ? t("soc.roles.edit") : t("soc.roles.new")}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("act.cancel")}
          </Button>
          <Button variant="primary" loading={busy} disabled={!name || clash} onClick={save}>
            {t("act.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label hint={clash ? <span className="text-rose-600">{t("soc.roles.nameClash")}</span> : undefined}>{t("soc.roles.name")}</Label>
          <Input autoFocus maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <Label>{t("soc.roles.description")}</Label>
          <Input maxLength={200} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <Label>{t("soc.roles.base")}</Label>
          <Select value={form.baseRole} onChange={(e) => setForm({ ...form, baseRole: e.target.value })}>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {enumLabel(r)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t("soc.roles.screens")}</Label>
          <div className="flex flex-wrap gap-2">
            {ROLE_MENU_KEYS.map((k) => (
              <label key={k} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
                <input type="checkbox" checked={form.menus.includes(k)} onChange={() => toggle(k)} />
                {screenLabel(k)}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{t("soc.roles.screensNote")}</p>
        </div>
        {form.id && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">{t("soc.roles.active")}</span>
            <Toggle checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
          </div>
        )}
      </div>
    </Modal>
  );
}

export function SocietyRoles() {
  const { project, menus } = useProject();
  const { current } = useSociety();
  const qc = useQueryClient();
  const roles = useSocietyQuery("roles", listRoles);
  const residents = useSocietyQuery("residents", listResidents);
  const history = useSocietyQuery("role_history", listRoleHistory);
  const [editing, setEditing] = useState<SocietyRole | null>(null);
  const [removing, setRemoving] = useState<SocietyRole | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = allows(menus, "roles");

  const holders = (id: string) => (residents.data ?? []).filter((r) => r.customRoleId === id).length;

  const remove = async () => {
    if (!removing || !current) return;
    const held = holders(removing.id);
    if (held > 0) {
      toast.error(t("soc.roles.deleteBlocked", { n: held }));
      setRemoving(null);
      return;
    }
    setBusy(true);
    try {
      await deleteRole(project, current.code, removing.id);
      toast.success(t("soc.roles.deleted"));
      qc.invalidateQueries({ queryKey: [project.id, "soc", current.code] });
      setRemoving(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<RoleChange>[] = [
    { key: "when", header: t("soc.roles.col.when"), cell: (c) => <span className="text-xs whitespace-nowrap">{dateTime(c.at)}</span> },
    {
      key: "who",
      header: t("soc.col.name"),
      cell: (c) => (
        <div>
          <p className="font-medium">{c.memberName || "—"}</p>
          <p className="font-mono text-[11px] text-muted">{c.flatNumber}</p>
        </div>
      ),
    },
    {
      key: "change",
      header: t("soc.roles.col.change"),
      cell: (c) => (
        <span className="text-sm">
          {roleName(c.fromRole, c.fromCustomRoleName)} → <span className="font-semibold">{roleName(c.toRole, c.toCustomRoleName)}</span>
        </span>
      ),
    },
    {
      key: "by",
      header: t("soc.roles.col.by"),
      hideSm: true,
      cell: (c) => (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {c.source === "core" && <Badge tone="violet">{t("soc.roles.fromCore")}</Badge>}
          <span>{c.changedBy || "—"}</span>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("soc.nav.roles")}
        description={t("soc.roles.desc")}
        actions={
          canEdit && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing(blank())}>
              {t("soc.roles.add")}
            </Button>
          )
        }
      />

      {roles.error ? (
        <ErrorState error={roles.error} onRetry={roles.refetch} />
      ) : roles.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (roles.data ?? []).length === 0 ? (
        <Card>
          <EmptyState icon={<IdCard className="size-5" />} title={t("soc.roles.empty")} />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(roles.data ?? []).map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.name}</p>
                  <p className="text-xs text-muted">
                    {t("soc.roles.base")}: {enumLabel(r.baseRole)} · {t("soc.roles.holders", { n: holders(r.id) })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!r.isActive && <Badge tone="red">{t("soc.roles.retired")}</Badge>}
                  {canEdit && (
                    <>
                      <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(r)} aria-label={t("soc.roles.edit")} />
                      <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setRemoving(r)} aria-label={t("soc.roles.delete")} />
                    </>
                  )}
                </div>
              </div>
              {r.description && <p className="mt-2 text-xs text-muted">{r.description}</p>}
              <div className="mt-3 flex flex-wrap gap-1">
                {r.menus.map((m) => (
                  <Badge key={m} tone="cyan">
                    {screenLabel(m)}
                  </Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader title={t("soc.roles.history")} action={<History className="size-4 text-muted" />} />
        <div className="px-2 pb-2">
          {history.error ? (
            <ErrorState error={history.error} onRetry={history.refetch} />
          ) : (
            <DataTable
              columns={columns}
              rows={history.data ?? []}
              rowKey={(c) => c.id}
              loading={history.isLoading}
              empty={<EmptyState icon={<History className="size-5" />} title={t("soc.roles.historyEmpty")} />}
            />
          )}
        </div>
      </Card>

      <RoleEditor role={editing} roles={roles.data ?? []} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        loading={busy}
        tone="danger"
        title={t("soc.roles.deleteTitle")}
        description={removing?.name}
        confirmLabel={t("soc.roles.delete")}
      />
    </>
  );
}
