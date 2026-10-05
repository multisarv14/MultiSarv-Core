import type { FirebaseOptions } from "firebase/app";

/**
 * Multisarv core — sagle admins ani tyancha access ithe (email + password login).
 * Project ughadla ki core `getProjectToken` tya project cha token deto.
 */
export const CORE = {
  firebase: firebaseFromEnv("CORE"),
  region: (import.meta.env.VITE_CORE_REGION as string | undefined)?.trim() || "asia-south1",
};

/**
 * Multisarv project registry.
 *
 * Pratyek project = vegla Firebase project, pan schema ekach (NOAI sarkha:
 * users, tasks, escrows, wallets, transactions, payouts, disputes, kyc,
 * categories + admin callables). Navin project jodaycha asel tar:
 * Saglyat sopa: Projects → Add project (super admin) — code badal nako.
 * Code madhe built-in project:
 *   1. Khali `BUILT_IN_PROJECTS` madhe ek entry add kara (envKey unique).
 *   2. `.env.local` madhe `VITE_<ENVKEY>_*` Firebase web config taka.
 *   3. `core/functions/src/projects.ts` madhe same `id` ani service account secret.
 * Baki sagla (dropdown, pages, access) apoaap chalto.
 */
export interface ProjectDef {
  /** URL slug — `/p/<id>/...` */
  id: string;
  name: string;
  tagline: string;
  /** Brand accent (hex) — sidebar / buttons ya rangat. */
  accent: string;
  /** Cloud Functions region. */
  region: string;
  currency: string;
  /** Users che phone dakhavtana country code. */
  phonePrefix: string;
  /** Platform commission (%) — fakt display sathi; khara hishob Functions karto. */
  platformFeePercent: number;
  firebase: FirebaseOptions | null;
  /** Web push (FCM) VAPID public key — Console → Cloud Messaging → Web Push certificates. */
  vapidKey?: string;
  /** Code madhe (NOAI); nasel tar super admin ne panel madhun add kelela. */
  builtIn?: boolean;
  /** Project Overview mahiti (core `projects/{id}`) — sagle optional. */
  logo?: string | null;
  client?: string;
  description?: string;
  status?: ProjectStatus;
  projectType?: ProjectType;
  startDate?: string | null;
  endDate?: string | null;
  manager?: ProjectPerson | null;
  team?: ProjectPerson[];
  createdAt?: Date | null;
  updatedAt?: Date | null;
  createdBy?: ProjectPerson | null;
}

export type ProjectStatus = "planning" | "rnd" | "development" | "testing" | "active" | "onHold";
export type ProjectType = "webApp" | "mobileApp" | "webMobile" | "marketplace" | "website" | "internal" | "other";
/** Core `projectAdmin.ts` STATUSES sobat same. */
export const PROJECT_STATUSES: ProjectStatus[] = ["planning", "rnd", "development", "testing", "active", "onHold"];
export const PROJECT_TYPES: ProjectType[] = ["webApp", "mobileApp", "webMobile", "marketplace", "website", "internal", "other"];

export interface ProjectPerson {
  uid: string;
  name: string;
  email: string;
}

function firebaseFromEnv(key: string): FirebaseOptions | null {
  const env = import.meta.env;
  const get = (name: string) => (env[`VITE_${key}_${name}`] as string | undefined)?.trim() || undefined;
  const config: FirebaseOptions = {
    apiKey: get("API_KEY"),
    authDomain: get("AUTH_DOMAIN"),
    projectId: get("PROJECT_ID"),
    storageBucket: get("STORAGE_BUCKET"),
    messagingSenderId: get("MESSAGING_SENDER_ID"),
    appId: get("APP_ID"),
  };
  // apiKey + projectId shivay Auth / Firestore chalat nahit.
  return config.apiKey && config.projectId ? config : null;
}

/** Code madhle projects. Super admin ne add kelele `@/context/projects` madhun yetat. */
export const BUILT_IN_PROJECTS: ProjectDef[] = [
  {
    id: "noai",
    name: "NOAI",
    tagline: "Workforce marketplace",
    accent: "#6366f1",
    region: "asia-south1",
    currency: "INR",
    phonePrefix: "+91",
    platformFeePercent: 10,
    firebase: firebaseFromEnv("NOAI"),
    vapidKey: (import.meta.env.VITE_NOAI_VAPID_KEY as string | undefined)?.trim() || undefined,
    builtIn: true,
  },
  // Navin project udaharan:
  // {
  //   id: "vijaydhara",
  //   name: "Vijaydhara",
  //   tagline: "…",
  //   accent: "#0ea5e9",
  //   region: "asia-south1",
  //   currency: "INR",
  //   phonePrefix: "+91",
  //   platformFeePercent: 10,
  //   firebase: firebaseFromEnv("VIJAYDHARA"),
  // },
];
