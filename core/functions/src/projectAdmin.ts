/**
 * Super admin: navin project (NOAI kinva SocietySarv type) add karne, Firebase la connect karne,
 * mahiti badalne, kadhne. Service account key encrypt karun `projectKeys` madhe —
 * Firestore rules madhe client la kahich access nahi.
 */
import { deleteApp, getApps } from "firebase-admin/app";

import { authFromKey, encryptKey, isBuiltIn, KEYS_SECRET, MULTISARV_ID, TEMPLATES, type ProjectTemplate } from "./projects.js";
import { audit, callable, db, fail, now, requireSuper, str } from "./shared.js";

const ID = /^[a-z][a-z0-9-]{1,29}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const REGIONS = ["asia-south1", "asia-south2", "us-central1", "europe-west1", "asia-southeast1"];
/** Firestore database id — `(default)` kinva named (`societysarv-app-db`). */
const DATABASE_ID = /^[a-z][a-z0-9-]{3,62}$/;

const ref = (id: string) => db.collection("projects").doc(id);

/** Panel `PROJECT_STATUSES` (src/config/projects.ts) sobat same. */
const STATUSES = ["planning", "rnd", "development", "testing", "active", "onHold"];
const TYPES = ["webApp", "mobileApp", "webMobile", "marketplace", "website", "internal", "other"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** EverMind sarkhya project cha app (tyacha `/api/admin/*`) — https, kinva local test sathi localhost. */
const API_URL = /^(https:\/\/[a-z0-9.-]+\.[a-z]{2,}|http:\/\/localhost:\d{2,5})$/;
/** Logo = chhota data URL (panel 256px la resize karto) — Firestore doc madhe. */
const LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

interface Person {
  uid: string;
  name: string;
  email: string;
}

async function person(uid: unknown): Promise<Person> {
  const id = str(uid, "badTeamMember", 1, 128);
  const a = (await db.collection("admins").doc(id).get()).data();
  if (!a?.active) fail("invalid-argument", "badTeamMember");
  return { uid: id, name: String(a!.name), email: String(a!.email) };
}

type Details = Record<string, unknown>;

/**
 * Project chi mahiti — dilele fieldsach (partial update). `full` = navin project
 * (naav compulsory, baki default).
 */
async function details(d: Details, full: boolean): Promise<Details> {
  const out: Details = {};
  const has = (k: string) => full || d[k] !== undefined;
  const text = (k: string, max: number) => (typeof d[k] === "string" ? (d[k] as string).trim().slice(0, max) : "");

  if (has("name")) out.name = str(d.name, "badProjectName", 2, 40);
  if (has("tagline")) out.tagline = text("tagline", 80);
  if (has("client")) out.client = text("client", 80);
  if (has("description")) out.description = text("description", 2000);
  if (has("accent")) out.accent = typeof d.accent === "string" && COLOR.test(d.accent) ? d.accent : "#6366f1";
  if (has("region")) out.region = typeof d.region === "string" && REGIONS.includes(d.region) ? d.region : "asia-south1";
  if (has("apiUrl")) {
    const v = typeof d.apiUrl === "string" ? d.apiUrl.trim().toLowerCase().replace(/\/+$/, "") : "";
    if (v && !API_URL.test(v)) fail("invalid-argument", "badApiUrl");
    out.apiUrl = v || null;
  }
  if (has("vapidKey")) out.vapidKey = typeof d.vapidKey === "string" && d.vapidKey.trim().length > 40 ? d.vapidKey.trim() : null;
  if (has("status")) {
    if (d.status !== undefined && !STATUSES.includes(d.status as string)) fail("invalid-argument", "badProjectStatus");
    out.status = (d.status as string) ?? "active";
  }
  if (has("projectType")) {
    if (d.projectType !== undefined && !TYPES.includes(d.projectType as string)) fail("invalid-argument", "badProjectType");
    out.projectType = (d.projectType as string) ?? "marketplace";
  }
  for (const k of ["startDate", "endDate"]) {
    if (!has(k)) continue;
    const v = d[k];
    if (v && (typeof v !== "string" || !DATE.test(v) || isNaN(Date.parse(v)))) fail("invalid-argument", "badProjectDate");
    out[k] = v || null;
  }
  if (out.startDate && out.endDate && (out.endDate as string) < (out.startDate as string)) fail("invalid-argument", "endBeforeStart");
  if (has("logo")) {
    const v = d.logo;
    if (v && (typeof v !== "string" || !LOGO.test(v) || v.length > 300_000)) fail("invalid-argument", "badLogo");
    out.logo = v || null;
  }
  if (has("manager")) out.manager = d.manager ? await person(d.manager) : null;
  if (has("team")) {
    const ids = Array.isArray(d.team) ? [...new Set(d.team as unknown[])] : [];
    if (ids.length > 50) fail("invalid-argument", "badTeamMember");
    out.team = await Promise.all(ids.map(person));
  }
  return out;
}

async function dynamicProject(id: unknown) {
  const pid = str(id, "unknownProject", 2, 30);
  if (isBuiltIn(pid)) fail("failed-precondition", "builtInProject");
  const snap = await ref(pid).get();
  if (!snap.exists) fail("not-found", "unknownProject");
  return { id: pid, data: snap.data()! };
}

export const createProject = callable<Details & { id?: string; template?: string }>(
  async (req) => {
    const by = await requireSuper(req);
    const id = str(req.data.id, "badProjectId", 2, 30).toLowerCase();
    if (!ID.test(id)) fail("invalid-argument", "badProjectId");
    if (id === MULTISARV_ID || isBuiltIn(id) || (await ref(id).get()).exists) fail("already-exists", "projectExists");
    if (req.data.template !== undefined && !TEMPLATES.includes(req.data.template as ProjectTemplate)) {
      fail("invalid-argument", "badTemplate");
    }
    const { template, ...rest } = req.data;
    const m = await details(rest, true);
    await ref(id).set({
      ...m,
      // Structure (menus / access) — nantar fakt super admin `updateProject` ne badalto.
      type: (template as ProjectTemplate | undefined) ?? "marketplace",
      firebase: null,
      connected: false,
      createdAt: now(),
      createdBy: { uid: by.uid, name: by.me.name, email: by.me.email },
      updatedAt: now(),
    });
    await audit(by, "projectCreate", { uid: id, email: String(m.name) });
    return { id };
  },
);

/**
 * Project Overview → Edit (fakt dilele fields). Built-in (NOAI) sathi overlay doc —
 * connection code / env madhech rahte, fakt overview mahiti ithe.
 * Structure (template) fakt dynamic project cha badalta yeto. Admins che juna structure che menus
 * `getProjectToken` gaalto (navin structure madhe je aahet tevdhech token madhe); ekhi urla nahi tar
 * tya admin la project cha access nahi — Module Access madhun navin menus dya.
 */
export const updateProject = callable<Details & { id?: string; template?: string }>(async (req) => {
  const by = await requireSuper(req);
  const id = str(req.data.id, "unknownProject", 2, 30);
  const builtIn = isBuiltIn(id);
  if (!builtIn) await dynamicProject(id);
  const { id: _id, template, ...rest } = req.data;
  const m = await details(rest, false);
  if (builtIn) delete m.region; // built-in cha region code madhe
  if (template !== undefined) {
    if (builtIn) fail("failed-precondition", "builtInProject");
    if (!TEMPLATES.includes(template as ProjectTemplate)) fail("invalid-argument", "badTemplate");
    m.type = template;
  }
  if (Object.keys(m).length === 0) return { ok: true };
  await ref(id).set({ ...m, ...(builtIn ? { builtIn: true } : {}), updatedAt: now(), updatedBy: by.uid }, { merge: true });
  await audit(by, "projectUpdate", { uid: id, email: String(m.name ?? id) }, { fields: Object.keys(m) });
  return { ok: true };
});

interface ServiceAccount {
  type: string;
  project_id: string;
  private_key: string;
  client_email: string;
}

const WEB_KEYS = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"] as const;

/**
 * Firebase web config + service account JSON. Donhi ekach Firebase project che
 * aahet ka, ani key ne kharach login token banto ka he tapasun mag save.
 */
export const connectProject = callable<{
  id?: string;
  firebase?: Record<string, unknown>;
  serviceAccount?: string;
  databaseId?: string;
}>(
  async (req) => {
    const by = await requireSuper(req);
    const { id, data } = await dynamicProject(req.data.id);

    const raw = req.data.firebase ?? {};
    const firebase: Record<string, string> = {};
    for (const k of WEB_KEYS) if (typeof raw[k] === "string" && raw[k]) firebase[k] = String(raw[k]).trim();
    if (!firebase.apiKey || !firebase.projectId || !firebase.appId) fail("invalid-argument", "badWebConfig");

    const dbRaw = typeof req.data.databaseId === "string" ? req.data.databaseId.trim() : "";
    if (dbRaw && dbRaw !== "(default)" && !DATABASE_ID.test(dbRaw)) fail("invalid-argument", "badDatabaseId");
    const databaseId = dbRaw && dbRaw !== "(default)" ? dbRaw : null;

    let sa: ServiceAccount;
    try {
      sa = JSON.parse(str(req.data.serviceAccount, "badServiceAccount", 100, 20000));
    } catch {
      return fail("invalid-argument", "badServiceAccount");
    }
    if (sa.type !== "service_account" || !sa.private_key || !sa.client_email || !sa.project_id) {
      fail("invalid-argument", "badServiceAccount");
    }
    if (sa.project_id !== firebase.projectId) fail("invalid-argument", "projectMismatch");

    // Khari chachni: key ne Auth API chalte ka ani custom token banto ka.
    const probe = `probe-${id}-${Date.now()}`;
    try {
      const a = authFromKey(probe, sa);
      await a.listUsers(1);
      await a.createCustomToken("ms_probe");
    } catch (err) {
      const code = String((err as { code?: string }).code ?? "");
      fail("failed-precondition", code.includes("configuration-not-found") ? "authNotEnabled" : "keyRejected");
    } finally {
      const app = getApps().find((x) => x.name === probe);
      if (app) await deleteApp(app).catch(() => {});
    }

    const keyVersion = Date.now();
    await db.collection("projectKeys").doc(id).set({ enc: encryptKey(JSON.stringify(sa)), clientEmail: sa.client_email, keyVersion });
    await ref(id).update({ firebase, databaseId, connected: true, keyVersion, connectedAt: now(), connectedBy: by.uid, updatedAt: now() });
    await audit(by, "projectConnect", { uid: id, email: String(data.name) }, { firebaseProject: sa.project_id });
    return { ok: true, projectId: sa.project_id };
  },
  [KEYS_SECRET],
);

export const removeProject = callable<{ id?: string }>(async (req) => {
  const by = await requireSuper(req);
  const { id, data } = await dynamicProject(req.data.id);
  await db.collection("projectKeys").doc(id).delete();
  await ref(id).delete();
  await audit(by, "projectRemove", { uid: id, email: String(data.name) });
  return { ok: true };
});
