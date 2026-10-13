/**
 * 1:1 Audio / Video calls (WebRTC) — fakt active Core Users (chat sarkhech).
 *
 * Media thet don browser / phone madhe (WebRTC, peer-to-peer; network ne adavla tar TURN relay).
 * Signalling Firestore var — Socket server nahi, chat sarkhe live listeners:
 *   calls/{id}               — server lihito (start / answer / end), don participants vachtat
 *   calls/{id}/candidates    — ICE candidates, participant swatahche lihito (rules tapasat)
 * Call samplyavar 1:1 chat madhe history message (`kind: "call"`) — missed / declined / vel.
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";

import { chatIdOf } from "./chat.js";
import { pushTo } from "./push.js";
import { callable, db, FieldValue, fail, loadAdmin, now, str, type AdminDoc } from "./shared.js";

type CallType = "audio" | "video";
type Status = "ringing" | "accepted" | "connected" | "ended";
type Outcome = "completed" | "missed" | "declined" | "cancelled" | "busy" | "failed";

interface CallDoc {
  caller: string;
  callee: string;
  names: Record<string, string>;
  type: CallType;
  status: Status;
  active: boolean;
  outcome: Outcome | null;
  chatId: string;
  createdAt: FirebaseFirestore.Timestamp;
  acceptedAt?: FirebaseFirestore.Timestamp | null;
  connectedAt?: FirebaseFirestore.Timestamp | null;
  beat?: FirebaseFirestore.Timestamp | null;
}

/** Itka vel uchalla nahi tar missed (client pan ha vel vaparto). */
export const RING_SECONDS = 45;
/** Connected call cha heartbeat itka juna — browser band / net gela → samplela. */
const STALE_SECONDS = 90;
const SDP_MAX = 30_000;

async function requireCoreUser(req: { auth?: { uid: string } }) {
  const uid = req.auth?.uid;
  if (!uid) fail("unauthenticated", "signIn");
  const me = await loadAdmin(uid!);
  if (!me?.active) fail("permission-denied", "disabled");
  return { uid: uid!, me: me! };
}

function sdpOf(v: unknown, type: "offer" | "answer") {
  const s = v as { type?: unknown; sdp?: unknown } | null;
  if (!s || s.type !== type || typeof s.sdp !== "string" || !s.sdp.length || s.sdp.length > SDP_MAX) fail("invalid-argument", "callBadSignal");
  return { type, sdp: s!.sdp as string };
}

/** Call doc + mi participant ahe ka. */
async function loadCall(id: unknown, uid: string) {
  const ref = db.collection("calls").doc(str(id, "callNotFound", 5, 64));
  const snap = await ref.get();
  const c = snap.data() as CallDoc | undefined;
  if (!c) fail("not-found", "callNotFound");
  if (c!.caller !== uid && c!.callee !== uid) fail("permission-denied", "callDenied");
  return { ref, c: c! };
}

const ms = (t: FirebaseFirestore.Timestamp | null | undefined) => (t ? t.toMillis() : 0);

/** Ha user dusrya (jivant) call madhe ahe ka — juna / atakleli calls sodun. */
async function busy(uid: string) {
  const [a, b] = await Promise.all([
    db.collection("calls").where("caller", "==", uid).where("active", "==", true).get(),
    db.collection("calls").where("callee", "==", uid).where("active", "==", true).get(),
  ]);
  const t = Date.now();
  return [...a.docs, ...b.docs].some((d) => {
    const c = d.data() as CallDoc;
    if (c.status === "ringing") return t - ms(c.createdAt) < (RING_SECONDS + 15) * 1000;
    return t - Math.max(ms(c.beat), ms(c.acceptedAt), ms(c.createdAt)) < STALE_SECONDS * 1000;
  });
}

const label = (type: CallType) => (type === "video" ? "video call" : "voice call");
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Chat list / juna app sathi text (web `kind: "call"` varun swatahcha dakhavto). */
function historyText(type: CallType, outcome: Outcome, duration: number) {
  const icon = type === "video" ? "🎥" : "📞";
  const what = label(type);
  switch (outcome) {
    case "completed":
      return `${icon} ${what[0].toUpperCase()}${what.slice(1)} · ${mmss(duration)}`;
    case "missed":
    case "cancelled":
      return `${icon} Missed ${what}`;
    case "declined":
      return `${icon} ${what[0].toUpperCase()}${what.slice(1)} · Declined`;
    case "busy":
      return `${icon} ${what[0].toUpperCase()}${what.slice(1)} · Busy`;
    default:
      return `${icon} ${what[0].toUpperCase()}${what.slice(1)} · Failed`;
  }
}

/**
 * Call sample — ekdach (transaction). 1:1 chat madhe history message; missed asel tar
 * callee la unread + push.
 */
