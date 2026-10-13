import { ArrowLeft, AtSign, BellOff, Phone, Search, Users, Video } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  attachmentUrl,
  CHAT_PAGE,
  chatIdOf,
  deleteChatMessage,
  FORWARD_MAX_MESSAGES,
  listChatUsers,
  markChatRead,
  notifyModeOf,
  reactChatMessage,
  receiptStatus,
  sendChatMessage,
  starChatMessages,
  useChatDoc,
  useChatGroup,
  useChatMessagesPaged,
  useMyChats,
  type ChatMessage,
  type ChatSummary,
  type ChatUser,
  type NotifyMode,
} from "@/api/chat";
import { Backdrop } from "@/components/layout/Backdrop";
import { Avatar, Button, Input, Skeleton, Spinner } from "@/components/ui/primitives";
import { t } from "@/i18n";
import { ago } from "@/lib/format";
import { errorMessage } from "@/lib/firebase";
import { cn } from "@/lib/utils";

import { Bubble, clock, MessageMenu, quoteText, type MenuAction, type Receipt } from "./bubble";
import { startCall, useCurrentCall } from "./calls";
import { Composer, type Outgoing } from "./Composer";
import { GroupAvatar, GroupInfo, NewGroupDialog } from "./groups";
import { dayTitle, DeleteDialog, ForwardDialog, MessageInfoDialog, ReactionsDialog, SearchPanel, SelectionBar } from "./tools";

export { AttachmentLink, MediaAttachment } from "./bubble";

/**
 * Internal Chat che tukde — Chat page ani bottom dock (LinkedIn sarkha) donhi vapartat.
 */

// ── Ughde chats (alert / unread sathi) ───────────────────────────────

/** Konte chats sadhya screen var ughde ahet — tyanche toast / sound nako. */
const openChats = new Map<string, number>();
export const isChatOpen = (chatId: string) => (openChats.get(chatId) ?? 0) > 0 && document.visibilityState === "visible";

/** Ughdya conversation la baherun — search ughda / message var ja (header, Group info). */
const controllers = new Map<string, { search: () => void; jump: (id: string) => void }>();
export const openChatSearch = (chatId: string) => controllers.get(chatId)?.search();
export const jumpToMessage = (chatId: string, id: string) => controllers.get(chatId)?.jump(id);

// ── Users (ekdach — page ani dock share) ─────────────────────────────

let usersCache: Promise<ChatUser[]> | null = null;
export const loadChatUsers = (fresh = false) => {
  if (!usersCache || fresh) usersCache = listChatUsers().catch((err) => ((usersCache = null), Promise.reject(err)));
  return usersCache;
};

/** Konasobat chat — 1:1 (Core User) kinva group. */
export type ChatPeer = { kind: "user"; user: ChatUser } | { kind: "group"; chatId: string };
export const peerKey = (p: ChatPeer) => (p.kind === "user" ? p.user.uid : p.chatId);
export const peerLink = (p: ChatPeer) =>
  p.kind === "user" ? `/chat?with=${encodeURIComponent(p.user.uid)}` : `/chat?group=${encodeURIComponent(p.chatId)}`;

export type ChatRow =
  | { kind: "user"; key: string; user: ChatUser; chat?: ChatSummary }
  | { kind: "group"; key: string; chat: ChatSummary };

export const rowPeer = (r: ChatRow): ChatPeer => (r.kind === "user" ? { kind: "user", user: r.user } : { kind: "group", chatId: r.chat.id });

/** Majhi group notification nivad (1:1 nehmi "all"). */
export const notifyMode = (c: ChatSummary | undefined, me: string): NotifyMode => (c?.group ? notifyModeOf(c.group, me) : "all");
export const isMuted = (c: ChatSummary | undefined, me: string) => notifyMode(c, me) === "off";

/** Shevatcha message mala alert karava ka — "mentions" madhe fakt mention / majhya message la reply. */
export function wantsAlert(c: ChatSummary, me: string) {
  const mode = notifyMode(c, me);
  if (mode === "off") return false;
  return mode === "all" || c.lastMentions.includes(me) || c.lastReplyToBy === me;
}

