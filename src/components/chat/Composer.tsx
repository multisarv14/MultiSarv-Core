import { AudioLines, Camera, FileText, Keyboard, Loader2, Mic, Paperclip, Reply, SendHorizontal, Smile, Trash2, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { CHAT_ACCEPT, CHAT_MAX_BYTES, chatFileOk, chatFileType, chatMaxFor, type ChatMessage } from "@/api/chat";
import { Avatar } from "@/components/ui/primitives";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

import { EmojiPicker } from "./EmojiPicker";
import { dictationSupported, fileSize, MAX_RECORD_SEC, mmss, recordingSupported, useDictation, useRecorder } from "./media";

/** WhatsApp sarkha input: gol "pill" (emoji · text · attach · camera) ani baju la gol mic / send button. */

/** Touch phone var Enter = navin oli (WhatsApp sarkha); keyboard / desktop var Enter = send. */
const coarse = () => window.matchMedia("(pointer: coarse)").matches;

const MAX_LINES_PX = 128;

export interface Outgoing {
  text: string;
  file: File | null;
  duration?: number;
  /** Group — `@Naav` kelele members (uid). */
  mentions?: string[];
}

export interface Mentionable {
  uid: string;
  name: string;
}

/** Cursor chya mage `@…` (shabdachya survatila) — mention shodh. */
const MENTION_AT = /(?:^|\s)@([^\s@]{0,30})$/;

export function Composer({
  me,
  reply,
  onCancelReply,
  onSend,
  quote,
  mentionables,
}: {
  me: string;
  reply: ChatMessage | null;
  onCancelReply: () => void;
  /** true = gela. false = parat input madhe theva. */
  onSend: (m: Outgoing) => Promise<boolean>;
  quote: (m: ChatMessage) => string;
  /** Group members (mi sodun) — `@` var yadi. */
  mentionables?: Mentionable[];
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [emoji, setEmoji] = useState(false);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    if (!mention || !mentionables?.length) return [];
    const q = mention.query.toLowerCase();
    return mentionables.filter((m) => m.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || m.name.toLowerCase().startsWith(q)).slice(0, 6);
  }, [mention, mentionables]);

  /** Cursor paryant `@query` aahe ka. */
  const detect = (value: string, caret: number) => {
    if (!mentionables?.length) return;
    const m = MENTION_AT.exec(value.slice(0, caret));
    setMention(m ? { start: caret - m[1].length - 1, query: m[1] } : null);
    setActive(0);
  };

  const pickMention = (p: Mentionable) => {
    if (!mention) return;
    const el = input.current;
    const caret = el?.selectionStart ?? text.length;
    const tag = `@${p.name} `;
    const next = text.slice(0, mention.start) + tag + text.slice(caret);
    setText(next);
    setMention(null);
    const at = mention.start + tag.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at, at);
    });
  };

  const deliver = async (m: Outgoing) => {
    setSending(true);
    try {
      return await onSend(m);
    } finally {
      setSending(false);
    }
  };

  const recorder = useRecorder((r) => {
    // 5 min zale — apoaap pathva.
    if (r.file.size > CHAT_MAX_BYTES) return toast.error(t("chat.tooBig", { max: fileSize(CHAT_MAX_BYTES) }));
    deliver({ text: "", file: r.file, duration: r.duration });
  });

  const dictation = useDictation(
    (said) => said && setText((v) => (v && !/\s$/.test(v) ? `${v} ${said}` : v + said)),
    (code) => toast.error(code === "not-allowed" || code === "service-not-allowed" ? t("chat.micBlocked") : t("chat.speechFailed")),
  );

  // Text pramane uncha (WhatsApp sarkha), kamal ~5 oli mag scroll.
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_LINES_PX)}px`;
    el.style.overflowY = el.scrollHeight > MAX_LINES_PX ? "auto" : "hidden";
  }, [text]);

  // Reply nivadla ki lagech lihayla.
  useLayoutEffect(() => {
    if (reply) input.current?.focus();
  }, [reply]);

  const pick = (f: File | undefined) => {
    if (fileInput.current) fileInput.current.value = "";
    if (cameraInput.current) cameraInput.current.value = "";
    if (!f) return;
    if (!chatFileOk(f)) return toast.error(t("chat.badType"));
    if (f.size > chatMaxFor(chatFileType(f))) return toast.error(t("chat.tooBig", { max: fileSize(chatMaxFor(chatFileType(f))) }));
    setFile(f);
    input.current?.focus();
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

  const send = async () => {
    const body = text.trim();
    if (sending || (!body && !file)) return;
    dictation.stop();
    setEmoji(false);
    // WhatsApp sarkha — lagech rikama; fail zala tar parat.
    const f = file;
    const mentions = (mentionables ?? []).filter((m) => body.includes(`@${m.name}`)).map((m) => m.uid);
    setText("");
    setFile(null);
    setMention(null);
    if (!(await deliver({ text: body, file: f, mentions }))) {
      setText((v) => v || body);
      setFile((x) => x ?? f);
    }
  };

  const startRecording = async () => {
    dictation.stop();
    setEmoji(false);
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
    await deliver({ text: "", file: r.file, duration: r.duration });
  };

  const empty = !text.trim() && !file;
  const showMic = empty && recordingSupported;

  const roundBtn =
    "flex size-11 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-sm transition hover:brightness-110 active:scale-95 disabled:opacity-60";
  // 44px oli madhe madhyavar (ekach oli), anek oli asel tar khali (WhatsApp sarkha).
  const pillBase = "flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:text-text";
  const pillIcon = `${pillBase} mb-1`;

  return (
    // Patti / resha nahi — pill ani button chat wallpaper var (WhatsApp sarkha).
    <div className="relative px-2 pt-1 pb-2">
      {emoji && <EmojiPicker onPick={insert} onClose={() => setEmoji(false)} />}
      {matches.length > 0 && (
        <ul role="listbox" className="animate-pop absolute bottom-full left-2 z-20 mb-2 w-[min(18rem,calc(100%-1rem))] overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-pop">
          {matches.map((m, i) => (
            <li key={m.uid}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickMention(m)}
                className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm", i === active ? "bg-accent/10" : "hover:bg-surface-2")}
              >
                <Avatar name={m.name} seed={m.uid} size="sm" />
                <span className="truncate">{m.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {recorder.recording ? (
        <div className="flex items-end gap-2">
          <div className="flex min-h-11 flex-1 items-center gap-2 rounded-3xl bg-surface px-2 shadow-sm">
            <button type="button" onClick={recorder.cancel} className={cn(pillBase, "text-rose-500 hover:text-rose-600")} title={t("chat.recordCancel")} aria-label={t("chat.recordCancel")}>
              <Trash2 className="size-5" />
            </button>
            <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-rose-500" />
            <span className="font-medium tabular text-text">{mmss(recorder.seconds)}</span>
            <span className="min-w-0 truncate text-xs text-muted">{t("chat.recording", { max: mmss(MAX_RECORD_SEC) })}</span>
          </div>
          <button type="button" onClick={sendRecording} disabled={sending} className={roundBtn} aria-label={t("chat.send")}>
            {sending ? <Loader2 className="size-5 animate-spin" /> : <SendHorizontal className="size-5" />}
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1 overflow-hidden rounded-3xl bg-surface shadow-sm">
            {reply && (
              <div className="m-1.5 mb-0 flex items-start gap-2 rounded-xl border-l-4 border-[#00a884] bg-surface-2 px-3 py-1.5 text-xs">
                <Reply className="mt-0.5 size-3.5 shrink-0 text-[#00a884]" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[#00a884]">{reply.by === me ? t("chat.you") : reply.byName}</p>
                  <p className="truncate text-muted">{quote(reply)}</p>
                </div>
                <button type="button" onClick={onCancelReply} className="shrink-0 text-muted hover:text-text" aria-label={t("act.cancel")}>
                  <X className="size-4" />
                </button>
              </div>
            )}
            {file && (
              <div className="m-1.5 mb-0 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs">
                <FileText className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
                <span className="shrink-0 text-muted">{fileSize(file.size)}</span>
                <button type="button" onClick={() => setFile(null)} className="shrink-0 text-muted hover:text-text" aria-label={t("act.cancel")}>
                  <X className="size-4" />
                </button>
              </div>
            )}

            <div className="flex items-end px-1">
              <button
                type="button"
                className={pillIcon}
                title={t("chat.emoji")}
                aria-label={t("chat.emoji")}
                onClick={() => {
                  setEmoji((v) => !v);
                  if (emoji) input.current?.focus();
                }}
              >
                {emoji ? <Keyboard className="size-5" /> : <Smile className="size-5" />}
              </button>
              <textarea
                ref={input}
                rows={1}
                value={text}
                maxLength={4000}
                placeholder={dictation.listening ? dictation.interim || t("chat.listening") : t("chat.placeholder")}
                className="block max-h-32 min-h-11 min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-[11px] text-[15px] leading-snug text-text shadow-none placeholder:text-muted/70 focus:outline-none pointer-coarse:text-base"
                // Global `*:focus-visible` outline (index.css, layer baher) Tailwind utility la harvto —
                // gol "pill" madhe to kaplela resha disto. Pill swatahch input ahe (WhatsApp sarkha).
                style={{ outline: "none" }}
                onChange={(e) => {
                  setText(e.target.value);
                  detect(e.target.value, e.target.selectionStart ?? e.target.value.length);
                }}
                onSelect={(e) => detect(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
                onBlur={() => setMention(null)}
                onKeyDown={(e) => {
                  if (matches.length) {
                    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                      e.preventDefault();
                      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
                      return;
                    }
                    if (e.key === "Enter" || e.key === "Tab") {
                      e.preventDefault();
                      pickMention(matches[active] ?? matches[0]);
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setMention(null);
                      return;
                    }
                  }
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !coarse()) {
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
                  className={cn(pillIcon, dictation.listening && "animate-pulse text-rose-500 hover:text-rose-600")}
                >
                  <AudioLines className="size-5" />
                </button>
              )}
              <button type="button" className={cn(pillIcon, "-rotate-45")} title={t("chat.attach")} aria-label={t("chat.attach")} onClick={() => fileInput.current?.click()}>
                <Paperclip className="size-5" />
              </button>
              {/* Camera fakt phone var (WhatsApp sarkha) — text lihitana lapto. */}
              {!text && (
                <button type="button" className={cn(pillIcon, "pointer-fine:hidden")} title={t("chat.camera")} aria-label={t("chat.camera")} onClick={() => cameraInput.current?.click()}>
                  <Camera className="size-5" />
                </button>
              )}
              <input ref={fileInput} type="file" accept={CHAT_ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
              <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            </div>
          </div>

          {showMic ? (
            <button type="button" onClick={startRecording} className={roundBtn} title={t("chat.record")} aria-label={t("chat.record")}>
              <Mic className="size-5" />
            </button>
          ) : (
            <button type="button" onClick={send} disabled={sending || empty} className={roundBtn} aria-label={t("chat.send")}>
              {sending ? <Loader2 className="size-5 animate-spin" /> : <SendHorizontal className="size-5" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
