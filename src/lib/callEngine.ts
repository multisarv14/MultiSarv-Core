/**
 * 1:1 call engine (WebRTC) — UI shivay. Media thet don devices madhe (peer-to-peer; TURN asel tar
 * relay), signalling [CallSignal] madhun (panel madhe Firestore + core functions, `src/api/calls.ts`).
 *
 * Caller: media → offer → `start` → answer ali ki jodto. Callee: offer var answer → `answer`.
 * ICE candidates don baju thet (buffer — remote description yeiparyant).
 */

export type CallType = "audio" | "video";
export type CallOutcome = "completed" | "missed" | "declined" | "cancelled" | "busy" | "failed";
export type CallPhase = "starting" | "calling" | "ringing" | "incoming" | "connecting" | "connected" | "reconnecting" | "ended";

export interface CallPeer {
  uid: string;
  name: string;
}

/** Server call doc (jevdhe engine la lagte). */
export interface CallRecord {
  id: string;
  caller: string;
  callee: string;
  names: Record<string, string>;
  type: CallType;
  status: "ringing" | "accepted" | "connected" | "ended";
  outcome: CallOutcome | null;
  offer: RTCSessionDescriptionInit | null;
  answer: RTCSessionDescriptionInit | null;
  createdAt: Date | null;
  duration: number;
}

export interface CallSignal {
  config(): Promise<{ iceServers: RTCIceServer[]; ringSeconds: number }>;
  start(to: string, type: CallType, offer: RTCSessionDescriptionInit): Promise<{ callId: string; busy: boolean }>;
  answer(callId: string, answer: RTCSessionDescriptionInit): Promise<void>;
  decline(callId: string): Promise<void>;
  end(callId: string, reason: "hangup" | "timeout" | "failed", diag?: CallDiag): Promise<void>;
  connected(callId: string): Promise<void>;
  heartbeat(callId: string): Promise<void>;
  watchCall(callId: string, cb: (c: CallRecord | null) => void): () => void;
  sendCandidate(callId: string, from: string, c: RTCIceCandidateInit): Promise<void>;
  watchCandidates(callId: string, from: string, cb: (c: RTCIceCandidateInit) => void): () => void;
}

/** Connection tapshil — call jodla nahi tar server logs madhe (kaaran shodhnyasathi). */
export interface CallDiag {
  platform: string;
  /** Aaplya baju sapadlele candidates — host (LAN) / srflx (STUN, public IP) / relay (TURN). */
  local: Record<string, number>;
  /** Samorchya baju kadun aalele. */
  remote: Record<string, number>;
  ice: string;
  conn: string;
  turn: boolean;
  error?: string;
}

export type CallError = "permission" | "noDevice" | "network" | "server" | null;

export interface CallState {
  phase: CallPhase;
  callId: string | null;
  type: CallType;
  peer: CallPeer;
  outgoing: boolean;
  /** Connected zala tevha (timer). */
  connectedAt: number | null;
  muted: boolean;
  cameraOff: boolean;
  facing: "user" | "environment";
  canSwitchCamera: boolean;
  local: MediaStream | null;
  remote: MediaStream | null;
  outcome: CallOutcome | null;
  error: CallError;
  duration: number;
}

const HEARTBEAT_MS = 30_000;
/** "Reconnecting…" itka vel — mag call samplava. */
const RECONNECT_MS = 15_000;

