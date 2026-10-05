import {
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User as FbUser,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { MenuKey } from "@/components/layout/nav";
import { CORE } from "@/config/projects";
import { getLang } from "@/i18n";
import { core, services } from "@/lib/firebase";

import { getProjects, resetProjects, startProjects, useProjects } from "./projects";

export type AdminRole = "superAdmin" | "admin";

/** Master modules (projects chya baher) — core `shared.ts` MODULES sobat same. */
export type ModuleKey = "clientTickets" | "devTickets";
export type ModulePerm = "view" | "raise" | "edit" | "assign" | "status";
export const MODULE_PERMS: ModulePerm[] = ["view", "raise", "edit", "assign", "status"];
export const MODULE_KEYS: ModuleKey[] = ["clientTickets", "devTickets"];

/** Core `admins/{uid}` — kontya project madhe konte menus. */
export interface AdminProfile {
  uid: string;
  name: string;
  email: string;
  role: AdminRole;
  /** Settings → Roles madhla role (`roles/{id}`). */
  roleId: string | null;
  active: boolean;
  projects: Record<string, MenuKey[]>;
  modules: Partial<Record<ModuleKey, ModulePerm[]>>;
  createdAt?: Date | null;
  lastSeenAt?: Date | null;
}

export type Session =
  | { status: "unconfigured" }
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "noProfile"; user: FbUser }
  | { status: "disabled"; user: FbUser }
  | { status: "ready"; user: FbUser; profile: AdminProfile };

const SessionContext = createContext<Session>({ status: "loading" });

/** Role badal nantar token ekdach refresh (claim nasel tar loop nako). */
const refreshed = new Set<string>();

export const toDate = (v: unknown): Date | null =>
  v && typeof (v as { toDate?: () => Date }).toDate === "function" ? (v as { toDate: () => Date }).toDate() : null;

export function toProfile(uid: string, d: Record<string, unknown>): AdminProfile {
  return {
    uid,
    name: String(d.name ?? ""),
    email: String(d.email ?? ""),
    role: d.role === "superAdmin" ? "superAdmin" : "admin",
    roleId: typeof d.roleId === "string" && d.roleId ? d.roleId : null,
    active: d.active !== false,
    projects: (d.projects as AdminProfile["projects"]) ?? {},
    modules: (d.modules as AdminProfile["modules"]) ?? {},
    createdAt: toDate(d.createdAt),
    lastSeenAt: toDate(d.lastSeenAt),
  };
}

/** Core login + live admin profile — access badalla ki UI lagech badalto. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(() =>
    CORE.firebase ? { status: "loading" } : { status: "unconfigured" },
  );

  useEffect(() => {
    if (!CORE.firebase) return;
    const { auth, db } = core();
    let stopProfile: (() => void) | undefined;
    const stopAuth = onIdTokenChanged(auth, (user) => {
      stopProfile?.();
      stopProfile = undefined;
      if (!user) return setSession({ status: "signedOut" });
      stopProfile = onSnapshot(
        doc(db, "admins", user.uid),
        (snap) => {
          if (!snap.exists()) return setSession({ status: "noProfile", user });
          const profile = toProfile(user.uid, snap.data());
          setSession(profile.active ? { status: "ready", user, profile } : { status: "disabled", user });
          // Role badalla (super admin kela / kadhla) — `superAdmin` claim sathi token taja.
          user
            .getIdTokenResult()
            .then((r) => {
              const key = `${user.uid}:${profile.role}`;
              if ((r.claims.superAdmin === true) === (profile.role === "superAdmin") || refreshed.has(key)) return;
              refreshed.add(key);
              return user.getIdToken(true);
            })
            .catch(() => {});
        },
        () => setSession({ status: "noProfile", user }),
      );
    });
    return () => {
      stopProfile?.();
      stopAuth();
    };
  }, []);

  // Login asel tar projects registry live (navin project add zala ki lagech).
  const uid = session.status === "ready" || session.status === "noProfile" || session.status === "disabled" ? session.user.uid : null;
  useEffect(() => {
    if (!uid) return;
    const stop = startProjects();
    return () => {
      stop();
      resetProjects();
    };
  }, [uid]);

  // Admin disable / access kadhla ki project sessions pan band.
  useEffect(() => {
    if (session.status === "disabled") signOutAll();
  }, [session.status]);

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

/** Fakt `ready` session aat (RequireSession nantar). */
export function useAdmin(): AdminProfile {
  const s = useSession();
  if (s.status !== "ready") throw new Error("useAdmin outside ready session");
  return s.profile;
}

export const isSuper = (p: AdminProfile | null | undefined) => p?.role === "superAdmin";

/** Ya project che menus — super admin `*`, access nasel tar null. */
export function projectMenus(p: AdminProfile | null | undefined, projectId: string): string[] | null {
  if (!p?.active) return null;
  if (p.role === "superAdmin") return ["*"];
  const menus = p.projects[projectId];
  return menus?.length ? menus : null;
}

/** Master module permission (super admin la sagle). Server pan hech tapasto. */
export const canModule = (p: AdminProfile | null | undefined, module: ModuleKey, perm: ModulePerm) =>
  !!p?.active && (p.role === "superAdmin" || !!p.modules[module]?.includes(perm));

/** Admin la access aslele projects (live — super admin ne navin add kela ki lagech). */
export function useVisibleProjects(p: AdminProfile) {
  return useProjects().filter((pr) => projectMenus(p, pr.id));
}

export async function signIn(email: string, password: string) {
  const { auth } = core();
  auth.languageCode = getLang();
  await signInWithEmailAndPassword(auth, email.trim(), password);
  // Login nantar push token navin (server var user cha ekach token).
  await import("@/lib/corePush").then((m) => m.markLoginForPush()).catch(() => {});
}

export async function resetPassword(email: string) {
  const { auth } = core();
  auth.languageCode = getLang();
  await sendPasswordResetEmail(auth, email.trim());
}

/** Core ani sagle projects madhun logout. */
export async function signOutAll() {
  // Ya browser cha chat push token kadha (dusra user login karel tar tyala junya user che messages nakot).
  await import("@/lib/corePush").then((m) => m.dropCorePush()).catch(() => {});
  await Promise.all(
    getProjects()
      .filter((p) => p.firebase)
      .map((p) => signOut(services(p).auth).catch(() => {})),
  );
  if (CORE.firebase) await signOut(core().auth);
}
