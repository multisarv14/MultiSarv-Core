import {
  Check,
  CheckCheck,
  CheckSquare,
  ChevronDown,
  Copy,
  Download,
  FileText,
  Forward,
  Info,
  Loader2,
  Mic,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Plus,
  Reply,
  Share2,
  Smile,
  Star,
  StarOff,
  Trash2,
  Video as VideoIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { attachmentUrl, type ChatAttachment, type ChatMessage } from "@/api/chat";
import { Badge } from "@/components/ui/primitives";
import { t } from "@/i18n";
import { dateTime } from "@/lib/format";
import { errorMessage } from "@/lib/firebase";
import { cn } from "@/lib/utils";

import { EmojiPicker } from "./EmojiPicker";
import { fileSize, mmss } from "./media";

/**
 * Ek message (bubble) ani tyache tukde — link, @mention, ✓✓, reactions, actions menu.
 * 1:1 ani group donhi.
 */

export const clock = (d: Date | null) => (d ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d) : "");

/** WhatsApp sarkhe jhatpat reactions. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export const quoteText = (m: { text: string; attachment: { name: string; type?: string } | string | null; audio?: boolean }) => {
  if (m.text) return m.text;
  const a = m.attachment;
  const isAudio = "audio" in m ? m.audio : typeof a === "object" && !!a?.type?.startsWith("audio/");
  if (isAudio) return `🎤 ${t("chat.voice")}`;
  return a ? `📎 ${typeof a === "string" ? a : a.name}` : "";
};

// ── Links / mentions ─────────────────────────────────────────────────

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
/** Shevatche `.,)` link cha bhag nahi. */
const trimUrl = (u: string) => u.replace(/[.,;:!?)\]}'"]+$/, "");
export const hrefOf = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

/** Text madhle links (Group info → Links). */
export function linksIn(text: string): string[] {
  return [...text.matchAll(URL_RE)].map((m) => trimUrl(m[0]));
}

/** Text — links clickable, `@Naav` (mention) highlight. */
export function MessageText({ text, mentions, names, me, mine }: { text: string; mentions: string[]; names: Record<string, string>; me: string; mine: boolean }) {
  const tags = mentions
    .map((uid) => ({ uid, tag: `@${names[uid] ?? ""}` }))
    .filter((x) => x.tag.length > 1)
    .sort((a, b) => b.tag.length - a.tag.length);

  const out: ReactNode[] = [];
  const mentionize = (s: string, key: string) => {
    if (!tags.length) return out.push(s);
    let rest = s;
    let i = 0;
    while (rest) {
      let best: { at: number; tag: string; uid: string } | null = null;
      for (const x of tags) {
        const at = rest.indexOf(x.tag);
        if (at >= 0 && (!best || at < best.at)) best = { at, ...x };
      }
      if (!best) {
        out.push(rest);
        break;
      }
      if (best.at) out.push(rest.slice(0, best.at));
      out.push(
        <span
          key={`${key}-m${i++}`}
          className={cn("rounded px-0.5 font-semibold", mine ? "bg-white/20" : best.uid === me ? "bg-accent/15 text-accent" : "text-accent")}
        >
          {best.tag}
        </span>,
      );
      rest = rest.slice(best.at + best.tag.length);
    }
  };

  let last = 0;
  let n = 0;
  for (const m of text.matchAll(URL_RE)) {
    const url = trimUrl(m[0]);
    const at = m.index ?? 0;
    if (at > last) mentionize(text.slice(last, at), `t${n}`);
    out.push(
      <a key={`l${n++}`} href={hrefOf(url)} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
        {url}
      </a>,
    );
    last = at + url.length;
  }
  if (last < text.length) mentionize(text.slice(last), `t${n}`);
  return <>{out}</>;
}

// ── ✓ / ✓✓ ──────────────────────────────────────────────────────────

export type Receipt = "sent" | "delivered" | "read";

export function Ticks({ status, mine }: { status: Receipt; mine: boolean }) {
  const label = t(`chat.status.${status}`);
  if (status === "sent") return <Check className={cn("size-3.5", mine ? "text-accent-fg/70" : "text-muted")} aria-label={label} />;
  return <CheckCheck className={cn("size-3.5", status === "read" ? "text-sky-400" : mine ? "text-accent-fg/70" : "text-muted")} aria-label={label} />;
}