/** Users + groups — recent adhi, mag naav; unread count (alert nako asleele sodun). */
export function useChatDirectory(me: string, enabled = true) {
  const [users, setUsers] = useState<ChatUser[] | null>(null);
  const chats = useMyChats(me);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadChatUsers()
      .then((u) => alive && setUsers(u))
      .catch((err) => {
        if (!alive) return;
        toast.error(errorMessage(err));
        setUsers([]);
      });
    return () => {
      alive = false;
    };
  }, [enabled]);

  const rows = useMemo<ChatRow[]>(() => {
    const byOther = new Map((chats ?? []).filter((c) => !c.group).map((c) => [c.other, c]));
    const people: ChatRow[] = (users ?? []).map((u) => ({ kind: "user", key: u.uid, user: u, chat: byOther.get(u.uid) }));
    const groups: ChatRow[] = (chats ?? []).filter((c) => c.group).map((c) => ({ kind: "group", key: c.id, chat: c }));
    const label = (r: ChatRow) => (r.kind === "user" ? r.user.name : r.chat.group!.name);
    return [...groups, ...people].sort(
      (a, b) => (b.chat?.updatedAt?.getTime() ?? 0) - (a.chat?.updatedAt?.getTime() ?? 0) || label(a).localeCompare(label(b)),
    );
  }, [users, chats]);

  const unread = (chats ?? []).filter((c) => {
    if (!c.unread) return false;
    const mode = notifyMode(c, me);
    return mode === "all" || (mode === "mentions" && c.mentioned);
  }).length;
  return { users, chats, rows, unread };
}

// ── List ──────────────────────────────────────────────────────────────

