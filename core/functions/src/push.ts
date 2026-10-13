/**
 * Core push (FCM) — Internal Chat ani Tickets.
 *
 * Kuthe jato: user ne phone app (android / ios) madhe login kela asel tar FAKT
 * phone var; app nasel tar web (browser / PWA) var. Test notification — jya
 * device varun test kela tyach device var.
 */
import { createHash } from "node:crypto";

import { getMessaging } from "firebase-admin/messaging";
import { logger } from "firebase-functions";

import { callable, db, FieldValue, fail, loadAdmin, str, type AdminDoc } from "./shared.js";

/** Ekach user che kamal devices. */
const MAX_PUSH_DEVICES = 10;
const PLATFORMS = ["android", "ios", "web"] as const;
type Platform = (typeof PLATFORMS)[number];
const MOBILE: readonly string[] = ["android", "ios"];

interface PushDevice {
  token: string;
  platform: Platform;
  at: number;
}

type PushAdmin = AdminDoc & { pushTokens?: string[]; pushDevices?: Record<string, PushDevice> };

async function requireCoreUser(req: { auth?: { uid: string } }) {
  const uid = req.auth?.uid;
  if (!uid) fail("unauthenticated", "signIn");
  const me = await loadAdmin(uid!);
  if (!me?.active) fail("permission-denied", "disabled");
  return { uid: uid!, me: me as PushAdmin };
}

/** Juna client (deviceId nahi) — token varun sthir id. */
const legacyId = (token: string) => "t-" + createHash("sha1").update(token).digest("hex").slice(0, 20);

/**
 * Ha device cha FCM token — `pushDevices.{deviceId} = {token, platform, at}`.
 * Pratyek device (phone app / browser) swatahchi entry badalto; dusrya device cha token
 * pusat nahi. Kamal `MAX_PUSH_DEVICES` (sarvat juna kadhto). `remove` = logout (fakt ha device).
 * Hach token dusrya user kade asel (ekach phone / browser var dusra login) tar tithun kadhto —
 * nahitar juna user che notifications ya device var yetil.
 */
export const registerCorePush = callable<{ token?: string; remove?: boolean; deviceId?: string; platform?: string }>(async (req) => {
  const { uid } = await requireCoreUser(req);
  const token = str(req.data.token, "badPushToken", 20, 4096);
  const deviceId =
    typeof req.data.deviceId === "string" && /^[\w-]{8,64}$/.test(req.data.deviceId) ? req.data.deviceId : legacyId(token);
  const platform: Platform = PLATFORMS.includes(req.data.platform as Platform) ? (req.data.platform as Platform) : "web";
  const ref = db.collection("admins").doc(uid);

  await db.runTransaction(async (tx) => {
    const a = (await tx.get(ref)).data() as PushAdmin | undefined;
    const devices = { ...(a?.pushDevices ?? {}) };
    // Hach token dusrya id khali (juna client / reinstall) — kadha.
    for (const [id, d] of Object.entries(devices)) if (id === deviceId || d.token === token) delete devices[id];
    if (!req.data.remove) {
      devices[deviceId] = { token, platform, at: Date.now() };
      const keep = Object.entries(devices)
        .sort((x, y) => y[1].at - x[1].at)
        .slice(0, MAX_PUSH_DEVICES);
      tx.update(ref, { pushDevices: Object.fromEntries(keep), pushTokens: FieldValue.arrayRemove(token) });
    } else {
      tx.update(ref, { pushDevices: devices, pushTokens: FieldValue.arrayRemove(token) });
    }
  });
  if (!req.data.remove) await dropTokenElsewhere(uid, token);
  return { ok: true };
});

/** Internal team — admins thode; map values var query nahi mhanun sagle vachto. */
async function dropTokenElsewhere(uid: string, token: string) {
  try {
    const snap = await db.collection("admins").get();
    await Promise.all(
      snap.docs
        .filter((d) => d.id !== uid)
        .filter((d) => {
          const a = d.data() as PushAdmin;
          return Object.values(a.pushDevices ?? {}).some((x) => x.token === token) || (a.pushTokens ?? []).includes(token);
        })
        .map((d) => removeTokens(d.id, [token])),
    );
  } catch (err) {
    logger.warn("push token cleanup failed", { uid, err });
  }
}

async function removeTokens(uid: string, dead: string[]) {
  const ref = db.collection("admins").doc(uid);
  await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data() as PushAdmin | undefined;
    const devices = Object.fromEntries(Object.entries(cur?.pushDevices ?? {}).filter(([, d]) => !dead.includes(d.token)));
    tx.update(ref, { pushDevices: devices, pushTokens: FieldValue.arrayRemove(...dead) });
  });
}

