import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Drawer state URL madhe (`?user=<uid>`, `?task=<id>`) — link share karta yeto,
 * back button ne band hoto, kontyahi page varun ughadta yeto.
 */
export function useDrawerParam(name: "user" | "task") {
  const [params, setParams] = useSearchParams();
  const value = params.get(name);

  const open = useCallback(
    (id: string) =>
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.set(name, id);
        // Eka drawer madhun dusra ughadla tar juna band.
        next.delete(name === "user" ? "task" : "user");
        return next;
      }),
    [name, setParams],
  );

  const close = useCallback(
    () =>
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.delete(name);
        return next;
      }),
    [name, setParams],
  );

  return [value, open, close] as const;
}
