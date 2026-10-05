import { Bell, BellRing, CheckCheck, Inbox } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { markAllCoreRead, markCoreRead, watchCoreInbox, type CoreInboxItem } from "@/api/core";
import { useAdmin } from "@/context/session";
import { t } from "@/i18n";
import { ago } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Button } from "../ui/primitives";

/**
 * Master panel cha bell — Super Admin ne Core Users na pathavlelya notices
 * (`admins/{uid}/inbox`) live. Project bell (NotificationBell) sarkhach.
 */
export function CoreNotificationBell() {
  const me = useAdmin();
  const [items, setItems] = useState<CoreInboxItem[]>([]);
  const [open, setOpen] = useState(false);
  const [ring, setRing] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    seen.current = null;
    return watchCoreInbox(me.uid, (next) => {
      // Pahila snapshot = juna inbox; tyanantar aalele ch "navin".
      if (seen.current) {
        const fresh = next.filter((n) => !n.isRead && !seen.current!.has(n.id));
        if (fresh.length > 0) {
          setRing(true);
          setTimeout(() => setRing(false), 1000);
          fresh.slice(0, 3).forEach((n) => toast(n.title, { description: n.body, icon: <BellRing className="size-4" /> }));
        }
      }
      seen.current = new Set(next.map((n) => n.id));
      setItems(next);
    });
  }, [me.uid]);

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

  const unread = items.filter((n) => !n.isRead);

  return (
    <div ref={box} className="relative">
      <Button variant="ghost" size="icon" title={t("bell.title")} aria-label={t("bell.title")} onClick={() => setOpen((o) => !o)} className="relative">
        <Bell className={cn("size-4", ring && "animate-ring")} />
        {unread.length > 0 && (
          <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] leading-4 font-bold text-white tabular">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </Button>

      {open && (
        <div className="animate-pop absolute top-full right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-semibold">{t("bell.title")}</p>
            {unread.length > 0 && (
              <button
                onClick={() => markAllCoreRead(me.uid, unread.map((n) => n.id)).catch(() => {})}
                className="flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <CheckCheck className="size-3.5" />
                {t("bell.markAll")}
              </button>
            )}
          </div>

          <ul className="max-h-96 divide-y divide-border overflow-y-auto">
            {items.length === 0 && (
              <li className="flex flex-col items-center px-6 py-10 text-center">
                <Inbox className="mb-2 size-6 text-muted" />
                <p className="text-sm font-medium">{t("bell.empty")}</p>
              </li>
            )}
            {items.map((n, i) => (
              <li key={n.id} className="animate-rise" style={{ ["--i" as string]: Math.min(i, 8) }}>
                <button
                  onClick={() => !n.isRead && markCoreRead(me.uid, n.id).catch(() => {})}
                  className={cn("flex w-full gap-3 px-4 py-3 text-left transition hover:bg-surface-2", !n.isRead && "bg-accent/5")}
                >
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.isRead ? "bg-transparent" : "bg-accent")} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm break-words", !n.isRead && "font-semibold")}>{n.title}</span>
                    <span className="block text-xs break-words whitespace-pre-line text-muted">{n.body}</span>
                    <span className="mt-0.5 block text-[11px] text-muted/80">
                      {n.byName} · {ago(n.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
