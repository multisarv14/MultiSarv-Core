import { sendPasswordResetEmail } from "firebase/auth";
import {
  Activity,
  Check,
  Copy,
  Crown,
  KeyRound,
  Layers,
  Link2,
  LockKeyhole,
  Lock,
  Mail,
  Pencil,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users as UsersIcon,
  UserX,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useRoles, type CoreRole } from "@/api/core";

import { navFor } from "@/components/layout/nav";
import { ProjectMark } from "@/components/layout/ProjectSwitcher";
import { CountUp, rise } from "@/components/ui/motion";
import { PageHeader, StatCard } from "@/components/ui/data";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { Avatar, Badge, Button, Card, EmptyState, Input, Label, Segmented, Select, Skeleton, Toggle } from "@/components/ui/primitives";
import { useProjects } from "@/context/projects";
import { useAdmin, type AdminProfile, type AdminRole } from "@/context/session";
import { getLang, t, type MsgKey } from "@/i18n";
import { ago, dateTime, num } from "@/lib/format";
import { callCore, core, errorMessage } from "@/lib/firebase";
import { cn, copyText } from "@/lib/utils";

import { useAdmins, useAudit, type AuditRow } from "./admins";

type Filter = "all" | "active" | "disabled";

/** Settings → Users: admins add / edit / disable / remove, ani activity. Access → Module Access. */
export function Users() {
  const me = useAdmin();
  const navigate = useNavigate();
  const projects = useProjects();
  const { admins, error } = useAdmins();
  const [tab, setTab] = useState<"admins" | "activity">("admins");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<AdminProfile | "new" | null>(null);
  const [removing, setRemoving] = useState<AdminProfile | null>(null);
  const [resetting, setResetting] = useState<AdminProfile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const audit = useAudit(tab === "activity");
  const { roles } = useRoles();

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (admins ?? []).filter(
      (a) =>
        (filter === "all" || (filter === "active" ? a.active : !a.active)) &&
        (!term || a.name.toLowerCase().includes(term) || a.email.includes(term)),
    );
  }, [admins, filter, q]);

  const stats = {
    total: admins?.length ?? 0,
    active: admins?.filter((a) => a.active).length ?? 0,
    supers: admins?.filter((a) => a.role === "superAdmin").length ?? 0,
  };

  const setActive = async (a: AdminProfile, active: boolean) => {
    setBusy(a.uid);
    try {
      await callCore("updateAdmin", { uid: a.uid, active });
      toast.success(active ? t("access.admins.enabled", { name: a.name }) : t("access.admins.disabled", { name: a.name }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(removing.uid);
    try {
      await callCore("deleteAdmin", { uid: removing.uid });
      toast.success(t("access.admins.deleted", { name: removing.name }));
      setRemoving(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title={t("master.nav.users")}
        description={t("master.users.subtitle")}
        actions={
          <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setEditing("new")}>
            {t("access.admins.add")}
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard index={0} label={t("access.stat.total")} icon={<UsersIcon className="size-4" />} loading={!admins} value={<CountUp value={stats.total} format={num} />} />
        <StatCard index={1} tone="green" label={t("access.stat.active")} icon={<Check className="size-4" />} loading={!admins} value={<CountUp value={stats.active} format={num} />} />
        <StatCard index={2} tone="violet" label={t("access.stat.supers")} icon={<Crown className="size-4" />} loading={!admins} value={<CountUp value={stats.supers} format={num} />} />
        <StatCard index={3} tone="blue" label={t("access.stat.projects")} icon={<Layers className="size-4" />} value={<CountUp value={projects.length} format={num} />} />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "admins", label: t("access.admins.tab"), count: stats.total },
            { value: "activity", label: t("access.activity.tab") },
          ]}
        />
        {tab === "admins" && (
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: t("access.filter.all") },
                { value: "active", label: t("access.filter.active") },
                { value: "disabled", label: t("access.filter.disabled") },
              ]}
            />
            <div className="w-full sm:w-56">
              <Input icon={<Search className="size-4" />} placeholder={t("access.admins.search")} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      {tab === "activity" ? (
        <ActivityList rows={audit} />
      ) : error ? (
        <Card>
          <EmptyState icon={<Lock className="size-5" />} title={t("err.generic")} description={error} />
        </Card>
      ) : !admins ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={<UsersIcon className="size-5" />} title={t("access.admins.empty")} />
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((a, i) => (
            <AdminRow
              key={a.uid}
              admin={a}
              roleName={roles?.find((r) => r.id === a.roleId)?.name}
              index={i}
              self={a.uid === me.uid}
              busy={busy === a.uid}
              onEdit={() => setEditing(a)}
              onAccess={() => navigate(`/settings/access?admin=${a.uid}`)}
              onToggle={(v) => setActive(a, v)}
              onDelete={() => setRemoving(a)}
              onReset={() => setResetting(a)}
            />
          ))}
        </div>
      )}

      <ResetPasswordDialog target={resetting} onClose={() => setResetting(null)} />
      <AdminEditor target={editing} onClose={() => setEditing(null)} self={me.uid} roles={roles} />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        tone="danger"
        loading={!!removing && busy === removing.uid}
        title={t("access.admins.deleteTitle", { name: removing?.name ?? "" })}
        description={t("access.admins.deleteDesc")}
        confirmLabel={t("access.admins.delete")}
      />
    </>
  );
}

