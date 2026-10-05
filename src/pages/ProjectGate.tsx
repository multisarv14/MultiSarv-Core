import { ArrowLeft, Lock, RefreshCw, Settings2 } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { Backdrop } from "@/components/layout/Backdrop";
import { ProjectMark } from "@/components/layout/ProjectSwitcher";
import { Button, Card, EmptyState } from "@/components/ui/primitives";
import type { ProjectDef } from "@/config/projects";
import { useProjects } from "@/context/projects";
import { useProjectAuth } from "@/context/auth";
import { ProjectContext } from "@/context/project";
import { t } from "@/i18n";


const Code = ({ children }: { children: ReactNode }) => <code className="rounded bg-surface-2 px-1">{children}</code>;

/** Translated vakyat `{name}` jagi code snippet (JSX) bhara. */
const fill = (text: string, nodes: Record<string, ReactNode>) =>
  text.split(/\{(\w+)\}/).map((part, i) => <Fragment key={i}>{i % 2 ? nodes[part] : part}</Fragment>);

const back = (
  <Link to="/projects">
    <Button size="sm" icon={<ArrowLeft className="size-3.5" />}>
      {t("shell.allProjects")}
    </Button>
  </Link>
);

/** `/p/:projectId/*` — core access tapasun project madhe silent login, mag shell. */
export function ProjectGate() {
  const { projectId } = useParams();
  const project = useProjects().find((p) => p.id === projectId);
  const auth = useProjectAuth(project);

  if (!project) return <Navigate to="/" replace />;

  switch (auth.status) {
    case "unconfigured":
      return (
        <Centered project={project}>
          <EmptyState
            icon={<Settings2 className="size-5" />}
            title={t("gate.unconfigured", { name: project.name })}
            description={fill(t("gate.unconfiguredDesc"), {
              env: <Code>.env.local</Code>,
              key: <Code>VITE_{project.id.toUpperCase()}_API_KEY</Code>,
            })}
            action={back}
          />
        </Centered>
      );
    case "loading":
      return <Connecting project={project} />;
    case "noAccess":
      return (
        <Centered project={project}>
          <EmptyState
            icon={<Lock className="size-5 text-rose-500" />}
            title={t("gate.accessDenied")}
            description={t("access.gate.noAccess", { name: project.name })}
            action={back}
          />
        </Centered>
      );
    case "error":
      return (
        <Centered project={project}>
          <EmptyState
            icon={<RefreshCw className="size-5 text-amber-500" />}
            title={t("access.gate.failed", { name: project.name })}
            description={auth.message}
            action={
              <div className="flex gap-2">
                {back}
                <Button size="sm" variant="primary" icon={<RefreshCw className="size-3.5" />} onClick={auth.retry}>
                  {t("act.retry")}
                </Button>
              </div>
            }
          />
        </Centered>
      );
    case "admin":
      return (
        <ProjectContext.Provider value={{ project, admin: auth.user, menus: auth.menus }}>
          <AppShell />
        </ProjectContext.Provider>
      );
  }
}

/** Token gheun project madhe jatana — project mark bhovti pulse. */
function Connecting({ project }: { project: ProjectDef }) {
  return (
    <div className="relative flex h-full items-center justify-center" style={{ ["--accent" as string]: project.accent }}>
      <Backdrop />
      <div className="animate-pop relative flex flex-col items-center text-center">
        <div className="relative">
          <span className="animate-pulse-ring absolute inset-0 rounded-2xl bg-accent/40" />
          <span className="animate-pulse-ring absolute inset-0 rounded-2xl bg-accent/30" style={{ animationDelay: "0.6s" }} />
          <div className="relative">
            <ProjectMark project={project} size="lg" />
          </div>
        </div>
        <p className="mt-6 text-sm font-semibold">{t("access.gate.connecting", { name: project.name })}</p>
        <p className="mt-1 text-xs text-muted">{t("access.gate.connectingHint")}</p>
      </div>
    </div>
  );
}

function Centered({ project, children }: { project: ProjectDef; children: ReactNode }) {
  return (
    <div className="relative flex min-h-full items-center justify-center p-4" style={{ ["--accent" as string]: project.accent }}>
      <Backdrop />
      <Card className="animate-pop relative w-full max-w-md">{children}</Card>
    </div>
  );
}
