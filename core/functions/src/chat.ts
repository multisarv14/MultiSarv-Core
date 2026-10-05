/**
 * Internal Chat — fakt Core Users (`admins`, active). Project users core madhe
 * nastat, mhanun tyanna kahich access nahi.
 *
 * `chats/{a__b}` (don uids sort karun) = 1:1 chat; `messages` subcollection.
 * Attachments Storage `chat/{chatId}/{uid}/…` — client upload karto (storage
 * rules), server metadata tapasun (size / type) message madhe jodto.
 */
import { getMessaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import type { CallableRequest } from "firebase-functions/v2/https";

import { callable, db, FieldValue, fail, loadAdmin, now, str, type AdminDoc } from "./shared.js";

/** Storage rules sobat same. */
export const CHAT_MAX_BYTES = 10 * 1024 * 1024;
const CHAT_TYPES = [
  /^image\/(png|jpe?g|gif|webp)$/,
  /^application\/pdf$/,
  /^text\/(plain|csv)$/,
  /^application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-excel|vnd\.ms-powerpoint)$/,
  /^application\/(zip|x-zip-compressed)$/,
  // Voice messages (MediaRecorder: Chrome webm/ogg, Safari mp4) ani audio files.
  /^audio\/(webm|ogg|mp4|mpeg|aac|x-m4a|wav)$/,
];
export const chatTypeOk = (t: string) => CHAT_TYPES.some((r) => r.test(t));

export const chatIdOf = (a: string, b: string) => [a, b].sort().join("__");

/** Active Core User — nahitar kahich nahi. */
async function requireCoreUser(req: CallableRequest<unknown>) {
  const uid = req.auth?.uid;
  if (!uid) fail("unauthenticated", "signIn");
  const me = await loadAdmin(uid!);
  if (!me?.active) fail("permission-denied", "disabled");
  return { uid: uid!, me: me! };
}

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

export const sendChatMessage = callable<{
  to?: string;
  text?: string;
  attachment?: { path?: string; name?: string; duration?: number } | null;
  /** Reply — tyach chat madhla message id. */
  replyTo?: string | null;
}>(async (req) => {
  const { uid, me } = await requireCoreUser(req);
  const to = str(req.data.to, "chatBadUser", 1, 128);
  if (to === uid) fail("invalid-argument", "chatBadUser");
  const other = await loadAdmin(to);
  if (!other?.active) fail("failed-precondition", "chatBadUser");

  const text = typeof req.data.text === "string" ? req.data.text.trim() : "";
  if (text.length > 4000) fail("invalid-argument", "chatTooLong");
  const chatId = chatIdOf(uid, to);

  let attachment: { path: string; name: string; size: number; type: string; duration?: number } | null = null;
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
    if (size <= 0 || size > CHAT_MAX_BYTES || !chatTypeOk(type)) {
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

  const chat = db.collection("chats").doc(chatId);

  // Reply: fakt yach chat madhla message; tyachi chhoti copy (quote) message madhe.
  let replyTo: { id: string; by: string; byName: string; text: string; attachment: string | null; audio: boolean } | null = null;
  if (req.data.replyTo) {
    const id = str(req.data.replyTo, "chatBadReply", 1, 64);
    const orig = await chat.collection("messages").doc(id).get();
    if (!orig.exists) fail("not-found", "chatBadReply");
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

  const msg = chat.collection("messages").doc();
  const batch = db.batch();
  batch.set(msg, { by: uid, byName: me.name, text, attachment, replyTo, at: now() });
  batch.set(
    chat,
    {
      members: [uid, to].sort(),
      names: { [uid]: me.name, [to]: other!.name },
      last: {
        text: text.slice(0, 140),
        by: uid,
        attachment: attachment ? (attachment.type.startsWith("audio/") ? "🎤" : attachment.name) : null,
      },
      updatedAt: now(),
      // Pathavnaryane vachlela.
      reads: { [uid]: now() },
    },
    { merge: true },
  );
  await batch.commit();
  await pushTo(to, {
    title: me.name,
    body: text ? text.slice(0, 160) : attachment?.type.startsWith("audio/") ? "🎤 Voice message" : `📎 ${attachment?.name ?? ""}`,
    link: `/chat?with=${encodeURIComponent(uid)}`,
    tag: `chat-${chatId}`,
  });
  return { id: msg.id, chatId };
});

// ── Push (PWA / browser) ─────────────────────────────────────────────

/**
 * Ha browser / PWA cha FCM token — user la EKACH token (`pushTokens: [token]`):
 * navin login / refresh zala ki juna badalto, mhanje push shevtchya device var.
 * `remove` = logout (fakt hach token asel tar kadhto).
 */
export const registerCorePush = callable<{ token?: string; remove?: boolean }>(async (req) => {
  const { uid } = await requireCoreUser(req);
  const token = str(req.data.token, "badPushToken", 20, 4096);
  const ref = db.collection("admins").doc(uid);
  await ref.update({ pushTokens: req.data.remove ? FieldValue.arrayRemove(token) : [token] });
  return { ok: true };
});

/** Swatahchya devices var test notification — "notification bar madhe yete ka" tapasnyasathi. */
export const testCorePush = callable(async (req) => {
  const { uid, me } = await requireCoreUser(req);
  const tokens = (me as AdminDoc & { pushTokens?: string[] }).pushTokens ?? [];
  if (!tokens.length) return { devices: 0, sent: 0 };
  // `force` — app samor asla tari notification bar madhe dakhva (test).
  const sent = await pushTo(uid, { title: "MultiSarv", body: "🔔 Test notification", link: "/chat", tag: `test-${Date.now()}`, force: true });
  return { devices: tokens.length, sent };
});

/** Recipient chya sagle devices la push; kharab tokens kadhto. Push fail zala tari message jato. */
async function pushTo(uid: string, n: { title: string; body: string; link: string; tag: string; force?: boolean }): Promise<number> {
  try {
    const a = (await loadAdmin(uid)) as (AdminDoc & { pushTokens?: string[] }) | null;
    const tokens = a?.active ? (a.pushTokens ?? []) : [];
    if (!tokens.length) return 0;
    const res = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title: n.title, body: n.body },
      data: { link: n.link, kind: "chat", tag: n.tag, ...(n.force && { force: "1" }) },
      webpush: {
        headers: { Urgency: "high" },
        notification: { icon: "/icon-192.png", badge: "/favicon-32.png", tag: n.tag, renotify: true, silent: false },
        fcmOptions: { link: n.link },
      },
    });
    const dead = res.responses
      .map((r, i) => (!r.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(r.error?.code ?? "") ? tokens[i] : null))
      .filter((t): t is string => !!t);
    if (dead.length) await db.collection("admins").doc(uid).update({ pushTokens: FieldValue.arrayRemove(...dead) });
    return res.successCount;
  } catch (err) {
    logger.warn("chat push failed", { uid, err });
    return 0;
  }
}

/** Chat ughadla — "vachla" vel (unread dot sathi). */
export const markChatRead = callable<{ chatId?: string }>(async (req) => {
  const { uid } = await requireCoreUser(req);
  const chatId = str(req.data.chatId, "chatBadUser", 3, 300);
  if (!chatId.split("__").includes(uid)) fail("permission-denied", "chatDenied");
  const ref = db.collection("chats").doc(chatId);
  if (!(await ref.get()).exists) return { ok: true };
  await ref.set({ reads: { [uid]: now() } }, { merge: true });
  return { ok: true };
});
