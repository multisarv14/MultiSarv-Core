import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, Banknote, Building2, Crown, FolderKanban, KeyRound, Lock, Scale, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { getQueueCounts } from "@/api/admin";
import { ProjectMark } from "@/components/layout/ProjectSwitcher";
import { CountUp, rise } from "@/components/ui/motion";
import { StatCard } from "@/components/ui/data";
import { Badge, Card, CardHeader, Skeleton } from "@/components/ui/primitives";
import type { ProjectDef } from "@/config/projects";
import { useProjectAuth } from "@/context/auth";
import { useCompany } from "@/context/company";
import { allows } from "@/context/project";
import { isSuper, useAdmin, useVisibleProjects } from "@/context/session";
import { t } from "@/i18n";
import { num } from "@/lib/format";

import { useAdmins } from "./admins";

export function NoProjects() {
  return (
    <Card className="animate-pop mx-auto max-w-md p-8 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-muted">
        <Lock className="size-5" />
      </span>
      <p className="mt-4 text-sm font-semibold">{t("access.home.noProjects")}</p>
      <p className="mt-1 text-xs text-muted">{t("access.home.noProjectsHint")}</p>
    </Card>
  );
}

/** Ek project chi oli — connection ani pending queues. */
function ProjectRow({ project, index }: { project: ProjectDef; index: number }) {
  const auth = useProjectAuth(project);
  const isAdmin = auth.status === "admin";
  const menus = isAdmin ? auth.menus : [];
  // Projects page ani project shell hich key vapartat — cache share.
  const { data, isLoading } = useQuery({
    queryKey: [project.id, "queues"],
    queryFn: () => getQueueCounts(project),
    enabled: isAdmin,
    staleTime: 30_000,
  });
  const queues = [
    { icon: BadgeCheck, value: data?.kyc, to: "kyc", menu: "kyc" as const, label: "KYC" },
    { icon: Scale, value: data?.disputes, to: "disputes", menu: "disputes" as const, label: t("nav.disputes") },
    { icon: Banknote, value: data?.payouts, to: "payouts", menu: "payouts" as const, label: t("nav.payouts") },
  ];

  return (
    <li className="animate-rise" style={{ ["--accent" as string]: project.accent, ...rise(index + 4) }}>
      <div className="group flex flex-wrap items-center gap-4 rounded-xl px-3 py-3 transition hover:bg-surface-2/60">
        <Link to={`/p/${project.id}`} className="flex min-w-48 flex-1 items-center gap-3">
          <ProjectMark project={project} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold group-hover:text-accent">{project.name}</span>
            <span className="block truncate text-[11px] text-muted">{project.tagline}</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          {queues.map((q) => {
            const open = isAdmin && allows(menus, q.menu);
            return (
              <Link
                key={q.to}
                to={open ? `/p/${project.id}/${q.to}` : `/p/${project.id}`}
                title={t("home.pendingQueue", { label: q.label })}
                className="flex min-w-16 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs transition hover:border-accent/40"
              >
                {open ? <q.icon className="size-3.5 text-muted" /> : <Lock className="size-3.5 text-muted/60" />}
                {open && isLoading ? <Skeleton className="h-4 w-5" /> : <span className="font-semibold tabular">{open ? (q.value ?? 0) : "—"}</span>}
              </Link>
            );
          })}
        </div>
        <div className="flex w-28 items-center justify-end gap-2">
          {auth.status === "admin" ? (
            <Badge tone="green" dot>
              {t("home.connected")}
            </Badge>
          ) : auth.status === "loading" ? (
            <Badge>{t("home.checking")}</Badge>
          ) : auth.status === "error" ? (
            <Badge tone="amber">{t("access.home.offline")}</Badge>
          ) : (
            <Badge tone="red">{t("home.noAdmin")}</Badge>
          )}
          <ArrowRight className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" />
        </div>
      </div>
    </li>
  );
}

/** Master Dashboard — landing: swagat, sankhya, projects cha aadhava. */
export function Dashboard() {
  const me = useAdmin();
  const sup = isSuper(me);
  const projects = useVisibleProjects(me);
  const { admins } = useAdmins(sup);
  const company = useCompany();
  const first = (me.name || me.email).split(/[\s@]/)[0];

  const shortcuts = [
    { to: "/settings/users", icon: Users, label: "master.nav.users" as const },
    { to: "/settings/access", icon: KeyRound, label: "master.nav.access" as const },
    { to: "/settings/company", icon: Building2, label: "master.nav.company" as const },
  ];

  return (
    <>
      <div className="mb-6">
        <p className="text-sm text-muted">
          {t("access.home.greeting", { name: first })} <span className="animate-wave">👋</span>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          <span className="text-shine">{company?.name || t("home.title")}</span>
        </h1>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard index={0} label={t("master.nav.projects")} icon={<FolderKanban className="size-4" />} value={<CountUp value={projects.length} format={num} />} />
        {sup ? (
          <>
            <StatCard index={1} tone="green" label={t("access.stat.active")} icon={<ShieldCheck className="size-4" />} loading={!admins} value={<CountUp value={admins?.filter((a) => a.active).length ?? 0} format={num} />} />
            <StatCard index={2} tone="violet" label={t("access.stat.supers")} icon={<Crown className="size-4" />} loading={!admins} value={<CountUp value={admins?.filter((a) => a.role === "superAdmin").length ?? 0} format={num} />} />
          </>
        ) : (
          <StatCard index={1} tone="blue" label={t("access.editor.role")} icon={<ShieldCheck className="size-4" />} value={t("access.role.admin")} />
        )}
        <StatCard
          index={3}
          tone="blue"
          label={t("master.dash.access")}
          icon={<KeyRound className="size-4" />}
          value={sup ? t("access.home.fullAccess") : <CountUp value={Object.values(me.projects).reduce((n, m) => n + m.length, 0)} format={num} />}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_300px]">
        <Card className="animate-rise" style={rise(4)}>
          <CardHeader
            title={t("master.dash.overview")}
            subtitle={t("master.dash.overviewHint")}
            action={
              <Link to="/projects" className="text-xs font-medium text-accent hover:underline">
                {t("act.viewAll")}
              </Link>
            }
          />
          {projects.length === 0 ? (
            <div className="px-5 pb-5">
              <NoProjects />
            </div>
          ) : (
            <ul className="px-2 pb-2">
              {projects.map((p, i) => (
                <ProjectRow key={p.id} project={p} index={i} />
              ))}
            </ul>
          )}
        </Card>

        {sup && (
          <Card className="animate-rise" style={rise(5)}>
            <CardHeader title={t("master.nav.settings")} />
            <div className="space-y-1 px-2 pb-2">
              {shortcuts.map((s) => (
                <Link key={s.to} to={s.to} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-surface-2/60">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-accent/10 text-accent transition group-hover:scale-105">
                    <s.icon className="size-4" />
                  </span>
                  <span className="flex-1 font-medium">{t(s.label)}</span>
                  <ArrowRight className="size-4 text-muted transition group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
