import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, Banknote, LayoutDashboard, LayoutGrid, LayoutPanelTop, List, Lock, Plug, Plus, Scale } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";

import { getQueueCounts } from "@/api/admin";
import { NAV } from "@/components/layout/nav";
import { ProjectMark } from "@/components/layout/ProjectSwitcher";
import { rise } from "@/components/ui/motion";
import { PageHeader } from "@/components/ui/data";
import { Badge, Button, Card, Segmented, Skeleton } from "@/components/ui/primitives";
import { type ProjectDef } from "@/config/projects";
import { useProjectAuth } from "@/context/auth";
import { allows } from "@/context/project";
import { getProjects, MULTISARV_PROJECT } from "@/context/projects";
import { isSuper, useAdmin, useVisibleProjects } from "@/context/session";
import { t } from "@/i18n";

import { NoProjects } from "./Dashboard";
import { ProjectStatusBadge } from "./projects/meta";
import { ProjectDetailsDrawer } from "./projects/ProjectDetailsDrawer";
import { ConnectDrawer } from "./projects/ProjectForms";

/** Mouse chya jagi accent glow (`.spotlight`). */
const track = (e: MouseEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
};

/** Card ani list row donhi sathi — connection, access ani pending queues. */
function useProjectState(project: ProjectDef) {
  const auth = useProjectAuth(project);
  const notConnected = !project.builtIn && !project.firebase;
  const isAdmin = auth.status === "admin";
  const menus = isAdmin ? auth.menus : [];
  // Project shell madhla `useQueueCounts` hyach key vaparto — cache share.
  const { data, isLoading } = useQuery({
    queryKey: [project.id, "queues"],
    queryFn: () => getQueueCounts(project),
    enabled: isAdmin,
    staleTime: 30_000,
  });

  const status = {
    unconfigured: notConnected ? <Badge tone="amber">{t("projects.notConnected")}</Badge> : <Badge>{t("shell.notConfigured")}</Badge>,
    loading: <Badge>{t("home.checking")}</Badge>,
    noAccess: <Badge tone="red">{t("home.noAdmin")}</Badge>,
    error: <Badge tone="amber">{t("access.home.offline")}</Badge>,
    admin: (
      <Badge tone="green" dot>
        {t("home.connected")}
      </Badge>
    ),
  }[auth.status];

  const queues = [
    { label: "KYC", icon: BadgeCheck, value: data?.kyc, to: "kyc", menu: "kyc" as const },
    { label: t("nav.disputes"), icon: Scale, value: data?.disputes, to: "disputes", menu: "disputes" as const },
    { label: t("nav.payouts"), icon: Banknote, value: data?.payouts, to: "payouts", menu: "payouts" as const },
  ];
  const menuCount = menus.includes("*") ? NAV.length : NAV.filter((n) => allows(menus, n.menu)).length;
  const accessText = isAdmin
    ? menus.includes("*")
      ? t("access.home.fullAccess")
      : t("access.home.menuCount", { n: menuCount, total: NAV.length })
    : (project.firebase?.projectId ?? "—");

  return { auth, notConnected, isAdmin, menus, isLoading, status, queues, accessText };
}

export function ProjectCard({
  project,
  index,
  onConnect,
}: {
  project: ProjectDef;
  index: number;
  /** Super admin — panel madhun add kelelya project sathi. */
  onConnect?: () => void;
}) {
  const { auth, notConnected, isAdmin, menus, isLoading, status, queues, accessText } = useProjectState(project);

  return (
    <Card
      onMouseMove={track}
      className="group animate-rise relative overflow-hidden transition duration-300 hover:-translate-y-1 hover:shadow-pop"
      style={{ ["--accent" as string]: project.accent, ...rise(index + 1) }}
    >
      <div className="spotlight pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100" />
      <div className="pointer-events-none absolute -top-24 -right-24 size-56 rounded-full bg-accent/15 blur-2xl transition group-hover:bg-accent/25" />
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="transition duration-300 group-hover:scale-105 group-hover:-rotate-3">
            <ProjectMark project={project} size="lg" />
          </div>
          <div className="flex items-center gap-1.5">
            {status}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{project.name}</h2>
          <ProjectStatusBadge status={project.status} />
        </div>
        <p className="text-sm text-muted">{project.tagline}</p>
        <p className="mt-1 text-[11px] text-muted/80">{accessText}</p>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {queues.map((q) => {
            const open = isAdmin && allows(menus, q.menu);
            return (
              <Link
                key={q.to}
                to={open ? `/p/${project.id}/${q.to}` : `/p/${project.id}`}
                className="rounded-xl border border-border bg-surface-2/50 p-2.5 transition hover:border-accent/40"
              >
                {open || !isAdmin ? <q.icon className="size-3.5 text-muted" /> : <Lock className="size-3.5 text-muted/60" />}
                {isAdmin && isLoading ? (
                  <Skeleton className="mt-1.5 h-5 w-8" />
                ) : (
                  <p className="mt-1 text-lg font-semibold tabular">{open ? (q.value ?? 0) : "—"}</p>
                )}
                <p className="text-[10px] text-muted">{t("home.pendingQueue", { label: q.label })}</p>
              </Link>
            );
          })}
        </div>

        {notConnected ? (
          <Button
            variant="primary"
            className="mt-5 w-full justify-center"
            disabled={!onConnect}
            onClick={onConnect}
            icon={<Plug className="size-4" />}
          >
            {onConnect ? t("projects.connect.cta") : t("projects.notConnected")}
          </Button>
        ) : (
        <Link to={`/p/${project.id}`} className="mt-5 block">
          <Button
            variant={isAdmin ? "primary" : "secondary"}
            className="w-full justify-center"
            disabled={auth.status === "unconfigured" || auth.status === "noAccess"}
            loading={auth.status === "loading"}
          >
            {t("home.openPanel")}
            <ArrowRight className="size-4 transition group-hover:translate-x-1" />
          </Button>
        </Link>
        )}
        <Link
          to={`/projects/${project.id}`}
          className="mt-2 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-accent"
        >
          <LayoutPanelTop className="size-3.5" /> {t("projects.overview.title")}
        </Link>
        {onConnect && !notConnected && (
          <button type="button" onClick={onConnect} className="mt-2 w-full text-center text-[11px] text-muted hover:text-accent">
            {t("projects.connect.again")}
          </button>
        )}
      </div>
    </Card>
  );
}