async function finish(ref: FirebaseFirestore.DocumentReference, decide: (c: CallDoc) => { outcome: Outcome; by: string } | null) {
  const done = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const c = snap.data() as CallDoc | undefined;
    if (!c || !c.active) return null;
    const d = decide(c);
    if (!d) return null;
    // Sweep ne samplela (browser gela) — vel shevatchya heartbeat paryant.
    const end = d.by === "system" && c.beat ? ms(c.beat) : Date.now();
    const from = ms(c.connectedAt);
    const duration = d.outcome === "completed" && from ? Math.max(0, Math.round((end - from) / 1000)) : 0;
    tx.update(ref, { status: "ended", active: false, outcome: d.outcome, endedBy: d.by, endedAt: now(), duration });

    // History — pathavnara = caller (WhatsApp sarkha).
    const chat = db.collection("chats").doc(c.chatId);
    const text = historyText(c.type, d.outcome, duration);
    const missed = d.outcome === "missed" || d.outcome === "cancelled";
    const msg = chat.collection("messages").doc();
    tx.set(msg, {
      kind: "call",
      call: { id: ref.id, type: c.type, outcome: d.outcome, duration },
      by: c.caller,
      byName: c.names[c.caller] ?? "",
      text,
      attachment: null,
      replyTo: null,
      mentions: [],
      to: [c.callee],
      at: now(),
    });
    tx.set(
      chat,
      {
        members: [c.caller, c.callee].sort(),
        names: c.names,
        last: { id: msg.id, text, by: c.caller, byName: c.names[c.caller] ?? "", attachment: null, mentions: [], replyToBy: null },
        updatedAt: now(),
        reads: { [c.caller]: now() },
        unread: { [c.caller]: 0, ...(missed && { [c.callee]: FieldValue.increment(1) }) },
      },
      { merge: true },
    );
    return { c, outcome: d.outcome, text, missed };
  });
  if (done?.missed) {
    await pushTo(done.c.callee, {
      kind: "chat",
      title: done.c.names[done.c.caller] ?? "MultiSarv",
      body: done.text,
      link: `/chat?with=${encodeURIComponent(done.c.caller)}`,
      tag: `call-${ref.id}`,
      from: done.c.caller,
      chatId: done.c.chatId,
    });
  }
  return done;
}

// ── Callables ────────────────────────────────────────────────────────

