import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { Check, Ticket, Wrench } from "lucide-react";
import { useEffect, useState } from "react";

import { MENU_KEYS, NAV, type MenuKey } from "@/components/layout/nav";
import { ProjectMark } from "@/components/layout/ProjectSwitcher";
import { Toggle } from "@/components/ui/primitives";
import { useProjects } from "@/context/projects";
import { MODULE_KEYS, MODULE_PERMS, toDate, toProfile, type AdminProfile, type ModuleKey, type ModulePerm } from "@/context/session";
import { t, type MsgKey } from "@/i18n";
import { core, errorMessage } from "@/lib/firebase";
import { cn } from "@/lib/utils";

/** Core `admins` live — super admin pahile, mag naav. */
export function useAdmins(enabled = true) {
  const [admins, setAdmins] = useState<AdminProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      collection(core().db, "admins"),
      (snap) => {
        const list = snap.docs.map((d) => toProfile(d.id, d.data()));
        list.sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "superAdmin" ? -1 : 1));
        setAdmins(list);
      },
      (err) => setError(errorMessage(err)),
    );
  }, [enabled]);
  return { admins, error };
}

export interface AuditRow {
  id: string;
  action: string;
  byEmail: string;
  targetEmail: string | null;
  at: Date | null;
}

export function useAudit(enabled: boolean) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      query(collection(core().db, "auditLogs"), orderBy("at", "desc"), limit(40)),
      (snap) =>
        setRows(
          snap.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              action: String(x.action),
              byEmail: String(x.byEmail ?? ""),
              targetEmail: (x.targetEmail as string | null) ?? null,
              at: toDate(x.at),
            };
          }),
        ),
      () => setRows([]),
    );
  }, [enabled]);
  return rows;
}

export type Access = Record<string, MenuKey[]>;

/** Project × menu checkbox grid — Module Access madhe. */
export function AccessMatrix({ value, onChange }: { value: Access; onChange: (a: Access) => void }) {
  const toggleProject = (id: string, on: boolean) => {
    const next = { ...value };
    if (on) next[id] = ["dashboard"];
    else delete next[id];
    onChange(next);
  };
  const toggleMenu = (id: string, menu: MenuKey) => {
    const cur = value[id] ?? [];
    const menus = cur.includes(menu) ? cur.filter((m) => m !== menu) : [...cur, menu];
    const next = { ...value, [id]: menus };
    if (!menus.length) delete next[id];
    onChange(next);
  };
  const setAll = (id: string, all: boolean) => onChange({ ...value, [id]: all ? [...MENU_KEYS] : ["dashboard"] });
  const projects = useProjects();

  return (
    <div className="space-y-3">
      {projects.map((p) => {
        const menus = value[p.id];
        const on = !!menus;
        return (
          <div
            key={p.id}
            className={cn("overflow-hidden rounded-xl border transition", on ? "border-accent/40 bg-surface" : "border-border bg-surface/50")}
            style={{ ["--accent" as string]: p.accent }}
          >
            <div className="flex items-center gap-3 p-3">
              <ProjectMark project={p} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{p.name}</p>
                <p className="text-[11px] text-muted">
                  {on ? t("access.home.menuCount", { n: menus.length, total: MENU_KEYS.length }) : t("access.editor.noAccess")}
                </p>
              </div>
              {on && (
                <button
                  type="button"
                  className="text-[11px] font-medium text-accent hover:underline"
                  onClick={() => setAll(p.id, menus.length !== MENU_KEYS.length)}
                >
                  {menus.length === MENU_KEYS.length ? t("access.editor.selectNone") : t("access.editor.selectAll")}
                </button>
              )}
              <Toggle checked={on} onChange={(v) => toggleProject(p.id, v)} />
            </div>
            {on && (
              <div className="animate-fade grid grid-cols-2 gap-2 border-t border-border bg-surface-2/40 p-3 sm:grid-cols-3">
                {NAV.map((n) => {
                  const checked = menus.includes(n.menu);
                  return (
                    <button
                      key={n.menu}
                      type="button"
                      onClick={() => toggleMenu(p.id, n.menu)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition active:scale-[0.97]",
                        checked ? "border-accent/50 bg-accent/10 text-accent" : "border-border bg-surface text-muted hover:text-text",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border transition",
                          checked ? "border-accent bg-accent text-white" : "border-border",
                        )}
                      >
                        {checked && <Check className="size-3" />}
                      </span>
                      <n.icon className="size-3.5 shrink-0" />
                      <span className="truncate">{t(n.label)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export type Modules = Partial<Record<ModuleKey, ModulePerm[]>>;

const MODULE_META: Record<ModuleKey, { label: MsgKey; icon: typeof Ticket }> = {
  clientTickets: { label: "master.nav.clientTickets", icon: Ticket },
  devTickets: { label: "master.nav.devTickets", icon: Wrench },
};

/** Master modules (Client / Dev Tickets) × permissions. Dusri permission dili ki View apoaap. */
export function ModuleMatrix({ value, onChange }: { value: Modules; onChange: (m: Modules) => void }) {
  const toggle = (m: ModuleKey, p: ModulePerm) => {
    const cur = value[m] ?? [];
    let next: ModulePerm[];
    if (cur.includes(p)) next = p === "view" ? [] : cur.filter((x) => x !== p);
    else next = p === "view" || cur.includes("view") ? [...cur, p] : ["view", ...cur, p];
    const out = { ...value, [m]: next };
    if (!next.length) delete out[m];
    onChange(out);
  };
  const setAll = (m: ModuleKey, all: boolean) => {
    const out = { ...value };
    if (all) out[m] = [...MODULE_PERMS];
    else delete out[m];
    onChange(out);
  };

  return (
    <div className="space-y-3">
      {MODULE_KEYS.map((m) => {
        const perms = value[m] ?? [];
        const Icon = MODULE_META[m].icon;
        return (
          <div key={m} className={cn("overflow-hidden rounded-xl border transition", perms.length ? "border-accent/40 bg-surface" : "border-border bg-surface/50")}>
            <div className="flex items-center gap-3 p-3">
              <span className="flex size-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t(MODULE_META[m].label)}</p>
                <p className="text-[11px] text-muted">
                  {perms.length ? t("master.access.permCount", { n: perms.length, total: MODULE_PERMS.length }) : t("access.editor.noAccess")}
                </p>
              </div>
              <button type="button" className="text-[11px] font-medium text-accent hover:underline" onClick={() => setAll(m, perms.length !== MODULE_PERMS.length)}>
                {perms.length === MODULE_PERMS.length ? t("access.editor.selectNone") : t("access.editor.selectAll")}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-border bg-surface-2/40 p-3 sm:grid-cols-5">
              {MODULE_PERMS.map((p) => {
                const checked = perms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => toggle(m, p)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition active:scale-[0.97]",
                      checked ? "border-accent/50 bg-accent/10 text-accent" : "border-border bg-surface text-muted hover:text-text",
                    )}
                  >
                    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border transition", checked ? "border-accent bg-accent text-white" : "border-border")}>
                      {checked && <Check className="size-3" />}
                    </span>
                    <span className="truncate">{t(`tickets.perm.${p}`)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
