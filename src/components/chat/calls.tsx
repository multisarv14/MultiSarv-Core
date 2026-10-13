import { Maximize2, Mic, MicOff, Minimize2, Phone, PhoneOff, SwitchCamera, Video, VideoOff } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { coreSignal, watchIncoming } from "@/api/calls";
import { Avatar } from "@/components/ui/primitives";
import { useAdmin } from "@/context/session";
import { t } from "@/i18n";
import { CallSession, type CallOutcome, type CallPeer, type CallState, type CallType } from "@/lib/callEngine";
import { core } from "@/lib/firebase";
import { cn } from "@/lib/utils";

/**
 * 1:1 Audio / Video call UI — chat header che buttons, incoming screen, call screen.
 * Ekach vel ekach call (WhatsApp sarkha). Media / signalling `src/lib/callEngine.ts`.
 */

// ── Current call (sagla panel share karto) ──────────────────────────

let current: CallSession | null = null;
const watchers = new Set<() => void>();
const setCurrent = (s: CallSession | null) => {
  current = s;
  watchers.forEach((f) => f());
};
const subscribeCurrent = (f: () => void) => {
  watchers.add(f);
  return () => watchers.delete(f);
};
export const useCurrentCall = () => useSyncExternalStore(subscribeCurrent, () => current);
const inCall = () => !!current && !current.ended;

/** Chat header madhun — audio / video call suru. */
export function startCall(me: string, peer: CallPeer, type: CallType) {
  if (inCall()) return void toast.error(t("call.alreadyIn"));
  if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") return void toast.error(t("call.unsupported"));
  setCurrent(CallSession.outgoing(coreSignal(), me, peer, type));
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// ── Tones (WebAudio — file nako) ──────────────────────────────────────

/** Incoming = ring-ring; outgoing = ringback. stop() parat deto. */
function playTone(kind: "incoming" | "ringback"): () => void {
  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioContext();
  } catch {
    return () => {};
  }
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  const freqs = kind === "incoming" ? [880, 660] : [440, 480];
  const oscs = freqs.map((f) => {
    const o = ctx!.createOscillator();
    o.frequency.value = f;
    o.connect(gain);
    o.start();
    return o;
  });
  const vol = kind === "incoming" ? 0.12 : 0.05;
  const on = kind === "incoming" ? 0.9 : 1.6;
  const every = kind === "incoming" ? 2.2 : 4;
  const schedule = () => {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.05);
    gain.gain.setValueAtTime(vol, t0 + on);
    gain.gain.linearRampToValueAtTime(0, t0 + on + 0.05);
  };
  schedule();
  const timer = setInterval(schedule, every * 1000);
  return () => {
    clearInterval(timer);
    oscs.forEach((o) => o.stop());
    void ctx?.close();
    ctx = null;
  };
}

// ── Layer (shell madhe ekda) ─────────────────────────────────────────

/**
 * Incoming calls aikto, chalu call cha screen dakhavto. Ekach call — dusra ringing ala tar server
 * adhich `busy` karto; ithe pan duplicate (ekach call che anek snapshot / tabs) talto.
 */
