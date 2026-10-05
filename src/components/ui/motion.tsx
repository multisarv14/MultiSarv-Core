import { useEffect, useRef, useState, type CSSProperties } from "react";

const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** 0 → value smooth (ease-out) — KPI anka "chadhtat". Reduced motion la thet value. */
export function useCountUp(value: number, duration = 900): number {
  const [shown, setShown] = useState(() => (reduced() ? value : 0));
  const from = useRef(shown);

  useEffect(() => {
    if (reduced()) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = origin + (value - origin) * eased;
      from.current = v;
      setShown(v);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return shown;
}

export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  return <>{format(useCountUp(value))}</>;
}

/** `animate-rise` sobat stagger index. */
export const rise = (i: number): CSSProperties => ({ ["--i" as string]: i });
