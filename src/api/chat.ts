import { collection, doc, limitToLast, onSnapshot, orderBy, query, where, type DocumentData } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useMemo, useRef, useState } from "react";

import { toDate } from "@/context/session";
import { deviceId } from "@/lib/corePush";
import { callCore, core } from "@/lib/firebase";

/** Internal Chat — fakt Core Users (core `chats`). Writes core functions karto. */

export interface ChatUser {
  uid: string;
  name: string;
  email: string;
  role: string | null;
}

/** Group chat (WhatsApp sarkha) — fakt Core Users members. */
export interface ChatGroup {
  name: string;
  description: string;
  /** Storage path — `groupPhotoUrl` ne URL. */
  photo: string | null;
  members: string[];
  admins: string[];
  /** Notifications band kelele members ("off"). */
  muted: string[];
  /** Member chi notification nivad (nasel tar "all"). */
  notify: Record<string, NotifyMode>;
  /** Fakt admins message pathavu shaktat. */
  onlyAdminsSend: boolean;
  /** uid → naav (sodun gelele pan, juna messages sathi). */
  names: Record<string, string>;
  createdBy: string;
  createdAt: Date | null;
}

/** all = sagle; mentions = fakt mention / majhya message la reply; off = band. */
export type NotifyMode = "all" | "mentions" | "off";
export const notifyModeOf = (g: ChatGroup | null | undefined, uid: string): NotifyMode =>
  g?.notify[uid] ?? (g?.muted.includes(uid) ? "off" : "all");

export interface ChatSummary {
  id: string;
  members: string[];
  /** 1:1 — samorcha uid; group la "". */
  other: string;
  group: ChatGroup | null;
  lastText: string;
  lastBy: string;
  lastByName: string;
  lastAttachment: string | null;
  /** Group madhla "X added Y" sarkha. */
  lastSystem: boolean;
  /** Shevatcha message "delete for everyone" zala. */
  lastDeleted: boolean;
  /** Shevatchya message madhe mention kelele / reply kelelya message cha lekhak. */
  lastMentions: string[];
  lastReplyToBy: string | null;
  updatedAt: Date | null;
  unread: boolean;
  /** Na vachlele messages (server counter; juna chat → 1). */
  unreadCount: number;
  /** Na vachlelya madhe mala mention. */
  mentioned: boolean;
  /** uid → shevti vachla / pohochla (✓✓). */
  reads: Record<string, Date | null>;
  delivered: Record<string, Date | null>;
}

export interface ChatAttachment {
  path: string;
  name: string;
  size: number;
  type: string;
  /** Voice message (sec). */
  duration?: number;
}

/** Reply kelelya message chi chhoti copy. */
export interface ChatReply {
  id: string;
  by: string;
  byName: string;
  text: string;
  attachment: string | null;
  audio: boolean;
}

export interface ChatMessage {
  id: string;
  /** Mention kelele members (uid). */
  mentions: string[];
  /** uid → emoji. */
  reactions: Record<string, string>;
  /** Mi star kelela. */
  starred: boolean;
  forwarded: boolean;
  /** Pathavla tevha che recipients (juna messages la null). */
  to: string[] | null;
  /** Call history (`kind: "call"`) — pathavnara = caller. */
  call: { id: string; type: "audio" | "video"; outcome: string; duration: number } | null;
  /** uid → vel — tya member chya device var pohochla / tyane vachla. */
  deliveredTo: Record<string, Date>;
  readBy: Record<string, Date>;
  by: string;
  byName: string;
  text: string;
  attachment: ChatAttachment | null;
  replyTo: ChatReply | null;
  at: Date | null;
  /** "Delete for everyone" zalela. */
  deleted: boolean;
  /** Pathavlyanantar badallela ("Edited"). */
  edited: boolean;
  /** Group madhla "X ne group banavla" sarkha message. */
  system: boolean;
}

/** Core `chat.ts` `EDIT_WINDOW_MS` sobat same (WhatsApp sarkha 15 min). */
export const CHAT_EDIT_WINDOW_MS = 15 * 60 * 1000;

