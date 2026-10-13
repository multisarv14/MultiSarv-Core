import { useCallback, useEffect, useRef, useState } from "react";

import { getLang } from "@/i18n";

// ── Speech → text (Web Speech API) ───────────────────────────────────

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

const Speech = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition })
  .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

/** Panel chi bhasha → bolnyachi bhasha. */
const SPEECH_LANG = { en: "en-IN", hi: "hi-IN", mr: "mr-IN", gu: "gu-IN" } as const;

export const dictationSupported = !!Speech;

/**
 * Bola → text. `onFinal` la pakka zalela text milto; `interim` = bolat astana disnara.
 * Chrome / Edge / Safari (webkit) madhe chalto; Firefox madhe nahi.
 */
export function useDictation(onFinal: (text: string) => void, onError?: (code: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const rec = useRef<Recognition | null>(null);
  const cb = useRef({ onFinal, onError });
  cb.current = { onFinal, onError };

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(() => {
    if (!Speech || rec.current) return;
    const r = new Speech();
    r.lang = SPEECH_LANG[getLang()] ?? "en-IN";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) cb.current.onFinal(res[0].transcript.trim());
        else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error !== "aborted" && e.error !== "no-speech") cb.current.onError?.(e.error);
    };
    r.onend = () => {
      rec.current = null;
      setListening(false);
      setInterim("");
    };
    rec.current = r;
    setListening(true);
    r.start();
  }, []);

  useEffect(() => () => rec.current?.abort(), []);
  return { listening, interim, start, stop };
}

// ── Voice message (MediaRecorder) ────────────────────────────────────

/** Browser la chalnara audio format — Chrome/Android webm, Safari/iOS mp4. */
function pickType(): { mime: string; ext: string } {
  const opts = [
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/mp4", ext: "m4a" },
    { mime: "audio/ogg;codecs=opus", ext: "ogg" },
  ];
  return opts.find((o) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(o.mime)) ?? { mime: "", ext: "webm" };
}

export const recordingSupported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

/** Kamal lambi — 5 min (10 MB chya khup aat). */
export const MAX_RECORD_SEC = 300;

export interface Recording {
  file: File;
  duration: number;
}

type Active = {
  rec: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  started: number;
  timer: number;
  resolve?: (r: Recording | null) => void;
  cancel?: boolean;
};

/**
 * Record → `stop()` File deto (voice message), `cancel()` takto. Mic permission
 * pahilya veli browser magto.
 */
export function useRecorder(onAutoStop?: (r: Recording) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const media = useRef<Active | null>(null);
  // Kamal vel zali ki recording haravu naye — caller la dya (pathvayla).
  const auto = useRef(onAutoStop);
  auto.current = onAutoStop;

  const cleanup = () => {
    const m = media.current;
    if (!m) return;
    clearInterval(m.timer);
    m.stream.getTracks().forEach((tr) => tr.stop());
    media.current = null;
    setRecording(false);
    setSeconds(0);
  };

  const start = useCallback(async () => {
    if (media.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const { mime, ext } = pickType();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    const started = Date.now();
    const m: Active = {
      rec,
      stream,
      chunks,
      started,
      timer: window.setInterval(() => {
        const s = Math.floor((Date.now() - started) / 1000);
        setSeconds(s);
        if (s >= MAX_RECORD_SEC && rec.state === "recording") rec.stop();
      }, 250),
    };
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const duration = Math.max(1, Math.round((Date.now() - started) / 1000));
      const type = (rec.mimeType || mime || "audio/webm").split(";")[0];
      const out = m.cancel || !chunks.length ? null : { file: new File(chunks, `voice-${started}.${type === "audio/mp4" ? "m4a" : ext}`, { type }), duration };
      if (m.resolve) m.resolve(out);
      else if (out) auto.current?.(out);
      cleanup();
    };
    media.current = m;
    rec.start(250);
    setRecording(true);
  }, []);

  /** Thambva ani File dya. */
  const stop = useCallback(
    () =>
      new Promise<Recording | null>((resolve) => {
        const m = media.current;
        if (!m) return resolve(null);
        m.resolve = resolve;
        if (m.rec.state !== "inactive") m.rec.stop();
      }),
    [],
  );

  const cancel = useCallback(() => {
    const m = media.current;
    if (!m) return;
    m.cancel = true;
    if (m.rec.state !== "inactive") m.rec.stop();
    else cleanup();
  }, []);

  useEffect(() => () => cancel(), [cancel]);
  return { recording, seconds, start, stop, cancel };
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export const fileSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
