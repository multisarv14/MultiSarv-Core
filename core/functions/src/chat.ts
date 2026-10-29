/**
 * Internal Chat — fakt Core Users (`admins`, active). Project users core madhe
 * nastat, mhanun tyanna kahich access nahi.
 *
 * `chats/{a__b}` (don uids sort karun) = 1:1 chat; `chats/{autoId}` + `type: "group"` = group
 * (WhatsApp sarkha — naav, members, admins). Donhi madhe `messages` subcollection.
 * Attachments Storage `chat/{chatId}/{uid}/…` — client upload karto (storage
 * rules), server metadata tapasun (size / type) message madhe jodto.
 */
import { FieldPath } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import type { CallableRequest } from "firebase-functions/v2/https";

import { pushTo } from "./push.js";
import { callable, db, FieldValue, fail, loadAdmin, now, str, type AdminDoc } from "./shared.js";

/** Storage rules sobat same. */
export const CHAT_MAX_BYTES = 10 * 1024 * 1024;
/** Video ani APK la jast jaga (storage.rules sobat same). */
export const CHAT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const CHAT_APK_MAX_BYTES = 100 * 1024 * 1024;
const APK_TYPE = "application/vnd.android.package-archive";
export const chatMaxFor = (type: string) => (type.startsWith("video/") ? CHAT_VIDEO_MAX_BYTES : type === APK_TYPE ? CHAT_APK_MAX_BYTES : CHAT_MAX_BYTES);
const CHAT_TYPES = [
  /^image\/(png|jpe?g|gif|webp)$/,
  /^application\/pdf$/,
  /^text\/(plain|csv)$/,
  /^application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-excel|vnd\.ms-powerpoint)$/,
  /^application\/(zip|x-zip-compressed)$/,
  // Android app (APK) — team madhe test builds.
  /^application\/vnd\.android\.package-archive$/,
  // Voice messages (MediaRecorder: Chrome webm/ogg, Safari mp4) ani audio files.
  /^audio\/(webm|ogg|mp4|mpeg|aac|x-m4a|wav)$/,
  /^video\/(mp4|quicktime|webm|3gpp)$/,
];
export const chatTypeOk = (t: string) => CHAT_TYPES.some((r) => r.test(t));

export const chatIdOf = (a: string, b: string) => [a, b].sort().join("__");

/** Group: kamal members (swatah dharun) ani naav lambi. */
const GROUP_MAX_MEMBERS = 100;
const GROUP_NAME_MAX = 60;
const GROUP_DESC_MAX = 500;
/** Group photo — client 512px JPEG banavto; file naav `group-photo-*` (message attachments pasun vegla). */
const GROUP_PHOTO_PREFIX = "group-photo-";
const GROUP_PHOTO_TYPE = /^image\/(png|jpe?g|webp)$/;

interface ChatDoc {
  type?: "group";
  name?: string;
  description?: string;
  /** Storage path (`chat/{chatId}/{uid}/group-photo-*`). */
  photo?: string | null;
  members: string[];
  admins?: string[];
  /** Juna: notifications band kelele members (`notify.{uid} = "off"` sobat sync). */
  muted?: string[];
  /** Member chi notification nivad — nasel tar "all". */
  notify?: Record<string, NotifyMode>;
  /** Group settings: fakt admins message pathavu shaktat. */
  onlyAdminsSend?: boolean;
  names?: Record<string, string>;
}

/** all = sagle messages; mentions = fakt mention / majhya message la reply; off = kahich nahi. */
type NotifyMode = "all" | "mentions" | "off";
const NOTIFY_MODES: readonly NotifyMode[] = ["all", "mentions", "off"];
const notifyOf = (c: ChatDoc | null | undefined, uid: string): NotifyMode =>
  c?.notify?.[uid] ?? (c?.muted?.includes(uid) ? "off" : "all");

/** Active Core User — nahitar kahich nahi. */
async function requireCoreUser(req: CallableRequest<unknown>) {
  const uid = req.auth?.uid;
  if (!uid) fail("unauthenticated", "signIn");
  const me = await loadAdmin(uid!);
  if (!me?.active) fail("permission-denied", "disabled");
  return { uid: uid!, me: me! };
}

/** Chat doc — fakt member asel tar (1:1 doc nasla tari id varun). */
async function loadChat(chatId: string, uid: string) {
  const ref = db.collection("chats").doc(chatId);
  const snap = await ref.get();
  const data = snap.data() as ChatDoc | undefined;
  const member = data ? data.members.includes(uid) : chatId.split("__").includes(uid);
  if (!member) fail("permission-denied", "chatDenied");
  return { ref, data, group: data?.type === "group" };
}