/** getUserMedia error → user la samjel asa prakar. */
function mediaError(err: unknown): CallError {
  const name = (err as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") return "permission";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "NotReadableError") return "noDevice";
  return "server";
}

export class CallSession {
  private state: CallState;
  private listeners = new Set<() => void>();
  private pc: RTCPeerConnection | null = null;
  private unsubs: (() => void)[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private beat: ReturnType<typeof setInterval> | null = null;
  private pendingLocal: RTCIceCandidateInit[] = [];
  private pendingRemote: RTCIceCandidateInit[] = [];
  private remoteSet = false;
  private closed = false;
  private markedConnected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private record: CallRecord | null = null;
  private diag: CallDiag = { platform: "web", local: {}, remote: {}, ice: "new", conn: "new", turn: false };
  private bump(side: "local" | "remote", candidate?: string) {
    const typ = / typ (\w+)/.exec(candidate ?? "")?.[1] ?? "?";
    this.diag[side][typ] = (this.diag[side][typ] ?? 0) + 1;
  }
  /** `end` sobat tapshil. */
  private endWith(callId: string, reason: "hangup" | "timeout" | "failed") {
    return this.signal.end(callId, reason, { ...this.diag, ice: this.pc?.iceConnectionState ?? this.diag.ice, conn: this.pc?.connectionState ?? this.diag.conn });
  }

  private constructor(
    private readonly signal: CallSignal,
    private readonly me: string,
    init: Pick<CallState, "type" | "peer" | "outgoing" | "phase" | "callId">,
  ) {
    this.state = {
      ...init,
      connectedAt: null,
      muted: false,
      cameraOff: false,
      facing: "user",
      canSwitchCamera: false,
      local: null,
      remote: null,
      outcome: null,
      error: null,
      duration: 0,
    };
  }

  // ── Store (React `useSyncExternalStore`) ──
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  };
  getState = () => this.state;
  private set(patch: Partial<CallState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((f) => f());
  }

  get id() {
    return this.state.callId;
  }
  get ended() {
    return this.state.phase === "ended";
  }

  // ── Outgoing ──

  static outgoing(signal: CallSignal, me: string, peer: CallPeer, type: CallType) {
    const s = new CallSession(signal, me, { type, peer, outgoing: true, phase: "starting", callId: null });
    void s.dial();
    return s;
  }

  private async dial() {
    try {
      const [cfg] = await Promise.all([this.signal.config(), this.openMedia()]);
      if (this.closed) return;
      const pc = this.makePeer(cfg.iceServers);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (this.closed) return;
      this.set({ phase: "calling" });
      const { callId, busy } = await this.signal.start(this.state.peer.uid, this.state.type, { type: offer.type, sdp: offer.sdp });
      this.set({ callId });
      if (busy) return this.finish("busy");
      if (this.closed) return void this.signal.end(callId, "hangup").catch(() => {});
      for (const c of this.pendingLocal.splice(0)) void this.signal.sendCandidate(callId, this.me, c).catch(() => {});
      this.unsubs.push(this.signal.watchCandidates(callId, this.state.peer.uid, (c) => this.addRemote(c)));
      this.unsubs.push(this.signal.watchCall(callId, (r) => this.onRecord(r)));
      // Uchalla nahi — missed.
      this.timers.push(
        setTimeout(() => {
          if (this.record?.status === "ringing" || this.state.phase === "calling" || this.state.phase === "ringing") {
            void this.endWith(callId, "timeout").catch(() => {});
            this.finish("missed");
          }
        }, cfg.ringSeconds * 1000),
      );
    } catch (err) {
      this.fail(err);
    }
  }

  // ── Incoming ──

  static incoming(signal: CallSignal, me: string, record: CallRecord) {
    const peer = { uid: record.caller, name: record.names[record.caller] ?? "" };
    const s = new CallSession(signal, me, { type: record.type, peer, outgoing: false, phase: "incoming", callId: record.id });
    s.record = record;
    s.unsubs.push(signal.watchCall(record.id, (r) => s.onRecord(r)));
    return s;
  }

  async accept() {
    const callId = this.state.callId;
    if (!callId || this.state.phase !== "incoming" || !this.record?.offer) return;
    this.set({ phase: "connecting" });
    try {
      const [cfg] = await Promise.all([this.signal.config(), this.openMedia()]);
      if (this.closed) return;
      const pc = this.makePeer(cfg.iceServers);
      this.unsubs.push(this.signal.watchCandidates(callId, this.state.peer.uid, (c) => this.addRemote(c)));
      await pc.setRemoteDescription(this.record.offer);
      this.remoteSet = true;
      await this.flushRemote();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.signal.answer(callId, { type: answer.type, sdp: answer.sdp });
      for (const c of this.pendingLocal.splice(0)) void this.signal.sendCandidate(callId, this.me, c).catch(() => {});
    } catch (err) {
      if (this.state.callId) void this.endWith(this.state.callId, "failed").catch(() => {});
      this.fail(err);
    }
  }

  async decline() {
    const callId = this.state.callId;
    if (callId) await this.signal.decline(callId).catch(() => {});
    this.finish("declined");
  }

  /** Lal button — kuthlyahi avasthet. */
  async hangup() {
    const callId = this.state.callId;
    if (this.closed) return;
    if (!this.state.outgoing && this.state.phase === "incoming") return this.decline();
    const outcome: CallOutcome = this.state.connectedAt ? "completed" : this.state.outgoing ? "cancelled" : "declined";
    this.finish(outcome);
    if (callId) await this.endWith(callId, "hangup").catch(() => {});
  }

  // ── Controls ──

  toggleMute() {
    const muted = !this.state.muted;
    this.state.local?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    this.set({ muted });
  }

  toggleCamera() {
    const cameraOff = !this.state.cameraOff;
    this.state.local?.getVideoTracks().forEach((t) => (t.enabled = !cameraOff));
    this.set({ cameraOff });
  }

  /** Phone var pudhcha / maagcha camera — chalu track badalto (call todat nahi). */
  async switchCamera() {
    const local = this.state.local;
    if (!local || this.state.type !== "video") return;
    const facing = this.state.facing === "user" ? "environment" : "user";
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: facing } } });
      const track = fresh.getVideoTracks()[0];
      const sender = this.pc?.getSenders().find((s) => s.track?.kind === "video");
      await sender?.replaceTrack(track);
      local.getVideoTracks().forEach((t) => {
        t.stop();
        local.removeTrack(t);
      });
      track.enabled = !this.state.cameraOff;
      local.addTrack(track);
      this.set({ facing, local: new MediaStream(local.getTracks()) });
    } catch {
      /* dusra camera nahi */
    }
  }

  // ── Internals ──

  private async openMedia() {
    const video = this.state.type === "video";
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: video ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    });
    if (this.closed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    let canSwitchCamera = false;
    if (video) {
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      canSwitchCamera = devices.filter((d) => d.kind === "videoinput").length > 1;
    }
    this.set({ local: stream, canSwitchCamera });
  }

  private makePeer(iceServers: RTCIceServer[]) {
    const pc = new RTCPeerConnection({ iceServers });
    this.diag.turn = iceServers.some((s) => [s.urls].flat().some((u) => String(u).startsWith("turn")));
    pc.oniceconnectionstatechange = () => (this.diag.ice = pc.iceConnectionState);
    this.pc = pc;
    this.state.local?.getTracks().forEach((t) => pc.addTrack(t, this.state.local!));
    const remote = new MediaStream();
    this.set({ remote });
    pc.ontrack = (e) => {
      for (const t of e.streams[0]?.getTracks() ?? [e.track]) if (!remote.getTracks().includes(t)) remote.addTrack(t);
      this.set({ remote: new MediaStream(remote.getTracks()) });
    };
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      const c = e.candidate.toJSON();
      this.bump("local", c.candidate);
      // Call id milalyavar thet; tyaadhi (caller — `start` chya adhi) ranget.
      if (this.state.callId) void this.signal.sendCandidate(this.state.callId, this.me, c).catch(() => {});
      else this.pendingLocal.push(c);
    };
    pc.onconnectionstatechange = () => this.onConnection(pc.connectionState);
    return pc;
  }

  private onConnection(s: RTCPeerConnectionState) {
    this.diag.conn = s;
    if (this.closed) return;
    if (s === "connected") {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.set({ phase: "connected", connectedAt: this.state.connectedAt ?? Date.now() });
      const callId = this.state.callId;
      if (callId && !this.markedConnected) {
        this.markedConnected = true;
        void this.signal.connected(callId).catch(() => {});
        this.beat = setInterval(() => void this.signal.heartbeat(callId).catch(() => {}), HEARTBEAT_MS);
      }
    } else if (s === "disconnected" && this.state.connectedAt) {
      // Network badalla / thoda gela — browser swatah parat jodto; nahitar samplava.
      this.set({ phase: "reconnecting" });
      if (!this.reconnectTimer) this.reconnectTimer = setTimeout(() => this.lost(), RECONNECT_MS);
    } else if (s === "failed") {
      this.lost();
    }
  }

  private lost() {
    const callId = this.state.callId;
    const wasConnected = !!this.state.connectedAt;
    this.finish(wasConnected ? "completed" : "failed", wasConnected ? null : "network");
    if (callId) void this.endWith(callId, wasConnected ? "hangup" : "failed").catch(() => {});
  }

  private async onRecord(r: CallRecord | null) {
    if (this.closed) return;
    if (!r) return this.finish(this.state.outcome ?? "failed");
    this.record = r;
    if (r.status === "ended") return this.finish(r.outcome ?? "completed", null, r.duration);
    if (this.state.outgoing) {
      if (r.status === "ringing" && this.state.phase === "calling") this.set({ phase: "ringing" });
      if ((r.status === "accepted" || r.status === "connected") && r.answer && !this.remoteSet && this.pc) {
        this.set({ phase: this.state.connectedAt ? this.state.phase : "connecting" });
        try {
          await this.pc.setRemoteDescription(r.answer);
          this.remoteSet = true;
          await this.flushRemote();
        } catch (err) {
          this.fail(err);
        }
      }
    }
  }

  private addRemote(c: RTCIceCandidateInit) {
    this.bump("remote", c.candidate);
    if (!this.pc || !this.remoteSet) return void this.pendingRemote.push(c);
    void this.pc.addIceCandidate(c).catch(() => {});
  }

  private async flushRemote() {
    for (const c of this.pendingRemote.splice(0)) await this.pc?.addIceCandidate(c).catch(() => {});
  }

  private fail(err: unknown) {
    const callId = this.state.callId;
    this.diag.error = String((err as { name?: string; message?: string })?.name ?? "") + ": " + String((err as { message?: string })?.message ?? err).slice(0, 200);
    const error = err instanceof DOMException || (err as { name?: string })?.name ? mediaError(err) : "server";
    this.finish("failed", error === "server" && !navigator.onLine ? "network" : error);
    if (callId) void this.endWith(callId, "failed").catch(() => {});
  }

  /** Sagle sodun — camera / mic band, connection band, listeners band. */
  private finish(outcome: CallOutcome, error: CallError = null, duration?: number) {
    if (this.closed) return;
    this.closed = true;
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.timers.forEach((t) => clearTimeout(t));
    if (this.beat) clearInterval(this.beat);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.state.local?.getTracks().forEach((t) => t.stop());
    this.pc?.close();
    this.pc = null;
    const secs = duration ?? (this.state.connectedAt ? Math.round((Date.now() - this.state.connectedAt) / 1000) : 0);
    this.set({ phase: "ended", outcome, error: error ?? this.state.error, duration: secs, local: null });
  }
}