/** Swatahcha sadha message, ajun vel ahe — "Edit" dakhva (server pan tapasto). */
export const canEditMessage = (m: ChatMessage, me: string) =>
  m.by === me && !m.deleted && !m.system && !m.call && !m.forwarded && !!m.at && Date.now() - m.at.getTime() < CHAT_EDIT_WINDOW_MS;

export const editChatMessage = (chatId: string, id: string, text: string, mentions: string[] = []) =>
  callCore<{ ok: boolean }>("editChatMessage", { chatId, id, text, mentions });

/** Core `chat.ts` / storage.rules sobat same. */
export const CHAT_MAX_BYTES = 10 * 1024 * 1024;
export const CHAT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const CHAT_APK_MAX_BYTES = 100 * 1024 * 1024;
const APK_TYPE = "application/vnd.android.package-archive";
/** Video la 50 MB, APK la 100 MB, baki 10 MB. */
export const chatMaxFor = (type: string) => (type.startsWith("video/") ? CHAT_VIDEO_MAX_BYTES : type === APK_TYPE ? CHAT_APK_MAX_BYTES : CHAT_MAX_BYTES);
export const CHAT_ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.apk,.mp3,.m4a,.wav,.ogg,.webm,.mp4,.mov,.3gp";
const TYPES = [
  /^application\/vnd\.android\.package-archive$/,
  /^image\/(png|jpe?g|gif|webp)$/,
  /^application\/pdf$/,
  /^text\/(plain|csv)$/,
  /^application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-excel|vnd\.ms-powerpoint)$/,
  /^application\/(zip|x-zip-compressed)$/,
  /^audio\/(webm|ogg|mp4|mpeg|aac|x-m4a|wav)$/,
  /^video\/(mp4|quicktime|webm|3gpp)$/,
];
/** Upload la jaanara type — codecs shivay; browser APK la type det nahi (Windows / Mac) tevha extension varun. */
export const chatFileType = (f: File) => f.type.split(";")[0] || (/\.apk$/i.test(f.name) ? APK_TYPE : "");
export const chatFileOk = (f: File) => TYPES.some((r) => r.test(chatFileType(f)));

export const chatIdOf = (a: string, b: string) => [a, b].sort().join("__");

export const listChatUsers = () => callCore<ChatUser[]>("listChatUsers", {});

const groupOf = (x: DocumentData): ChatGroup | null =>
  x.type !== "group"
    ? null
    : {
        name: String(x.name ?? ""),
        description: String(x.description ?? ""),
        photo: typeof x.photo === "string" ? x.photo : null,
        members: (x.members as string[] | undefined) ?? [],
        admins: (x.admins as string[] | undefined) ?? [],
        muted: (x.muted as string[] | undefined) ?? [],
        notify: (x.notify as Record<string, NotifyMode> | undefined) ?? {},
        onlyAdminsSend: x.onlyAdminsSend === true,
        names: (x.names as Record<string, string> | undefined) ?? {},
        createdBy: String(x.createdBy ?? ""),
        createdAt: toDate(x.createdAt),
      };

function summaryOf(id: string, x: DocumentData, uid: string): ChatSummary {
  const updatedAt = toDate(x.updatedAt);
  const read = toDate(x.reads?.[uid]);
  const last = (x.last ?? {}) as {
    text?: string;
    by?: string;
    byName?: string;
    attachment?: string | null;
    system?: boolean;
    deleted?: boolean;
    mentions?: string[];
    replyToBy?: string | null;
  };
  const unread = last.by !== uid && !!updatedAt && (!read || read < updatedAt);
  const stamps = (m: unknown) => Object.fromEntries(Object.entries((m ?? {}) as Record<string, unknown>).map(([k, v]) => [k, toDate(v)]));
  const count = Number(x.unread?.[uid]);
  return {
    id,
    members: (x.members as string[] | undefined) ?? [],
    other: x.type === "group" ? "" : ((x.members as string[]).find((m) => m !== uid) ?? ""),
    group: groupOf(x),
    lastText: last.text ?? "",
    lastBy: last.by ?? "",
    lastByName: last.byName ?? "",
    lastAttachment: last.attachment ?? null,
    lastSystem: last.system === true,
    lastDeleted: last.deleted === true,
    lastMentions: last.mentions ?? [],
    lastReplyToBy: last.replyToBy ?? null,
    updatedAt,
    unread,
    unreadCount: unread ? (Number.isFinite(count) && count > 0 ? count : 1) : 0,
    mentioned: unread && x.mentionUnread?.[uid] === true,
    reads: stamps(x.reads),
    delivered: stamps(x.delivered),
  };
}

