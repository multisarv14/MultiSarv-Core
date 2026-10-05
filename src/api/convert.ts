import { Timestamp, type DocumentSnapshot, type QueryDocumentSnapshot } from "firebase/firestore";

/** Firestore Timestamp → Date (nested objects madhe pan). */
function revive(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === "object" && value.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = revive(v);
    return out;
  }
  return value;
}

export function fromDoc<T>(snap: DocumentSnapshot | QueryDocumentSnapshot): T {
  return { ...(revive(snap.data() ?? {}) as object), id: snap.id } as T;
}

export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
