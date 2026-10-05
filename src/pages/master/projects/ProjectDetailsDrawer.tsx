import { Check, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { Avatar, Badge, Button, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { PROJECT_STATUSES, PROJECT_TYPES, type ProjectDef, type ProjectStatus, type ProjectType } from "@/config/projects";
import { t } from "@/i18n";
import { callCore, errorMessage } from "@/lib/firebase";
import { cn } from "@/lib/utils";

import { useAdmins } from "../admins";
import { LogoPicker } from "./LogoPicker";
import { projectStatusLabel, projectTypeLabel } from "./meta";

const REGIONS = ["asia-south1", "asia-south2", "asia-southeast1", "us-central1", "europe-west1"];
const COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6"];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 30);

interface Form {
  id: string;
  name: string;
  client: string;
  tagline: string;
  description: string;
  status: ProjectStatus;
  projectType: ProjectType;
  startDate: string;
  endDate: string;
  manager: string;
  team: string[];
  accent: string;
  region: string;
  vapidKey: string;
  logo: string | null;
}

const fromProject = (p?: ProjectDef | null): Form => ({
  id: p?.id ?? "",
  name: p?.name ?? "",
  client: p?.client ?? "",
  tagline: p?.tagline ?? "",
  description: p?.description ?? "",
  status: p?.status ?? "active",
  projectType: p?.projectType ?? "marketplace",
  startDate: p?.startDate ?? "",
  endDate: p?.endDate ?? "",
  manager: p?.manager?.uid ?? "",
  team: p?.team?.map((m) => m.uid) ?? [],
  accent: p?.accent ?? COLORS[0],
  region: p?.region ?? REGIONS[0],
  vapidKey: p?.vapidKey ?? "",
  logo: p?.logo ?? null,
});

function Section({ title, hint, children, i }: { title: string; hint?: string; children: ReactNode; i: number }) {
  return (
    <section className="animate-rise rounded-2xl border border-border bg-surface p-4" style={{ ["--i" as string]: i }}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold">{title}</p>
        {hint && <p className="text-[11px] text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label hint={error ? <span className="text-rose-500">{error}</span> : hint}>{label}</Label>
      {children}
    </div>
  );
}

/**
 * Add project ani Project Overview → Edit — ekach form. Logo, mahiti, status, type,
 * tarkha, manager / team (saddhyache Users madhun). Save → core `createProject` / `updateProject`.
 */
export function ProjectDetailsDrawer({
  project,
  open,
  onClose,
  onSaved,
}: {
  /** Asel tar Edit, nasel tar Add. */
  project?: ProjectDef | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string, created: boolean) => void;
}) {
  const editing = !!project;
  const [f, setF] = useState<Form>(fromProject(project));
  const [idTouched, setIdTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [teamQ, setTeamQ] = useState("");
  const { admins } = useAdmins(open);
  const active = useMemo(() => (admins ?? []).filter((a) => a.active), [admins]);

  useEffect(() => {
    if (!open) return;
    setF(fromProject(project));
    setIdTouched(false);
    setTeamQ("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const errors = {
    name: f.name.trim().length < 2 ? t("core.err.badProjectName") : null,
    id: !editing && !/^[a-z][a-z0-9-]{1,29}$/.test(f.id) ? t("core.err.badProjectId") : null,
    endDate: f.startDate && f.endDate && f.endDate < f.startDate ? t("core.err.endBeforeStart") : null,
  };
  const [touched, setTouched] = useState(false);
  const valid = !errors.name && !errors.id && !errors.endDate;
  const dirty = JSON.stringify(f) !== JSON.stringify(fromProject(project));

  const save = async () => {
    setTouched(true);
    if (!valid) return;
    setBusy(true);
    try {
      const body = {
        id: f.id,
        name: f.name.trim(),
        client: f.client.trim(),
        tagline: f.tagline.trim(),
        description: f.description.trim(),
        status: f.status,
        projectType: f.projectType,
        startDate: f.startDate || null,
        endDate: f.endDate || null,
        manager: f.manager || null,
        team: f.team,
        accent: f.accent,
        ...(project?.builtIn ? {} : { region: f.region }),
        ...(editing ? { vapidKey: f.vapidKey } : {}),
        ...(f.logo !== (project?.logo ?? null) ? { logo: f.logo } : {}),
      };
      await callCore(editing ? "updateProject" : "createProject", body);
      toast.success(editing ? t("projects.toast.saved", { name: body.name }) : t("projects.toast.created", { name: body.name }));
      onSaved?.(f.id, !editing);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!project) return;
    setBusy(true);
    try {
      await callCore("removeProject", { id: project.id });
      toast.success(t("projects.toast.removed", { name: project.name }));
      setRemoving(false);
      onSaved?.(project.id, false);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const preview = { ...(project ?? ({} as ProjectDef)), id: f.id || "new", name: f.name || "P", accent: f.accent } as ProjectDef;
  const shown = touched ? errors : { name: null, id: null, endDate: errors.endDate };
  const teamList = active.filter((a) => !teamQ || a.name.toLowerCase().includes(teamQ.toLowerCase()) || a.email.includes(teamQ.toLowerCase()));

  return (
    <>
      <Drawer
        open={open}
        onClose={busy ? () => {} : onClose}
        width="max-w-2xl"
        title={editing ? t("projects.editTitle", { name: project!.name }) : t("projects.add")}
        subtitle={editing ? (project!.builtIn ? t("projects.builtInHint") : f.id) : t("projects.addHint")}
      >
        <div className="space-y-4 pb-24">
          <Section title={t("projects.logo.title")} i={0}>
            <LogoPicker project={preview} value={f.logo} original={project?.logo ?? null} onChange={(v) => set("logo", v)} disabled={busy} />
          </Section>

          <Section title={t("projects.section.basic")} i={1}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("projects.field.name")} error={shown.name}>
                <Input
                  autoFocus={!editing}
                  value={f.name}
                  maxLength={40}
                  placeholder={t("projects.field.namePlaceholder")}
                  onChange={(e) => {
                    set("name", e.target.value);
                    if (!editing && !idTouched) set("id", slug(e.target.value));
                  }}
                />
              </Field>
              <Field label={t("projects.field.id")} hint={editing ? t("projects.field.idLocked") : t("projects.field.idHint")} error={shown.id}>
                <Input
                  className="font-mono"
                  value={f.id}
                  disabled={editing}
                  maxLength={30}
                  placeholder="vijaydhara"
                  onChange={(e) => {
                    setIdTouched(true);
                    set("id", slug(e.target.value));
                  }}
                />
              </Field>
              <Field label={t("projects.field.client")} hint={t("word.optional")}>
                <Input value={f.client} maxLength={80} placeholder={t("projects.field.clientPlaceholder")} onChange={(e) => set("client", e.target.value)} />
              </Field>
              <Field label={t("projects.field.tagline")} hint={t("word.optional")}>
                <Input value={f.tagline} maxLength={80} placeholder={t("projects.field.taglinePlaceholder")} onChange={(e) => set("tagline", e.target.value)} />
              </Field>
              <Field label={t("projects.field.description")} hint={`${f.description.length}/2000`} className="sm:col-span-2">
                <Textarea className="min-h-24" value={f.description} maxLength={2000} placeholder={t("projects.field.descriptionPlaceholder")} onChange={(e) => set("description", e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title={t("projects.section.details")} i={2}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("projects.field.status")}>
                <Select value={f.status} onChange={(e) => set("status", e.target.value as ProjectStatus)}>
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {projectStatusLabel(s)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("projects.field.type")}>
                <Select value={f.projectType} onChange={(e) => set("projectType", e.target.value as ProjectType)}>
                  {PROJECT_TYPES.map((s) => (
                    <option key={s} value={s}>
                      {projectTypeLabel(s)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("projects.field.start")} hint={t("word.optional")}>
                <Input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} />
              </Field>
              <Field label={t("projects.field.end")} hint={t("word.optional")} error={shown.endDate}>
                <Input type="date" value={f.endDate} min={f.startDate || undefined} onChange={(e) => set("endDate", e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title={t("projects.section.team")} hint={t("projects.teamHint")} i={3}>
            <Field label={t("projects.field.manager")} className="mb-4">
              <Select value={f.manager} onChange={(e) => set("manager", e.target.value)} disabled={!admins}>
                <option value="">{t("projects.noManager")}</option>
                {active.map((a) => (
                  <option key={a.uid} value={a.uid}>
                    {a.name} · {a.email}
                  </option>
                ))}
              </Select>
            </Field>
            <Label hint={t("projects.teamCount", { n: f.team.length })}>{t("projects.field.team")}</Label>
            <Input icon={<Search className="size-4" />} placeholder={t("access.admins.search")} value={teamQ} onChange={(e) => setTeamQ(e.target.value)} />
            <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto rounded-xl border border-border p-1">
              {teamList.length === 0 && <li className="px-3 py-4 text-center text-xs text-muted">{t("access.admins.empty")}</li>}
              {teamList.map((a) => {
                const on = f.team.includes(a.uid);
                return (
                  <li key={a.uid}>
                    <button
                      type="button"
                      onClick={() => set("team", on ? f.team.filter((x) => x !== a.uid) : [...f.team, a.uid])}
                      className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left transition", on ? "bg-accent/10" : "hover:bg-surface-2")}
                    >
                      <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border transition", on ? "border-accent bg-accent text-white" : "border-border")}>
                        {on && <Check className="size-3" />}
                      </span>
                      <Avatar name={a.name} seed={a.uid} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{a.name}</span>
                        <span className="block truncate text-[11px] text-muted">{a.email}</span>
                      </span>
                      {f.manager === a.uid && <Badge tone="violet">{t("projects.field.manager")}</Badge>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section title={t("projects.section.appearance")} i={4}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("projects.field.color")}>
                <div className="flex flex-wrap items-center gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => set("accent", c)}
                      className={cn("size-7 rounded-full ring-offset-2 ring-offset-surface transition", f.accent === c ? "ring-2 ring-text" : "hover:scale-110")}
                      style={{ background: c }}
                      aria-label={c}
                    />
                  ))}
                  <input type="color" value={f.accent} onChange={(e) => set("accent", e.target.value)} className="size-7 cursor-pointer rounded-full border border-border bg-transparent" />
                </div>
              </Field>
              {!project?.builtIn && (
                <Field label={t("projects.field.region")}>
                  <Select value={f.region} onChange={(e) => set("region", e.target.value)}>
                    {REGIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {editing && (
                <Field label={t("projects.field.vapid")} hint={t("word.optional")} className="sm:col-span-2">
                  <Input className="font-mono text-xs" value={f.vapidKey} onChange={(e) => set("vapidKey", e.target.value)} placeholder="BEyf…" />
                </Field>
              )}
            </div>
          </Section>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-2 border-t border-border bg-surface/90 px-5 py-3 backdrop-blur">
          {editing && !project!.builtIn && (
            <Button variant="ghost" className="mr-auto text-rose-500" icon={<Trash2 className="size-4" />} onClick={() => setRemoving(true)} disabled={busy}>
              {t("projects.remove")}
            </Button>
          )}
          <Button onClick={onClose} disabled={busy}>
            {t("act.cancel")}
          </Button>
          <Button variant="primary" loading={busy} disabled={editing && !dirty} onClick={save} icon={<Check className="size-4" />}>
            {editing ? t("projects.saveChanges") : t("projects.add")}
          </Button>
        </div>
      </Drawer>
      <ConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
        onConfirm={remove}
        tone="danger"
        loading={busy}
        title={t("projects.removeTitle", { name: project?.name ?? "" })}
        description={t("projects.removeDesc")}
        confirmLabel={t("projects.remove")}
      />
    </>
  );
}