function AdminRow({
  admin: a,
  roleName,
  index,
  self,
  busy,
  onEdit,
  onAccess,
  onToggle,
  onDelete,
  onReset,
}: {
  admin: AdminProfile;
  roleName?: string;
  index: number;
  self: boolean;
  busy: boolean;
  onEdit: () => void;
  onAccess: () => void;
  onToggle: (v: boolean) => void;
  onDelete: () => void;
  onReset: () => void;
}) {
  const all = useProjects();
  const projects = Object.entries(a.projects).filter(([, m]) => m.length);
  return (
    <Card
      className={cn(
        "group animate-rise flex flex-col gap-4 p-4 transition hover:border-accent/30 hover:shadow-pop sm:flex-row sm:items-center",
        !a.active && "opacity-60",
      )}
      style={rise(index)}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="relative">
          <Avatar name={a.name || a.email} seed={a.uid} />
          <span className={cn("absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-surface", a.active ? "bg-emerald-500" : "bg-zinc-400")} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">{a.name}</p>
            {a.role === "superAdmin" ? (
              <Badge tone="violet">
                <Crown className="size-3" /> {t("access.role.superAdmin")}
              </Badge>
            ) : (
              <Badge tone="blue">{t("access.role.admin")}</Badge>
            )}
            {roleName && <Badge tone="cyan">{roleName}</Badge>}
            {self && <Badge tone="accent">{t("access.admins.you")}</Badge>}
          </div>
          <p className="truncate text-xs text-muted">
            {a.email} · {t("access.admins.lastSeen", { time: ago(a.lastSeenAt) })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 sm:max-w-sm">
        {a.role === "superAdmin" ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Sparkles className="size-3.5 text-violet-500" /> {t("access.admins.everything")}
          </span>
        ) : projects.length === 0 ? (
          <span className="text-xs text-muted">{t("access.admins.noProjects")}</span>
        ) : (
          projects.map(([id, menus]) => {
            const p = all.find((x) => x.id === id);
            return (
              <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2/60 py-0.5 pr-2 pl-0.5 text-[11px]">
                {p && <ProjectMark project={p} size="sm" />}
                <span className="font-medium">{p?.name ?? id}</span>
                <span className="text-muted tabular">
                  {menus.length}/{navFor(p).length}
                </span>
              </span>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-2 sm:justify-end">
        <Toggle checked={a.active} disabled={self || busy} onChange={onToggle} size="sm" />
        <Button size="sm" icon={<KeyRound className="size-3.5" />} onClick={onAccess}>
          {t("master.nav.access")}
        </Button>
        <Button size="icon" variant="ghost" className="size-8" title={t("reset.title")} aria-label={t("reset.title")} disabled={!a.active} onClick={onReset}>
          <LockKeyhole className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" className="size-8" title={t("master.users.edit")} onClick={onEdit}>
          <Pencil className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" className="size-8 text-rose-500 hover:text-rose-600" disabled={self} title={t("access.admins.delete")} onClick={onDelete}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </Card>
  );
}

const ACTION_ICON: Record<string, typeof UserPlus> = { create: UserPlus, update: Pencil, delete: UserX, passwordReset: LockKeyhole };

/**
 * Super admin → password reset: reset email (Firebase Auth) pathavto ani
 * share karnyasathi link pan deto (admin / super admin donhi sathi).
 */
function ResetPasswordDialog({ target, onClose }: { target: AdminProfile | null; onClose: () => void }) {
  const [busy, setBusy] = useState<"email" | "link" | null>(null);
  const [result, setResult] = useState<{ link: string; emailed: boolean } | null>(null);

  useEffect(() => {
    if (target) setResult(null);
  }, [target]);

  const run = async (mode: "email" | "link") => {
    if (!target) return;
    setBusy(mode);
    try {
      const { email, link } = await callCore<{ email: string; link: string }>("adminResetPassword", { uid: target.uid });
      if (mode === "email") {
        const { auth } = core();
        auth.languageCode = getLang();
        await sendPasswordResetEmail(auth, email, { url: `${location.origin}/login` }).catch(() => sendPasswordResetEmail(auth, email));
        toast.success(t("reset.sent", { email }));
      }
      setResult({ link, emailed: mode === "email" });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open={!!target}
      onClose={busy ? () => {} : onClose}
      size="md"
      title={t("reset.title")}
      description={target ? `${target.name} · ${target.email}` : undefined}
      footer={
        result ? (
          <Button variant="primary" onClick={onClose}>
            {t("act.close")}
          </Button>
        ) : (
          <>
            <Button icon={<Link2 className="size-3.5" />} loading={busy === "link"} disabled={!!busy} onClick={() => run("link")}>
              {t("reset.linkOnly")}
            </Button>
            <Button variant="primary" icon={<Mail className="size-3.5" />} loading={busy === "email"} disabled={!!busy} onClick={() => run("email")}>
              {t("reset.sendEmail")}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="animate-pop space-y-3">
          {result.emailed && <p className="text-sm text-emerald-600 dark:text-emerald-400">{t("reset.sent", { email: target?.email ?? "" })}</p>}
          <div>
            <Label hint={t("reset.linkHint")}>{t("reset.link")}</Label>
            <div className="flex gap-2">
              <Input readOnly value={result.link} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button
                icon={<Copy className="size-3.5" />}
                onClick={async () => {
                  if (await copyText(result.link)) toast.success(t("act.copied"));
                }}
              >
                {t("access.created.copy")}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-muted">{t("reset.desc")}</p>
      )}
    </Modal>
  );
}

function ActivityList({ rows }: { rows: AuditRow[] | null }) {
  if (!rows) return <Skeleton className="h-64 rounded-2xl" />;
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState icon={<Activity className="size-5" />} title={t("access.activity.empty")} />
      </Card>
    );
  }
  return (
    <Card className="p-2">
      <ol>
        {rows.map((r, i) => {
          const Icon = ACTION_ICON[r.action] ?? Activity;
          return (
            <li key={r.id} className="animate-rise flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-2/60" style={rise(i)}>
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Icon className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p>
                  <span className="font-medium">{r.byEmail}</span>{" "}
                  <span className="text-muted">{t(`access.activity.${r.action}` as MsgKey)}</span>{" "}
                  <span className="font-medium">{r.targetEmail ?? "—"}</span>
                </p>
                <p className="text-[11px] text-muted" title={dateTime(r.at)}>
                  {ago(r.at)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

const genPassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$%";
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
};

/** Naav, email, password ani role. Project / menu access Module Access madhe. */
function AdminEditor({
  target,
  onClose,
  self,
  roles,
}: {
  target: AdminProfile | "new" | null;
  onClose: () => void;
  self: string;
  roles: CoreRole[] | null;
}) {
  const navigate = useNavigate();
  const isNew = target === "new";
  const existing = target && target !== "new" ? target : null;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AdminRole>("admin");
  const [roleId, setRoleId] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ uid: string; email: string; password: string; role: AdminRole } | null>(null);

  useEffect(() => {
    if (!target) return;
    setName(existing?.name ?? "");
    setEmail(existing?.email ?? "");
    setPassword(isNew ? genPassword() : "");
    setRole(existing?.role ?? "admin");
    setRoleId(existing?.roleId ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const save = async () => {
    setSaving(true);
    try {
      if (isNew) {
        const { uid } = await callCore<{ uid: string }>("createAdmin", { name, email, password, role, roleId: roleId || null, projects: {} });
        setCreated({ uid, email: email.trim().toLowerCase(), password, role });
        toast.success(t("access.admins.created", { name }));
      } else if (existing) {
        await callCore("updateAdmin", { uid: existing.uid, name, role, roleId: roleId || null });
        toast.success(t("access.admins.saved", { name }));
      }
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const canSave = name.trim().length >= 2 && (!isNew || (/^\S+@\S+\.\S+$/.test(email) && password.length >= 8));

  return (
    <>
      <Drawer
        open={!!target}
        onClose={saving ? () => {} : onClose}
        width="max-w-xl"
        title={isNew ? t("access.admins.add") : t("master.users.editTitle", { name: existing?.name ?? "" })}
        subtitle={isNew ? t("access.editor.newHint") : existing?.email}
      >
        <div className="space-y-6 pb-20">
          <section className="animate-rise grid gap-4 sm:grid-cols-2">
            <div>
              <Label>{t("access.editor.name")}</Label>
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Rahul Patil" maxLength={60} />
            </div>
            <div>
              <Label>{t("access.login.email")}</Label>
              <Input type="email" icon={<Mail className="size-4" />} value={email} disabled={!isNew} onChange={(e) => setEmail(e.target.value)} placeholder="admin@company.com" />
            </div>
            {isNew && (
              <div className="sm:col-span-2">
                <Label hint={t("access.editor.passwordHint")}>{t("access.editor.tempPassword")}</Label>
                <div className="flex gap-2">
                  <Input icon={<KeyRound className="size-4" />} value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
                  <Button type="button" onClick={() => setPassword(genPassword())} icon={<Sparkles className="size-3.5" />}>
                    {t("access.editor.generate")}
                  </Button>
                </div>
              </div>
            )}
          </section>

          <section className="animate-rise" style={rise(1)}>
            <Label
              hint={
                <Link to="/settings/roles" onClick={onClose} className="text-accent hover:underline">
                  {t("roles.manage")}
                </Link>
              }
            >
              {t("access.editor.role")}
            </Label>
            <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} disabled={!roles}>
              <option value="">{t("roles.none")}</option>
              {roles?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
              {/* Role kadhla gela asel tari juna value dakhva. */}
              {roleId && roles && !roles.some((r) => r.id === roleId) && <option value={roleId}>—</option>}
            </Select>
            {roles?.length === 0 && <p className="mt-1.5 text-[11px] text-muted">{t("cn.noRoles")}</p>}
          </section>

          <section className="animate-rise" style={rise(2)}>
            <Label>{t("access.editor.level")}</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["admin", "superAdmin"] as const).map((r) => {
                const lock = existing?.uid === self && r === "admin";
                return (
                  <button
                    key={r}
                    type="button"
                    disabled={lock}
                    onClick={() => setRole(r)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3 text-left transition disabled:opacity-50",
                      role === r ? "border-accent bg-accent/5 ring-3 ring-[var(--ring)]" : "border-border hover:bg-surface-2",
                    )}
                  >
                    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", r === "superAdmin" ? "bg-violet-500/10 text-violet-500" : "bg-sky-500/10 text-sky-500")}>
                      {r === "superAdmin" ? <Crown className="size-4" /> : <ShieldCheck className="size-4" />}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{t(`access.role.${r}`)}</span>
                      <span className="block text-[11px] text-muted">{t(`access.role.${r}Hint`)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {role === "admin" && <p className="mt-3 text-[11px] text-muted">{t("master.users.accessHint")}</p>}
          </section>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 border-t border-border bg-surface/90 px-5 py-3 backdrop-blur">
          <Button onClick={onClose} disabled={saving}>
            {t("act.cancel")}
          </Button>
          <Button variant="primary" loading={saving} disabled={!canSave} onClick={save} icon={isNew ? <UserPlus className="size-4" /> : <Check className="size-4" />}>
            {isNew ? t("access.admins.add") : t("act.save")}
          </Button>
        </div>
      </Drawer>

      <Modal
        open={!!created}
        onClose={() => setCreated(null)}
        size="sm"
        title={t("access.created.title")}
        description={t("access.created.desc")}
        footer={
          <>
            <Button
              icon={<Copy className="size-3.5" />}
              onClick={async () => {
                if (created && (await copyText(`${location.origin}\n${created.email}\n${created.password}`))) {
                  toast.success(t("act.copied"));
                }
              }}
            >
              {t("access.created.copy")}
            </Button>
            {created?.role === "admin" && (
              <Button variant="primary" icon={<KeyRound className="size-3.5" />} onClick={() => navigate(`/settings/access?admin=${created.uid}`)}>
                {t("master.users.giveAccess")}
              </Button>
            )}
          </>
        }
      >
        {created && (
          <div className="animate-pop space-y-2 rounded-xl border border-border bg-surface-2/60 p-4 font-mono text-sm">
            <p className="truncate">{location.origin}</p>
            <p className="truncate">{created.email}</p>
            <p className="truncate">{created.password}</p>
          </div>
        )}
      </Modal>
    </>
  );
}
