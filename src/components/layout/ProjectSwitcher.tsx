import { Check, ChevronsUpDown, LayoutGrid, LayoutPanelTop } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import type { ProjectDef } from "@/config/projects";
import { useAdmin, useVisibleProjects } from "@/context/session";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

export function ProjectMark({ project, size = "md" }: { project: ProjectDef; size?: "sm" | "md" | "lg" | "xl" }) {
  // Multisarv (master panel) — swatahcha logo.
  if (project.id === "multisarv") {
    return (
      <img
        src="/favicon.svg"
        alt=""
        className={cn("shrink-0 rounded-lg shadow-sm", size === "sm" && "size-6", size === "md" && "size-8", size === "lg" && "size-11", size === "xl" && "size-20 rounded-2xl")}
      />
    );
  }
  if (project.logo) {
    return (
      <img
        src={project.logo}
        alt=""
        className={cn(
          "shrink-0 rounded-lg bg-white object-contain shadow-sm ring-1 ring-border",
          size === "sm" && "size-6",
          size === "md" && "size-8",
          size === "lg" && "size-11",
          size === "xl" && "size-20 rounded-2xl p-1",
        )}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg font-bold text-white shadow-sm",
        size === "sm" && "size-6 text-[10px]",
        size === "md" && "size-8 text-xs",
        size === "lg" && "size-11 text-base",
        size === "xl" && "size-20 rounded-2xl text-2xl",
      )}
      style={{ background: `linear-gradient(135deg, ${project.accent}, color-mix(in oklab, ${project.accent} 55%, #06b6d4))` }}
    >
      {project.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** Master dropdown — ekach page var rahun dusra project. */
export function ProjectSwitcher({ current }: { current: ProjectDef }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const projects = useVisibleProjects(useAdmin());
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const switchTo = (p: ProjectDef) => {
    setOpen(false);
    // Same page dusrya project madhe: /p/noai/payouts → /p/xyz/payouts
    const sub = pathname.split("/").slice(3).join("/");
    navigate(`/p/${p.id}/${sub}`);
  };

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface px-2.5 py-2 text-left transition hover:bg-surface-2"
      >
        <ProjectMark project={current} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{current.name}</span>
          <span className="block truncate text-[11px] text-muted">{current.tagline}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" />
      </button>

      {open && (
        <div className="animate-pop absolute top-full right-0 left-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-pop">
          <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-wider text-muted uppercase">
            {t("shell.projects")}
          </p>
          {projects.map((p) => (
            <button
              key={p.id}
              disabled={!p.firebase}
              onClick={() => switchTo(p)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-surface-2 disabled:opacity-50"
            >
              <ProjectMark project={p} size="sm" />
              <span className="flex-1 truncate">{p.name}</span>
              {!p.firebase && <span className="text-[10px] text-muted">{t("shell.notConfigured")}</span>}
              {p.id === current.id && <Check className="size-4 text-accent" />}
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
          <Link
            to={`/projects/${current.id}`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-text"
          >
            <LayoutPanelTop className="size-4" />
            {t("projects.overview.title")}
          </Link>
          <Link
            to="/projects"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-text"
          >
            <LayoutGrid className="size-4" />
            {t("shell.allProjects")}
          </Link>
        </div>
      )}
    </div>
  );
}