/** User che sagle devices (navin `pushDevices` + juna `pushTokens`). */
function devicesOf(a: PushAdmin | null) {
  const list: { id: string; token: string; platform: Platform | "unknown" }[] = Object.entries(a?.pushDevices ?? {}).map(([id, d]) => ({
    id,
    token: d.token,
    platform: d.platform,
  }));
  for (const t of a?.pushTokens ?? []) if (!list.some((d) => d.token === t)) list.push({ id: legacyId(t), token: t, platform: "unknown" });
  return list;
}

/** Phone app asel tar fakt phone; nahitar web / juna. */
function targets(a: PushAdmin | null) {
  const all = devicesOf(a);
  const mobile = all.filter((d) => MOBILE.includes(d.platform));
  return mobile.length ? mobile : all;
}

/**
 * Test notification — "notification bar madhe yete ka" tapasnyasathi. `deviceId` dila
 * (ha phone / browser) tar fakt tyach device var; nahitar normal niyam (phone → web).
 */
export const testCorePush = callable<{ deviceId?: string }>(async (req) => {
  const { uid, me } = await requireCoreUser(req);
  const all = devicesOf(me);
  const own = typeof req.data?.deviceId === "string" ? all.filter((d) => d.id === req.data.deviceId) : [];
  const list = own.length ? own : targets(me);
  if (!list.length) return { devices: 0, sent: 0, platforms: [] };
  // `force` — app samor asla tari notification bar madhe dakhva (test).
  const sent = await pushTo(
    uid,
    { title: "MultiSarv", body: "🔔 Test notification", link: "/chat", tag: `test-${Date.now()}`, force: true },
    list.map((d) => d.token),
  );
  return { devices: list.length, sent, platforms: list.map((d) => d.platform) };
});

export interface PushMessage {
  title: string;
  body: string;
  link: string;
  tag: string;
  /** Phone app: `chat` → chat ughadto, `ticket` → ticket. */
  kind?: "chat" | "ticket" | "call";
  from?: string;
  chatId?: string;
  /** Chat — tap kela ki ha message (mention / reply) dakhva. */
  messageId?: string;
  /** Incoming call — tap / app madhe ring. */
  callId?: string;
  /** audio / video (phone app cha native ring screen). */
  callType?: string;
  ticketId?: string;
  force?: boolean;
}

/**
 * Recipient la push (phone asel tar phone, nahitar web); kharab tokens kadhto.
 * `only` = he tokens (test). Push fail zala tari mool kaam (message / ticket) hote.
 */
export async function pushTo(uid: string, n: PushMessage, only?: string[]): Promise<number> {
  try {
    const a = (await loadAdmin(uid)) as PushAdmin | null;
    const tokens = !a?.active ? [] : only ?? targets(a).map((d) => d.token);
    if (!tokens.length) return 0;
    const kind = n.kind ?? "chat";
    const res = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title: n.title, body: n.body },
      // `fromUid` / `chatId` / `ticketId` — phone app thet tithe ughadto.
      // `from` FCM cha reserved key ahe ("Invalid data payload key") — to vaparla tar push jatach nahi.
      data: {
        link: n.link,
        kind,
        tag: n.tag,
        ...(n.from && { fromUid: n.from }),
        ...(n.chatId && { chatId: n.chatId }),
        ...(n.messageId && { messageId: n.messageId }),
        ...(n.callId && { callId: n.callId }),
        ...(n.callType && { callType: n.callType }),
        ...(n.ticketId && { ticketId: n.ticketId }),
        ...(n.force && { force: "1" }),
      },
      android: { priority: "high", notification: { channelId: kind === "ticket" ? "tickets" : "chat", tag: n.tag, sound: "default" } },
      apns: { payload: { aps: { sound: "default", threadId: n.tag } } },
      webpush: {
        headers: { Urgency: "high" },
        notification: { icon: "/icon-192.png", badge: "/favicon-32.png", tag: n.tag, renotify: true, silent: false },
        fcmOptions: { link: n.link },
      },
    });
    // Fakt token mrut asel tarach kadha — `invalid-argument` payload chi chuk pan asu shakte
    // (tasa kadhla tar ekach chukimule sagle tokens udtat).
    const dead = res.responses
      .map((r, i) => (!r.success && /registration-token-not-registered|invalid-registration-token/.test(r.error?.code ?? "") ? tokens[i] : null))
      .filter((t): t is string => !!t);
    if (dead.length) await removeTokens(uid, dead);
    const failed = res.responses.filter((r) => !r.success).map((r) => `${r.error?.code}: ${r.error?.message}`);
    if (failed.length) logger.warn("push not delivered", { uid, kind, failed });
    return res.successCount;
  } catch (err) {
    logger.warn("push failed", { uid, err });
    return 0;
  }
}
