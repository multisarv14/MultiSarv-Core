import { ArrowLeft, AudioLines, FileText, Loader2, Mic, Paperclip, Reply, Search, Send, Smile, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import {
  attachmentUrl,
  CHAT_ACCEPT,
  CHAT_MAX_BYTES,
  chatFileOk,
  chatIdOf,
  listChatUsers,
  markChatRead,
  sendChatMessage,
  useChatMessages,
  useMyChats,
  type ChatAttachment,
  type ChatMessage,
  type ChatSummary,
  type ChatUser,
} from "@/api/chat";
import { Avatar, Badge, Button, Input, Skeleton, Spinner, Textarea } from "@/components/ui/primitives";
import { t } from "@/i18n";
import { ago, dateTime } from "@/lib/format";
import { errorMessage } from "@/lib/firebase";
import { cn } from "@/lib/utils";

import { EmojiPicker } from "./EmojiPicker";
import { dictationSupported, MAX_RECORD_SEC, mmss, recordingSupported, useDictation, useRecorder } from "./media";

/**
 * Internal Chat che tukde — Chat page ani bottom dock (LinkedIn sarkha) donhi vapartat.
 */

export const fileSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const clock = (d: Date | null) => (d ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d) : "");

// ── Ughde chats (alert / unread sathi) ───────────────────────────────

/** Konte chats sadhya screen var ughde ahet — tyanche toast / sound nako. */
const openChats = new Map<string, number>();
export const isChatOpen = (chatId: string) => (openChats.get(chatId) ?? 0) > 0 && document.visibilityState === "visible";

// ── Users (ekdach — page ani dock share) ─────────────────────────────

let usersCache: Promise<ChatUser[]> | null = null;
export const loadChatUsers = (fresh = false) => {
  if (!usersCache || fresh) usersCache = listChatUsers().catch((err) => ((usersCache = null), Promise.reject(err)));
  return usersCache;
};

export interface ChatRow {
  user: ChatUser;
  chat?: ChatSummary;
}

/** Users + majhe chats — recent adhi, mag naav; unread count. */
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
    const byOther = new Map((chats ?? []).map((c) => [c.other, c]));
    return (users ?? [])
      .map((u) => ({ user: u, chat: byOther.get(u.uid) }))
      .sort((a, b) => (b.chat?.updatedAt?.getTime() ?? 0) - (a.chat?.updatedAt?.getTime() ?? 0) || a.user.name.localeCompare(b.user.name));
  }, [users, chats]);

  const unread = (chats ?? []).filter((c) => c.unread).length;
  return { users, chats, rows, unread };
}

// ── List ──────────────────────────────────────────────────────────────

