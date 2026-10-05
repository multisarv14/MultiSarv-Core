import { ChevronDown, LogOut, Menu, Moon, Sun, X } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useCompany } from "@/context/company";
import { canModule, isSuper, signOutAll, useAdmin } from "@/context/session";
import { useTheme } from "@/context/theme";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

import { Avatar, Badge, Button, Spinner } from "../ui/primitives";
import { ChatDock } from "../chat/ChatDock";
import { Backdrop } from "./Backdrop";
import { CoreNotificationBell } from "./CoreNotificationBell";
import { LanguageMenu } from "./LanguageMenu";
import { MASTER_NAV, type MasterNavItem } from "./masterNav";

const linkCls = (active: boolean) =>
  cn(
    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
    active ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface-2 hover:text-text",
  );

function Item({ item, onNavigate }: { item: MasterNavItem; onNavigate?: () => void }) {
  return (
    <NavLink to={item.to} end={item.to === "/"} onClick={onNavigate} className={({ isActive }) => linkCls(isActive)}>
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" />}
          <item.icon className="size-4 transition-transform group-hover:scale-110" />
          <span className="flex-1">{t(item.label)}</span>
        </>
      )}
    </NavLink>
  );
}

/** Settings sarkha submenu — tya page var asla ki ughda. */
function Group({ item, onNavigate }: { item: MasterNavItem; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const inside = pathname.startsWith(item.to);
  const [open, setOpen] = useState(inside);
  useEffect(() => {
    if (inside) setOpen(true);
  }, [inside]);

  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className={cn(linkCls(false), "w-full", inside && "text-text")}>
        <item.icon className="size-4 transition-transform group-hover:scale-110" />
        <span className="flex-1 text-left">{t(item.label)}</span>
        <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
      </button>
      <div className={cn("grid transition-all duration-200", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">
          <div className="mt-0.5 ml-5 space-y-0.5 border-l border-border pl-2">
            {item.children!.map((c) => (
              <Item key={c.to} item={c} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const me = useAdmin();
  const company = useCompany();
  const nav = MASTER_NAV.filter((n) => (n.module ? canModule(me, n.module, "view") : !n.superOnly || isSuper(me)));
  const brand = company?.name || "Multisarv";

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="flex items-center gap-2.5 px-2 pt-1">
        {company?.logo ? (
          <img src={company.logo} alt="" className="size-9 rounded-lg bg-surface object-contain" />
        ) : (
          <img src="/favicon.svg" alt="" className="size-9" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">{brand}</p>
          <p className="truncate text-[11px] text-muted">{t("master.tagline")}</p>
        </div>
      </div>

      <nav className="flex-1 overscroll-contain space-y-0.5 overflow-y-auto">
        {nav.map((n) => (n.children ? <Group key={n.to} item={n} onNavigate={onNavigate} /> : <Item key={n.to} item={n} onNavigate={onNavigate} />))}
      </nav>

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

/** Master panel layout — project shell (AppShell) sarkhach, pan Multisarv level che menus. */
export function MasterShell() {
  const me = useAdmin();
  const { theme, toggle } = useTheme();
  const [mobileNav, setMobileNav] = useState(false);
  const location = useLocation();

  useEffect(() => setMobileNav(false), [location.pathname]);

  return (
    <div className="relative isolate flex min-h-full">
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

      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-bg/50 px-4 backdrop-blur-xl sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNav(true)}>
            <Menu className="size-5" />
          </Button>
          {isSuper(me) && (
            <Badge tone="violet" className="hidden sm:inline-flex">
              {t("access.role.superAdmin")}
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-1">
            <LanguageMenu />
            <CoreNotificationBell />
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
            <div key={location.pathname} className="animate-rise">
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>
      <ChatDock />
    </div>
  );
}
