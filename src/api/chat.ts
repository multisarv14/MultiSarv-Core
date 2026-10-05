import { collection, doc, limitToLast, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useState } from "react";

import { toDate } from "@/context/session";
import { callCore, core } from "@/lib/firebase";

/** Internal Chat — fakt Core Users (core `chats`). Writes core functions karto. */

export interface ChatUser {
  uid: string;
  name: string;
  email: string;
  role: string | null;
}

export interface ChatSummary {
  id: string;
  other: string;
  lastText: string;
  lastBy: string;
  lastAttachment: string | null;
  updatedAt: Date | null;
  unread: boolean;
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
  by: string;
  byName: string;
  text: string;
  attachment: ChatAttachment | null;
  replyTo: ChatReply | null;
  at: Date | null;
}

/** Core `chat.ts` / storage.rules sobat same. */
export const CHAT_MAX_BYTES = 10 * 1024 * 1024;
export const CHAT_ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.mp3,.m4a,.wav,.ogg,.webm";
const TYPES = [
  /^image\/(png|jpe?g|gif|webp)$/,
  /^application\/pdf$/,
  /^text\/(plain|csv)$/,
  /^application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-excel|vnd\.ms-powerpoint)$/,
  /^application\/(zip|x-zip-compressed)$/,
  /^audio\/(webm|ogg|mp4|mpeg|aac|x-m4a|wav)$/,
];
export const chatFileOk = (f: File) => TYPES.some((r) => r.test(f.type.split(";")[0]));

export const chatIdOf = (a: string, b: string) => [a, b].sort().join("__");

export const listChatUsers = () => callCore<ChatUser[]>("listChatUsers", {});

/** Majhe chats live — last message ani unread. */
export function useMyChats(uid: string) {
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  useEffect(
    () =>
      onSnapshot(
        query(collection(core().db, "chats"), where("members", "array-contains", uid)),
        (snap) =>
          setChats(
            snap.docs.map((d) => {
              const x = d.data();
              const updatedAt = toDate(x.updatedAt);
              const read = toDate(x.reads?.[uid]);
              const last = (x.last ?? {}) as { text?: string; by?: string; attachment?: string | null };
              return {
                id: d.id,
                other: (x.members as string[]).find((m) => m !== uid) ?? "",
                lastText: last.text ?? "",
                lastBy: last.by ?? "",
                lastAttachment: last.attachment ?? null,
                updatedAt,
                unread: last.by !== uid && !!updatedAt && (!read || read < updatedAt),
              };
            }),
          ),
        () => setChats([]),
      ),
    [uid],
  );
  return chats;
}

/** Ek chat che messages live (shevatche 300). */
export function useChatMessages(chatId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  useEffect(() => {
    setMessages(null);
    if (!chatId) return;
    return onSnapshot(
      query(collection(doc(core().db, "chats", chatId), "messages"), orderBy("at"), limitToLast(300)),
      { includeMetadataChanges: false },
      (snap) =>
        setMessages(
          snap.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              by: String(x.by ?? ""),
              byName: String(x.byName ?? ""),
              text: String(x.text ?? ""),
              attachment: (x.attachment as ChatAttachment | null) ?? null,
              replyTo: (x.replyTo as ChatReply | null) ?? null,
              at: toDate(x.at),
            };
          }),
        ),
      () => setMessages([]),
    );
  }, [chatId]);
  return messages;
}

/** File Storage la (swatahchya folder madhe), mag message. `duration` = voice message (sec). */
export async function sendChatMessage(
  me: string,
  to: string,
  text: string,
  file?: File | null,
  opts: { replyTo?: string | null; duration?: number } = {},
) {
  let attachment: { path: string; name: string; duration?: number } | null = null;
  if (file) {
    const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
    const path = `chat/${chatIdOf(me, to)}/${me}/${Date.now()}-${safe}`;
    // contentType madhe codecs (";codecs=opus") nako — rules exact type tapasta.
    await uploadBytes(ref(core().storage, path), file, { contentType: file.type.split(";")[0] });
    attachment = { path, name: file.name, duration: opts.duration };
  }
  return callCore<{ id: string; chatId: string }>("sendChatMessage", { to, text, attachment, replyTo: opts.replyTo ?? null });
}

/** Swatahchya devices var test notification. */
export const testCorePush = () => callCore<{ devices: number; sent: number }>("testCorePush", {});

export const markChatRead = (chatId: string) => callCore("markChatRead", { chatId });

/** Attachment ughadnyasathi URL (storage rules — fakt chat members). */
export const attachmentUrl = (path: string) => getDownloadURL(ref(core().storage, path));
