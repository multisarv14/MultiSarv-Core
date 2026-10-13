import { CalendarDays, Check, CheckCheck, Copy, Forward, Search, Star, StarOff, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  FORWARD_MAX_TARGETS,
  forwardChatMessages,
  receiptsOf,
  useMyChats,
  type ChatMessage,
  type ChatSummary,
  type ChatTarget,
  type ChatUser,
} from "@/api/chat";
import { Modal } from "@/components/ui/overlay";
import { Avatar, Button, Input } from "@/components/ui/primitives";
import { t } from "@/i18n";
import { date, dateTime } from "@/lib/format";
import { errorMessage } from "@/lib/firebase";
import { cn } from "@/lib/utils";

import { clock, quoteText } from "./bubble";
import { GroupAvatar } from "./groups";
import { loadChatUsers } from "./parts";

/** Conversation chi sadhane — search, forward, info, reactions, delete, select. */

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "Today" / "Yesterday" / tarikh — messages madhla date separator. */
export function dayTitle(d: Date) {
  const now = new Date();
  if (sameDay(d, now)) return t("chat.today");
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return t("chat.yesterday");
  return date(d);
}

// ── Search ───────────────────────────────────────────────────────────

/**
 * Conversation madhe shodh — text, pathavnara, `@mention`, file naav, tarikh.
 * Fakt load zalele messages; "Search older" ne juna pan.
 */
export function SearchPanel({
  messages,
  names,
  me,
  hasMore,
  onMore,
  onPick,
  onClose,
}: {
  messages: ChatMessage[];
  names: Record<string, string>;
  me: string;
  hasMore: boolean;
  onMore: () => void;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [day, setDay] = useState("");
  const term = q.trim().toLowerCase();

  const results = useMemo(() => {
    if (!term && !day) return [];
    const on = day ? new Date(`${day}T00:00:00`) : null;
    return messages
      .filter((m) => !m.system && !m.deleted)
      .filter((m) => !on || (m.at && sameDay(m.at, on)))
      .filter((m) => {
        if (!term) return true;
        if (term.startsWith("@")) {
          const who = term.slice(1);
          return m.mentions.some((u) => (names[u] ?? "").toLowerCase().includes(who));
        }
        return (
          m.text.toLowerCase().includes(term) ||
          (m.by === me ? t("chat.you") : m.byName).toLowerCase().includes(term) ||
          !!m.attachment?.name.toLowerCase().includes(term)
        );
      })
      .reverse();
  }, [messages, term, day, names, me]);

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-surface">
      <div className="flex items-center gap-2 border-b border-border p-2">
        <div className="min-w-0 flex-1">
          <Input icon={<Search className="size-4" />} autoFocus placeholder={t("chat.searchIn")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="relative flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border text-muted hover:text-text" title={t("chat.searchDate")}>
          <CalendarDays className={cn("size-4", day && "text-accent")} />
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={t("chat.searchDate")} />
        </label>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("act.close")}>
          <X className="size-4" />
        </Button>
      </div>
      {day && (
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
          <CalendarDays className="size-3.5 text-accent" /> {date(new Date(`${day}T00:00:00`))}
          <button type="button" className="ml-auto text-muted hover:text-text" onClick={() => setDay("")}>
            <X className="size-3.5" />
          </button>
        </div>
      )}
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
        {!term && !day ? (
          <li className="px-4 py-10 text-center text-xs text-muted">{t("chat.searchHint")}</li>
        ) : results.length === 0 ? (
          <li className="px-4 py-10 text-center text-xs text-muted">{t("chat.searchNone")}</li>
        ) : (
          results.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => onPick(m.id)} className="w-full rounded-xl px-3 py-2 text-left hover:bg-surface-2">
                <span className="flex items-center justify-between gap-2 text-[11px] text-muted">
                  <span className="truncate font-medium text-text">{m.by === me ? t("chat.you") : m.byName}</span>
                  <span className="shrink-0">{dateTime(m.at)}</span>
                </span>
                <span className="line-clamp-2 text-sm">{quoteText(m)}</span>
              </button>
            </li>
          ))
        )}
        {hasMore && (term || day) && (
          <li className="p-2 text-center">
            <Button size="sm" variant="ghost" onClick={onMore}>
              {t("chat.searchOlder")}
            </Button>
          </li>
        )}
      </ul>
    </div>
  );
}

// ── Forward ──────────────────────────────────────────────────────────

type Pick = { key: string; label: string; target: ChatTarget; user?: ChatUser; chat?: ChatSummary };