export function ChatList({
  me,
  rows,
  loading,
  selected,
  onOpen,
  header,
}: {
  me: string;
  rows: ChatRow[];
  loading: boolean;
  selected?: string | null;
  onOpen: (u: ChatUser) => void;
  header?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const list = term ? rows.filter((r) => r.user.name.toLowerCase().includes(term) || r.user.email.toLowerCase().includes(term)) : rows;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-border p-3">
        {header}
        <Input icon={<Search className="size-4" />} placeholder={t("chat.search")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
        {loading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="m-1.5 h-12 rounded-xl" />)
        ) : list.length === 0 ? (
          <li className="px-4 py-10 text-center text-xs text-muted">{t("chat.noUsers")}</li>
        ) : (
          list.map(({ user: u, chat: c }) => (
            <li key={u.uid}>
              <button
                type="button"
                onClick={() => onOpen(u)}
                className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-surface-2", u.uid === selected && "bg-accent/10")}
              >
                <Avatar name={u.name || u.email} seed={u.uid} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-sm", c?.unread ? "font-semibold" : "font-medium")}>{u.name}</span>
                    {c?.updatedAt && <span className="shrink-0 text-[10px] text-muted">{ago(c.updatedAt)}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={cn("truncate text-xs", c?.unread ? "text-text" : "text-muted")}>
                      {c ? (c.lastBy === me ? `${t("chat.you")}: ` : "") + (c.lastText || (c.lastAttachment ? `📎 ${c.lastAttachment}` : "")) : (u.role ?? u.email)}
                    </span>
                    {c?.unread && <span className="ml-auto size-2 shrink-0 rounded-full bg-accent" />}
                  </span>
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

// ── Conversation ──────────────────────────────────────────────────────

export function ChatHeader({
  other,
  onBack,
  actions,
  backMobileOnly,
}: {
  other: ChatUser;
  onBack?: () => void;
  actions?: ReactNode;
  backMobileOnly?: boolean;
}) {
  return (
    <header className="flex items-center gap-3 border-b border-border px-3 py-2.5">
      {onBack && (
        <Button variant="ghost" size="icon" className={cn("-ml-1 shrink-0", backMobileOnly && "md:hidden")} onClick={onBack} aria-label={t("act.close")}>
          <ArrowLeft className="size-4" />
        </Button>
      )}
      <Avatar name={other.name || other.email} seed={other.uid} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{other.name}</p>
        <p className="truncate text-[11px] text-muted">{other.role ? `${other.role} · ${other.email}` : other.email}</p>
      </div>
      {actions}
    </header>
  );
}

/** Messages + input. `header` nako asel tar (dock popup swatahcha header deto) `header={false}`. */
export function Conversation({ me, other, onBack, header = true }: { me: string; other: ChatUser; onBack?: () => void; header?: boolean }) {
  const chatId = chatIdOf(me, other.uid);
  const messages = useChatMessages(chatId);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [emoji, setEmoji] = useState(false);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const recorder = useRecorder();

  // Bolla te text madhe (shevti, jaga sodun).
  const dictation = useDictation(
    (said) => said && setText((v) => (v && !/\s$/.test(v) ? `${v} ${said}` : v + said)),
    (code) => toast.error(code === "not-allowed" || code === "service-not-allowed" ? t("chat.micBlocked") : t("chat.speechFailed")),
  );

  // Ha chat ughda — tyache alerts nako.
  useEffect(() => {
    openChats.set(chatId, (openChats.get(chatId) ?? 0) + 1);
    return () => {
      openChats.set(chatId, (openChats.get(chatId) ?? 1) - 1);
    };
  }, [chatId]);

  // Navin message aala ki khali scroll ani "vachla".
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
    if (messages?.length && document.visibilityState === "visible") markChatRead(chatId).catch(() => {});
  }, [messages?.length, chatId]);

  const pick = (f: File | undefined) => {
    if (fileInput.current) fileInput.current.value = "";
    if (!f) return;
    if (!chatFileOk(f)) return toast.error(t("chat.badType"));
    if (f.size > CHAT_MAX_BYTES) return toast.error(t("chat.tooBig", { max: fileSize(CHAT_MAX_BYTES) }));
    setFile(f);
  };

  /** Emoji cursor chya jagi. */
  const insert = (e: string) => {
    const el = input.current;
    const at = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? at;
    setText(text.slice(0, at) + e + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + e.length, at + e.length);
    });
  };

  const deliver = async (body: string, f: File | null, duration?: number) => {
    setSending(true);
    try {
      await sendChatMessage(me, other.uid, body, f, { replyTo: reply?.id ?? null, duration });
      setReply(null);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setSending(false);
    }
  };

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    if (sending || (!text.trim() && !file)) return;
    dictation.stop();
    if (await deliver(text.trim(), file)) {
      setText("");
      setFile(null);
    }
  };

  const startRecording = async () => {
    dictation.stop();
    try {
      await recorder.start();
    } catch {
      toast.error(t("chat.micBlocked"));
    }
  };

  const sendRecording = async () => {
    const r = await recorder.stop();
    if (!r) return;
    if (r.file.size > CHAT_MAX_BYTES) return toast.error(t("chat.tooBig", { max: fileSize(CHAT_MAX_BYTES) }));
    await deliver("", r.file, r.duration);
  };

  /** Quote var click — mool message kade scroll. */
  const jump = (id: string) => {
    const el = list.current?.querySelector<HTMLElement>(`[data-msg="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("ring-2", "ring-accent/50");
    setTimeout(() => el.classList.remove("ring-2", "ring-accent/50"), 1200);
  };

  const replyTo = (m: ChatMessage) => {
    setReply(m);
    input.current?.focus();
  };

  const empty = !text.trim() && !file;

  return (
    <>
      {header && <ChatHeader other={other} onBack={onBack} backMobileOnly />}

      <div ref={list} className="min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4">
        {!messages ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted">{t("chat.empty", { name: other.name })}</p>
        ) : (
          messages.map((m) => <Bubble key={m.id} m={m} mine={m.by === me} me={me} onReply={() => replyTo(m)} onJump={jump} />)
        )}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className="relative border-t border-border p-2.5">
        {reply && (
          <div className="mb-2 flex items-start gap-2 rounded-lg border-l-4 border-accent bg-surface-2/70 px-3 py-1.5 text-xs">
            <Reply className="mt-0.5 size-3.5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-accent">{reply.by === me ? t("chat.you") : reply.byName}</p>
              <p className="truncate text-muted">{quoteText(reply)}</p>
            </div>
            <button type="button" onClick={() => setReply(null)} className="shrink-0 text-muted hover:text-text" aria-label={t("act.cancel")}>
              <X className="size-3.5" />
            </button>
          </div>
        )}
        {file && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-1.5 text-xs">
            <FileText className="size-3.5 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <span className="shrink-0 text-muted">{fileSize(file.size)}</span>
            <button type="button" onClick={() => setFile(null)} className="shrink-0 text-muted hover:text-text" aria-label={t("act.cancel")}>
              <X className="size-3.5" />
            </button>
          </div>
        )}
        {emoji && <EmojiPicker onPick={insert} onClose={() => setEmoji(false)} />}

        {recorder.recording ? (
          // Recording chalu — WhatsApp sarkha bar: cancel · vel · send.
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="icon" className="shrink-0 text-rose-500" onClick={recorder.cancel} title={t("chat.recordCancel")} aria-label={t("chat.recordCancel")}>
              <Trash2 className="size-4" />
            </Button>
            <div className="flex h-9 flex-1 items-center gap-2 rounded-lg bg-rose-500/10 px-3 text-sm">
              <span className="size-2.5 animate-pulse rounded-full bg-rose-500" />
              <span className="font-medium tabular text-rose-600 dark:text-rose-400">{mmss(recorder.seconds)}</span>
              <span className="truncate text-xs text-muted">{t("chat.recording", { max: mmss(MAX_RECORD_SEC) })}</span>
            </div>
            <Button type="button" variant="primary" size="icon" className="shrink-0" loading={sending} onClick={sendRecording} aria-label={t("chat.send")}>
              {!sending && <Send className="size-4" />}
            </Button>
          </div>
        ) : (
          <div className="flex items-end gap-1">
            <input ref={fileInput} type="file" accept={CHAT_ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            <Button type="button" variant="ghost" size="icon" className="shrink-0" title={t("chat.emoji")} aria-label={t("chat.emoji")} onClick={() => setEmoji((v) => !v)}>
              <Smile className="size-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="shrink-0" title={t("chat.attach")} aria-label={t("chat.attach")} onClick={() => fileInput.current?.click()}>
              <Paperclip className="size-4" />
            </Button>
            <div className="relative min-w-0 flex-1">
              <Textarea
                ref={input}
                rows={1}
                value={text}
                maxLength={4000}
                placeholder={dictation.listening ? dictation.interim || t("chat.listening") : t("chat.placeholder")}
                className={cn("max-h-32 min-h-9 resize-none py-2", dictationSupported && "pr-9", dictation.listening && "ring-2 ring-rose-500/40")}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              {dictationSupported && (
                <button
                  type="button"
                  onClick={dictation.listening ? dictation.stop : dictation.start}
                  title={dictation.listening ? t("chat.dictateStop") : t("chat.dictate")}
                  aria-label={dictation.listening ? t("chat.dictateStop") : t("chat.dictate")}
                  className={cn(
                    "absolute right-1.5 bottom-1.5 flex size-6 items-center justify-center rounded-md transition",
                    dictation.listening ? "animate-pulse bg-rose-500 text-white" : "text-muted hover:bg-surface-2 hover:text-text",
                  )}
                >
                  <AudioLines className="size-3.5" />
                </button>
              )}
            </div>
            {empty && recordingSupported ? (
              <Button type="button" variant="primary" size="icon" className="shrink-0" onClick={startRecording} title={t("chat.record")} aria-label={t("chat.record")}>
                <Mic className="size-4" />
              </Button>
            ) : (
              <Button type="submit" variant="primary" size="icon" className="shrink-0" loading={sending} disabled={empty} aria-label={t("chat.send")}>
                {!sending && <Send className="size-4" />}
              </Button>
            )}
          </div>
        )}
      </form>
    </>
  );
}

const quoteText = (m: { text: string; attachment: { name: string; type?: string } | string | null; audio?: boolean }) => {
  if (m.text) return m.text;
  const a = m.attachment;
  const isAudio = "audio" in m ? m.audio : typeof a === "object" && !!a?.type?.startsWith("audio/");
  if (isAudio) return `🎤 ${t("chat.voice")}`;
  return a ? `📎 ${typeof a === "string" ? a : a.name}` : "";
};

function Bubble({ m, mine, me, onReply, onJump }: { m: ChatMessage; mine: boolean; me: string; onReply: () => void; onJump: (id: string) => void }) {
  // Touch: ujvikade swipe = reply (WhatsApp sarkha).
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const audio = m.attachment?.type.startsWith("audio/");

  return (
    <div
      data-msg={m.id}
      className={cn("group flex flex-col rounded-xl transition-shadow", mine ? "items-end" : "items-start")}
      onPointerDown={(e) => e.pointerType !== "mouse" && (start.current = { x: e.clientX, y: e.clientY })}
      onPointerMove={(e) => {
        if (!start.current) return;
        const x = e.clientX - start.current.x;
        if (Math.abs(e.clientY - start.current.y) > 30) return (start.current = null), setDx(0);
        setDx(Math.max(0, Math.min(x, 80)));
      }}
      onPointerUp={() => {
        if (dx > 55) onReply();
        start.current = null;
        setDx(0);
      }}
      onPointerCancel={() => ((start.current = null), setDx(0))}
    >
      <p className="mb-0.5 px-1 text-[10px] text-muted" title={dateTime(m.at)}>
        {mine ? t("chat.you") : m.byName} · {clock(m.at)}
      </p>
      <div className={cn("flex max-w-[85%] items-center gap-1", mine && "flex-row-reverse")} style={dx ? { transform: `translateX(${dx}px)` } : undefined}>
        <div
          className={cn(
            "min-w-0 rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap",
            mine ? "rounded-br-sm bg-accent text-accent-fg" : "rounded-bl-sm border border-border bg-surface-2/60",
            audio && "min-w-56",
          )}
        >
          {m.replyTo && (
            <button
              type="button"
              onClick={() => onJump(m.replyTo!.id)}
              className={cn("mb-1.5 block w-full rounded-lg border-l-4 px-2 py-1 text-left text-xs", mine ? "border-white/70 bg-white/15" : "border-accent bg-surface")}
            >
              <span className={cn("block font-semibold", !mine && "text-accent")}>{m.replyTo.by === me ? t("chat.you") : m.replyTo.byName}</span>
              <span className="line-clamp-2 opacity-80">{quoteText(m.replyTo)}</span>
            </button>
          )}
          {m.attachment && (audio ? <VoiceNote a={m.attachment} mine={mine} /> : <AttachmentLink a={m.attachment} mine={mine} />)}
          {m.text && <p className={cn(m.attachment && "mt-1.5")}>{m.text}</p>}
        </div>
        <button
          type="button"
          onClick={onReply}
          title={t("chat.reply")}
          aria-label={t("chat.reply")}
          className="shrink-0 rounded-full p-1 text-muted opacity-0 transition group-hover:opacity-100 hover:bg-surface-2 hover:text-text focus-visible:opacity-100 pointer-coarse:hidden"
        >
          <Reply className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Voice message — URL lagel tevha ghevun player. */
function VoiceNote({ a, mine }: { a: ChatAttachment; mine: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    attachmentUrl(a.path)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [a.path]);
  return (
    <div className="flex items-center gap-2">
      <Mic className={cn("size-4 shrink-0", mine ? "text-accent-fg/80" : "text-accent")} />
      {url ? (
        <audio controls preload="metadata" src={url} className="h-9 w-full min-w-0 max-w-64" />
      ) : failed ? (
        <span className="text-xs opacity-80">{t("chat.voiceFailed")}</span>
      ) : (
        <Loader2 className="size-4 animate-spin" />
      )}
      {a.duration ? <span className="shrink-0 text-[10px] tabular opacity-80">{mmss(a.duration)}</span> : null}
    </div>
  );
}

/** Click kela ki URL ghevun navin tab madhe ughadto / download. */
function AttachmentLink({ a, mine }: { a: ChatAttachment; mine: boolean }) {
  const [busy, setBusy] = useState(false);
  const openFile = async () => {
    // Popup blocker talnyasathi tab adhi ughdun mag URL.
    const tab = window.open("", "_blank");
    setBusy(true);
    try {
      const url = await attachmentUrl(a.path);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (err) {
      tab?.close();
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={openFile}
      className={cn(
        "flex w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition",
        mine ? "bg-white/15 hover:bg-white/25" : "bg-surface hover:bg-surface-2",
      )}
    >
      {busy ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <FileText className="size-4 shrink-0" />}
      <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
      <Badge tone={mine ? "neutral" : "accent"} className="shrink-0">
        {fileSize(a.size)}
      </Badge>
    </button>
  );
}
