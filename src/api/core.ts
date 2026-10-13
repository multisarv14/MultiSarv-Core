import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc, writeBatch } from "firebase/firestore";
import { useEffect, useState } from "react";

import { toDate } from "@/context/session";
import { core, errorMessage } from "@/lib/firebase";

// ── Settings → Roles (core `roles`) ──────────────────────────────────

export interface CoreRole {
  id: string;
  name: string;
  description: string;
}

/** Roles live — navin role banavla ki Users chya dropdown madhe lagech. */
export function useRoles() {
  const [roles, setRoles] = useState<CoreRole[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(
    () =>
      onSnapshot(
        collection(core().db, "roles"),
        (snap) =>
          setRoles(
            snap.docs
              .map((d) => ({ id: d.id, name: String(d.get("name") ?? ""), description: String(d.get("description") ?? "") }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          ),
        (err) => setError(errorMessage(err)),
      ),
    [],
  );
  return { roles, error };
}

// ── Super Admin → Notifications ──────────────────────────────────────

export type NoticeAudience = { kind: "all" } | { kind: "roles"; roleIds: string[] } | { kind: "users"; uids: string[] };

export interface CoreNotice {
  id: string;
  title: string;
  body: string;
  audience: NoticeAudience;
  targeted: number;
  byName: string;
  createdAt: Date | null;
}

/** Pathavlelya notices (fakt super admin la vachta yeta). */
export function useCoreNotices() {
  const [items, setItems] = useState<CoreNotice[] | null>(null);
  useEffect(
    () =>
      onSnapshot(
        query(collection(core().db, "coreNotices"), orderBy("createdAt", "desc"), limit(50)),
        (snap) =>
          setItems(
            snap.docs.map((d) => {
              const x = d.data();
              return {
                id: d.id,
                title: String(x.title ?? ""),
                body: String(x.body ?? ""),
                audience: (x.audience as NoticeAudience) ?? { kind: "all" },
                targeted: Number(x.targeted ?? 0),
                byName: String(x.byName ?? ""),
                createdAt: toDate(x.createdAt),
              };
            }),
          ),
        () => setItems([]),
      ),
    [],
  );
  return items;
}

export interface CoreInboxItem {
  id: string;
  title: string;
  body: string;
  byName: string;
  isRead: boolean;
  createdAt: Date | null;
  /** Ticket notification — click var ticket ughadto. */
  type: "notice" | "ticket";
  link: string | null;
}

/** Core User cha inbox (`admins/{uid}/inbox`) — master panel cha bell. */
export function watchCoreInbox(uid: string, cb: (items: CoreInboxItem[]) => void) {
  return onSnapshot(
    query(collection(core().db, "admins", uid, "inbox"), orderBy("createdAt", "desc"), limit(30)),
    (snap) =>
      cb(
        snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            title: String(x.title ?? ""),
            body: String(x.body ?? ""),
            byName: String(x.byName ?? ""),
            isRead: x.isRead === true,
            createdAt: toDate(x.createdAt),
            type: x.type === "ticket" ? "ticket" : "notice",
            // Fakt panel madhla path.
            link: typeof x.link === "string" && x.link.startsWith("/") && !x.link.startsWith("//") ? x.link : null,
          };
        }),
      ),
    () => cb([]),
  );
}

export const markCoreRead = (uid: string, id: string) => updateDoc(doc(core().db, "admins", uid, "inbox", id), { isRead: true });

export async function markAllCoreRead(uid: string, ids: string[]) {
  if (ids.length === 0) return;
  const batch = writeBatch(core().db);
  ids.slice(0, 450).forEach((id) => batch.update(doc(core().db, "admins", uid, "inbox", id), { isRead: true }));
  await batch.commit();
}
