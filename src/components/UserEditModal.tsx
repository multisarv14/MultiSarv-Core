import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { Role, User, UserChanges } from "@/api/types";
import { useCategories, useUpdateUser } from "@/hooks/queries";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

import { Modal } from "./ui/overlay";
import { Button, Input, Label } from "./ui/primitives";
import { roleLabel } from "./ui/status";

const EDITABLE_ROLES: Role[] = ["customer", "worker", "business"];

interface Form {
  name: string;
  email: string;
  businessName: string;
  upiId: string;
  city: string;
  skills: string[];
  roles: Role[];
}

const fromUser = (u: User): Form => ({
  name: u.name === "Unnamed" ? "" : u.name,
  email: u.email ?? "",
  businessName: u.businessName ?? "",
  upiId: u.upiId ?? "",
  city: u.location?.city ?? "",
  skills: u.skills,
  roles: u.availableRoles.filter((r) => r !== "admin"),
});

/** Admin ne user chi mahiti badalne — fakt badallele fields server la jatat. */
export function UserEditModal({ user, open, onClose }: { user: User; open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<Form>(() => fromUser(user));
  const update = useUpdateUser();
  const { data: categories } = useCategories();

  useEffect(() => {
    if (open) setForm(fromUser(user));
  }, [open, user]);

  // Skill chips = category names (app madhe hich value save hote).
  const skillOptions = useMemo(() => {
    const names = (categories ?? []).filter((c) => !c.parentId).map((c) => c.name);
    return [...new Set([...names, ...form.skills])];
  }, [categories, form.skills]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const changes = useMemo(() => {
    const before = fromUser(user);
    const c: UserChanges = {};
    if (form.name.trim() !== before.name) c.name = form.name.trim();
    if (form.email.trim() !== before.email) c.email = form.email.trim();
    if (form.businessName.trim() !== before.businessName) c.businessName = form.businessName.trim();
    if (form.upiId.trim() !== before.upiId) c.upiId = form.upiId.trim();
    if (form.city.trim() !== before.city) c.city = form.city.trim();
    if ([...form.skills].sort().join("|") !== [...before.skills].sort().join("|")) c.skills = form.skills;
    if ([...form.roles].sort().join("|") !== [...before.roles].sort().join("|")) c.availableRoles = form.roles;
    return c;
  }, [form, user]);

  const dirty = Object.keys(changes).length > 0;
  const valid = form.name.trim().length >= 2 && form.roles.length > 0;

  const save = () => {
    if (!dirty) return toast.info(t("users.edit.noChanges"));
    update.mutate({ userId: user.id, changes }, { onSuccess: onClose });
  };

  return (
    <Modal
      open={open}
      onClose={update.isPending ? () => {} : onClose}
      size="lg"
      title={t("users.edit.title")}
      description={t("users.edit.desc")}
      footer={
        <>
          <Button onClick={onClose} disabled={update.isPending}>
            {t("act.cancel")}
          </Button>
          <Button
            variant="primary"
            icon={<Save className="size-4" />}
            loading={update.isPending}
            disabled={!valid}
            onClick={save}
          >
            {t("users.edit.save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>{t("users.field.name")} *</Label>
          <Input value={form.name} maxLength={80} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <Label>{t("users.field.city")}</Label>
          <Input value={form.city} maxLength={60} placeholder="Pune" onChange={(e) => set("city", e.target.value)} />
        </div>
        <div>
          <Label>{t("users.field.email")}</Label>
          <Input type="email" value={form.email} maxLength={120} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div>
          <Label>{t("users.field.upi")}</Label>
          <Input value={form.upiId} maxLength={120} placeholder="name@bank" onChange={(e) => set("upiId", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>{t("users.field.business")}</Label>
          <Input value={form.businessName} maxLength={120} onChange={(e) => set("businessName", e.target.value)} />
        </div>

        <div className="sm:col-span-2">
          <Label>{t("users.edit.roles")} *</Label>
          <div className="flex flex-wrap gap-2">
            {EDITABLE_ROLES.map((r) => (
              <Chip key={r} active={form.roles.includes(r)} onClick={() => set("roles", toggle(form.roles, r))}>
                {roleLabel(r)}
              </Chip>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2">
          <Label hint={t("users.edit.skillsHint")}>{t("users.field.skills")}</Label>
          <div className="flex flex-wrap gap-2">
            {skillOptions.map((s) => (
              <Chip key={s} active={form.skills.includes(s)} onClick={() => set("skills", toggle(form.skills, s))}>
                {s}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition",
        active ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}