// ── Bubble ───────────────────────────────────────────────────────────

export interface BubbleProps {
  m: ChatMessage;
  me: string;
  /** Group — naav (mention / sender). */
  names: Record<string, string>;
  group: boolean;
  receipt: Receipt | null;
  selecting: boolean;
  selected: boolean;
  onSelect: () => void;
  onReply: () => void;
  onJump: (id: string) => void;
  onMenu: (m: ChatMessage, x: number, y: number) => void;
  onReactions: () => void;
  /** 1:1 — call history var "Call back". */
  onCallBack?: (type: "audio" | "video") => void;
}

export function Bubble({ m, me, names, group, receipt, selecting, selected, onSelect, onReply, onJump, onMenu, onReactions, onCallBack }: BubbleProps) {
  const mine = m.by === me;
  // Touch: ujvikade swipe = reply; long-press = menu (WhatsApp sarkha).
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const press = useRef<number | null>(null);
  const audio = m.attachment?.type.startsWith("audio/");
  const reactions = Object.entries(m.reactions);

  if (m.system) return <p className="mx-auto w-fit max-w-[90%] rounded-lg bg-surface-2/70 px-3 py-1 text-center text-[11px] text-muted">{m.text}</p>;
  if (m.call) return <CallEntry m={m} mine={mine} onCallBack={onCallBack} />;

  const clearPress = () => {
    if (press.current) clearTimeout(press.current);
    press.current = null;
  };

  // Vel + ✓✓ — WhatsApp sarkhe bubble chya aat khali-ujvikade. Text chya shevti adrushya "ghost"
  // copy jaga rakhte: jaga asel tar shevatchya olit, nasel tar apoaap navin olit (ujvikade).
  const stampTone = mine ? "text-accent-fg/75" : "text-muted";
  const stampInner = (
    <>
      {m.starred && <Star className="size-2.5 fill-current" />}
      {clock(m.at)}
      {mine && receipt && !m.deleted && <Ticks status={receipt} mine />}
    </>
  );
  const ghost = (
    <span aria-hidden className="invisible ml-2 inline-flex h-3 items-center gap-1 align-baseline text-[10px] leading-none whitespace-nowrap">
      {stampInner}
    </span>
  );
  const stamp = (
    <span title={dateTime(m.at)} className={cn("absolute right-2.5 bottom-1.5 inline-flex items-center gap-1 text-[10px] leading-none whitespace-nowrap", stampTone)}>
      {stampInner}
    </span>
  );
  /** Group — itarancha naav bubble chya varti (WhatsApp sarkha). */
  const sender = group && !mine && <p className="mb-0.5 truncate text-xs font-semibold text-accent">{m.byName}</p>;

  const body = m.deleted ? (
    <div className="relative min-w-0 rounded-2xl border border-dashed border-border bg-surface/80 px-3 py-2 text-xs text-muted italic">
      {sender}
      <p>
        🚫 {t("chat.deleted")}
        {ghost}
      </p>
      <span title={dateTime(m.at)} className="absolute right-2.5 bottom-1.5 text-[10px] leading-none text-muted not-italic">
        {clock(m.at)}
      </span>
    </div>
  ) : (
    <div
      className={cn(
        "relative min-w-0 rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap shadow-sm",
        mine ? "rounded-br-sm bg-accent text-accent-fg" : "rounded-bl-sm border border-border bg-surface",
        audio && "min-w-56",
      )}
    >
      {sender}
      {m.forwarded && (
        <p className={cn("mb-1 flex items-center gap-1 text-[11px] italic", mine ? "text-accent-fg/75" : "text-muted")}>
          <Forward className="size-3" /> {t("chat.forwarded")}
        </p>
      )}
      {m.replyTo && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onJump(m.replyTo!.id);
          }}
          className={cn("mb-1.5 block w-full rounded-lg border-l-4 px-2 py-1 text-left text-xs", mine ? "border-white/70 bg-white/15" : "border-accent bg-surface-2")}
        >
          <span className={cn("block font-semibold", !mine && "text-accent")}>{m.replyTo.by === me ? t("chat.you") : m.replyTo.byName}</span>
          <span className="line-clamp-2 opacity-80">{quoteText(m.replyTo)}</span>
        </button>
      )}
      {m.attachment &&
        (audio ? (
          <VoiceNote a={m.attachment} mine={mine} />
        ) : /^(image|video)\//.test(m.attachment.type) ? (
          <MediaAttachment a={m.attachment} mine={mine} />
        ) : (
          <AttachmentLink a={m.attachment} mine={mine} />
        ))}
      {m.text ? (
        <p className={cn(m.attachment && "mt-1.5")}>
          <MessageText text={m.text} mentions={m.mentions} names={names} me={me} mine={mine} />
          {ghost}
        </p>
      ) : (
        // Fakt file / photo / voice — vel khali ujvikade svatantra olit.
        <p className="mt-1 h-3" aria-hidden />
      )}
      {stamp}
    </div>
  );

  return (
    <div
      data-msg={m.id}
      className={cn("group flex items-start gap-2 rounded-xl transition-shadow", selecting && "cursor-pointer", selected && "bg-accent/10")}
      onClick={selecting ? onSelect : undefined}
    >
      {selecting && (
        <span className={cn("mt-5 flex size-5 shrink-0 items-center justify-center rounded border-2", selected ? "border-accent bg-accent text-accent-fg" : "border-border")}>
          {selected && <Check className="size-3" strokeWidth={3} />}
        </span>
      )}
      <div
        className={cn("flex min-w-0 flex-1 flex-col", mine ? "items-end" : "items-start")}
        onPointerDown={(e) => {
          if (selecting || e.pointerType === "mouse") return;
          start.current = { x: e.clientX, y: e.clientY };
          const { clientX, clientY } = e;
          press.current = window.setTimeout(() => ((start.current = null), setDx(0), onMenu(m, clientX, clientY)), 450);
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const x = e.clientX - start.current.x;
          if (Math.abs(x) > 8 || Math.abs(e.clientY - start.current.y) > 8) clearPress();
          if (Math.abs(e.clientY - start.current.y) > 30 || m.deleted) return (start.current = null), setDx(0);
          setDx(Math.max(0, Math.min(x, 80)));
        }}
        onPointerUp={() => {
          clearPress();
          if (dx > 55) onReply();
          start.current = null;
          setDx(0);
        }}
        onPointerCancel={() => (clearPress(), (start.current = null), setDx(0))}
        onContextMenu={(e) => {
          if (selecting) return;
          e.preventDefault();
          onMenu(m, e.clientX, e.clientY);
        }}
      >
        <div className={cn("flex max-w-[85%] items-center gap-1", mine && "flex-row-reverse")} style={dx ? { transform: `translateX(${dx}px)` } : undefined}>
          {body}
          {!selecting && (
            <div className={cn("flex shrink-0 items-center opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:hidden", mine && "flex-row-reverse")}>
              {!m.deleted && (
                <HoverButton label={t("chat.reply")} onClick={onReply}>
                  <Reply className="size-3.5" />
                </HoverButton>
              )}
              {!m.deleted && (
                <HoverButton label={t("chat.react")} onClick={(e) => onMenu(m, e.clientX, e.clientY)}>
                  <Smile className="size-3.5" />
                </HoverButton>
              )}
              <HoverButton label={t("chat.more")} onClick={(e) => onMenu(m, e.clientX, e.clientY)}>
                <ChevronDown className="size-3.5" />
              </HoverButton>
            </div>
          )}
        </div>
        {reactions.length > 0 && !m.deleted && <ReactionChips reactions={m.reactions} me={me} names={names} mine={mine} onOpen={onReactions} />}
      </div>
    </div>
  );
}

