import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useRoles, type CoreRole } from "@/api/core";
import { rise } from "@/components/ui/motion";
import { PageHeader } from "@/components/ui/data";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { Badge, Button, Card, EmptyState, Input, Label, Skeleton, Textarea } from "@/components/ui/primitives";
import { t } from "@/i18n";
import { callCore, errorMessage } from "@/lib/firebase";

import { useAdmins } from "./admins";

/** Settings → Roles: Core Users che roles banavne / badalne / kadhne. */
export function Roles() {
  const { roles, error } = useRoles();
  const { admins } = useAdmins();
  const [editing, setEditing] = useState<CoreRole | "new" | null>(null);
  const [removing, setRemoving] = useState<CoreRole | null>(null);
  const [busy, setBusy] = useState(false);

  const usage = (id: string) => admins?.filter((a) => a.roleId === id).length ?? 0;

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await callCore("deleteRole", { id: removing.id });
      toast.success(t("roles.deleted"));
      setRemoving(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={t("master.nav.roles")}
        description={t("roles.subtitle")}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
            {t("roles.add")}
          </Button>
        }
      />

      {error ? (
        <Card>
          <EmptyState title={t("err.generic")} description={error} />
        </Card>
      ) : !roles ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : roles.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Tag className="size-5" />}
            title={t("roles.empty")}
            description={t("roles.emptyHint")}
            action={
              <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>
                {t("roles.add")}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((r, i) => (
            <Card key={r.id} className="animate-rise flex items-start gap-3 p-4" style={rise(i)}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Tag className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold">{r.name}</p>
                  <Badge tone="neutral">{t("roles.users", { n: usage(r.id) })}</Badge>
                </div>
                {r.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{r.description}</p>}
              </div>
              <div className="flex shrink-0 items-center">
                <Button size="icon" variant="ghost" className="size-8" title={t("roles.edit")} onClick={() => setEditing(r)}>
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-rose-500 hover:text-rose-600"
                  title={t("access.admins.delete")}
                  disabled={usage(r.id) > 0}
                  onClick={() => setRemoving(r)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <RoleEditor target={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        tone="danger"
        loading={busy}
        title={t("roles.deleteTitle", { name: removing?.name ?? "" })}
        description={t("roles.deleteDesc")}
        confirmLabel={t("access.admins.delete")}
      />
    </>
  );
}

function RoleEditor({ target, onClose }: { target: CoreRole | "new" | null; onClose: () => void }) {
  const existing = target && target !== "new" ? target : null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setName(existing?.name ?? "");
    setDescription(existing?.description ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const save = async () => {
    setSaving(true);
    try {
      await callCore("saveRole", { id: existing?.id, name, description });
      toast.success(t("roles.saved"));
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!target}
      onClose={saving ? () => {} : onClose}
      title={existing ? t("roles.edit") : t("roles.add")}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            {t("act.cancel")}
          </Button>
          <Button variant="primary" loading={saving} disabled={name.trim().length < 2} onClick={save}>
            {t("act.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>{t("roles.name")}</Label>
          <Input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Support" />
        </div>
        <div>
          <Label>{t("roles.description")}</Label>
          <Textarea value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
