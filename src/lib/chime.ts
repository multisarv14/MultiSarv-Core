/** Navin message — chhota "ding" (asset nako, WebAudio). Browser ne block kela tar shant. */
let ctx: AudioContext | null = null;

export function playChime() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = t0 + i * 0.12;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  } catch {
    /* audio nahi */
  }
}