/** Call history — WhatsApp sarkha: "Voice call · 3:12", lal "Missed voice call", parat call. */
function CallEntry({ m, mine, onCallBack }: { m: ChatMessage; mine: boolean; onCallBack?: (type: "audio" | "video") => void }) {
  const c = m.call!;
  const video = c.type === "video";
  const missed = !mine && (c.outcome === "missed" || c.outcome === "cancelled");
  const label =
    c.outcome === "completed"
      ? video
        ? t("call.videoCall")
        : t("call.voiceCall")
      : missed
        ? video
          ? t("call.missedVideo")
          : t("call.missedVoice")
        : c.outcome === "declined"
          ? t("call.declinedShort")
          : c.outcome === "busy"
            ? t("call.busyShort")
            : c.outcome === "failed"
              ? t("call.failedShort")
              : t("call.noAnswerShort");
  const Icon = video ? VideoIcon : missed ? PhoneMissed : mine ? PhoneOutgoing : PhoneIncoming;
  return (
    <div data-msg={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className={cn("flex items-center gap-3 rounded-2xl px-3 py-2 shadow-sm", mine ? "rounded-br-sm bg-accent text-accent-fg" : "rounded-bl-sm border border-border bg-surface")}>
        <span className={cn("flex size-9 items-center justify-center rounded-full", mine ? "bg-white/15" : missed ? "bg-rose-500/10 text-rose-600" : "bg-accent/10 text-accent")}>
          <Icon className="size-4" />
        </span>
        <span className="min-w-0">
          <span className={cn("block text-sm font-medium", missed && "text-rose-600")}>{label}</span>
          <span className={cn("block text-[11px]", mine ? "text-accent-fg/75" : "text-muted")} title={dateTime(m.at)}>
            {clock(m.at)}
            {c.outcome === "completed" && c.duration > 0 && ` · ${Math.floor(c.duration / 60)}:${String(c.duration % 60).padStart(2, "0")}`}
          </span>
        </span>
        {onCallBack && (
          <button
            type="button"
            onClick={() => onCallBack(c.type)}
            title={t("call.callBack")}
            aria-label={t("call.callBack")}
            className={cn("ml-1 rounded-full p-2 transition", mine ? "hover:bg-white/15" : "text-accent hover:bg-accent/10")}
          >
            {video ? <VideoIcon className="size-4" /> : <Phone className="size-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

function HoverButton({ label, onClick, children }: { label: string; onClick: (e: React.MouseEvent) => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className="rounded-full p-1 text-muted hover:bg-surface-2 hover:text-text">
      {children}
    </button>
  );
}

/** Emoji → kiti; click → konakonache (dialog). */
function ReactionChips({
  reactions,
  me,
  names,
  mine,
  onOpen,
}: {
  reactions: Record<string, string>;
  me: string;
  names: Record<string, string>;
  mine: boolean;
  onOpen: () => void;
}) {
  const groups = new Map<string, string[]>();
  for (const [uid, e] of Object.entries(reactions)) groups.set(e, [...(groups.get(e) ?? []), uid]);
  const title = [...groups].map(([e, uids]) => `${e} ${uids.map((u) => (u === me ? t("chat.you") : (names[u] ?? "—"))).join(", ")}`).join("\n");
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={title}
      className={cn("-mt-1.5 flex items-center gap-1 rounded-full border border-border bg-surface px-1.5 py-0.5 text-xs shadow-sm hover:bg-surface-2", mine ? "mr-2" : "ml-2")}
    >
      {[...groups].map(([e, uids]) => (
        <span key={e} className={cn("flex items-center gap-0.5", uids.includes(me) && "font-semibold")}>
          {e}
          {uids.length > 1 && <span className="text-[10px] text-muted tabular">{uids.length}</span>}
        </span>
      ))}
    </button>
  );
}

// ── Actions menu ─────────────────────────────────────────────────────

export type MenuAction = "reply" | "copy" | "forward" | "star" | "select" | "share" | "info" | "delete";

/** Click / long-press javal — jhatpat reactions + actions. */
export function MessageMenu({
  m,
  me,
  x,
  y,
  onClose,
  onReact,
  onAction,
}: {
  m: ChatMessage;
  me: string;
  x: number;
  y: number;
  onClose: () => void;
  onReact: (emoji: string | null) => void;
  onAction: (a: MenuAction) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [picker, setPicker] = useState(false);
  const mine = m.by === me;
  const current = m.reactions[me] ?? null;

  // Screen chya aat theva.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) });
  }, [x, y, picker]);

  useEffect(() => {
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const id = setTimeout(() => document.addEventListener("pointerdown", down), 0);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", onClose);
    return () => {
      clearTimeout(id);
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const react = (e: string) => {
    onReact(current === e ? null : e);
    onClose();
  };

  const items: { a: MenuAction; icon: ReactNode; label: string; danger?: boolean; show: boolean }[] = [
    { a: "reply", icon: <Reply className="size-4" />, label: t("chat.reply"), show: !m.deleted },
    { a: "copy", icon: <Copy className="size-4" />, label: t("chat.copy"), show: !m.deleted && !!m.text },
    { a: "forward", icon: <Forward className="size-4" />, label: t("chat.forward"), show: !m.deleted },
    { a: "star", icon: m.starred ? <StarOff className="size-4" /> : <Star className="size-4" />, label: m.starred ? t("chat.unstar") : t("chat.star"), show: !m.deleted },
    { a: "select", icon: <CheckSquare className="size-4" />, label: t("chat.select"), show: true },
    { a: "share", icon: <Share2 className="size-4" />, label: t("chat.share"), show: !m.deleted && typeof navigator.share === "function" },
    { a: "info", icon: <Info className="size-4" />, label: t("chat.info"), show: mine && !m.deleted },
    { a: "delete", icon: <Trash2 className="size-4" />, label: t("chat.delete"), danger: true, show: true },
  ];

  return createPortal(
    <div ref={box} role="menu" className="animate-pop fixed z-[70] w-60 rounded-xl border border-border bg-surface p-1 shadow-pop" style={pos}>
      {!m.deleted && (
        <div className="relative flex items-center justify-between gap-0.5 border-b border-border px-1 pb-1">
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => react(e)}
              className={cn("flex size-8 items-center justify-center rounded-full text-lg transition hover:scale-110 hover:bg-surface-2", current === e && "bg-accent/15")}
            >
              {e}
            </button>
          ))}
          <button type="button" onClick={() => setPicker((v) => !v)} className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-2" aria-label={t("chat.react")}>
            <Plus className="size-4" />
          </button>
          {picker && <EmojiPicker placement="below" onPick={react} onClose={() => setPicker(false)} />}
        </div>
      )}
      <ul className="pt-1">
        {items
          .filter((i) => i.show)
          .map((i) => (
            <li key={i.a}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onClose();
                  onAction(i.a);
                }}
                className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2", i.danger && "text-rose-600")}
              >
                {i.icon}
                {i.label}
              </button>
            </li>
          ))}
      </ul>
    </div>,
    document.body,
  );
}

// ── Attachments ──────────────────────────────────────────────────────

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
        <audio controls preload="metadata" src={url} className="h-9 w-full max-w-64 min-w-0" />
      ) : failed ? (
        <span className="text-xs opacity-80">{t("chat.voiceFailed")}</span>
      ) : (
        <Loader2 className="size-4 animate-spin" />
      )}
      {a.duration ? <span className="shrink-0 text-[10px] tabular opacity-80">{mmss(a.duration)}</span> : null}
    </div>
  );
}

