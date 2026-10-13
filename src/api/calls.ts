import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  type Firestore,
} from "firebase/firestore";
import { httpsCallable, type Functions } from "firebase/functions";

import { toDate } from "@/context/session";
import type { CallRecord, CallSignal, CallType } from "@/lib/callEngine";
import { core } from "@/lib/firebase";

/**
 * Calls signalling — core Firestore (`calls/{id}` + `candidates`) ani core functions
 * (`core/functions/src/calls.ts`). `db` / `functions` parameter — emulator test sathi pan.
 */

const recordOf = (id: string, x: Record<string, unknown>): CallRecord => ({
  id,
  caller: String(x.caller ?? ""),
  callee: String(x.callee ?? ""),
  names: (x.names as Record<string, string>) ?? {},
  type: x.type === "video" ? "video" : "audio",
  status: (x.status as CallRecord["status"]) ?? "ended",
  outcome: (x.outcome as CallRecord["outcome"]) ?? null,
  offer: (x.offer as RTCSessionDescriptionInit | null) ?? null,
  answer: (x.answer as RTCSessionDescriptionInit | null) ?? null,
  createdAt: toDate(x.createdAt),
  duration: Number(x.duration ?? 0),
});

export function firestoreSignal(db: Firestore, functions: Functions): CallSignal {
  const call = <T = unknown>(name: string, data: Record<string, unknown>) =>
    httpsCallable<Record<string, unknown>, T>(functions, name)(data).then((r) => r.data);
  let cfg: Promise<{ iceServers: RTCIceServer[]; ringSeconds: number }> | null = null;
  return {
    // TURN credentials thoda vel chaltat — call la ekda (cache 10 min).
    config: () => {
      if (!cfg) {
        cfg = call<{ iceServers: RTCIceServer[]; ringSeconds: number }>("getCallConfig", {}).catch((e) => ((cfg = null), Promise.reject(e)));
        setTimeout(() => (cfg = null), 10 * 60_000);
      }
      return cfg;
    },
    start: (to, type, offer) => call<{ callId: string; busy: boolean }>("startCall", { to, type, offer }),
    answer: (callId, answer) => call("answerCall", { callId, answer }).then(() => {}),
    decline: (callId) => call("declineCall", { callId }).then(() => {}),
    end: (callId, reason, diag) => call("endCall", { callId, reason, ...(diag && { diag }) }).then(() => {}),
    connected: (callId) => call("markCallConnected", { callId }).then(() => {}),
    heartbeat: (callId) => call("callHeartbeat", { callId }).then(() => {}),
    watchCall: (callId, cb) =>
      onSnapshot(
        doc(db, "calls", callId),
        (s) => cb(s.exists() ? recordOf(s.id, s.data()) : null),
        () => cb(null),
      ),
    sendCandidate: (callId, from, c) => addDoc(collection(db, "calls", callId, "candidates"), { from, c, at: serverTimestamp() }).then(() => {}),
    watchCandidates: (callId, from, cb) =>
      onSnapshot(query(collection(db, "calls", callId, "candidates"), where("from", "==", from)), (s) => {
        for (const ch of s.docChanges()) if (ch.type === "added") cb(ch.doc.get("c") as RTCIceCandidateInit);
      }),
  };
}

/** Mala yenare (ringing) calls live — incoming screen. */
export function watchIncoming(db: Firestore, me: string, cb: (calls: CallRecord[]) => void) {
  return onSnapshot(
    query(collection(db, "calls"), where("callee", "==", me), where("status", "==", "ringing")),
    (s) => cb(s.docs.map((d) => recordOf(d.id, d.data()))),
    () => cb([]),
  );
}

let live: CallSignal | null = null;
/** Panel che (live core). */
export const coreSignal = () => (live ??= firestoreSignal(core().db, core().functions));

export type { CallType };