/** Active users che naav (group members / add). */
async function activeUsers(uids: string[]) {
  const snaps = uids.length ? await db.getAll(...uids.map((u) => db.collection("admins").doc(u))) : [];
  const out = new Map<string, string>();
  for (const s of snaps) if (s.exists && s.get("active") === true) out.set(s.id, String(s.get("name") ?? ""));
  return out;
}

const uidList = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 128))] : [];

/** Chat sathi internal users (active admins) — super admin nasla tari list milte. */
export const listChatUsers = callable(async (req) => {
  const { uid } = await requireCoreUser(req);
  const [admins, roles] = await Promise.all([
    db.collection("admins").where("active", "==", true).get(),
    db.collection("roles").get(),
  ]);
  const roleName = new Map(roles.docs.map((r) => [r.id, String(r.get("name") ?? "")]));
  return admins.docs
    .filter((d) => d.id !== uid)
    .map((d) => {
      const a = d.data() as AdminDoc & { roleId?: string | null };
      return { uid: d.id, name: a.name, email: a.email, role: a.roleId ? (roleName.get(a.roleId) ?? null) : null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
});

/** Group madhe "X ne group banavla" sarkhe message (`kind: "system"`). */
function systemMessage(batch: FirebaseFirestore.WriteBatch, chat: FirebaseFirestore.DocumentReference, uid: string, name: string, text: string) {
  batch.set(chat.collection("messages").doc(), { kind: "system", by: uid, byName: name, text, attachment: null, replyTo: null, at: now() });
}

// ── Send ─────────────────────────────────────────────────────────────

/** Message kuthe jato — tapaslela (member / active / group settings). */
interface Target {
  chatId: string;
  ref: FirebaseFirestore.DocumentReference;
  group: ChatDoc | null;
  /** 1:1 samorcha. */
  to: string;
  other: AdminDoc | null;
}

async function resolveTarget(uid: string, data: { to?: unknown; chatId?: unknown }): Promise<Target> {
  if (data.chatId) {
    const chatId = str(data.chatId, "chatDenied", 3, 300);
    const c = await loadChat(chatId, uid);
    if (!c.group) fail("invalid-argument", "chatDenied");
    if (c.data!.onlyAdminsSend && !(c.data!.admins ?? []).includes(uid)) fail("permission-denied", "groupAdminsOnlySend");
    return { chatId, ref: c.ref, group: c.data!, to: "", other: null };
  }
  const to = str(data.to, "chatBadUser", 1, 128);
  if (to === uid) fail("invalid-argument", "chatBadUser");
  const other = await loadAdmin(to);
  if (!other?.active) fail("failed-precondition", "chatBadUser");
  const chatId = chatIdOf(uid, to);
  return { chatId, ref: db.collection("chats").doc(chatId), group: null, to, other };
}

type Attachment = { path: string; name: string; size: number; type: string; duration?: number };
type Quote = { id: string; by: string; byName: string; text: string; attachment: string | null; audio: boolean };

interface Outgoing {
  text: string;
  attachment: Attachment | null;
  replyTo: Quote | null;
  mentions: string[];
  forwarded?: boolean;
}

const previewOf = (m: Outgoing) =>
  m.text ? m.text.slice(0, 160) : m.attachment?.type.startsWith("audio/") ? "🎤 Voice message" : `📎 ${m.attachment?.name ?? ""}`;

/**
 * Message lihito, chat doc (last / unread count / mention) taja karto, mag push:
 * mention / majhya message la reply → nehmi (notify "off" sodun); itar fakt notify "all".
 */
async function post(t: Target, uid: string, me: AdminDoc, m: Outgoing) {
  const msg = t.ref.collection("messages").doc();
  const others = t.group ? t.group.members.filter((x) => x !== uid) : [t.to];
  const batch = db.batch();
  batch.set(msg, {
    by: uid,
    byName: me.name,
    text: m.text,
    attachment: m.attachment,
    replyTo: m.replyTo,
    mentions: m.mentions,
    // Pathavtana che recipients — group madhe nantar aalele / gelele ✓✓ madhe mojat nahit.
    to: others,
    ...(m.forwarded && { forwarded: true }),
    at: now(),
  });
  const last = {
    id: msg.id,
    text: m.text.slice(0, 140),
    by: uid,
    byName: me.name,
    attachment: m.attachment ? (m.attachment.type.startsWith("audio/") ? "🎤" : m.attachment.name) : null,
    mentions: m.mentions,
    replyToBy: m.replyTo?.by ?? null,
  };
  const counters = {
    // Pathavnaryane vachlela; baki saglyanna +1 unread.
    reads: { [uid]: now() },
    unread: { [uid]: 0, ...Object.fromEntries(others.map((x) => [x, FieldValue.increment(1)])) },
    ...(m.mentions.length && { mentionUnread: Object.fromEntries(m.mentions.map((x) => [x, true])) }),
  };
  batch.set(
    t.ref,
    t.group
      ? { last, updatedAt: now(), names: { [uid]: me.name }, ...counters }
      : { members: [uid, t.to].sort(), names: { [uid]: me.name, [t.to]: t.other!.name }, last, updatedAt: now(), ...counters },
    { merge: true },
  );
  await batch.commit();

  const preview = previewOf(m);
  const msgParam = `&msg=${encodeURIComponent(msg.id)}`;
  const push = {
    link: (t.group ? `/chat?group=${encodeURIComponent(t.chatId)}` : `/chat?with=${encodeURIComponent(uid)}`) + msgParam,
    tag: `chat-${t.chatId}`,
    from: uid,
    chatId: t.chatId,
    messageId: msg.id,
  };
  if (!t.group) {
    await pushTo(t.to, { ...push, title: me.name, body: preview });
    return msg.id;
  }
  const title = t.group.name ?? "Group";
  await Promise.all(
    others.map((x) => {
      const mode = notifyOf(t.group, x);
      if (mode === "off") return null;
      if (m.mentions.includes(x)) return pushTo(x, { ...push, title, body: `${me.name} mentioned you: ${preview}` });
      if (m.replyTo?.by === x) return pushTo(x, { ...push, title, body: `${me.name} replied to you: ${preview}` });
      return mode === "all" ? pushTo(x, { ...push, title, body: `${me.name}: ${preview}` }) : null;
    }),
  );
  return msg.id;
}

export const sendChatMessage = callable<{
  /** 1:1 — samorcha user. */
  to?: string;
  /** Group — chat id (`to` aivaji). */
  chatId?: string;
  text?: string;
  attachment?: { path?: string; name?: string; duration?: number } | null;
  /** Reply — tyach chat madhla message id. */
  replyTo?: string | null;
  /** Group — mention kelele members (uid). */
  mentions?: string[];
}>(async (req) => {
  const { uid, me } = await requireCoreUser(req);
  const target = await resolveTarget(uid, req.data);
  const { chatId, ref: chat } = target;

  const text = typeof req.data.text === "string" ? req.data.text.trim() : "";
  if (text.length > 4000) fail("invalid-argument", "chatTooLong");

  let attachment: Attachment | null = null;
  if (req.data.attachment) {
    const path = str(req.data.attachment.path, "chatBadFile", 1, 400);
    // Fakt swatahchya folder madhli, ya chat chi file.
    if (!path.startsWith(`chat/${chatId}/${uid}/`) || path.includes("..")) fail("permission-denied", "chatBadFile");
    const file = getStorage().bucket().file(path);
    const [exists] = await file.exists();
    if (!exists) fail("not-found", "chatBadFile");
    const [meta] = await file.getMetadata();
    const size = Number(meta.size ?? 0);
    const type = String(meta.contentType ?? "");
    if (size <= 0 || size > chatMaxFor(type) || !chatTypeOk(type)) {
      await file.delete().catch(() => {});
      fail("invalid-argument", "chatBadFile");
    }
    const name = (typeof req.data.attachment.name === "string" && req.data.attachment.name.trim()) || path.split("/").pop()!;
    attachment = { path, name: name.slice(0, 200), size, type };
    // Voice message chi lambi (sec) — fakt dakhavnyasathi.
    const d = Number(req.data.attachment.duration);
    if (type.startsWith("audio/") && Number.isFinite(d) && d > 0) attachment.duration = Math.min(Math.round(d), 3600);
  }
  if (!text && !attachment) fail("invalid-argument", "chatEmpty");

  // Reply: fakt yach chat madhla (delete na zalela) message; tyachi chhoti copy (quote) message madhe.
  let replyTo: Quote | null = null;
  if (req.data.replyTo) {
    const id = str(req.data.replyTo, "chatBadReply", 1, 64);
    const orig = await chat.collection("messages").doc(id).get();
    if (!orig.exists || orig.get("deleted") === true) fail("not-found", "chatBadReply");
    const o = orig.data()!;
    const oa = o.attachment as { name?: string; type?: string } | null;
    replyTo = {
      id,
      by: String(o.by ?? ""),
      byName: String(o.byName ?? ""),
      text: String(o.text ?? "").slice(0, 140),
      attachment: oa?.name ?? null,
      audio: !!oa?.type?.startsWith("audio/"),
    };
  }

  // Mention fakt yach group che (itar) members.
  const mentions = target.group ? uidList(req.data.mentions).filter((x) => x !== uid && target.group!.members.includes(x)).slice(0, 50) : [];

  const id = await post(target, uid, me, { text, attachment, replyTo, mentions });
  return { id, chatId };
});

// ── Forward ──────────────────────────────────────────────────────────

const FORWARD_MAX_MESSAGES = 10;
const FORWARD_MAX_TARGETS = 5;

/** WhatsApp sarkha forward — fakt mi member aslelya chat madhun, mi pathavu shakto tithe; file chi copy. */
export const forwardChatMessages = callable<{ chatId?: string; ids?: string[]; targets?: { to?: string; chatId?: string }[] }>(async (req) => {
  const { uid, me } = await requireCoreUser(req);
  const chatId = str(req.data.chatId, "chatDenied", 3, 300);
  const { ref: source } = await loadChat(chatId, uid);
  const ids = uidList(req.data.ids).slice(0, FORWARD_MAX_MESSAGES);
  const rawTargets = Array.isArray(req.data.targets) ? req.data.targets.slice(0, FORWARD_MAX_TARGETS) : [];
  if (!ids.length || !rawTargets.length) fail("invalid-argument", "chatBadMessage");

  const snaps = await db.getAll(...ids.map((id) => source.collection("messages").doc(id)));
  const msgs = snaps
    .filter((d) => d.exists && d.get("deleted") !== true && d.get("kind") !== "system" && !((d.get("hiddenFor") as string[] | undefined) ?? []).includes(uid))
    .sort((a, b) => (a.get("at")?.toMillis?.() ?? 0) - (b.get("at")?.toMillis?.() ?? 0));
  if (!msgs.length) fail("not-found", "chatBadMessage");

  const targets: Target[] = [];
  for (const t of rawTargets) {
    const resolved = await resolveTarget(uid, t ?? {});
    if (!targets.some((x) => x.chatId === resolved.chatId)) targets.push(resolved);
  }

  const bucket = getStorage().bucket();
  for (const t of targets) {
    for (const [i, d] of msgs.entries()) {
      const o = d.data()!;
      let attachment: Attachment | null = null;
      const a = o.attachment as Attachment | null;
      if (a?.path) {
        const path = `chat/${t.chatId}/${uid}/${Date.now()}-${i}-${a.path.split("/").pop()!.replace(/^\d+-/, "")}`;
        const ok = await bucket.file(a.path).copy(bucket.file(path)).then(() => true, () => false);
        if (ok) attachment = { ...a, path };
      }
      const text = String(o.text ?? "");
      if (!text && !attachment) continue;
      await post(t, uid, me, { text, attachment, replyTo: null, mentions: [], forwarded: true });
    }
  }
  return { ok: true, chats: targets.map((t) => t.chatId) };
});

// ── Reactions / star ─────────────────────────────────────────────────

/** Ek member — ek reaction (badalta / kadhta yeto). `emoji: null` = kadha. */
export const reactChatMessage = callable<{ chatId?: string; id?: string; emoji?: string | null }>(async (req) => {
  const { uid, me } = await requireCoreUser(req);
  const chatId = str(req.data.chatId, "chatDenied", 3, 300);
  const id = str(req.data.id, "chatBadMessage", 1, 64);
  const { ref: chat, data } = await loadChat(chatId, uid);
  const emoji = req.data.emoji == null ? null : str(req.data.emoji, "chatBadReaction", 1, 16);
  if (emoji && /\s/.test(emoji)) fail("invalid-argument", "chatBadReaction");
  const ref = chat.collection("messages").doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.get("deleted") === true || snap.get("kind") === "system") fail("not-found", "chatBadMessage");
  await ref.update(new FieldPath("reactions", uid), emoji ?? FieldValue.delete());

  // Majhya message la reaction — lekhakala kalva (notify "off" sodun).
  const author = String(snap.get("by") ?? "");
  if (emoji && author && author !== uid && (!data?.type || notifyOf(data, author) !== "off") && (data?.members ?? []).includes(author)) {
    const text = String(snap.get("text") ?? "").slice(0, 60) || String(snap.get("attachment.name") ?? "");
    await pushTo(author, {
      title: data?.type === "group" ? (data.name ?? "Group") : me.name,
      body: `${me.name} reacted ${emoji} to "${text}"`,
      link: data?.type === "group" ? `/chat?group=${chatId}` : `/chat?with=${uid}`,
      tag: `chat-${chatId}`,
      from: uid,
      chatId,
    });
  }
  return { ok: true };
});

/** Star / save — fakt majhyasathi (`admins/{uid}/starred/{chatId}`; itar members la disat nahi). */
export const starChatMessages = callable<{ chatId?: string; ids?: string[]; starred?: boolean }>(async (req) => {
  const { uid } = await requireCoreUser(req);
  const chatId = str(req.data.chatId, "chatDenied", 3, 300);
  const { ref: chat } = await loadChat(chatId, uid);
  const wanted = uidList(req.data.ids).slice(0, 50);
  if (!wanted.length) fail("invalid-argument", "chatBadMessage");
  const ref = db.collection("admins").doc(uid).collection("starred").doc(chatId);
  if (req.data.starred === false) {
    await ref.set({ ids: FieldValue.arrayRemove(...wanted), updatedAt: now() }, { merge: true });
    return { ok: true };
  }
  const snaps = await db.getAll(...wanted.map((id) => chat.collection("messages").doc(id)));
  const ids = snaps.filter((d) => d.exists && d.get("deleted") !== true && d.get("kind") !== "system").map((d) => d.id);
  if (ids.length) await ref.set({ ids: FieldValue.arrayUnion(...ids), updatedAt: now() }, { merge: true });
  return { ok: true };
});

// ── Receipts (✓ / ✓✓ / blue ✓✓) ──────────────────────────────────────
//
// Pratyek message var `deliveredTo.{uid}` / `readBy.{uid}` (exact vel) — fakt recipient
// swatah (tyachya device / screen varun) lihito, server tapasto. Chat doc var `delivered.{uid}` /
// `reads.{uid}` watermark: tyachya nantarchech messages ghetle jatat — ekach message dusryanda nahi
// (restart / reconnect nantar pan same).

/** Ekda kamal kiti messages var receipt (juna chat pahilyanda ughadla tari). */
const RECEIPT_BATCH = 400;

async function stampReceipts(ref: FirebaseFirestore.DocumentReference, uid: string, read: boolean) {
  await db.runTransaction(async (tx) => {
    const chat = await tx.get(ref);
    const members = (chat.get("members") as string[] | undefined) ?? [];
    if (!chat.exists || !members.includes(uid)) return;
    const readAt = chat.get(new FieldPath("reads", uid)) as FirebaseFirestore.Timestamp | undefined;
    const gotAt = chat.get(new FieldPath("delivered", uid)) as FirebaseFirestore.Timestamp | undefined;
    // Delivered: shevtcha delivered / read nantar che; read: shevtcha read nantar che.
    const since = read ? readAt : [readAt, gotAt].filter(Boolean).sort((a, b) => b!.toMillis() - a!.toMillis())[0];
    let q = ref.collection("messages").orderBy("at", "desc").limit(RECEIPT_BATCH);
    if (since) q = q.where("at", ">", since);
    const msgs = await tx.get(q);

    for (const d of msgs.docs) {
      if (d.get("by") === uid || d.get("kind") === "system") continue;
      const to = d.get("to") as string[] | undefined;
      if (to && !to.includes(uid)) continue; // pathavla tevha member navhta
      const patch: [FirebaseFirestore.FieldPath, unknown][] = [];
      if (!d.get(new FieldPath("deliveredTo", uid))) patch.push([new FieldPath("deliveredTo", uid), now()]);
      if (read && !d.get(new FieldPath("readBy", uid))) patch.push([new FieldPath("readBy", uid), now()]);
      if (!patch.length) continue;
      const [first, ...rest] = patch;
      tx.update(d.ref, first[0], first[1], ...rest.flat());
    }
    tx.update(
      ref,
      new FieldPath("delivered", uid),
      now(),
      ...(read ? [new FieldPath("reads", uid), now(), new FieldPath("unread", uid), 0, new FieldPath("mentionUnread", uid), false] : []),
    );
  });
}

/** Navin messages ya device var pohochle (✓✓ grey) — chat list / push ala ki client pathavto. */
export const markChatDelivered = callable<{ chatIds?: string[] }>(async (req) => {
  const { uid } = await requireCoreUser(req);
  const ids = uidList(req.data.chatIds).slice(0, 50);
  await Promise.all(ids.map((id) => stampReceipts(db.collection("chats").doc(id), uid, false)));
  return { ok: true };
});

// ── Delete ───────────────────────────────────────────────────────────

/**
 * WhatsApp sarkha: `forEveryone` — fakt swatahcha message, sagळ्यांसाठी "deleted"
 * (text / file kadhto, Storage madhli file pan); nahitar fakt majhyasathi lapvto (`hiddenFor`).
 */
export const deleteChatMessage = callable<{ chatId?: string; id?: string; forEveryone?: boolean }>(async (req) => {
  const { uid } = await requireCoreUser(req);
  const chatId = str(req.data.chatId, "chatDenied", 3, 300);
  const id = str(req.data.id, "chatBadMessage", 1, 64);
  const { ref: chat } = await loadChat(chatId, uid);
  const ref = chat.collection("messages").doc(id);
  const snap = await ref.get();
  if (!snap.exists) fail("not-found", "chatBadMessage");

  if (!req.data.forEveryone) {
    await ref.update({ hiddenFor: FieldValue.arrayUnion(uid) });
    return { ok: true };
  }

  const m = snap.data()!;
  if (m.by !== uid || m.kind === "system") fail("permission-denied", "chatDeleteDenied");
  if (m.deleted === true) return { ok: true };
  const path = (m.attachment as { path?: string } | null)?.path;
  await ref.update({ deleted: true, text: "", attachment: null, replyTo: null, deletedAt: now() });
  if (path) await getStorage().bucket().file(path).delete().catch(() => {});
  // Shevatcha message hota tar list madhla preview pan.
  await db.runTransaction(async (tx) => {
    const c = await tx.get(chat);
    if (c.get("last.id") === id) tx.update(chat, { "last.text": "", "last.attachment": null, "last.deleted": true });
  });
  return { ok: true };
});

/** WhatsApp sarkha — pathavlyapasun itkya vel edit. */
const EDIT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Message edit — fakt swatahcha (call / system / forwarded / deleted nahi), `EDIT_WINDOW_MS` aat.
 * Text (ani group mentions) badalto, `editedAt` lavto; shevatcha message asel tar list cha preview pan.
 */
export const editChatMessage = callable<{ chatId?: string; id?: string; text?: string; mentions?: string[] }>(async (req) => {
  const { uid } = await requireCoreUser(req);
  const chatId = str(req.data.chatId, "chatDenied", 3, 300);
  const id = str(req.data.id, "chatBadMessage", 1, 64);
  const { ref: chat, data, group } = await loadChat(chatId, uid);
  const ref = chat.collection("messages").doc(id);
  const snap = await ref.get();
  if (!snap.exists) fail("not-found", "chatBadMessage");

  const m = snap.data()!;
  if (m.by !== uid || m.kind === "system" || m.kind === "call" || m.deleted === true || m.forwarded === true) fail("permission-denied", "chatEditDenied");
  const sentAt = (m.at as FirebaseFirestore.Timestamp | undefined)?.toMillis() ?? 0;
  if (Date.now() - sentAt > EDIT_WINDOW_MS) fail("failed-precondition", "chatEditExpired");

  const text = typeof req.data.text === "string" ? req.data.text.trim() : "";
  if (text.length > 4000) fail("invalid-argument", "chatTooLong");
  if (!text && !m.attachment) fail("invalid-argument", "chatEmpty");
  if (text === m.text) return { ok: true };

  const members = group ? (data?.members ?? []) : [];
  const mentions = uidList(req.data.mentions).filter((x) => x !== uid && members.includes(x)).slice(0, 50);
  await ref.update({ text, mentions, editedAt: now() });
  await db.runTransaction(async (tx) => {
    const c = await tx.get(chat);
    if (c.get("last.id") === id) tx.update(chat, { "last.text": text.slice(0, 140), "last.mentions": mentions, "last.edited": true });
  });
  return { ok: true };
});

// ── Groups ───────────────────────────────────────────────────────────

const groupDescription = (v: unknown) => {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string" || v.trim().length > GROUP_DESC_MAX) fail("invalid-argument", "groupBadDescription");
  return (v as string).trim();
};

/** Group photo path — fakt swatahne ya group sathi upload keleli image. */
async function groupPhoto(chatId: string, uid: string, v: unknown) {
  const path = str(v, "groupBadPhoto", 1, 400);
  const dir = `chat/${chatId}/${uid}/`;
  if (!path.startsWith(dir) || path.includes("..") || !path.slice(dir.length).startsWith(GROUP_PHOTO_PREFIX)) fail("permission-denied", "groupBadPhoto");
  const file = getStorage().bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) fail("not-found", "groupBadPhoto");
  const [meta] = await file.getMetadata();
  const size = Number(meta.size ?? 0);
  if (size <= 0 || size > CHAT_MAX_BYTES || !GROUP_PHOTO_TYPE.test(String(meta.contentType ?? ""))) {
    await file.delete().catch(() => {});
    fail("invalid-argument", "groupBadPhoto");
  }
  return path;
}

/** Navin group — banavnara admin. Members fakt active Core Users (internal team). Photo nantar `updateChatGroup` ne. */
export const createChatGroup = callable<{ name?: string; description?: string; members?: string[] }>(async (req) => {
  const { uid, me } = await requireCoreUser(req);
  const name = str(req.data.name, "groupBadName", 1, GROUP_NAME_MAX);
  const description = groupDescription(req.data.description);
  const wanted = uidList(req.data.members).filter((m) => m !== uid);
  if (!wanted.length || wanted.length + 1 > GROUP_MAX_MEMBERS) fail("invalid-argument", "groupBadMembers");
  const users = await activeUsers(wanted);
  if (users.size !== wanted.length) fail("failed-precondition", "chatBadUser");

  const chat = db.collection("chats").doc();
  const members = [uid, ...wanted];
  const batch = db.batch();
  batch.set(chat, {
    type: "group",
    name,
    description,
    photo: null,
    members,
    admins: [uid],
    muted: [],
    createdBy: uid,
    names: { [uid]: me.name, ...Object.fromEntries(users) },
    last: { id: null, text: `${me.name} created group "${name}"`, by: uid, byName: me.name, attachment: null, system: true },
    createdAt: now(),
    updatedAt: now(),
    reads: { [uid]: now() },
  });
  systemMessage(batch, chat, uid, me.name, `${me.name} created group "${name}"`);
  await batch.commit();
  await Promise.all(
    wanted.map((m) => pushTo(m, { title: name, body: `${me.name} added you`, link: `/chat?group=${chat.id}`, tag: `chat-${chat.id}`, from: uid, chatId: chat.id })),
  );
  return { chatId: chat.id };
});

/**
 * Group settings — sagle badal fakt group admin: naav, photo (`null` = kadha), description,
 * members add / remove, admin banva (`promote`) / kadha (`demote`).
 */
export const updateChatGroup = callable<{
  chatId?: string;
  name?: string;
  description?: string;
  photo?: string | null;
  add?: string[];
  remove?: string[];
  promote?: string[];
  demote?: string[];
  /** Group settings: fakt admins message pathavu shaktat. */
  onlyAdminsSend?: boolean;
}>(async (req) => {
  const { uid, me } = await requireCoreUser(req);
  const chatId = str(req.data.chatId, "chatDenied", 3, 300);
  const { ref, data, group } = await loadChat(chatId, uid);
  if (!group) fail("invalid-argument", "chatDenied");
  if (!(data!.admins ?? []).includes(uid)) fail("permission-denied", "groupAdminOnly");

  // Lamb kaam (users / Storage) transaction chya adhi.
  const add = uidList(req.data.add).filter((m) => !data!.members.includes(m));
  const added = add.length ? await activeUsers(add) : new Map<string, string>();
  if (added.size !== add.length) fail("failed-precondition", "chatBadUser");
  const photo = req.data.photo === undefined ? undefined : req.data.photo === null ? null : await groupPhoto(chatId, uid, req.data.photo);
  const name = req.data.name === undefined ? undefined : str(req.data.name, "groupBadName", 1, GROUP_NAME_MAX);
  const description = req.data.description === undefined ? undefined : groupDescription(req.data.description);

  const result = await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data() as ChatDoc | undefined;
    if (!cur || !cur.members.includes(uid) || !(cur.admins ?? []).includes(uid)) fail("permission-denied", "groupAdminOnly");
    const names = { ...(cur!.names ?? {}) };
    const update: Record<string, unknown> = {};
    const notes: string[] = [];
    let oldPhoto: string | null = null;

    if (name !== undefined && name !== cur!.name) {
      update.name = name;
      notes.push(`${me.name} changed the group name to "${name}"`);
    }
    if (description !== undefined && description !== (cur!.description ?? "")) {
      update.description = description;
      notes.push(`${me.name} ${description ? "changed" : "removed"} the group description`);
    }
    if (photo !== undefined && photo !== (cur!.photo ?? null)) {
      update.photo = photo;
      oldPhoto = cur!.photo ?? null;
      notes.push(`${me.name} ${photo ? "changed" : "removed"} the group photo`);
    }

    let members = [...cur!.members];
    let admins = [...(cur!.admins ?? [])];
    const fresh = [...added.keys()].filter((m) => !members.includes(m));
    if (fresh.length) {
      if (members.length + fresh.length > GROUP_MAX_MEMBERS) fail("invalid-argument", "groupBadMembers");
      members.push(...fresh);
      for (const m of fresh) names[m] = added.get(m)!;
      notes.push(`${me.name} added ${fresh.map((m) => names[m]).join(", ")}`);
    }
    const remove = uidList(req.data.remove).filter((m) => m !== uid && members.includes(m));
    if (remove.length) {
      members = members.filter((m) => !remove.includes(m));
      admins = admins.filter((a) => !remove.includes(a));
      notes.push(`${me.name} removed ${remove.map((r) => names[r] ?? "a member").join(", ")}`);
    }
    const promote = uidList(req.data.promote).filter((m) => members.includes(m) && !admins.includes(m));
    if (promote.length) {
      admins.push(...promote);
      notes.push(`${me.name} made ${promote.map((m) => names[m] ?? "a member").join(", ")} a group admin`);
    }
    // Swatahla demote nahi — shevatcha admin rahnar nahi asa hou naye.
    const demote = uidList(req.data.demote).filter((m) => m !== uid && admins.includes(m));
    if (demote.length) {
      admins = admins.filter((a) => !demote.includes(a));
      notes.push(`${me.name} dismissed ${demote.map((m) => names[m] ?? "a member").join(", ")} as admin`);
    }
    if (typeof req.data.onlyAdminsSend === "boolean" && req.data.onlyAdminsSend !== (cur!.onlyAdminsSend === true)) {
      update.onlyAdminsSend = req.data.onlyAdminsSend;
      notes.push(
        req.data.onlyAdminsSend
          ? `${me.name} changed this group's settings to allow only admins to send messages`
          : `${me.name} changed this group's settings to allow all members to send messages`,
      );
    }
    const none = { fresh: [] as string[], removed: [] as string[], promoted: [] as string[], demoted: [] as string[] };
    if (!notes.length) return { ...none, title: cur!.name ?? "Group", oldPhoto: null };

    if (fresh.length || remove.length) {
      update.members = members;
      update.muted = (cur!.muted ?? []).filter((m) => members.includes(m));
      update.names = names;
    }
    if (fresh.length || remove.length || promote.length || demote.length) update.admins = admins;
    update.last = { id: null, text: notes[notes.length - 1], by: uid, byName: me.name, attachment: null, system: true };
    update.updatedAt = now();
    for (const n of notes) {
      tx.set(ref.collection("messages").doc(), { kind: "system", by: uid, byName: me.name, text: n, attachment: null, replyTo: null, at: now() });
    }
    tx.update(ref, update);
    return { fresh, removed: remove, promoted: promote, demoted: demote, title: (update.name as string | undefined) ?? cur!.name ?? "Group", oldPhoto };
  });

  if (result.oldPhoto) await getStorage().bucket().file(result.oldPhoto).delete().catch(() => {});
  // Jyanchya sathi badal ahe tyanna kalva (add / remove / admin).
  const note = (m: string, body: string) => pushTo(m, { title: result.title, body, link: `/chat?group=${chatId}`, tag: `chat-${chatId}`, from: uid, chatId });
  await Promise.all([
    ...result.fresh.map((m) => note(m, `${me.name} added you`)),
    ...result.removed.map((m) => note(m, `${me.name} removed you`)),
    ...result.promoted.map((m) => note(m, `${me.name} made you a group admin`)),
    ...result.demoted.map((m) => note(m, `${me.name} dismissed you as admin`)),
  ]);
  return { ok: true };
});

