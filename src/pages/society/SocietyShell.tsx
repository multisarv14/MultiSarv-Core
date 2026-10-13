import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, LogOut, Menu, Moon, RefreshCw, ShieldCheck, Sun, X } from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";

import { listSocieties } from "@/api/society";
import { ChatDock } from "@/components/chat/ChatDock";
import { CallLayer } from "@/components/chat/calls";
import { Backdrop } from "@/components/layout/Backdrop";
import { LanguageMenu } from "@/components/layout/LanguageMenu";
import { SOCIETY_NAV, societyMenuForPath } from "@/components/layout/nav";
import { ProjectSwitcher } from "@/components/layout/ProjectSwitcher";
import { ErrorState } from "@/components/ui/data";
import { Avatar, Button, Card, EmptyState, Select, Spinner } from "@/components/ui/primitives";
import { allows, useProject } from "@/context/project";
import { isSuper, signOutAll, useAdmin } from "@/context/session";
import { useTheme } from "@/context/theme";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

import { saveSociety, savedSociety, SocietyContext, useSociety } from "./state";

function SocietyPicker() {
  const { societies, current, select } = useSociety();
  if (societies.length === 0) return null;
  return (
    <div>
      <p className="px-1 pb-1 text-[10px] font-semibold tracking-wider text-muted/80 uppercase">{t("soc.picker.label")}</p>
      <Select value={current?.code ?? ""} onChange={(e) => select(e.target.value)} title={t("soc.picker.label")}>
        {societies.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name} · {s.code}
          </option>
        ))}
      </Select>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { project, menus } = useProject();
  const me = useAdmin();
  const nav = SOCIETY_NAV.filter((n) => allows(menus, n.menu));
  const groups = [...new Set(nav.map((n) => n.group))];

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <ProjectSwitcher current={project} />
      <SocietyPicker />

      <nav className="flex-1 overscroll-contain space-y-4 overflow-y-auto">
        {groups.map((g) => (
          <div key={g}>
            <p className="px-3 pb-1 text-[10px] font-semibold tracking-wider text-muted/80 uppercase">{t(g)}</p>
            {nav.filter((n) => n.group === g).map((n) => (
              <NavLink
                key={n.to}
                to={`/s/${project.id}/${n.to}`}
                end={n.to === ""}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                    isActive ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface-2 hover:text-text",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" />}
                    <n.icon className="size-4 transition-transform group-hover:scale-110" />
                    <span className="flex-1">{t(n.label)}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {isSuper(me) && (
        <Link
          to="/settings/users"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-text"
        >
          <ShieldCheck className="size-4" />
          {t("master.nav.settings")}
        </Link>
      )}

      <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface p-2.5">
        <Avatar name={me.name || me.email} seed={me.uid} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{me.name || t("shell.admin")}</p>
          <p className="truncate text-[11px] text-muted">{me.email}</p>
        </div>
        <Button variant="ghost" size="icon" className="size-8" title={t("shell.signOut")} onClick={() => signOutAll()}>
          <LogOut className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * SocietySarv sarkhya project cha shell (`/s/:projectId`). NOAI `AppShell` sarkhach disto,
 * pan NOAI che bhag (task / user drawers, admin inbox, push) nahit — te `users` collection
 * vapartat je SocietySarv madhe nahi.
 */
export function SocietyShell() {
  const { project, menus } = useProject();
  const { theme, toggle } = useTheme();
  const [mobileNav, setMobileNav] = useState(false);
  const qc = useQueryClient();
  const fetching = useIsFetching({ queryKey: [project.id] });
  const location = useLocation();
  const [picked, setPicked] = useState<string | null>(() => savedSociety(project.id));

  const list = useQuery({
    queryKey: [project.id, "societies"],
    queryFn: () => listSocieties(project),
    staleTime: 60_000,
  });

  useEffect(() => setMobileNav(false), [location.pathname]);

  const ctx = useMemo(() => {
    const societies = list.data ?? [];
    const current = societies.find((s) => s.code === picked) ?? societies[0] ?? null;
    return {
      societies,
      current,
      select: (code: string) => {
        saveSociety(project.id, code);
        setPicked(code);
      },
    };
  }, [list.data, picked, project.id]);

  const refresh = () => qc.invalidateQueries({ queryKey: [project.id] });
  const firstAllowed = SOCIETY_NAV.find((n) => allows(menus, n.menu))?.to ?? "";

  const body = list.error ? (
    <ErrorState error={list.error} onRetry={list.refetch} />
  ) : list.isLoading ? (
    <div className="flex h-64 items-center justify-center">
      <Spinner />
    </div>
  ) : !ctx.current ? (
    <Card>
      <EmptyState icon={<Building2 className="size-5" />} title={t("soc.empty.title")} description={t("soc.empty.desc")} />
    </Card>
  ) : allows(menus, societyMenuForPath(location.pathname)) ? (
    <Outlet />
  ) : (
    <Navigate to={`/s/${project.id}/${firstAllowed}`} replace />
  );

  return (
    <SocietyContext.Provider value={ctx}>
      <div className="relative isolate flex min-h-full" style={{ ["--accent" as string]: project.accent }}>
        <Backdrop fixed />
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-border bg-bg/60 backdrop-blur-xl lg:block">
          <Sidebar />
        </aside>

        {mobileNav && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="animate-fade absolute inset-0 bg-black/50" onClick={() => setMobileNav(false)} />
            <aside className="animate-slide-in absolute inset-y-0 left-0 w-[min(18rem,calc(100vw-4rem))] border-r border-border bg-bg/90 backdrop-blur-xl">
              <Button variant="ghost" size="icon" className="absolute top-3 -right-12 bg-surface" onClick={() => setMobileNav(false)}>
                <X className="size-4" />
              </Button>
              <Sidebar onNavigate={() => setMobileNav(false)} />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-bg/50 px-4 backdrop-blur-xl sm:px-6">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNav(true)}>
              <Menu className="size-5" />
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{ctx.current?.name ?? project.name}</p>
              {ctx.current && <p className="truncate font-mono text-[11px] text-muted">{ctx.current.code}</p>}
            </div>
            <div className="ml-auto flex items-center gap-1">
              <LanguageMenu />
              <Button variant="ghost" size="icon" title={t("shell.refresh")} onClick={refresh}>
                <RefreshCw className={cn("size-4", fetching > 0 && "animate-spin")} />
              </Button>
              <Button variant="ghost" size="icon" title={t("shell.theme")} onClick={toggle}>
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <Suspense
              fallback={
                <div className="flex h-64 items-center justify-center">
                  <Spinner />
                </div>
              }
            >
              <div key={`${location.pathname}:${ctx.current?.code ?? ""}`} className="animate-rise">
                {body}
              </div>
            </Suspense>
          </main>
        </div>

        <ChatDock />
      <CallLayer />
      </div>
    </SocietyContext.Provider>
  );
}
