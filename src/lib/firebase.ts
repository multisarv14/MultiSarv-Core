import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from "firebase/functions";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";

import { CORE, type ProjectDef } from "@/config/projects";
import { getLang, t, tMaybe } from "@/i18n";

export interface ProjectServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  functions: Functions;
}

const cache = new Map<string, ProjectServices>();

/**
 * Pratyek project sathi vegla named Firebase app — auth session pan vegla
 * (IndexedDB madhe app name ne save hoto), mhanun dropdown ne switch kelyavar
 * dusrya project cha login tikun rahto.
 */
export function services(project: ProjectDef): ProjectServices {
  const hit = cache.get(project.id);
  if (hit) return hit;
  if (!project.firebase) throw new Error(`${project.name}: Firebase config missing`);

  const app =
    getApps().find((a) => a.name === project.id) ?? initializeApp(project.firebase, project.id);
  const s: ProjectServices = {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
    storage: getStorage(app),
    functions: getFunctions(app, project.region),
  };
  // Local test: `VITE_USE_EMULATORS=true` — noai cha `firebase emulators:start` vaparto.
  if (import.meta.env.VITE_USE_EMULATORS === "true") {
    const host = import.meta.env.VITE_EMULATOR_HOST || "127.0.0.1";
    connectAuthEmulator(s.auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(s.db, host, 8080);
    connectStorageEmulator(s.storage, host, 9199);
    connectFunctionsEmulator(s.functions, host, 5001);
  }
  cache.set(project.id, s);
  return s;
}

export interface CoreServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
  /** Internal Chat attachments. */
  storage: FirebaseStorage;
}

let coreCache: CoreServices | null = null;

/**
 * Multisarv core (admins + access). Emulator mode madhe pan live core vaparto —
 * projects emulator la jatat, ani auth emulator custom token cha signature tapasat nahi.
 */
export function core(): CoreServices {
  if (coreCache) return coreCache;
  if (!CORE.firebase) throw new Error("Core Firebase config missing");
  const app = getApps().find((a) => a.name === "core") ?? initializeApp(CORE.firebase, "core");
  coreCache = { app, auth: getAuth(app), db: getFirestore(app), functions: getFunctions(app, CORE.region), storage: getStorage(app) };
  return coreCache;
}

/** Core callable (createAdmin, getProjectToken …). */
export async function callCore<T = unknown>(name: string, data: Record<string, unknown>): Promise<T> {
  const fn = httpsCallable<Record<string, unknown>, T>(core().functions, name);
  return (await fn(data)).data;
}

/** Admin callable — server `fail()` panel chya current bhashet message deto. */
export async function callFn<T = unknown>(
  project: ProjectDef,
  name: string,
  data: Record<string, unknown>,
): Promise<T> {
  const fn = httpsCallable<Record<string, unknown>, T>(services(project).functions, name);
  const res = await fn({ ...data, lang: getLang() });
  return res.data;
}

/** Firebase errors → admin la samjel asa message. */
export function errorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const raw = err as { code?: string; message?: string };
    // Callable errors `functions/failed-precondition` ani message la HTTP status ("… [400]").
    const e = {
      code: raw.code?.replace(/^functions\//, ""),
      message: raw.message?.replace(/\s*\[\d{3}\]$/, ""),
    };
    // Core functions message mhanun i18n key pathavtat (`core.err.*`).
    if (e.message?.startsWith("core.err.")) return tMaybe(e.message, t("err.generic"));
    switch (e.code) {
      case "permission-denied":
      case "functions/permission-denied":
        return e.message?.includes("Missing or insufficient")
          ? t("err.notAdminClaim")
          : e.message || t("err.permission");
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
      case "auth/invalid-email":
        return t("err.badCredentials");
      case "auth/user-disabled":
        return t("core.err.disabled");
      case "auth/too-many-requests":
        return t("err.tooMany");
      case "auth/unauthorized-domain":
        return t("err.unauthorizedDomain");
      case "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
        return t("err.badApiKey");
      case "auth/network-request-failed":
        return t("err.network");
      case "failed-precondition":
        if (e.message?.includes("requires an index")) {
          return t("err.needsIndex");
        }
        return e.message || t("err.notPossible");
      case "unavailable":
        return t("err.unavailable");
    }
    if (e.message) return e.message.replace(/^Firebase: /, "");
  }
  return t("err.generic");
}