/** Majhe chats live (1:1 ani groups) — last message ani unread. */
export function useMyChats(uid: string) {
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  useEffect(
    () =>
      onSnapshot(
        query(collection(core().db, "chats"), where("members", "array-contains", uid)),
        (snap) => setChats(snap.docs.map((d) => summaryOf(d.id, d.data(), uid))),
        () => setChats([]),
      ),
    [uid],
  );
  return chats;
}

/**
 * Ek chat doc live (✓✓ / group info). `null` = load hotoy; `false` = nahi kinva mi member nahi
 * (group madhun kadhla / sodla — rules mag vachu det nahit).
 */
export function useChatDoc(chatId: string | null, uid: string) {
  const [chat, setChat] = useState<ChatSummary | false | null>(null);
  useEffect(() => {
    setChat(null);
    if (!chatId) return;
    return onSnapshot(
      doc(core().db, "chats", chatId),
      (snap) => {
        const x = snap.data();
        setChat(x && ((x.members as string[] | undefined) ?? []).includes(uid) ? summaryOf(snap.id, x, uid) : false);
      },
      () => setChat(false),
    );
  }, [chatId, uid]);
  return chat;
}

/** Group live — 1:1 doc asel tar `false`. */
export function useChatGroup(chatId: string | null, uid: string) {
  const chat = useChatDoc(chatId, uid);
  return chat && !chat.group ? false : chat;
}

/** `{uid: Timestamp}` → `{uid: Date}` (pending / chukiche sodun). */
const stampsOf = (v: unknown): Record<string, Date> => {
  const out: Record<string, Date> = {};
  for (const [k, x] of Object.entries((v ?? {}) as Record<string, unknown>)) {
    const d = toDate(x);
    if (d) out[k] = d;
  }
  return out;
};

/** Mi star kelele (fakt majhe — `admins/{me}/starred/{chatId}`). */
function useStarredIds(chatId: string | null, me: string) {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setIds(new Set());
    if (!chatId) return;
    return onSnapshot(
      doc(core().db, "admins", me, "starred", chatId),
      (snap) => setIds(new Set((snap.get("ids") as string[] | undefined) ?? [])),
      () => setIds(new Set()),
    );
  }, [chatId, me]);
  return ids;
}

// ── ✓ / ✓✓ / blue ✓✓ ─────────────────────────────────────────────────

export interface RecipientReceipt {
  uid: string;
  delivered: boolean;
  deliveredAt: Date | null;
  read: boolean;
  readAt: Date | null;
}

/**
 * Message che pratyek recipient — pathavla tevha che (`to`), ajun member asnare. Exact vel
 * message var (`readBy` / `deliveredTo`); juna message (receipt nasel) — chat watermark
 * (`reads` / `delivered`) — fakt "ho / nahi", vel nahi.
 */
export function receiptsOf(m: ChatMessage, chat: ChatSummary): RecipientReceipt[] {
  const at = m.at?.getTime() ?? Infinity;
  const who = (m.to ?? chat.members).filter((u) => u !== m.by && chat.members.includes(u));
  return who.map((u) => {
    const readAt = m.readBy[u] ?? null;
    const read = !!readAt || (chat.reads[u]?.getTime() ?? 0) >= at;
    const deliveredAt = m.deliveredTo[u] ?? readAt;
    const delivered = read || !!deliveredAt || (chat.delivered[u]?.getTime() ?? 0) >= at;
    return { uid: u, delivered, deliveredAt, read, readAt };
  });
}

