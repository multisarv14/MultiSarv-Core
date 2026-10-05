import { CornerDownLeft, Hash, Search, User } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

import { allows, useProject } from "@/context/project";
import { useAdmin, useVisibleProjects } from "@/context/session";
import { t as tr } from "@/i18n";
import { cn } from "@/lib/utils";

import { NAV } from "./nav";
import { ProjectMark } from "./ProjectSwitcher";

interface Item {
  id: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

/** ⌘K / Ctrl+K — page, project, user (phone) kinva task id var thet. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { project, menus } = useProject();
  const me = useAdmin();
  const visible = useVisibleProjects(me);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const base = `/p/${project.id}`;
    const term = q.trim();
    const t = term.toLowerCase();
    const go = (to: string) => () => {
      navigate(to);
      onClose();
    };

    const dynamic: Item[] = [];
    const digits = term.replace(/\D/g, "");
    if (digits.length >= 10) {
      dynamic.push({
        id: "phone",
        label: tr("palette.searchPhone", { phone: digits.slice(-10) }),
        hint: tr("palette.hint.users"),
        icon: <User className="size-4" />,
        run: go(`${base}/users?q=${digits.slice(-10)}`),
      });
    }
    if (/^[A-Za-z0-9_-]{4,64}$/.test(term) && digits.length < 10) {
      dynamic.push(
        {
          id: "task",
          label: tr("palette.openTask", { id: term }),
          hint: tr("palette.hint.taskId"),
          icon: <Hash className="size-4" />,
          run: go(`${base}/tasks?task=${encodeURIComponent(term)}`),
        },
        {
          id: "user",
          label: tr("palette.openUser", { id: term }),
          hint: tr("palette.hint.userId"),
          icon: <User className="size-4" />,
          run: go(`${base}/users?user=${encodeURIComponent(term)}`),
        },
      );
    }

    const pages: Item[] = NAV.filter((n) => allows(menus, n.menu)).map((n) => ({
      id: `nav-${n.to}`,
      label: tr(n.label),
      hint: tr(n.group),
      icon: <n.icon className="size-4" />,
      run: go(`${base}/${n.to}`),
    }));
    const projects: Item[] = visible.filter((p) => p.firebase && p.id !== project.id).map((p) => ({
      id: `p-${p.id}`,
      label: `${tr("shell.switchProject")}: ${p.name}`,
      hint: tr("palette.hint.project"),
      icon: <ProjectMark project={p} size="sm" />,
      run: go(`/p/${p.id}`),
    }));

    const match = (i: Item) => !t || i.label.toLowerCase().includes(t) || i.hint?.toLowerCase().includes(t);
    return [...pages.filter(match), ...projects.filter(match), ...dynamic];
  }, [q, project.id, navigate, onClose, menus, visible]);

  useEffect(() => setActive(0), [q]);

  if (!open) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      items[active]?.run();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div className="animate-fade absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-pop relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 text-muted" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={tr("palette.placeholder")}
            className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none pointer-coarse:text-base placeholder:text-muted"
          />
          <kbd className="rounded border border-border px-1.5 text-[10px] text-muted pointer-coarse:hidden">ESC</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{tr("palette.noMatch")}</li>}
          {items.map((item, i) => (
            <li key={item.id}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={item.run}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm",
                  i === active ? "bg-accent/10 text-text" : "text-muted",
                )}
              >
                <span className={cn(i === active && "text-accent")}>{item.icon}</span>
                <span className="flex-1 truncate text-text">{item.label}</span>
                {item.hint && <span className="text-[11px] text-muted">{item.hint}</span>}
                {i === active && <CornerDownLeft className="size-3.5 text-muted" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