/** Group notifications — fakt majhyasathi: all / mentions (mention + reply) / off. */
export const setChatNotify = callable<{ chatId?: string; mode?: string }>(async (req) => {
  const { uid } = await requireCoreUser(req);
  const chatId = str(req.data.chatId, "chatDenied", 3, 300);
  const { ref, group } = await loadChat(chatId, uid);
  if (!group) fail("invalid-argument", "chatDenied");
  const mode = NOTIFY_MODES.includes(req.data.mode as NotifyMode) ? (req.data.mode as NotifyMode) : "all";
  await ref.update(new FieldPath("notify", uid), mode, "muted", mode === "off" ? FieldValue.arrayUnion(uid) : FieldValue.arrayRemove(uid));
  return { ok: true };
});

/** Juna client (mute on / off). */
export const muteChatGroup = callable<{ chatId?: string; muted?: boolean }>(async (req) => {
  const { uid } = await requireCoreUser(req);
  const chatId = str(req.data.chatId, "chatDenied", 3, 300);
  const { ref, group } = await loadChat(chatId, uid);
  if (!group) fail("invalid-argument", "chatDenied");
  const off = req.data.muted === true;
  await ref.update(new FieldPath("notify", uid), off ? "off" : "all", "muted", off ? FieldValue.arrayUnion(uid) : FieldValue.arrayRemove(uid));
  return { ok: true };
});