/** Sagle recipients ni vachla → read; sagle kade pohochla → delivered; nahitar sent. */
export function receiptStatus(m: ChatMessage, chat: ChatSummary | null | false): "sent" | "delivered" | "read" {
  if (!chat || !m.at) return "sent";
  const r = receiptsOf(m, chat);
  if (!r.length) return "sent";
  if (r.every((x) => x.read)) return "read";
  if (r.every((x) => x.delivered)) return "delivered";
  return "sent";
}

/** Ekda kiti messages (juna "Load earlier" ne +). */
export const CHAT_PAGE = 300;

/**
 * Ek chat che messages live (shevatche `limit`) — "Delete for me" kelele lapvun.
 * `loadedLimit` = he messages kontya limit che (vadhavla ani ajun alele nahit tar kami).
 */
export function useChatMessagesPaged(chatId: string | null, me: string, limit = CHAT_PAGE) {
  const [state, setState] = useState<{ list: ChatMessage[]; limit: number; full: boolean } | null>(null);
  // Fakt chat badalla tar rikama — `limit` vadhla tar juna list rahu dya (scroll jaga).
  const shown = useRef(chatId);
  useEffect(() => {
    if (shown.current !== chatId) {
      shown.current = chatId;
      setState(null);
    }
    if (!chatId) return;
    return onSnapshot(
      query(collection(doc(core().db, "chats", chatId), "messages"), orderBy("at"), limitToLast(limit)),
      { includeMetadataChanges: false },
      (snap) =>
        setState({
          limit,
          // Limit bharla — ajun juna asu shaktat ("Delete for me" lapvlele pan mojun).
          full: snap.size >= limit,
          list: snap.docs.filter((d) => !((d.get("hiddenFor") as string[] | undefined) ?? []).includes(me)).map((d) => {
            const x = d.data();
            return {
              id: d.id,
              mentions: (x.mentions as string[] | undefined) ?? [],
              reactions: (x.reactions as Record<string, string> | undefined) ?? {},
              starred: false,
              forwarded: x.forwarded === true,
              to: Array.isArray(x.to) ? (x.to as string[]) : null,
              deliveredTo: stampsOf(x.deliveredTo),
              readBy: stampsOf(x.readBy),
              by: String(x.by ?? ""),
              byName: String(x.byName ?? ""),
              text: String(x.text ?? ""),
              attachment: (x.attachment as ChatAttachment | null) ?? null,
              replyTo: (x.replyTo as ChatReply | null) ?? null,
              at: toDate(x.at),
              deleted: x.deleted === true,
              edited: x.editedAt != null && x.deleted !== true,
              system: x.kind === "system",
              call: x.kind === "call" && x.call ? (x.call as ChatMessage["call"]) : null,
            };
          }),
        }),
      () => setState({ list: [], limit, full: false }),
    );
  }, [chatId, me, limit]);
  const starred = useStarredIds(chatId, me);
  const messages = useMemo(() => state?.list.map((m) => (starred.has(m.id) ? { ...m, starred: true } : m)) ?? null, [state, starred]);
  const loading = !!state && state.limit < limit;
  return { messages, hasMore: !!state && (state.full || loading), loadingMore: loading };
}

/** Shevatche `limit` messages (paging nako tithe). */
export const useChatMessages = (chatId: string | null, me: string, limit = CHAT_PAGE) => useChatMessagesPaged(chatId, me, limit).messages;

/** Konala — 1:1 (`to` = uid) kinva group (`chatId`). */
export type ChatTarget = { to: string } | { chatId: string };

/** File Storage la (swatahchya folder madhe), mag message. `duration` = voice message (sec). */
export async function sendChatMessage(
  me: string,
  target: ChatTarget,
  text: string,
  file?: File | null,
  opts: { replyTo?: string | null; duration?: number; mentions?: string[] } = {},
) {
  const chatId = "chatId" in target ? target.chatId : chatIdOf(me, target.to);
  let attachment: { path: string; name: string; duration?: number } | null = null;
  if (file) {
    const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
    const path = `chat/${chatId}/${me}/${Date.now()}-${safe}`;
    // contentType madhe codecs (";codecs=opus") nako — rules exact type tapasta.
    await uploadBytes(ref(core().storage, path), file, { contentType: chatFileType(file) });
    attachment = { path, name: file.name, duration: opts.duration };
  }
  return callCore<{ id: string; chatId: string }>("sendChatMessage", {
    ...target,
    text,
    attachment,
    replyTo: opts.replyTo ?? null,
    mentions: opts.mentions ?? [],
  });
}

