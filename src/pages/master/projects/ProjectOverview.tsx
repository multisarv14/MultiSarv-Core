import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  Crown,
  FileText,
  ImagePlus,
  Info,
  Pencil,
  Plug,
  ShieldCheck,
  Users as UsersIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { ProjectMark } from "@/components/layout/ProjectSwitcher";
import { rise } from "@/components/ui/motion";
import { Modal } from "@/components/ui/overlay";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, KV } from "@/components/ui/primitives";
import type { ProjectDef } from "@/config/projects";
import { useProjects } from "@/context/projects";
import { isSuper, projectMenus, useAdmin } from "@/context/session";
import { t } from "@/i18n";
import { date, dateTime } from "@/lib/format";
import { callCore, errorMessage } from "@/lib/firebase";
import { copyText } from "@/lib/utils";

import { LogoPicker } from "./LogoPicker";
import { ConnectDrawer } from "./ProjectForms";
import { ProjectDetailsDrawer } from "./ProjectDetailsDrawer";
import { projectTypeLabel, ProjectStatusBadge } from "./meta";

const DAY = 86_400_000;
const parse = (d?: string | null) => (d ? new Date(`${d}T00:00:00`) : null);

/** Start → End madhe kiti gele — progress bar ani "X divas baki". */
function Timeline({ project }: { project: ProjectDef }) {
  const start = parse(project.startDate);
  const end = parse(project.endDate);
  if (!start && !end) return <p className="text-sm text-muted">{t("projects.overview.noDates")}</p>;
  const now = Date.now();
  const pct = start && end ? Math.min(100, Math.max(0, ((now - +start) / Math.max(DAY, +end - +start)) * 100)) : null;
  const left = end ? Math.ceil((+end - now) / DAY) : null;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <div>
          <p className="text-[11px] text-muted">{t("projects.field.start")}</p>
          <p className="font-medium">{start ? date(start) : "—"}</p>
        </div>
        <ArrowRight className="size-4 text-muted" />
        <div className="text-right">
          <p className="text-[11px] text-muted">{t("projects.field.end")}</p>
          <p className="font-medium">{end ? date(end) : "—"}</p>
        </div>
      </div>
      {pct !== null && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            {left !== null && left >= 0
              ? t("projects.overview.daysLeft", { n: left, pct: Math.round(pct) })
              : t("projects.overview.overdue", { n: Math.abs(left ?? 0) })}
          </p>
        </div>
      )}
    </div>
  );
}

function Person({ p, badge }: { p: { uid: string; name: string; email: string }; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
      <Avatar name={p.name} seed={p.uid} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{p.name}</p>
        <p className="truncate text-[11px] text-muted">{p.email}</p>
      </div>
      {badge}
    </div>
  );
}

/** Fakt logo badalnyasathi chhota modal — preview, Save, loading. */
function LogoModal({ project, open, onClose }: { project: ProjectDef; open: boolean; onClose: () => void }) {
  const [logo, setLogo] = useState<string | null>(project.logo ?? null);
  const [busy, setBusy] = useState(false);
  const changed = logo !== (project.logo ?? null);

  const save = async () => {
    setBusy(true);
    try {
      await callCore("updateProject", { id: project.id, logo });
      toast.success(logo ? t("projects.logo.saved") : t("projects.logo.removed"));
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={t("projects.logo.title")}
      description={project.name}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("act.cancel")}
          </Button>
          <Button variant="primary" loading={busy} disabled={!changed} onClick={save} icon={<Check className="size-4" />}>
            {t("projects.saveChanges")}
          </Button>
        </>
      }
    >
      <LogoPicker project={project} value={logo} original={project.logo ?? null} onChange={setLogo} disabled={busy} />
    </Modal>
  );
}