/** Konala forward — people + groups (jithe mi pathavu shakto), kamal 5. */
export function ForwardDialog({ me, chatId, ids, onClose, onDone }: { me: string; chatId: string; ids: string[]; onClose: () => void; onDone: () => void }) {
  const chats = useMyChats(me);
  const [users, setUsers] = useState<ChatUser[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    loadChatUsers()
      .then((u) => alive && setUsers(u))
      .catch(() => alive && setUsers([]));
    return () => {
      alive = false;
    };
  }, []);

  const options = useMemo<Pick[]>(() => {
    const recent = new Map((chats ?? []).map((c) => [c.id, c.updatedAt?.getTime() ?? 0]));
    const groups: Pick[] = (chats ?? [])
      .filter((c) => c.group && (!c.group.onlyAdminsSend || c.group.admins.includes(me)))
      .map((c) => ({ key: c.id, label: c.group!.name, target: { chatId: c.id }, chat: c }));
    const people: Pick[] = (users ?? []).map((u) => ({ key: u.uid, label: u.name, target: { to: u.uid }, user: u }));
    const at = (p: Pick) => recent.get(p.chat ? p.chat.id : [me, p.key].sort().join("__")) ?? 0;
    return [...groups, ...people].sort((a, b) => at(b) - at(a) || a.label.localeCompare(b.label));
  }, [chats, users, me]);

  const term = q.trim().toLowerCase();
  const list = term ? options.filter((o) => o.label.toLowerCase().includes(term) || o.user?.email.toLowerCase().includes(term)) : options;

  const send = async () => {
    setBusy(true);
    try {
      await forwardChatMessages(
        chatId,
        ids,
        options.filter((o) => picked.includes(o.key)).map((o) => o.target),
      );
      toast.success(t("chat.forwardedTo", { n: picked.length }));
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={t("chat.forwardTo")}
      description={t("chat.forwardLimit", { n: picked.length, max: FORWARD_MAX_TARGETS })}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("act.cancel")}
          </Button>
          <Button variant="primary" icon={<Forward className="size-4" />} loading={busy} disabled={!picked.length} onClick={send}>
            {t("chat.forward")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input icon={<Search className="size-4" />} autoFocus placeholder={t("chat.search")} value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="max-h-[min(24rem,50dvh)] space-y-0.5 overflow-y-auto overscroll-contain">
          {list.map((o) => {
            const on = picked.includes(o.key);
            const full = !on && picked.length >= FORWARD_MAX_TARGETS;
            return (
              <li key={o.key}>
                <button
                  type="button"
                  disabled={full}
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== o.key) : [...p, o.key]))}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2 disabled:opacity-50"
                >
                  {o.chat ? <GroupAvatar photo={o.chat.group!.photo} seed={o.chat.id} size="sm" /> : <Avatar name={o.label} seed={o.key} size="sm" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{o.label}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {o.chat ? t("group.members", { n: o.chat.group!.members.length }) : (o.user?.role ?? o.user?.email)}
                    </span>
                  </span>
                  <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2", on ? "border-accent bg-accent text-accent-fg" : "border-border")}>
                    {on && <Check className="size-3" strokeWidth={3} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}

// ── Message info (✓✓ konakade) ───────────────────────────────────────

export function MessageInfoDialog({
  m,
  chat,
  names,
  onClose,
}: {
  m: ChatMessage;
  chat: ChatSummary;
  names: Record<string, string>;
  onClose: () => void;
}) {
  // Pratyek recipient — exact vel message var (juna message la vel nasel).
  const rows = receiptsOf(m, chat).map((r) => ({
    uid: r.uid,
    name: names[r.uid] ?? "—",
    read: (r.read ? (r.readAt ?? true) : null) as Date | true | null,
    delivered: (r.delivered ? (r.deliveredAt ?? true) : null) as Date | true | null,
  }));
  const readBy = rows.filter((r) => r.read);
  const deliveredTo = rows.filter((r) => !r.read && r.delivered);
  const pending = rows.filter((r) => !r.read && !r.delivered);
  const section = (title: React.ReactNode, list: typeof rows, when: (r: (typeof rows)[number]) => Date | true | null) =>
    list.length > 0 && (
      <div className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted">{title}</p>
        {list.map((r) => (
          <div key={r.uid} className="flex items-center gap-3 py-1">
            <Avatar name={r.name} seed={r.uid} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
            <span className="shrink-0 text-[11px] text-muted">{when(r) instanceof Date ? dateTime(when(r) as Date) : ""}</span>
          </div>
        ))}
      </div>
    );
  return (
    <Modal open onClose={onClose} title={t("chat.info")} size="sm">
      <div className="space-y-4">
        <div className="rounded-xl bg-surface-2/60 px-3 py-2 text-sm">
          <p className="line-clamp-4 whitespace-pre-wrap">{quoteText(m)}</p>
          <p className="mt-1 text-right text-[10px] text-muted">{clock(m.at)}</p>
        </div>
        {section(
          <>
            <CheckCheck className="size-3.5 text-sky-500" /> {t("chat.status.read")}
          </>,
          readBy,
          (r) => r.read,
        )}
        {section(
          <>
            <CheckCheck className="size-3.5" /> {t("chat.status.delivered")}
          </>,
          deliveredTo,
          (r) => r.delivered,
        )}
        {section(
          <>
            <Check className="size-3.5" /> {t("chat.status.sent")}
          </>,
          pending,
          () => null,
        )}
      </div>
    </Modal>
  );
}

// ── Reactions (konakonache) ──────────────────────────────────────────

export function ReactionsDialog({
  m,
  me,
  names,
  onReact,
  onClose,
}: {
  m: ChatMessage;
  me: string;
  names: Record<string, string>;
  onReact: (emoji: string | null) => void;
  onClose: () => void;
}) {
  const all = Object.entries(m.reactions);
  const emojis = [...new Set(all.map(([, e]) => e))];
  const [tab, setTab] = useState<string | null>(null);
  const list = tab ? all.filter(([, e]) => e === tab) : all;
  return (
    <Modal open onClose={onClose} title={t("chat.reactions")} size="sm">
      <div className="mb-3 flex gap-1 overflow-x-auto">
        <button type="button" onClick={() => setTab(null)} className={cn("rounded-full px-3 py-1 text-xs font-medium", !tab ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2")}>
          {t("chat.all")} {all.length}
        </button>
        {emojis.map((e) => (
          <button key={e} type="button" onClick={() => setTab(e)} className={cn("rounded-full px-3 py-1 text-sm", tab === e ? "bg-accent/15" : "hover:bg-surface-2")}>
            {e} <span className="text-xs text-muted">{all.filter(([, x]) => x === e).length}</span>
          </button>
        ))}
      </div>
      <ul className="space-y-1">
        {list.map(([uid, e]) => (
          <li key={uid}>
            <button
              type="button"
              disabled={uid !== me}
              onClick={() => {
                onReact(null);
                onClose();
              }}
              className="flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left enabled:hover:bg-surface-2"
            >
              <Avatar name={names[uid] ?? "—"} seed={uid} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{uid === me ? t("chat.you") : (names[uid] ?? "—")}</span>
                {uid === me && <span className="block text-[11px] text-muted">{t("chat.tapToRemove")}</span>}
              </span>
              <span className="text-lg">{e}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

// ── Delete ───────────────────────────────────────────────────────────

/** WhatsApp sarkha: sagle majhe (ani delete na zalele) asel tarach "for everyone". */
export function DeleteDialog({ count, forEveryone, busy, onDelete, onClose }: { count: number; forEveryone: boolean; busy: boolean; onDelete: (everyone: boolean) => void; onClose: () => void }) {
  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={count > 1 ? t("chat.deleteMany", { n: count }) : t("chat.deleteOne")}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("act.cancel")}
          </Button>
          <Button variant="secondary" loading={busy} onClick={() => onDelete(false)}>
            {t("chat.deleteForMe")}
          </Button>
          {forEveryone && (
            <Button variant="danger" disabled={busy} onClick={() => onDelete(true)}>
              {t("chat.deleteForEveryone")}
            </Button>
          )}
        </>
      }
    >
      <p className="text-sm text-muted">{forEveryone ? t("chat.deleteHintEveryone") : t("chat.deleteHint")}</p>
    </Modal>
  );
}

// ── Select ───────────────────────────────────────────────────────────

/** Composer chya jagi — nivadlelya messages var actions. */
export function SelectionBar({
  count,
  allStarred,
  onCopy,
  onForward,
  onStar,
  onDelete,
  onCancel,
}: {
  count: number;
  allStarred: boolean;
  onCopy: () => void;
  onForward: () => void;
  onStar: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const btn = (label: string, icon: React.ReactNode, onClick: () => void, danger?: boolean) => (
    <Button variant="ghost" size="icon" disabled={!count} onClick={onClick} title={label} aria-label={label} className={cn(danger && "text-rose-600 hover:text-rose-600")}>
      {icon}
    </Button>
  );
  return (
    <div className="flex items-center gap-1 border-t border-border bg-surface-2/50 px-2 py-2">
      <Button variant="ghost" size="icon" onClick={onCancel} aria-label={t("act.cancel")}>
        <X className="size-4" />
      </Button>
      <span className="flex-1 text-sm font-medium">{t("chat.selectedN", { n: count })}</span>
      {btn(t("chat.copy"), <Copy className="size-4" />, onCopy)}
      {btn(allStarred ? t("chat.unstar") : t("chat.star"), allStarred ? <StarOff className="size-4" /> : <Star className="size-4" />, onStar)}
      {btn(t("chat.forward"), <Forward className="size-4" />, onForward)}
      {btn(t("chat.delete"), <Trash2 className="size-4" />, onDelete, true)}
    </div>
  );
}