/** Image / video — chat madhech preview (click → mothi navin tab madhe) ani download. */
export function MediaAttachment({ a, mine }: { a: ChatAttachment; mine: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const video = a.type.startsWith("video/");
  useEffect(() => {
    let alive = true;
    attachmentUrl(a.path)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [a.path]);

  // Cross-origin la `<a download>` chalat nahi — blob ne; bucket CORS nasel tar navin tab.
  const download = async () => {
    if (!url) return;
    setBusy(true);
    try {
      const blob = await fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))));
      const href = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement("a"), { href, download: a.name });
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    } catch {
      window.open(url, "_blank");
    } finally {
      setBusy(false);
    }
  };

  if (failed) return <AttachmentLink a={a} mine={mine} />;
  return (
    <div className="relative w-64 max-w-full overflow-hidden rounded-lg bg-black/5">
      {!url ? (
        <div className="flex aspect-square items-center justify-center">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : video ? (
        <video controls preload="metadata" src={url} className="max-h-80 w-full bg-black" />
      ) : (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={a.name} loading="lazy" className="max-h-80 w-full object-cover" />
        </a>
      )}
      {url && (
        <button
          type="button"
          onClick={download}
          title={a.name}
          aria-label={`Download ${a.name}`}
          className="absolute top-1.5 right-1.5 flex size-8 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        </button>
      )}
    </div>
  );
}

/** Click kela ki URL ghevun navin tab madhe ughadto / download. */
export function AttachmentLink({ a, mine }: { a: ChatAttachment; mine: boolean }) {
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