export function CallLayer() {
  const me = useAdmin();
  const call = useCurrentCall();
  const seen = useRef(new Set<string>());

  useEffect(
    () =>
      watchIncoming(core().db, me.uid, (list) => {
        for (const r of list) {
          if (seen.current.has(r.id)) continue;
          seen.current.add(r.id);
          // Juna (ring vel sampla) kinva mi aadhich call madhe — dakhvu naka.
          if (r.createdAt && Date.now() - r.createdAt.getTime() > 60_000) continue;
          if (inCall()) continue;
          setCurrent(CallSession.incoming(coreSignal(), me.uid, r));
        }
      }),
    [me.uid],
  );

  // Call sampla — thoda vel "Call ended" mag band.
  const state = useSyncExternalStore(call?.subscribe ?? noopSub, call?.getState ?? nullState);
  useEffect(() => {
    if (!call || state?.phase !== "ended") return;
    const id = setTimeout(() => current === call && setCurrent(null), 2200);
    return () => clearTimeout(id);
  }, [call, state?.phase]);

  // Tab band — call samplava (shakya tevdhe; server sweep pan karto).
  useEffect(() => {
    const bye = () => current && !current.ended && void current.hangup();
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, []);

  if (!call || !state) return null;
  return createPortal(<CallScreen call={call} s={state} />, document.body);
}

const noopSub = () => () => {};
const nullState = () => null;

// ── Screen ────────────────────────────────────────────────────────────

function outcomeText(o: CallOutcome | null, outgoing: boolean, duration: number) {
  switch (o) {
    case "completed":
      return `${t("call.ended")} · ${mmss(duration)}`;
    case "missed":
      return outgoing ? t("call.noAnswer") : t("call.missed");
    case "declined":
      return outgoing ? t("call.declinedByPeer") : t("call.declined");
    case "busy":
      return t("call.busy");
    case "cancelled":
      return t("call.cancelled");
    case "failed":
      return t("call.failed");
    default:
      return t("call.ended");
  }
}

function CallScreen({ call, s }: { call: CallSession; s: CallState }) {
  const box = useRef<HTMLDivElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const [now, setNow] = useState(Date.now());
  const [full, setFull] = useState(false);
  const video = s.type === "video";
  const remoteHasVideo = !!s.remote?.getVideoTracks().some((tr) => tr.readyState === "live");

  // Streams → elements.
  useEffect(() => {
    if (remoteVideo.current && remoteVideo.current.srcObject !== s.remote) remoteVideo.current.srcObject = s.remote;
    if (remoteAudio.current && remoteAudio.current.srcObject !== s.remote) remoteAudio.current.srcObject = s.remote;
  }, [s.remote, video]);
  useEffect(() => {
    if (localVideo.current && localVideo.current.srcObject !== s.local) localVideo.current.srcObject = s.local;
  }, [s.local]);

  // Timer.
  useEffect(() => {
    if (!s.connectedAt || s.phase === "ended") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [s.connectedAt, s.phase]);

  // Ring / ringback.
  useEffect(() => {
    if (s.phase === "incoming") return playTone("incoming");
    if (s.phase === "ringing") return playTone("ringback");
  }, [s.phase]);

  // Permission / device errors — samjel asa message.
  useEffect(() => {
    if (s.error === "permission") toast.error(video ? t("call.permCamera") : t("call.permMic"));
    else if (s.error === "noDevice") toast.error(video ? t("call.noCamera") : t("call.noMic"));
    else if (s.error === "network") toast.error(t("call.network"));
  }, [s.error, video]);

  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFull = () => {
    const p = document.fullscreenElement ? document.exitFullscreen() : box.current?.requestFullscreen();
    p?.catch(() => {});
  };

  const status =
    s.phase === "starting"
      ? t("call.starting")
      : s.phase === "calling"
        ? t("call.calling")
        : s.phase === "ringing"
          ? t("call.ringing")
          : s.phase === "incoming"
            ? video
              ? t("call.incomingVideo")
              : t("call.incomingVoice")
            : s.phase === "connecting"
              ? t("call.connecting")
              : s.phase === "reconnecting"
                ? t("call.reconnecting")
                : s.phase === "connected"
                  ? mmss(Math.max(0, (now - (s.connectedAt ?? now)) / 1000))
                  : outcomeText(s.outcome, s.outgoing, s.duration);

  const showRemoteVideo = video && remoteHasVideo && (s.phase === "connected" || s.phase === "reconnecting");

  return (
    <div ref={box} role="dialog" aria-modal="true" aria-label={s.peer.name} className="animate-fade fixed inset-0 z-[90] flex flex-col overflow-hidden bg-neutral-950 text-white">
      {/* Remote — purna screen (video) */}
      <video ref={remoteVideo} autoPlay playsInline className={cn("absolute inset-0 size-full bg-black object-cover", !showRemoteVideo && "hidden")} />
      {!video && <audio ref={remoteAudio} autoPlay />}

      {/* Mahiti — naav, photo, avastha */}
      <div className={cn("relative z-10 flex flex-col items-center px-6 pt-[max(3rem,env(safe-area-inset-top))] text-center", showRemoteVideo && "pt-[max(1rem,env(safe-area-inset-top))]")}>
        {!showRemoteVideo && (
          <div className={cn("mb-5 rounded-full p-1 ring-4 ring-white/10", (s.phase === "incoming" || s.phase === "ringing") && "animate-pulse")}>
            <div className="origin-center scale-[1.8] p-3">
              <Avatar name={s.peer.name} seed={s.peer.uid} size="lg" />
            </div>
          </div>
        )}
        <p className={cn("font-semibold drop-shadow", showRemoteVideo ? "text-base" : "mt-6 text-2xl")}>{s.peer.name}</p>
        <p className="mt-1 text-sm text-white/75 tabular drop-shadow" aria-live="polite">
          {status}
        </p>
      </div>

      {/* Local — PiP */}
      {video && s.local && !s.cameraOff && (
        <video
          ref={localVideo}
          autoPlay
          playsInline
          muted
          className={cn(
            "absolute z-20 rounded-2xl bg-black object-cover shadow-2xl ring-1 ring-white/20 transition-all",
            showRemoteVideo ? "right-4 bottom-32 w-28 sm:w-44 aspect-[3/4]" : "inset-0 size-full rounded-none opacity-40",
            s.facing === "user" && "-scale-x-100",
          )}
        />
      )}

      <div className="flex-1" />

      {/* Controls */}
      <div className="relative z-30 flex items-center justify-center gap-4 px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:gap-6">
        {s.phase === "incoming" ? (
          <>
            <RoundButton label={t("call.decline")} tone="danger" onClick={() => void call.decline()}>
              <PhoneOff className="size-6" />
            </RoundButton>
            <RoundButton label={t("call.accept")} tone="accept" onClick={() => void call.accept()}>
              {video ? <Video className="size-6" /> : <Phone className="size-6" />}
            </RoundButton>
          </>
        ) : s.phase === "ended" ? null : (
          <>
            <RoundButton label={s.muted ? t("call.unmute") : t("call.mute")} active={s.muted} onClick={() => call.toggleMute()}>
              {s.muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
            </RoundButton>
            {video && (
              <RoundButton label={s.cameraOff ? t("call.cameraOn") : t("call.cameraOff")} active={s.cameraOff} onClick={() => call.toggleCamera()}>
                {s.cameraOff ? <VideoOff className="size-5" /> : <Video className="size-5" />}
              </RoundButton>
            )}
            {video && s.canSwitchCamera && (
              <RoundButton label={t("call.switchCamera")} onClick={() => void call.switchCamera()}>
                <SwitchCamera className="size-5" />
              </RoundButton>
            )}
            {video && document.fullscreenEnabled && (
              <RoundButton label={full ? t("call.exitFull") : t("call.full")} onClick={toggleFull}>
                {full ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
              </RoundButton>
            )}
            <RoundButton label={t("call.end")} tone="danger" onClick={() => void call.hangup()}>
              <PhoneOff className="size-6" />
            </RoundButton>
          </>
        )}
      </div>
    </div>
  );
}

function RoundButton({
  label,
  onClick,
  children,
  tone = "plain",
  active,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  /** danger = lal (end / decline), accept = hirva. */
  tone?: "plain" | "danger" | "accept";
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex size-14 items-center justify-center rounded-full shadow-lg transition active:scale-95",
        tone === "danger"
          ? "bg-rose-600 text-white hover:bg-rose-500"
          : tone === "accept"
            ? "bg-emerald-600 text-white hover:bg-emerald-500"
            : active
              ? "bg-white text-neutral-900"
              : "bg-white/15 text-white backdrop-blur hover:bg-white/25",
      )}
    >
      {children}
    </button>
  );
}