/** STUN / TURN — TURN che credentials fakt server kade (`settings/callServers`, client la vachta yet nahi). */
export const getCallConfig = callable(async (req) => {
  await requireCoreUser(req);
  const iceServers: { urls: string | string[]; username?: string; credential?: string }[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  try {
    const cfg = (await db.collection("settings").doc("callServers").get()).data() as
      | { turn?: { urls: string | string[]; username?: string; credential?: string }[]; cloudflare?: { keyId?: string; apiToken?: string } }
      | undefined;
    if (cfg?.cloudflare?.keyId && cfg.cloudflare.apiToken) {
      // Cloudflare TURN — thoda vel chalnare (1 taas) credentials.
      // Navin endpoint (`generate-ice-servers`), nasel tar juna (`generate`) — donhi response shape chaltat.
      const base = `https://rtc.live.cloudflare.com/v1/turn/keys/${cfg.cloudflare.keyId}/credentials`;
      const post = (path: string) =>
        fetch(`${base}/${path}`, {
          method: "POST",
          headers: { authorization: `Bearer ${cfg.cloudflare!.apiToken}`, "content-type": "application/json" },
          body: JSON.stringify({ ttl: 3600 }),
        });
      let r = await post("generate-ice-servers");
      if (!r.ok) r = await post("generate");
      if (r.ok) {
        const body = (await r.json()) as { iceServers?: unknown };
        const list = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : [];
        iceServers.push(...(list as typeof iceServers));
      } else logger.warn("cloudflare turn failed", { status: r.status });
    }
    if (Array.isArray(cfg?.turn)) iceServers.push(...cfg!.turn!);
  } catch (err) {
    logger.warn("call config failed", { err });
  }
  return { iceServers, ringSeconds: RING_SECONDS };
});

/** Call suru — caller cha offer. Samorcha busy asel tar `busy` (history pan). */
export const startCall = callable<{ to?: string; type?: string; offer?: unknown }>(async (req) => {
  const { uid, me } = await requireCoreUser(req);
  const to = str(req.data.to, "chatBadUser", 1, 128);
  if (to === uid) fail("invalid-argument", "chatBadUser");
  const other = (await loadAdmin(to)) as AdminDoc | null;
  if (!other?.active) fail("failed-precondition", "chatBadUser");
  const type: CallType = req.data.type === "video" ? "video" : "audio";
  const offer = sdpOf(req.data.offer, "offer");
  if (await busy(uid)) fail("failed-precondition", "callYouBusy");

  const ref = db.collection("calls").doc();
  const base = {
    caller: uid,
    callee: to,
    names: { [uid]: me.name, [to]: other!.name },
    type,
    chatId: chatIdOf(uid, to),
    createdAt: now(),
    acceptedAt: null,
    connectedAt: null,
    beat: null,
    answer: null,
  };
  if (await busy(to)) {
    await ref.set({ ...base, offer: null, status: "ringing", active: true, outcome: null });
    await finish(ref, () => ({ outcome: "busy", by: to }));
    return { callId: ref.id, busy: true };
  }
  await ref.set({ ...base, offer, status: "ringing", active: true, outcome: null });
  await pushTo(to, {
    kind: "call",
    title: me.name,
    body: type === "video" ? "📹 Incoming video call" : "📞 Incoming voice call",
    link: `/chat?with=${encodeURIComponent(uid)}`,
    tag: `call-${ref.id}`,
    from: uid,
    chatId: base.chatId,
    callId: ref.id,
    callType: type,
  });
  return { callId: ref.id, busy: false };
});

/** Callee ne uchalla — answer. */
export const answerCall = callable<{ callId?: string; answer?: unknown }>(async (req) => {
  const { uid } = await requireCoreUser(req);
  const { ref } = await loadCall(req.data.callId, uid);
  const answer = sdpOf(req.data.answer, "answer");
  await db.runTransaction(async (tx) => {
    const c = (await tx.get(ref)).data() as CallDoc;
    if (c.callee !== uid) fail("permission-denied", "callDenied");
    if (c.status !== "ringing" || !c.active) fail("failed-precondition", "callOver");
    tx.update(ref, { status: "accepted", answer, acceptedAt: now(), beat: now() });
  });
  return { ok: true };
});

/** Callee ne nakarla. */
export const declineCall = callable<{ callId?: string }>(async (req) => {
  const { uid } = await requireCoreUser(req);
  const { ref } = await loadCall(req.data.callId, uid);
  await finish(ref, (c) => (c.callee === uid && c.status === "ringing" ? { outcome: "declined", by: uid } : null));
  return { ok: true };
});

/**
 * Call samplava (kuthlahi participant). `reason`: hangup (default), timeout (uchalla nahi → missed),
 * failed (connection jamla nahi / tutla).
 */
export const endCall = callable<{ callId?: string; reason?: string; diag?: unknown }>(async (req) => {
  const { uid } = await requireCoreUser(req);
  const { ref } = await loadCall(req.data.callId, uid);
  const reason = req.data.reason === "timeout" || req.data.reason === "failed" ? req.data.reason : "hangup";
  // Client che connection tapshil (kontya network vatanchi candidates milali, kuthe thambla) —
  // "connect hot nahi" shodhnyasathi logs madhe. Fakt lahan JSON.
  if (req.data.diag && typeof req.data.diag === "object") {
    const diag = JSON.stringify(req.data.diag).slice(0, 1500);
    logger.info("call diag", { callId: ref.id, uid, reason, diag });
  }
  const r = await finish(ref, (c) => {
    if (c.status === "ringing") {
      if (uid === c.callee) return { outcome: "declined", by: uid };
      return { outcome: reason === "timeout" ? "missed" : reason === "failed" ? "failed" : "cancelled", by: uid };
    }
    if (c.status === "accepted" && !c.connectedAt) return { outcome: reason === "failed" ? "failed" : "cancelled", by: uid };
    return { outcome: reason === "failed" && !c.connectedAt ? "failed" : "completed", by: uid };
  });
  return { ok: true, outcome: r?.outcome ?? null };
});

/** Media jodla (ICE connected) — vel suru. Don baju kadhunahi; ekdach. */
export const markCallConnected = callable<{ callId?: string }>(async (req) => {
  const { uid } = await requireCoreUser(req);
  const { ref } = await loadCall(req.data.callId, uid);
  await db.runTransaction(async (tx) => {
    const c = (await tx.get(ref)).data() as CallDoc;
    if (!c.active || c.status === "ringing") return;
    tx.update(ref, c.connectedAt ? { beat: now() } : { status: "connected", connectedAt: now(), beat: now() });
  });
  return { ok: true };
});

/** Call chalu ahe (30 s la) — browser band zala tar sweep call samplavto. */
export const callHeartbeat = callable<{ callId?: string }>(async (req) => {
  const { uid } = await requireCoreUser(req);
  const { ref, c } = await loadCall(req.data.callId, uid);
  if (c.active) await ref.update({ beat: now() });
  return { ok: c.active };
});

/** Atakleli calls — uchalli nahi (missed) / heartbeat thambla (samplela). */
export const sweepCalls = onSchedule({ schedule: "every 2 minutes", region: "asia-south1", timeoutSeconds: 120 }, async () => {
  const snap = await db.collection("calls").where("active", "==", true).limit(200).get();
  const t = Date.now();
  for (const d of snap.docs) {
    const c = d.data() as CallDoc;
    if (c.status === "ringing" && t - ms(c.createdAt) > (RING_SECONDS + 15) * 1000) {
      await finish(d.ref, (x) => (x.status === "ringing" ? { outcome: "missed", by: "system" } : null));
    } else if (c.status !== "ringing" && t - Math.max(ms(c.beat), ms(c.acceptedAt)) > STALE_SECONDS * 1000) {
      await finish(d.ref, (x) => (x.status !== "ringing" ? { outcome: x.connectedAt ? "completed" : "failed", by: "system" } : null));
    }
  }
});