/** Projects → Project Overview: sagli mahiti, logo, team; super admin la Edit. */
export function ProjectOverview() {
  const { projectId } = useParams();
  const me = useAdmin();
  const sup = isSuper(me);
  const project = useProjects().find((p) => p.id === projectId);
  const [editing, setEditing] = useState(false);
  const [logoOpen, setLogoOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Access nasel kinva project nahi (kadhla) — Projects var parat.
  if (!project || (!sup && !projectMenus(me, project.id))) return <Navigate to="/projects" replace />;

  const connected = !!project.firebase;
  const team = project.team ?? [];
  const people = new Set([...(project.manager ? [project.manager.uid] : []), ...team.map((m) => m.uid)]).size;

  return (
    <div style={{ ["--accent" as string]: project.accent }}>
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-muted">
        <Link to="/projects" className="hover:text-text">
          {t("master.nav.projects")}
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-text">{project.name}</span>
      </nav>

      <Card className="animate-rise relative mb-4 overflow-hidden">
        <div className="pointer-events-none absolute -top-28 -right-20 size-72 rounded-full bg-accent/15 blur-3xl" />
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
          <div className="group relative self-start">
            <ProjectMark project={project} size="xl" />
            {sup && (
              <button
                type="button"
                onClick={() => setLogoOpen(true)}
                title={t("projects.logo.change")}
                className="absolute -right-2 -bottom-2 flex size-7 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-card transition hover:text-accent"
              >
                <ImagePlus className="size-3.5" />
              </button>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{project.name}</h1>
              <ProjectStatusBadge status={project.status} />
              {project.builtIn && <Badge tone="violet">{t("projects.builtIn")}</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <button
                type="button"
                className="inline-flex items-center gap-1 font-mono text-xs hover:text-accent"
                onClick={async () => (await copyText(project.id)) && toast.success(t("act.copied"))}
              >
                {project.id} <Copy className="size-3" />
              </button>
              {project.client && (
                <span className="inline-flex items-center gap-1" title={t("projects.field.client")}>
                  <Info className="size-3.5" /> {project.client}
                </span>
              )}
              {project.projectType && <span>{projectTypeLabel(project.projectType)}</span>}
            </div>
            {project.tagline && <p className="mt-1 text-sm text-muted">{project.tagline}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {sup && (
              <Button variant="primary" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
                {t("tickets.edit")}
              </Button>
            )}
            {connected ? (
              <Link to={`/p/${project.id}`}>
                <Button icon={<ArrowRight className="size-3.5" />}>{t("home.openPanel")}</Button>
              </Link>
            ) : (
              sup &&
              !project.builtIn && (
                <Button icon={<Plug className="size-3.5" />} onClick={() => setConnecting(true)}>
                  {t("projects.connect.cta")}
                </Button>
              )
            )}
          </div>
        </div>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card className="animate-rise" style={rise(1)}>
            <CardHeader title={<span className="inline-flex items-center gap-2"><FileText className="size-4" /> {t("projects.field.description")}</span>} />
            <div className="px-5 pb-5">
              {project.description ? (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{project.description}</p>
              ) : (
                <p className="text-sm text-muted">
                  {t("projects.overview.noDescription")}{" "}
                  {sup && (
                    <button type="button" className="text-accent hover:underline" onClick={() => setEditing(true)}>
                      {t("projects.overview.addNow")}
                    </button>
                  )}
                </p>
              )}
            </div>
          </Card>

          <Card className="animate-rise" style={rise(2)}>
            <CardHeader title={<span className="inline-flex items-center gap-2"><CalendarDays className="size-4" /> {t("projects.overview.timeline")}</span>} />
            <div className="px-5 pb-5">
              <Timeline project={project} />
            </div>
          </Card>

          <Card className="animate-rise" style={rise(3)}>
            <CardHeader
              title={<span className="inline-flex items-center gap-2"><UsersIcon className="size-4" /> {t("projects.section.team")}</span>}
              subtitle={t("projects.teamCount", { n: people })}
            />
            <div className="px-3 pb-4">
              {project.manager || team.length ? (
                <div className="grid gap-x-4 sm:grid-cols-2">
                  {project.manager && (
                    <Person
                      p={project.manager}
                      badge={
                        <Badge tone="violet">
                          <Crown className="size-3" /> {t("projects.field.manager")}
                        </Badge>
                      }
                    />
                  )}
                  {team
                    .filter((m) => m.uid !== project.manager?.uid)
                    .map((m) => (
                      <Person key={m.uid} p={m} />
                    ))}
                </div>
              ) : (
                <EmptyState className="py-8" icon={<UsersIcon className="size-5" />} title={t("projects.overview.noTeam")} />
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20">
          <Card className="animate-rise p-5" style={rise(2)}>
            <div className="divide-y divide-border">
              <KV label={t("projects.field.id")}>
                <span className="font-mono">{project.id}</span>
              </KV>
              <KV label={t("projects.field.client")}>{project.client || "—"}</KV>
              <KV label={t("projects.field.status")}>{project.status ? <ProjectStatusBadge status={project.status} /> : "—"}</KV>
              <KV label={t("projects.field.type")}>{project.projectType ? projectTypeLabel(project.projectType) : "—"}</KV>
              <KV label={t("projects.field.manager")}>{project.manager?.name ?? "—"}</KV>
              <KV label={t("projects.overview.created")}>{project.createdAt ? dateTime(project.createdAt) : "—"}</KV>
              <KV label={t("projects.overview.updated")}>{project.updatedAt ? dateTime(project.updatedAt) : "—"}</KV>
              {project.createdBy && <KV label={t("projects.overview.createdBy")}>{project.createdBy.name}</KV>}
            </div>
          </Card>

          <Card className="animate-rise p-5" style={rise(3)}>
            <p className="mb-2 inline-flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="size-4" /> {t("projects.overview.connection")}
            </p>
            <div className="divide-y divide-border">
              <KV label={t("projects.overview.firebase")}>
                {connected ? <span className="font-mono text-xs">{project.firebase!.projectId}</span> : <Badge tone="amber">{t("projects.notConnected")}</Badge>}
              </KV>
              <KV label={t("projects.field.region")}>{project.region}</KV>
              <KV label={t("projects.overview.structure")}>{t("projects.typeMarketplace")}</KV>
              <KV label={t("projects.overview.push")}>{project.vapidKey ? t("word.yes") : t("word.no")}</KV>
            </div>
          </Card>
        </div>
      </div>

      {sup && (
        <>
          <ProjectDetailsDrawer project={project} open={editing} onClose={() => setEditing(false)} />
          {logoOpen && <LogoModal project={project} open onClose={() => setLogoOpen(false)} />}
          <ConnectDrawer project={connecting ? project : null} onClose={() => setConnecting(false)} />
        </>
      )}
    </div>
  );
}