export function ChatList({
  me,
  rows,
  users,
  loading,
  selected,
  onOpen,
  header,
}: {
  me: string;
  rows: ChatRow[];
  /** "New group" sathi Core Users. */
  users: ChatUser[] | null;
  loading: boolean;
  selected?: string | null;
  onOpen: (p: ChatPeer) => void;
  header?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const term = q.trim().toLowerCase();
  // Group naav kinva tyatla konihi member.
  const list = term
    ? rows.filter((r) =>
        r.kind === "user"
          ? r.user.name.toLowerCase().includes(term) || r.user.email.toLowerCase().includes(term)
          : r.chat.group!.name.toLowerCase().includes(term) ||
            r.chat.group!.members.some((m) => m !== me && (r.chat.group!.names[m] ?? "").toLowerCase().includes(term)),
      )
    : rows;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-border p-3">
        {header}
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Input icon={<Search className="size-4" />} placeholder={t("chat.searchChats")} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button variant="secondary" size="icon" className="shrink-0" onClick={() => setCreating(true)} disabled={!users?.length} title={t("group.new")} aria-label={t("group.new")}>
            <Users className="size-4" />
          </Button>
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
        {loading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="m-1.5 h-12 rounded-xl" />)
        ) : list.length === 0 ? (
          <li className="px-4 py-10 text-center text-xs text-muted">{term ? t("chat.searchNone") : t("chat.noUsers")}</li>
        ) : (
          list.map((r) => {
            const c = r.chat;
            const quiet = !!c && !wantsAlert(c, me) && !c.mentioned;
            const muted = isMuted(c, me);
            // Search: group member match zala tar to dakhva.
            const matched =
              term && r.kind === "group" && !r.chat.group!.name.toLowerCase().includes(term)
                ? r.chat.group!.members.filter((m) => m !== me && (r.chat.group!.names[m] ?? "").toLowerCase().includes(term)).map((m) => r.chat.group!.names[m])
                : null;
            const preview = matched
              ? matched.join(", ")
              : !c
                ? r.kind === "user"
                  ? (r.user.role ?? r.user.email)
                  : ""
                : (c.lastSystem ? "" : c.lastBy === me ? `${t("chat.you")}: ` : r.kind === "group" && c.lastByName ? `${c.lastByName}: ` : "") +
                  (c.lastText || (c.lastAttachment ? `📎 ${c.lastAttachment}` : ""));
            return (
              <li key={r.key}>
                <button
                  type="button"
                  onClick={() => onOpen(rowPeer(r))}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-surface-2", r.key === selected && "bg-accent/10")}
                >
                  {r.kind === "user" ? (
                    <Avatar name={r.user.name || r.user.email} seed={r.user.uid} size="sm" />
                  ) : (
                    <GroupAvatar photo={r.chat.group!.photo} seed={r.chat.id} size="sm" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", c?.unread ? "font-semibold" : "font-medium")}>
                        {r.kind === "user" ? r.user.name : r.chat.group!.name}
                      </span>
                      {c?.updatedAt && <span className={cn("shrink-0 text-[10px]", c.unread && !quiet ? "font-semibold text-accent" : "text-muted")}>{ago(c.updatedAt)}</span>}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className={cn("min-w-0 flex-1 truncate text-xs", c?.unread && !quiet ? "text-text" : "text-muted")}>{preview}</span>
                      {muted && <BellOff className="size-3 shrink-0 text-muted" aria-label={t("group.muted")} />}
                      {c?.mentioned && (
                        <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg" title={t("chat.mentionedYou")}>
                          <AtSign className="size-3" />
                        </span>
                      )}
                      {c?.unread && (
                        <span
                          className={cn(
                            "flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold tabular",
                            quiet ? "bg-muted/30 text-text" : "bg-accent text-accent-fg",
                          )}
                        >
                          {c.unreadCount > 99 ? "99+" : c.unreadCount}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
      {creating && users && (
        <NewGroupDialog
          me={me}
          users={users}
          onClose={() => setCreating(false)}
          onCreated={(chatId) => {
            setCreating(false);
            onOpen({ kind: "group", chatId });
          }}
        />
      )}
    </div>
  );
}

// ── Conversation ──────────────────────────────────────────────────────

const peerChatId = (me: string, p: ChatPeer) => (p.kind === "user" ? chatIdOf(me, p.user.uid) : p.chatId);

function SearchButton({ chatId }: { chatId: string }) {
  return (
    <Button variant="ghost" size="icon" className="shrink-0" onClick={() => openChatSearch(chatId)} title={t("chat.searchIn")} aria-label={t("chat.searchIn")}>
      <Search className="size-4" />
    </Button>
  );
}

export function ChatHeader({
  me,
  peer,
  onBack,
  actions,
  backMobileOnly,
}: {
  me: string;
  peer: ChatPeer;
  onBack?: () => void;
  actions?: ReactNode;
  backMobileOnly?: boolean;
}) {
  const back = onBack && (
    <Button variant="ghost" size="icon" className={cn("-ml-1 shrink-0", backMobileOnly && "md:hidden")} onClick={onBack} aria-label={t("act.close")}>
      <ArrowLeft className="size-4" />
    </Button>
  );
  if (peer.kind === "group") return <GroupHeader me={me} chatId={peer.chatId} back={back} actions={actions} />;
  const other = peer.user;
  return (
    <header className="flex items-center gap-3 border-b border-border px-3 py-2.5">
      {back}
      <Avatar name={other.name || other.email} seed={other.uid} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{other.name}</p>
        <p className="truncate text-[11px] text-muted">{other.role ? `${other.role} · ${other.email}` : other.email}</p>
      </div>
      <CallButtons me={me} peer={other} />
      <SearchButton chatId={peerChatId(me, peer)} />
      {actions}
    </header>
  );
}

/** 1:1 header — audio / video call (WhatsApp sarkha). Group madhe nahi. */
function CallButtons({ me, peer }: { me: string; peer: ChatUser }) {
  const call = useCurrentCall();
  const busy = !!call && !call.ended;
  return (
    <>
      <Button variant="ghost" size="icon" className="shrink-0" disabled={busy} onClick={() => startCall(me, { uid: peer.uid, name: peer.name }, "video")} title={t("call.startVideo")} aria-label={t("call.startVideo")}>
        <Video className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" className="shrink-0" disabled={busy} onClick={() => startCall(me, { uid: peer.uid, name: peer.name }, "audio")} title={t("call.startVoice")} aria-label={t("call.startVoice")}>
        <Phone className="size-4" />
      </Button>
    </>
  );
}

/** Group header — click → Group info (WhatsApp sarkha). */
function GroupHeader({ me, chatId, back, actions }: { me: string; chatId: string; back: ReactNode; actions?: ReactNode }) {
  const chat = useChatGroup(chatId, me);
  const [info, setInfo] = useState(false);
  const g = chat ? chat.group! : null;
  const names = g
    ? g.members
        .filter((m) => m !== me)
        .map((m) => g.names[m] ?? "")
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
    : [];
  return (
    <header className="flex items-center gap-3 border-b border-border px-3 py-2.5">
      {back}
      <button type="button" onClick={() => g && setInfo(true)} disabled={!g} className="flex min-w-0 flex-1 items-center gap-3 text-left" title={t("group.info")}>
        <GroupAvatar photo={g?.photo ?? null} seed={chatId} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{g ? g.name : chat === false ? t("group.unavailable") : "…"}</span>
          <span className="block truncate text-[11px] text-muted">{g ? [t("chat.you"), ...names].join(", ") : ""}</span>
        </span>
        {g && notifyModeOf(g, me) === "off" && <BellOff className="size-3.5 shrink-0 text-muted" aria-label={t("group.muted")} />}
      </button>
      {g && <SearchButton chatId={chatId} />}
      {actions}
      {info && chat && <GroupInfo me={me} chat={chat} onClose={() => setInfo(false)} />}
    </header>
  );
}

/** Messages + input. `header` nako asel tar (dock popup swatahcha header deto) `header={false}`. */
export function Conversation({
  me,
  peer,
  onBack,
  header = true,
  focusId,
}: {
  me: string;
  peer: ChatPeer;
  onBack?: () => void;
  header?: boolean;
  /** Notification (mention / reply) varun — ughadlyavar ha message dakhva. */
  focusId?: string | null;
}) {
  const chatId = peerChatId(me, peer);
  const [limit, setLimit] = useState(CHAT_PAGE);
  const { messages, hasMore, loadingMore } = useChatMessagesPaged(chatId, me, limit);
  // Chat doc — ✓✓, group members / settings, mi ajun member ahe ka.
  const chat = useChatDoc(chatId, me);
  const g = chat ? chat.group : null;
  const left = peer.kind === "group" && chat === false;
  const blocked = !!g?.onlyAdminsSend && !g.admins.includes(me);

  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [search, setSearch] = useState(false);
  const [menu, setMenu] = useState<{ m: ChatMessage; x: number; y: number } | null>(null);
  const [forwardIds, setForwardIds] = useState<string[] | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [reactionsMsg, setReactionsMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useRef<HTMLDivElement>(null);
  /** User khali ahe ka (juna history vachat nahi). */
  const atBottom = useRef(true);
  const lastSeen = useRef<string | null>(null);
  /** "Load earlier" nantar scroll jaga tashich. */
  const restore = useRef<number | null>(null);
  const pendingJump = useRef<string | null>(focusId ?? null);
  /** Ughadla tevha pahila na vachlela message ("N unread messages" resha). */
  const [firstUnread, setFirstUnread] = useState<string | null | undefined>(undefined);

  const names = useMemo<Record<string, string>>(
    () => (peer.kind === "user" ? { [peer.user.uid]: peer.user.name } : { ...(g?.names ?? {}) }),
    [peer, g?.names],
  );
  const mentionables = useMemo(
    () => (g ? g.members.filter((u) => u !== me && g.names[u]).map((u) => ({ uid: u, name: g.names[u] })).sort((a, b) => a.name.localeCompare(b.name)) : undefined),
    [g, me],
  );
  const byId = useMemo(() => new Map((messages ?? []).map((m) => [m.id, m])), [messages]);

  // Ha chat ughda — tyache alerts nako.
  useEffect(() => {
    openChats.set(chatId, (openChats.get(chatId) ?? 0) + 1);
    return () => {
      openChats.set(chatId, (openChats.get(chatId) ?? 1) - 1);
    };
  }, [chatId]);

  /**
   * "Read" fakt user kharach pahat asel tar: ha conversation screen var ughda, tab disto ani
   * window la focus (dusrya app / window madhe asel tar fakt delivered).
   */
  const markIfViewing = () => {
    if (document.visibilityState !== "visible" || !document.hasFocus()) return;
    markChatRead(chatId).catch(() => {});
  };

  // Pahilya load la — konta message pasun na vachlele.
  useEffect(() => {
    if (firstUnread !== undefined || !messages || chat === null) return;
    const read = chat ? (chat.reads[me]?.getTime() ?? 0) : 0;
    setFirstUnread(chat && chat.unread ? (messages.find((m) => m.by !== me && !m.system && (m.at?.getTime() ?? 0) > read)?.id ?? null) : null);
  }, [messages, chat, me, firstUnread]);

  // Navin message: khali asel kiva swatah pathavla tarach scroll; dusryacha asel tar "vachla".
  useEffect(() => {
    const last = messages?.[messages.length - 1];
    if (!last || last.id === lastSeen.current) return;
    const first = lastSeen.current === null;
    lastSeen.current = last.id;
    const el = list.current;
    // Notification varun ughadla — tya message var (jump), khali nahi.
    if (el && !(first && focusId) && (first || atBottom.current || last.by === me)) {
      if (first && firstUnread) list.current?.querySelector(`[data-unread]`)?.scrollIntoView({ block: "start" });
      else el.scrollTop = el.scrollHeight;
    }
    if (last.by !== me && !left) markIfViewing();
  }, [messages, chatId, me, left, firstUnread, focusId]);

  // Tab / window parat samor (focus) — tevhach "vachla" (blue ✓✓).
  const unreadNow = !!chat && chat.unread;
  useEffect(() => {
    const on = () => unreadNow && !left && markIfViewing();
    document.addEventListener("visibilitychange", on);
    window.addEventListener("focus", on);
    return () => {
      document.removeEventListener("visibilitychange", on);
      window.removeEventListener("focus", on);
    };
  }, [chatId, unreadNow, left]);

  // Juna messages load zale — scroll jaga tashich; rahilela jump.
  useLayoutEffect(() => {
    if (loadingMore) return;
    const el = list.current;
    if (el && restore.current !== null) {
      el.scrollTop = el.scrollHeight - restore.current;
      restore.current = null;
    }
    if (pendingJump.current && messages) {
      const id = pendingJump.current;
      if (byId.has(id) || !hasMore) {
        pendingJump.current = null;
        requestAnimationFrame(() => jump(id));
      } else {
        loadMore();
      }
    }
  });

  const loadMore = () => {
    if (loadingMore) return;
    const el = list.current;
    if (el) restore.current = el.scrollHeight - el.scrollTop;
    setLimit((l) => l + CHAT_PAGE);
  };

  /** Quote / search / starred var click — mool message kade scroll (juna asel tar load karun). */
  const jump = (id: string) => {
    const el = list.current?.querySelector<HTMLElement>(`[data-msg="${id}"]`);
    if (!el) {
      if (loadingMore) pendingJump.current = id;
      else if (hasMore) {
        pendingJump.current = id;
        loadMore();
      } else toast(t("chat.notLoaded"));
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("ring-2", "ring-accent/50");
    setTimeout(() => el.classList.remove("ring-2", "ring-accent/50"), 1400);
  };
  const jumpRef = useRef(jump);
  jumpRef.current = jump;
  useEffect(() => {
    const c = { search: () => setSearch(true), jump: (id: string) => jumpRef.current(id) };
    controllers.set(chatId, c);
    return () => {
      if (controllers.get(chatId) === c) controllers.delete(chatId);
    };
  }, [chatId]);

  const onSend = async ({ text, file, duration, mentions }: Outgoing) => {
    try {
      await sendChatMessage(me, peer.kind === "user" ? { to: peer.user.uid } : { chatId }, text, file, { replyTo: reply?.id ?? null, duration, mentions });
      setReply(null);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    }
  };

  // ── ✓ / ✓✓ — pratyek recipient vegla (message var live) ──
  const receiptOf = (m: ChatMessage): Receipt | null => (m.by !== me || m.system || m.call ? null : receiptStatus(m, chat));

  // ── Actions ──
  const react = (m: ChatMessage, emoji: string | null) => reactChatMessage(chatId, m.id, emoji).catch((err) => toast.error(errorMessage(err)));

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("chat.copied"));
    } catch {
      toast.error(t("chat.copyFailed"));
    }
  };

  const share = async (m: ChatMessage) => {
    try {
      if (m.attachment) {
        const url = await attachmentUrl(m.attachment.path);
        const blob = await fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))));
        const file = new File([blob], m.attachment.name, { type: m.attachment.type });
        if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], text: m.text || undefined });
      }
      await navigator.share({ text: m.text || m.attachment?.name || "" });
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") toast.error(t("chat.shareFailed"));
    }
  };

  const star = (ids: string[], starred: boolean) =>
    starChatMessages(chatId, ids, starred)
      .then(() => toast.success(starred ? t("chat.starred") : t("chat.unstarred")))
      .catch((err) => toast.error(errorMessage(err)));

  const onAction = (m: ChatMessage, a: MenuAction) => {
    if (a === "reply") setReply(m);
    else if (a === "copy") copy(m.text);
    else if (a === "forward") setForwardIds([m.id]);
    else if (a === "star") star([m.id], !m.starred);
    else if (a === "select") setSelected([m.id]);
    else if (a === "share") share(m);
    else if (a === "info") setInfoMsg(m.id);
    else if (a === "delete") setDeleting([m.id]);
  };

  const picked = (selected ?? []).map((id) => byId.get(id)).filter((m): m is ChatMessage => !!m);
  const ordered = [...picked].sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));
  const toDelete = (deleting ?? []).map((id) => byId.get(id)).filter((m): m is ChatMessage => !!m);
  const canDeleteForEveryone = toDelete.length > 0 && toDelete.every((m) => m.by === me && !m.deleted && !m.system);

  const doDelete = async (everyone: boolean) => {
    setBusy(true);
    try {
      for (const m of toDelete) await deleteChatMessage(chatId, m.id, everyone);
      setDeleting(null);
      setSelected(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const forwardSelected = () => {
    const ids = ordered.filter((m) => !m.deleted && !m.system).map((m) => m.id);
    if (!ids.length) return;
    if (ids.length > FORWARD_MAX_MESSAGES) return void toast.error(t("chat.forwardTooMany", { max: FORWARD_MAX_MESSAGES }));
    setForwardIds(ids);
  };

  const copySelected = () => {
    const live = ordered.filter((m) => !m.deleted && !m.system && m.text);
    if (!live.length) return;
    copy(
      live.length === 1
        ? live[0].text
        : live.map((m) => `[${m.at ? `${dayTitle(m.at)}, ${clock(m.at)}` : ""}] ${m.by === me ? t("chat.you") : m.byName}: ${m.text}`).join("\n"),
    );
    setSelected(null);
  };

  const toggleSelect = (id: string) => setSelected((s) => (s ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]));

  const unreadCount = firstUnread && messages ? messages.slice(messages.findIndex((m) => m.id === firstUnread)).filter((m) => m.by !== me && !m.system).length : 0;
  const infoM = infoMsg ? byId.get(infoMsg) : null;
  const reactionsM = reactionsMsg ? byId.get(reactionsMsg) : null;

  return (
    <>
      {header && <ChatHeader me={me} peer={peer} onBack={onBack} backMobileOnly />}

      <div className="relative isolate flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Panel chi tich background (grid + aurora) — chat wallpaper, scroll hot nahi. */}
        <Backdrop />
        <div
          ref={list}
          onScroll={(e) => {
            const el = e.currentTarget;
            atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            if (menu) setMenu(null);
          }}
          className="relative min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4"
        >
          {!messages ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : messages.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted">
              {peer.kind === "user" ? t("chat.empty", { name: peer.user.name }) : left ? t("group.notMember") : t("group.empty")}
            </p>
          ) : (
            <>
              {hasMore && (
                <div className="text-center">
                  <Button size="sm" variant="ghost" onClick={loadMore} loading={loadingMore}>
                    {t("chat.loadEarlier")}
                  </Button>
                </div>
              )}
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const newDay = m.at && (!prev?.at || prev.at.toDateString() !== m.at.toDateString());
                return (
                  <Fragment key={m.id}>
                    {newDay && (
                      <div className="sticky top-0 z-[1] flex justify-center py-1">
                        <span className="rounded-lg border border-border bg-surface px-2.5 py-0.5 text-[11px] font-medium text-muted shadow-sm">{dayTitle(m.at!)}</span>
                      </div>
                    )}
                    {m.id === firstUnread && (
                      <div data-unread className="flex items-center gap-3 py-1 text-[11px] font-semibold text-accent">
                        <span className="h-px flex-1 bg-accent/30" />
                        {t("chat.unreadN", { n: unreadCount })}
                        <span className="h-px flex-1 bg-accent/30" />
                      </div>
                    )}
                    <Bubble
                      m={m}
                      me={me}
                      names={names}
                      group={peer.kind === "group"}
                      receipt={receiptOf(m)}
                      selecting={!!selected}
                      selected={!!selected?.includes(m.id)}
                      onSelect={() => toggleSelect(m.id)}
                      onReply={() => !left && !blocked && setReply(m)}
                      onJump={jump}
                      onMenu={(msg, x, y) => setMenu({ m: msg, x, y })}
                      onReactions={() => setReactionsMsg(m.id)}
                      onCallBack={peer.kind === "user" ? (type) => startCall(me, { uid: peer.user.uid, name: peer.user.name }, type) : undefined}
                    />
                  </Fragment>
                );
              })}
            </>
          )}
        </div>

        {search && messages && (
          <SearchPanel
            messages={messages}
            names={names}
            me={me}
            hasMore={hasMore}
            onMore={loadMore}
            onClose={() => setSearch(false)}
            onPick={(id) => {
              setSearch(false);
              requestAnimationFrame(() => jump(id));
            }}
          />
        )}
      </div>

      {selected ? (
        <SelectionBar
          count={picked.length}
          allStarred={picked.length > 0 && picked.every((m) => m.starred)}
          onCopy={copySelected}
          onForward={forwardSelected}
          onStar={() => {
            const all = picked.every((m) => m.starred);
            star(picked.filter((m) => !m.deleted && !m.system).map((m) => m.id), !all).then(() => setSelected(null));
          }}
          onDelete={() => setDeleting(picked.map((m) => m.id))}
          onCancel={() => setSelected(null)}
        />
      ) : left ? (
        <p className="border-t border-border bg-surface-2/50 px-4 py-3 text-center text-xs text-muted">{t("group.notMember")}</p>
      ) : blocked ? (
        <p className="border-t border-border bg-surface-2/50 px-4 py-3 text-center text-xs text-muted">{t("group.onlyAdminsCanSend")}</p>
      ) : (
        <Composer me={me} reply={reply} onCancelReply={() => setReply(null)} onSend={onSend} quote={quoteText} mentionables={mentionables} />
      )}

      {menu && (
        <MessageMenu
          m={menu.m}
          me={me}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onReact={(e) => react(menu.m, e)}
          onAction={(a) => onAction(menu.m, a)}
        />
      )}
      {forwardIds && (
        <ForwardDialog
          me={me}
          chatId={chatId}
          ids={forwardIds}
          onClose={() => setForwardIds(null)}
          onDone={() => {
            setForwardIds(null);
            setSelected(null);
          }}
        />
      )}
      {infoM && chat && <MessageInfoDialog m={infoM} chat={chat} names={names} onClose={() => setInfoMsg(null)} />}
      {reactionsM && <ReactionsDialog m={reactionsM} me={me} names={names} onReact={(e) => react(reactionsM, e)} onClose={() => setReactionsMsg(null)} />}
      {deleting && toDelete.length > 0 && (
        <DeleteDialog count={toDelete.length} forEveryone={canDeleteForEveryone} busy={busy} onDelete={doDelete} onClose={() => setDeleting(null)} />
      )}
    </>
  );
}
