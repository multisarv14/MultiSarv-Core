import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";

/**
 * Core la mahit aslele projects:
 *  - built-in (NOAI) — code madhe, key `PROJECT_KEY_<ID>` secret madhe;
 *  - super admin ne panel madhun add kelele — `projects/{id}` (Firestore),
 *    service account key `projectKeys/{id}` madhe encrypt karun (client la kadhich nahi).
 */
export interface CoreProject {
  id: string;
  name: string;
  builtIn: boolean;
  /** Firebase web config + service account jodla aahe. */
  connected: boolean;
  menus: readonly string[];
  /** Panel che pages konte — NOAI sarkhe (marketplace), SocietySarv sarkhe (society) kinva EverMind sarkhe (evermind). */
  template: ProjectTemplate;
  /** Named Firestore database (SocietySarv: `societysarv-app-db`); nasel tar `(default)`. */
  databaseId?: string;
  /** Built-in sathi secret. */
  key?: ReturnType<typeof defineSecret>;
  /** Dynamic key badalli ki navin Admin app. */
  keyVersion?: number;
}

/** NOAI structure che sagle menus — panel cha `NAV` (src/components/layout/nav.ts). */
export const MARKETPLACE_MENUS = [
  "dashboard",
  "users",
  "kyc",
  "tasks",
  "disputes",
  "payouts",
  "ledger",
  "notifications",
  "catalog",
] as const;

/** SocietySarv structure che menus — panel cha `SOCIETY_NAV` (src/components/layout/nav.ts). */
export const SOCIETY_MENUS = [
  "dashboard",
  "residents",
  "bills",
  "finance",
  "visitors",
  "notices",
  "complaints",
  "contacts",
  "roles",
  "subscriptions",
] as const;

/**
 * EverMind structure che menus — panel cha `EVERMIND_NAV`. Data Firestore madhun nahi: EverMind chya
 * `/api/admin/*` la panel cha ID token jato, ani tithe `menus` claim tapasla jato
 * (EverMind `src/lib/admin.ts` → `PanelMenu` sobat same).
 */
export const EVERMIND_MENUS = ["dashboard", "companies", "users", "upgrades"] as const;

export type ProjectTemplate = "marketplace" | "society" | "evermind";
export const TEMPLATES: readonly ProjectTemplate[] = ["marketplace", "society", "evermind"];

/** Project doc `type` → template. Juna / rikama = marketplace (NOAI sarkha). */
export const templateOf = (v: unknown): ProjectTemplate =>
  TEMPLATES.includes(v as ProjectTemplate) ? (v as ProjectTemplate) : "marketplace";

export const menusFor = (template: ProjectTemplate): readonly string[] =>
  template === "society" ? SOCIETY_MENUS : template === "evermind" ? EVERMIND_MENUS : MARKETPLACE_MENUS;

const BUILT_IN: CoreProject[] = [
  { id: "noai", name: "NOAI", builtIn: true, connected: true, template: "marketplace", key: defineSecret("PROJECT_KEY_NOAI"), menus: MARKETPLACE_MENUS },
];

/** Dynamic projects chya service account keys encrypt karnari master key. */
export const KEYS_SECRET = defineSecret("PROJECT_KEYS_SECRET");

export const PROJECT_SECRETS = [...BUILT_IN.map((p) => p.key!), KEYS_SECRET];

/** Tickets sathi "Multisarv" (master panel swatah) — Firebase project nahi. */
export const MULTISARV_ID = "multisarv";

const db = () => getFirestore();

export const isBuiltIn = (id: unknown) => BUILT_IN.some((p) => p.id === id);

function fromDoc(id: string, d: FirebaseFirestore.DocumentData): CoreProject {
  const template = templateOf(d.type);
  return {
    id,
    name: String(d.name ?? id),
    builtIn: false,
    connected: d.connected === true,
    menus: menusFor(template),
    template,
    databaseId: typeof d.databaseId === "string" && d.databaseId ? d.databaseId : undefined,
    keyVersion: Number(d.keyVersion ?? 0),
  };
}

export async function listProjects(): Promise<CoreProject[]> {
  const snap = await db().collection("projects").get();
  // `builtIn: true` docs = built-in project chi overview mahiti (overlay), vegla project nahi.
  return [...BUILT_IN, ...snap.docs.filter((d) => d.get("builtIn") !== true).map((d) => fromDoc(d.id, d.data()))];
}

export async function getProject(id: unknown): Promise<CoreProject | null> {
  if (typeof id !== "string" || !id) return null;
  const built = BUILT_IN.find((p) => p.id === id);
  if (built) return built;
  const snap = await db().collection("projects").doc(id).get();
  return snap.exists ? fromDoc(snap.id, snap.data()!) : null;
}

// ── Key encryption (AES-256-GCM) ─────────────────────────────────────

const masterKey = () => createHash("sha256").update(KEYS_SECRET.value()).digest();

export function encryptKey(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", masterKey(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

function decryptKey(enc: string): string {
  const [iv, tag, data] = enc.split(".").map((s) => Buffer.from(s, "base64"));
  const d = createDecipheriv("aes-256-gcm", masterKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

/** Service account JSON ne target project cha Admin SDK (named app, cache). */
export function authFromKey(name: string, json: { project_id: string }): Auth {
  const existing = getApps().find((a) => a.name === name);
  if (existing) return getAuth(existing);
  return getAuth(initializeApp({ credential: cert(json as never), projectId: json.project_id }, name));
}

/** Target project cha Admin Auth — built-in secret kinva encrypted Firestore key. */
export async function projectAuth(project: CoreProject): Promise<Auth> {
  if (project.builtIn) {
    return authFromKey(`project-${project.id}`, JSON.parse(project.key!.value()));
  }
  const snap = await db().collection("projectKeys").doc(project.id).get();
  if (!snap.exists) throw new Error(`${project.id}: not connected`);
  return authFromKey(`project-${project.id}-${project.keyVersion ?? 0}`, JSON.parse(decryptKey(snap.get("enc"))));
}

/** Target project madhe admin cha uid — app users pasun vegla disava mhanun prefix. */
export const panelUid = (uid: string) => `ms_${uid}`;

/**
 * Connected project chi key jo ya Firebase project sathi aahe tyacha Admin app.
 * GarageGuru vegla panel project nahi — to `multisarv-mobileapps` madhe rahto, ani tya project chi
 * key SocietySarv Connect kartana aadhich `projectKeys` madhe aahe; tich key ithe vaparto.
 */
export async function appForFirebaseProject(firebaseProjectId: string): Promise<App | null> {
  const name = `fb-${firebaseProjectId}`;
  const suffix = `@${firebaseProjectId}.iam.gserviceaccount.com`;
  const snap = await db().collection("projectKeys").get();
  for (const doc of snap.docs) {
    if (!String(doc.get("clientEmail") ?? "").endsWith(suffix)) continue;
    const json = JSON.parse(decryptKey(doc.get("enc")));
    if (json.project_id !== firebaseProjectId) continue;
    const appName = `${name}-${doc.id}-${doc.get("keyVersion") ?? 0}`;
    return getApps().find((a) => a.name === appName) ?? initializeApp({ credential: cert(json), projectId: json.project_id }, appName);
  }
  return null;
}