/** Group sodne — shevatcha admin gela tar sarvat juna member admin. */
export const leaveChatGroup = callable<{ chatId?: string }>(async (req) => {
  const { uid, me } = await requireCoreUser(req);
  const chatId = str(req.data.chatId, "chatDenied", 3, 300);
  const { ref, data, group } = await loadChat(chatId, uid);
  if (!group) fail("invalid-argument", "chatDenied");
  const members = data!.members.filter((m) => m !== uid);
  let admins = (data!.admins ?? []).filter((a) => a !== uid);
  if (!admins.length && members.length) admins = [members[0]];
  const batch = db.batch();
  const text = `${me.name} left`;
  systemMessage(batch, ref, uid, me.name, text);
  batch.update(ref, {
    members,
    admins,
    muted: FieldValue.arrayRemove(uid),
    last: { id: null, text, by: uid, byName: me.name, attachment: null, system: true },
    updatedAt: now(),
  });
  await batch.commit();
  return { ok: true };
});

/** Chat ughadla — "vachla" vel (unread dot sathi). */
export const markChatRead = callable<{ chatId?: string }>(async (req) => {
  const { uid } = await requireCoreUser(req);
  const chatId = str(req.data.chatId, "chatBadUser", 3, 300);
  const { ref, data } = await loadChat(chatId, uid);
  if (!data) return { ok: true };
  // Fakt user ne chat screen var pahila tevha (client tapasto) — read ⇒ delivered pan.
  await stampReceipts(ref, uid, true);
  return { ok: true };
});
