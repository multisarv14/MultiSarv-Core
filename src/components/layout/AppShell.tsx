import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, Moon, RefreshCw, Search, ShieldCheck, Sun, X } from "lucide-react";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";

import { allows, useProject } from "@/context/project";
import { isSuper, signOutAll, useAdmin } from "@/context/session";
import { useTheme } from "@/context/theme";
import { registerAdminDevice } from "@/api/notifications";
import { useQueueCounts } from "@/hooks/queries";
import { getLang, t } from "@/i18n";
import { refreshPush } from "@/lib/push";
import { cn } from "@/lib/utils";
import { TaskDrawer } from "@/pages/TaskDrawer";
import { UserDrawer } from "@/pages/UserDrawer";

import { Avatar, Button, Spinner } from "../ui/primitives";
import { ChatDock } from "../chat/ChatDock";
import { CommandPalette } from "./CommandPalette";
import { Backdrop } from "./Backdrop";
import { LanguageMenu } from "./LanguageMenu";
import { menuForPath, NAV } from "./nav";
import { NotificationBell } from "./NotificationBell";
import { ProjectSwitcher } from "./ProjectSwitcher";

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { project, menus } = useProject();
  const me = useAdmin();
  const { data: queues } = useQueueCounts();
  const nav = NAV.filter((n) => allows(menus, n.menu));
  const groups = [...new Set(nav.map((n) => n.group))];

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <ProjectSwitcher current={project} />

      <nav className="flex-1 overscroll-contain space-y-4 overflow-y-auto">
        {groups.map((g) => (
          <div key={g}>
            <p className="px-3 pb-1 text-[10px] font-semibold tracking-wider text-muted/80 uppercase">{t(g)}</p>
            {nav.filter((n) => n.group === g).map((n) => {
              const count = n.queue ? (queues?.[n.queue] ?? 0) : 0;
              return (
                <NavLink
                  key={n.to}
                  to={`/p/${project.id}/${n.to}`}
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
                      {count > 0 && (
                        <span className="rounded-full bg-rose-500 px-1.5 py-px text-[10px] font-semibold text-white tabular">
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
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

export function AppShell() {
  const { project, menus } = useProject();
  const { theme, toggle } = useTheme();
  const [mobileNav, setMobileNav] = useState(false);
  const [palette, setPalette] = useState(false);
  const qc = useQueryClient();
  const fetching = useIsFetching({ queryKey: [project.id] });
  const location = useLocation();

  useEffect(() => setMobileNav(false), [location.pathname]);

  // Admin alerts panel chya bhashet; push permission asel tar token taja.
  useEffect(() => {
    registerAdminDevice(project, { language: getLang() }).catch(() => {});
    refreshPush(project);
  }, [project]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const closePalette = useCallback(() => setPalette(false), []);
  const refresh = () => qc.invalidateQueries({ queryKey: [project.id] });

  return (
    // Project cha brand colour sagla UI la (--accent).
    <div className="relative isolate flex min-h-full" style={{ ["--accent" as string]: project.accent }}>
      <Backdrop fixed />
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-border bg-bg/60 backdrop-blur-xl lg:block">
        <Sidebar />
      </aside>

      {mobileNav && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="animate-fade absolute inset-0 bg-black/50" onClick={() => setMobileNav(false)} />
          <aside className="animate-slide-in absolute inset-y-0 left-0 w-[min(18rem,calc(100vw-4rem))] border-r border-border bg-bg/90 backdrop-blur-xl">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 -right-12 bg-surface"
              onClick={() => setMobileNav(false)}
            >
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
          <button
            onClick={() => setPalette(true)}
            className="flex h-9 w-full min-w-0 max-w-sm items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-muted transition hover:border-accent/40"
          >
            <Search className="size-4" />
            <span className="min-w-0 flex-1 truncate text-left">{t("shell.search")}</span>
            <kbd className="hidden rounded border border-border px-1.5 text-[10px] sm:inline">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <LanguageMenu />
            <NotificationBell />
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
            {/* Page badalla ki halka fade-up. Menu cha access nasel tar pahilya allowed page var. */}
            <div key={location.pathname} className="animate-rise">
              {allows(menus, menuForPath(location.pathname)) ? (
                <Outlet />
              ) : (
                <Navigate to={`/p/${project.id}/${NAV.find((n) => allows(menus, n.menu))?.to ?? ""}`} replace />
              )}
            </div>
          </Suspense>
        </main>
      </div>

      <CommandPalette open={palette} onClose={closePalette} />
      <UserDrawer />
      <TaskDrawer />
      <ChatDock />
    </div>
  );
}