type View = "list" | "grid";
const VIEW_KEY = "ms-projects-view";

/** Default List; ya session madhe nivadlela view lakshat (tab band kela ki parat List). */
const readView = (): View => {
  try {
    return sessionStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
};

/** List view — ek project ek row. Card sarkhich mahiti ani actions. */
function ProjectRow({ project, index, onConnect }: { project: ProjectDef; index: number; onConnect?: () => void }) {
  const { auth, notConnected, isAdmin, menus, isLoading, status, queues, accessText } = useProjectState(project);
  return (
    <div
      className="animate-rise flex flex-col gap-3 px-4 py-3 transition hover:bg-surface-2/40 md:flex-row md:items-center"
      style={{ ["--accent" as string]: project.accent, ...rise(index) }}
    >
      <Link to={`/projects/${project.id}`} className="group flex min-w-0 flex-1 items-center gap-3">
        <ProjectMark project={project} size="lg" />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold group-hover:text-accent">{project.name}</span>
            <ProjectStatusBadge status={project.status} />
            {status}
          </span>
          <span className="block truncate text-xs text-muted">{project.tagline || accessText}</span>
        </span>
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        {queues.map((q) => {
          const open = isAdmin && allows(menus, q.menu);
          return (
            <Link
              key={q.to}
              to={open ? `/p/${project.id}/${q.to}` : `/p/${project.id}`}
              title={t("home.pendingQueue", { label: q.label })}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2/50 px-2.5 py-1.5 text-xs transition hover:border-accent/40"
            >
              {open || !isAdmin ? <q.icon className="size-3.5 text-muted" /> : <Lock className="size-3.5 text-muted/60" />}
              {isAdmin && isLoading ? <Skeleton className="h-4 w-5" /> : <span className="font-semibold tabular">{open ? (q.value ?? 0) : "—"}</span>}
            </Link>
          );
        })}

        {notConnected ? (
          <Button size="sm" variant="primary" disabled={!onConnect} onClick={onConnect} icon={<Plug className="size-3.5" />}>
            {onConnect ? t("projects.connect.cta") : t("projects.notConnected")}
          </Button>
        ) : (
          <Link to={`/p/${project.id}`}>
            <Button
              size="sm"
              variant={isAdmin ? "primary" : "secondary"}
              disabled={auth.status === "unconfigured" || auth.status === "noAccess"}
              loading={auth.status === "loading"}
            >
              {t("home.openPanel")}
              <ArrowRight className="size-3.5" />
            </Button>
          </Link>
        )}
        <Link to={`/projects/${project.id}`} title={t("projects.overview.title")}>
          <Button size="icon" variant="ghost" className="size-8" aria-label={t("projects.overview.title")}>
            <LayoutPanelTop className="size-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

/**
 * MultiSarv — master panel swatah (core `projects` madhe doc nahi, tickets
 * `MULTISARV_PROJECT` vapartat). Firebase project nasla tari list madhe pahila.
 */
function MultisarvRow({ index }: { index: number }) {
  const p = MULTISARV_PROJECT;
  return (
    <div className="animate-rise flex flex-col gap-3 px-4 py-3 transition hover:bg-surface-2/40 md:flex-row md:items-center" style={rise(index)}>
      <Link to="/" className="group flex min-w-0 flex-1 items-center gap-3">
        <ProjectMark project={p} size="lg" />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold group-hover:text-accent">{p.name}</span>
            <Badge tone="green" dot>
              {t("projects.multisarv.badge")}
            </Badge>
          </span>
          <span className="block truncate text-xs text-muted">{p.tagline}</span>
        </span>
      </Link>
      <Link to="/">
        <Button size="sm" variant="primary" icon={<LayoutDashboard className="size-3.5" />}>
          {t("master.nav.dashboard")}
        </Button>
      </Link>
    </div>
  );
}

function MultisarvCard({ index }: { index: number }) {
  const p = MULTISARV_PROJECT;
  return (
    <Card
      onMouseMove={track}
      className="group animate-rise relative overflow-hidden transition duration-300 hover:-translate-y-1 hover:shadow-pop"
      style={{ ["--accent" as string]: p.accent, ...rise(index + 1) }}
    >
      <div className="spotlight pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100" />
      <div className="pointer-events-none absolute -top-24 -right-24 size-56 rounded-full bg-accent/15 blur-2xl transition group-hover:bg-accent/25" />
      <div className="relative flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="transition duration-300 group-hover:scale-105 group-hover:-rotate-3">
            <ProjectMark project={p} size="lg" />
          </div>
          <Badge tone="green" dot>
            {t("projects.multisarv.badge")}
          </Badge>
        </div>
        <h2 className="mt-4 text-lg font-semibold">{p.name}</h2>
        <p className="text-sm text-muted">{p.tagline}</p>
        <p className="mt-1 text-[11px] text-muted/80">{t("projects.multisarv.hint")}</p>
        <Link to="/" className="mt-auto block pt-5">
          <Button variant="primary" className="w-full justify-center">
            {t("master.nav.dashboard")}
            <ArrowRight className="size-4 transition group-hover:translate-x-1" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}

/** Projects — admin la access aslele projects. Super admin: navin project add / connect / edit. */
export function Projects() {
  const me = useAdmin();
  const sup = isSuper(me);
  const projects = useVisibleProjects(me);
  const [adding, setAdding] = useState(false);
  const [connecting, setConnecting] = useState<ProjectDef | null>(null);
  const [view, setView] = useState<View>(readView);

  const changeView = (v: View) => {
    setView(v);
    try {
      sessionStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode */
    }
  };
  const connectFor = (p: ProjectDef) => (sup && !p.builtIn ? () => setConnecting(p) : undefined);

  return (
    <>
      <PageHeader
        title={t("master.nav.projects")}
        description={t("home.intro")}
        actions={
          <>
            <Segmented
              value={view}
              onChange={changeView}
              options={[
                { value: "list", label: <span className="inline-flex items-center gap-1.5"><List className="size-3.5" /> {t("projects.view.list")}</span> },
                { value: "grid", label: <span className="inline-flex items-center gap-1.5"><LayoutGrid className="size-3.5" /> {t("projects.view.grid")}</span> },
              ]}
            />
            {sup && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
                {t("projects.add")}
              </Button>
            )}
          </>
        }
      />
      {view === "list" ? (
        <Card className="divide-y divide-border overflow-hidden">
          <MultisarvRow index={0} />
          {projects.map((p, i) => (
            <ProjectRow key={p.id} project={p} index={i + 1} onConnect={connectFor(p)} />
          ))}
          {sup && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-muted transition hover:bg-surface-2/60 hover:text-accent"
            >
              <span className="flex size-11 items-center justify-center rounded-xl border-2 border-dashed border-border">
                <Plus className="size-4" />
              </span>
              {t("projects.add")}
            </button>
          )}
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <MultisarvCard index={0} />
          {projects.map((p, i) => (
            <ProjectCard
              key={p.id}
              project={p}
              index={i}
              onConnect={connectFor(p)}
            />
          ))}
          {sup && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="group animate-rise flex min-h-64 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface/40 p-6 text-center transition hover:border-accent/50 hover:bg-surface/70"
              style={rise(projects.length + 1)}
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-accent/10 text-accent transition group-hover:scale-110 group-hover:rotate-90">
                <Plus className="size-5" />
              </span>
              <p className="mt-3 text-sm font-semibold">{t("projects.add")}</p>
              <p className="mt-1 max-w-56 text-xs leading-relaxed text-muted">{t("projects.addCardHint")}</p>
            </button>
          )}
        </div>
      )}

      {projects.length === 0 && !sup && (
        <div className="mt-5">
          <NoProjects />
        </div>
      )}

      <ProjectDetailsDrawer
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(id) => {
          // Lagech connect karayla — store madhe aala ki drawer ughdel.
          setTimeout(() => {
            const p = getProjects().find((x) => x.id === id);
            if (p) setConnecting(p);
          }, 600);
        }}
      />
      <ConnectDrawer project={connecting} onClose={() => setConnecting(null)} />
    </>
  );
}