// ── Groups ───────────────────────────────────────────────────────────

/** Core `chat.ts` sobat same. */
export const GROUP_NAME_MAX = 60;
export const GROUP_DESC_MAX = 500;
export const GROUP_MAX_MEMBERS = 100;

export interface GroupPatch {
  name?: string;
  description?: string;
  /** Storage path; `null` = photo kadha. */
  photo?: string | null;
  add?: string[];
  remove?: string[];
  promote?: string[];
  demote?: string[];
  /** Fakt admins message pathavu shaktat. */
  onlyAdminsSend?: boolean;
}

/** Server members tapasto — fakt active Core Users; banavnara group admin. */
export const createChatGroup = (data: { name: string; description: string; members: string[] }) =>
  callCore<{ chatId: string }>("createChatGroup", data);

/** Fakt group admin (server tapasto). */
export const updateChatGroup = (chatId: string, patch: GroupPatch) => callCore("updateChatGroup", { chatId, ...patch });

export const leaveChatGroup = (chatId: string) => callCore("leaveChatGroup", { chatId });

export const setChatNotify = (chatId: string, mode: NotifyMode) => callCore("setChatNotify", { chatId, mode });

/** Photo chhota (512px JPEG) karun group cha photo mhanun lavto. */
export async function setGroupPhoto(me: string, chatId: string, file: File) {
  const blob = await squareJpeg(file, 512);
  const path = `chat/${chatId}/${me}/group-photo-${Date.now()}.jpg`;
  await uploadBytes(ref(core().storage, path), blob, { contentType: "image/jpeg" });
  await updateChatGroup(chatId, { photo: path });
}

/** Madhla chaukon crop, `size` px JPEG. */
async function squareJpeg(file: File, size: number): Promise<Blob> {
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height);
  const canvas = Object.assign(document.createElement("canvas"), { width: size, height: size });
  canvas.getContext("2d")!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
  img.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("photo"))), "image/jpeg", 0.85));
}

/** Group photo URL (path badalla tarach navin request). */
const photoUrls = new Map<string, Promise<string>>();
export const groupPhotoUrl = (path: string) => {
  let p = photoUrls.get(path);
  if (!p) {
    p = getDownloadURL(ref(core().storage, path));
    p.catch(() => photoUrls.delete(path));
    photoUrls.set(path, p);
  }
  return p;
};

/** Swatahchya devices var test notification. */
/** Test — fakt ya browser var (server `deviceId` varun). */
export const testCorePush = () => callCore<{ devices: number; sent: number }>("testCorePush", { deviceId: deviceId() });

export const markChatRead = (chatId: string) => callCore("markChatRead", { chatId });

/** ✓✓ grey — majhya device var pohochle. */
export const markChatDelivered = (chatIds: string[]) => callCore("markChatDelivered", { chatIds });

/** `forEveryone` — fakt swatahcha (server tapasto); nahitar fakt majhyasathi lapvto. */
export const deleteChatMessage = (chatId: string, id: string, forEveryone = false) => callCore("deleteChatMessage", { chatId, id, forEveryone });

/** `emoji: null` = majhi reaction kadha. */
export const reactChatMessage = (chatId: string, id: string, emoji: string | null) => callCore("reactChatMessage", { chatId, id, emoji });

export const starChatMessages = (chatId: string, ids: string[], starred: boolean) => callCore("starChatMessages", { chatId, ids, starred });

/** Kamal 10 messages, 5 chats (server pan). */
export const FORWARD_MAX_MESSAGES = 10;
export const FORWARD_MAX_TARGETS = 5;
export const forwardChatMessages = (chatId: string, ids: string[], targets: ChatTarget[]) =>
  callCore<{ chats: string[] }>("forwardChatMessages", { chatId, ids, targets });

/** Attachment ughadnyasathi URL (storage rules — fakt chat members). */
export const attachmentUrl = (path: string) => getDownloadURL(ref(core().storage, path));
