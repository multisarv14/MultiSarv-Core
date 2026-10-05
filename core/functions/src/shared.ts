import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall, type CallableRequest, type FunctionsErrorCode } from "firebase-functions/v2/https";
import type { SecretParam } from "firebase-functions/params";

initializeApp();
setGlobalOptions({ region: "asia-south1", maxInstances: 10 });

export const db = getFirestore();
export const auth = getAuth();
export const now = () => FieldValue.serverTimestamp();
export { FieldValue };

export type Role = "superAdmin" | "admin";
/** projectId → menus. Super admin la sagle (`*`). */
export type Access = Record<string, string[]>;

/**
 * Master panel che modules (projects chya baher) → permissions.
 * Module Access page varun super admin deto; super admin la sagle.
 */
export const MODULES: Record<string, readonly string[]> = {
  clientTickets: ["view", "raise", "edit", "assign", "status"],
  devTickets: ["view", "raise", "edit", "assign", "status"],
};
export type Modules = Record<string, string[]>;

export interface AdminDoc {
  name: string;
  email: string;
  role: Role;
  /** Settings → Roles madhla role (designation). Access `role` / modules ne tharto. */
  roleId?: string | null;
  active: boolean;
  projects: Access;
  modules?: Modules;
}

/** Message = panel i18n key (`core.err.*`) — panel tyachya bhashet dakhavto. */
export const fail = (code: FunctionsErrorCode, key: string): never => {
  throw new HttpsError(code, `core.err.${key}`);
};

export const callable = <T>(handler: (req: CallableRequest<T>) => Promise<unknown>, secrets: SecretParam[] = []) =>
  onCall<T>({ invoker: "public", secrets }, handler);

export async function loadAdmin(uid: string): Promise<AdminDoc | null> {
  const snap = await db.collection("admins").doc(uid).get();
  return snap.exists ? (snap.data() as AdminDoc) : null;
}

export function str(v: unknown, key: string, min: number, max: number): string {
  if (typeof v !== "string" || v.trim().length < min || v.trim().length > max) fail("invalid-argument", key);
  return (v as string).trim();
}

/** Fakt mahit aslele modules ani permissions; "view" shivay baki nahit. */
export function parseModules(v: unknown): Modules {
  const out: Modules = {};
  if (!v || typeof v !== "object") return out;
  for (const [key, perms] of Object.entries(v as Record<string, unknown>)) {
    const allowed = MODULES[key];
    if (!allowed || !Array.isArray(perms)) continue;
    const valid = [...new Set(perms.filter((p): p is string => typeof p === "string" && allowed.includes(p)))];
    if (valid.length && !valid.includes("view")) valid.unshift("view");
    if (valid.length) out[key] = valid;
  }
  return out;
}

export const hasModule = (a: AdminDoc | null, module: string, perm: string) =>
  !!a?.active && (a.role === "superAdmin" || !!a.modules?.[module]?.includes(perm));

/** Fakt active super admin (claim ani doc donhi). */
export async function requireSuper(req: CallableRequest<unknown>) {
  const uid = req.auth?.uid;
  if (!uid) fail("unauthenticated", "signIn");
  const me = await loadAdmin(uid!);
  if (req.auth?.token.superAdmin !== true || me?.role !== "superAdmin" || !me.active) fail("permission-denied", "superOnly");
  return { uid: uid!, me: me! };
}

/** Kon kay badalla — Users → Activity. */
export function audit(by: { uid: string; me: AdminDoc }, action: string, target: { uid: string; email?: string }, extra: object = {}) {
  return db.collection("auditLogs").add({
    action,
    by: by.uid,
    byEmail: by.me.email,
    target: target.uid,
    targetEmail: target.email ?? null,
    ...extra,
    at: now(),
  });
}
