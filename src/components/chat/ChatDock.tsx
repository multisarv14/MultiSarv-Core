import { Bell, BellOff, BellRing, ChevronDown, ChevronUp, Maximize2, MessageCircle, Minus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { chatIdOf, testCorePush, type ChatUser } from "@/api/chat";
import { Avatar, Button } from "@/components/ui/primitives";
import { useAdmin } from "@/context/session";
import { t } from "@/i18n";
import { playChime } from "@/lib/chime";
import { corePushState, enableCorePush, refreshCorePush, refreshCorePushOnStart, type CorePushState } from "@/lib/corePush";
import { cn } from "@/lib/utils";

import { ChatHeader, ChatList, Conversation, isChatOpen, useChatDirectory } from "./parts";

/** Kuthunahi chat ughadnyasathi (toast, notification click). */
const openers = new Set<(uid: string) => void>();
export const openChatWith = (uid: string) => openers.forEach((f) => f(uid));

const MAX_POPUPS = 2;

/**
 * LinkedIn sarkha Messaging dock — sagle panel pages var (Chat page sodun).
 * Desktop: khali ujvikade bar → list; person var click → khali popup window.
 * Mobile: floating button → bottom sheet (list → conversation).
 * Navin message: toast + sound (tab ughda asel tar); band asel tar push (service worker).
 */
export function ChatDock() {
  const me = useAdmin();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onChatPage = pathname.startsWith("/chat");
  const { users, chats, rows, unread } = useChatDirectory(me.uid);
  const [listOpen, setListOpen] = useState(false);
  const [popups, setPopups] = useState<{ user: ChatUser; min: boolean }[]>([]);
  const [sheet, setSheet] = useState<ChatUser | "list" | null>(null);
  const desktop = useDesktop();

  const open = (u: ChatUser) => {
    if (onChatPage) return navigate(`/chat?with=${encodeURIComponent(u.uid)}`);
    if (!desktop) return setSheet(u);
    setPopups((p) => [{ user: u, min: false }, ...p.filter((x) => x.user.uid !== u.uid)].slice(0, MAX_POPUPS));
  };
  const openRef = useRef(open);
  openRef.current = open;

  // Toast / notification click → chat ughda.
  useEffect(() => {
    const f = (uid: string) => {
      const u = users?.find((x) => x.uid === uid);
      if (u) openRef.current(u);
      else navigate(`/chat?with=${encodeURIComponent(uid)}`);
    };
    openers.add(f);
    return () => {
      openers.delete(f);
    };
  }, [users, navigate]);

  // Push token taja (permission aadhich dili asel tar) — login nantar navin, app parat samor aala ki taja.
  useEffect(() => {
    refreshCorePushOnStart();
    let last = Date.now();
    const onShow = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 10 * 60_000) return;
      last = Date.now();
      refreshCorePush();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, []);

  // Navin message — toast + sound (ughda chat sodun).
  const seen = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    if (!chats) return;
    const prev = seen.current;
    seen.current = new Map(chats.map((c) => [c.id, c.updatedAt?.getTime() ?? 0]));
    if (!prev) return; // pahila snapshot = juna
    for (const c of chats) {
      const at = c.updatedAt?.getTime() ?? 0;
      if (!c.unread || c.lastBy === me.uid || at <= (prev.get(c.id) ?? 0) || isChatOpen(c.id)) continue;
      const from = users?.find((u) => u.uid === c.other);
      // Push chalu asel tar phone notification cha sound vajto — double sound nako.
      if (!("Notification" in window) || Notification.permission !== "granted") playChime();
      toast(from?.name ?? t("master.nav.chat"), {
        id: `chat-${c.id}`,
        description: c.lastText || (c.lastAttachment ? `📎 ${c.lastAttachment}` : ""),
        icon: <MessageCircle className="size-4" />,
        action: { label: t("chat.open"), onClick: () => openChatWith(c.other) },
      });
    }
  }, [chats, users, me.uid]);

  if (onChatPage) return null;

  const listHeader = <PushToggle compact />;

  // ── Mobile: floating button + bottom sheet ──
  if (!desktop) {
    const current = sheet && sheet !== "list" ? sheet : null;
    return (
      <>
        {!sheet && (
          <button
            type="button"
            onClick={() => setSheet("list")}
            aria-label={t("chat.messaging")}
            className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex size-13 items-center justify-center rounded-full bg-accent text-accent-fg shadow-pop transition active:scale-95"
          >
            <MessageCircle className="size-6" />
            {unread > 0 && <UnreadDot n={unread} className="absolute -top-0.5 -right-0.5" />}
          </button>
        )}
        {sheet &&
          createPortal(
            <div className="fixed inset-0 z-40">
              <div className="animate-fade absolute inset-0 bg-black/40" onClick={() => setSheet(null)} />
              <div className="animate-pop absolute inset-x-0 bottom-0 flex h-[88dvh] flex-col overflow-hidden rounded-t-2xl border border-border bg-surface pb-[env(safe-area-inset-bottom)] shadow-pop">
                <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border" />
                {current ? (
                  <>
                    <ChatHeader
                      other={current}
                      onBack={() => setSheet("list")}
                      actions={
                        <Button variant="ghost" size="icon" onClick={() => setSheet(null)} aria-label={t("act.close")}>
                          <X className="size-4" />
                        </Button>
                      }
                    />
                    <Conversation key={current.uid} me={me.uid} other={current} header={false} />
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-4 pt-2">
                      <p className="text-base font-semibold">{t("chat.messaging")}</p>
                      <Button variant="ghost" size="icon" onClick={() => setSheet(null)} aria-label={t("act.close")}>
                        <X className="size-4" />
                      </Button>
                    </div>
                    <ChatList me={me.uid} rows={rows} loading={!users} onOpen={open} header={listHeader} />
                  </>
                )}
              </div>
            </div>,
            document.body,
          )}
      </>
    );
  }

  // ── Desktop: bottom dock (list + popups) ──
  return createPortal(
    <div className="pointer-events-none fixed right-4 bottom-0 z-30 flex flex-row-reverse items-end gap-3">
      <div className="pointer-events-auto flex w-72 flex-col overflow-hidden rounded-t-xl border border-b-0 border-border bg-surface shadow-pop">
        <button type="button" onClick={() => setListOpen((o) => !o)} className="flex h-12 items-center gap-2.5 px-3 text-left hover:bg-surface-2/60">
          <span className="relative">
            <Avatar name={me.name || me.email} seed={me.uid} size="sm" />
            <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-surface" />
          </span>
          <span className="flex-1 text-sm font-semibold">{t("chat.messaging")}</span>
          {unread > 0 && <UnreadDot n={unread} />}
          {listOpen ? <ChevronDown className="size-4 text-muted" /> : <ChevronUp className="size-4 text-muted" />}
        </button>
        {listOpen && (
          <div className="flex h-[min(30rem,70dvh)] flex-col border-t border-border">
            <ChatList me={me.uid} rows={rows} loading={!users} onOpen={open} header={listHeader} />
          </div>
        )}
      </div>

      {popups.map(({ user, min }) => {
        const chat = chats?.find((c) => c.id === chatIdOf(me.uid, user.uid));
        const toggle = () => setPopups((p) => p.map((x) => (x.user.uid === user.uid ? { ...x, min: !x.min } : x)));
        const close = () => setPopups((p) => p.filter((x) => x.user.uid !== user.uid));
        return (
          <div key={user.uid} className="animate-pop pointer-events-auto flex w-80 flex-col overflow-hidden rounded-t-xl border border-b-0 border-border bg-surface shadow-pop">
            <div className={cn("flex items-center gap-1", min && "cursor-pointer")} onClick={min ? toggle : undefined}>
              <div className="min-w-0 flex-1">
                <ChatHeader other={user} />
              </div>
              {min && chat?.unread && <UnreadDot n={1} />}
              <div className="flex items-center pr-1.5" onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => navigate(`/chat?with=${encodeURIComponent(user.uid)}`)} title={t("chat.expand")} aria-label={t("chat.expand")}>
                  <Maximize2 className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7" onClick={toggle} title={t("chat.minimize")} aria-label={t("chat.minimize")}>
                  <Minus className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7" onClick={close} aria-label={t("act.close")}>
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
            {!min && (
              <div className="flex h-[min(26rem,65dvh)] flex-col">
                <Conversation key={user.uid} me={me.uid} other={user} header={false} />
              </div>
            )}
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

function UnreadDot({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn("flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] leading-5 font-bold text-white tabular", className)}>
      {n > 9 ? "9+" : n}
    </span>
  );
}

/** md (768px) paryant mobile — bottom sheet. */
function useDesktop() {
  const q = "(min-width: 768px)";
  const [desktop, setDesktop] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setDesktop(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return desktop;
}

/** Push notifications chalu kara (permission user click var — iOS PWA la garjeche). */
export function PushToggle({ compact }: { compact?: boolean }) {
  const [state, setState] = useState<CorePushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    corePushState().then(setState);
  }, []);
  if (!state || state === "unsupported") return null;
  if (state === "granted") {
    return (
      <Button
        size="sm"
        variant="ghost"
        className={cn(compact && "w-full justify-center")}
        loading={busy}
        icon={<BellRing className="size-3.5" />}
        onClick={async () => {
          setBusy(true);
          try {
            await enableCorePush(); // token taja
            const r = await testCorePush();
            if (r.sent > 0) toast.success(t("chat.pushTestSent", { n: r.sent }));
            else toast.error(t("chat.pushNoDevice"));
          } catch {
            toast.error(t("chat.pushFailed"));
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("chat.pushTest")}
      </Button>
    );
  }
  if (state === "denied") {
    return (
      <p className={cn("flex items-center gap-1.5 text-[11px] text-muted", !compact && "rounded-lg border border-border px-2.5 py-1.5")}>
        <BellOff className="size-3.5 shrink-0" /> {t("chat.pushBlocked")}
      </p>
    );
  }
  return (
    <Button
      size="sm"
      variant={compact ? "secondary" : "primary"}
      className={cn(compact && "w-full justify-center")}
      loading={busy}
      icon={<Bell className="size-3.5" />}
      onClick={async () => {
        setBusy(true);
        try {
          const s = await enableCorePush();
          setState(s);
          if (s === "granted") {
            playChime();
            toast.success(t("chat.pushOn"));
          }
        } catch {
          toast.error(t("chat.pushFailed"));
        } finally {
          setBusy(false);
        }
      }}
    >
      {t("chat.pushEnable")}
    </Button>
  );
}
