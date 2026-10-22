/**
 * Multisarv core — sagle admins ithe, ani tyancha project / menu access.
 *
 * Panel email + password ne core madhe login karto. Project ughadla ki
 * `getProjectToken` tya project cha custom token deto (claims: admin, menus),
 * panel tyane project madhe silent login karto — phone OTP nahi.
 */
import { getFirestore } from "firebase-admin/firestore";
import { type CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

import { parseRoleId } from "./roles.js";
import { getProject, listProjects, panelUid, PROJECT_SECRETS, projectAuth, type CoreProject } from "./projects.js";
import {
  auth,
  callable as baseCallable,
  db,
  fail,
  FieldValue,
  loadAdmin,
  now,
  parseModules,
  requireSuper,
  audit,
  str,
  type Access,
  type AdminDoc,
  type Role,
} from "./shared.js";

export * from "./projectAdmin.js";
export * from "./tickets.js";
export * from "./roles.js";
export * from "./notices.js";
export * from "./chat.js";
export * from "./push.js";
export * from "./calls.js";

/** Admin / project callables — project keys (custom token, revoke) lagtat. */
const callable = <T>(handler: (req: CallableRequest<T>) => Promise<unknown>) => baseCallable<T>(handler, PROJECT_SECRETS);


// ── Validation ───────────────────────────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const role = (v: unknown): Role => (v === "superAdmin" ? "superAdmin" : "admin");

/** Fakt mahit aslele projects ani tyache menus — baki sagla gal. */
async function parseAccess(v: unknown): Promise<Access> {
  const out: Access = {};
  if (!v || typeof v !== "object") return out;
  const projects = await listProjects();
  for (const [id, menus] of Object.entries(v as Record<string, unknown>)) {
    const p = projects.find((x) => x.id === id);
    if (!p || !Array.isArray(menus)) continue;
    const valid = [...new Set(menus.filter((m): m is string => typeof m === "string" && p.menus.includes(m)))];
    if (valid.length) out[id] = valid;
  }
  return out;
}

const menusOf = (a: AdminDoc | null, projectId: string): string[] | null => {
  if (!a?.active) return null;
  if (a.role === "superAdmin") return ["*"];
  return a.projects?.[projectId]?.length ? a.projects[projectId] : null;
};

const same = (a: string[] | null, b: string[] | null) =>
  (a ?? []).slice().sort().join() === (b ?? []).slice().sort().join();

/**
 * Access badalla → tya project madhla session revoke (max 1 taas juna token
 * chalto, mag panel navin token gheto) ani admin alerts sathi `panelMenus` taja.
 */
async function syncProject(project: CoreProject, uid: string, menus: string[] | null) {
  const target = panelUid(uid);
  try {
    const pAuth = await projectAuth(project);
    await pAuth.revokeRefreshTokens(target).catch((e: { code?: string }) => {
      if (e.code !== "auth/user-not-found") throw e;
    });
    // `users/{uid}` (admin alerts) fakt NOAI structure madhe. SocietySarv sarkhya project cha
    // `(default)` DB dusrya app cha asu shakto — tithe kahich lihu naye.
    if (project.template !== "marketplace") return;
    const ref = getFirestore(pAuth.app).collection("users").doc(target);
    if ((await ref.get()).exists) {
      await ref.set(
        menus
          ? { panelMenus: menus, availableRoles: FieldValue.arrayUnion("admin") }
          : { panelMenus: [], availableRoles: FieldValue.arrayRemove("admin"), fcmTokens: [] },
        { merge: true },
      );
    }
  } catch (err) {
    // Ekhada project down asla tari baki access badal thambu naye.
    logger.warn("syncProject failed", { project: project.id, uid, err });
  }
}

async function syncAll(uid: string, before: AdminDoc | null, after: AdminDoc | null) {
  const projects = (await listProjects()).filter((p) => p.connected);
  await Promise.all(
    projects.map((p) => {
      const a = menusOf(before, p.id);
      const b = menusOf(after, p.id);
      return same(a, b) ? null : syncProject(p, uid, b);
    }),
  );
}


// ── Project login ────────────────────────────────────────────────────

/** Project madhe silent login sathi custom token (access asel tarach). */
export const getProjectToken = callable<{ projectId?: string }>(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) fail("unauthenticated", "signIn");
  const project = await getProject(req.data.projectId);
  if (!project) fail("not-found", "unknownProject");
  if (!project!.connected) fail("failed-precondition", "projectNotConnected");

  const me = await loadAdmin(uid!);
  if (!me) fail("permission-denied", "noProfile");
  if (!me!.active) fail("permission-denied", "disabled");
  // Structure badalli tar juna structure che menus (je ata nahit) token madhe jat nahit.
  const menus = menusOf(me, project!.id)?.filter((m) => m === "*" || project!.menus.includes(m));
  if (!menus?.length) fail("permission-denied", "noProjectAccess");

  const token = await (await projectAuth(project!)).createCustomToken(panelUid(uid!), {
    admin: true,
    panel: true,
    menus,
    adminName: me!.name,
    adminEmail: me!.email,
  });
  await db.collection("admins").doc(uid!).set({ lastSeenAt: now() }, { merge: true });
  return { token, menus };
});

// ── Admins (fakt super admin) ────────────────────────────────────────

export const createAdmin = callable<{
  name?: string;
  email?: string;
  password?: string;
  role?: string;
  roleId?: string | null;
  projects?: unknown;
  modules?: unknown;
}>(
  async (req) => {
    const by = await requireSuper(req);
    const name = str(req.data.name, "badName", 2, 60);
    const email = str(req.data.email, "badEmail", 5, 120).toLowerCase();
    if (!EMAIL.test(email)) fail("invalid-argument", "badEmail");
    const password = str(req.data.password, "weakPassword", 8, 128);
    const doc: AdminDoc = {
      name,
      email,
      role: role(req.data.role),
      roleId: await parseRoleId(req.data.roleId),
      active: true,
      projects: await parseAccess(req.data.projects),
      modules: parseModules(req.data.modules),
    };

    const user = await auth.createUser({ email, password, displayName: name }).catch((e: { code?: string }) => {
      if (e.code === "auth/email-already-exists") fail("already-exists", "emailExists");
      if (e.code === "auth/invalid-password") fail("invalid-argument", "weakPassword");
      throw e;
    });
    await auth.setCustomUserClaims(user.uid, { superAdmin: doc.role === "superAdmin" });
    await db.collection("admins").doc(user.uid).set({ ...doc, createdAt: now(), createdBy: by.uid, updatedAt: now() });
    await audit(by, "create", { uid: user.uid, email }, { role: doc.role, projects: doc.projects });
    return { uid: user.uid };
  },
);

export const updateAdmin = callable<{
  uid?: string;
  name?: string;
  role?: string;
  roleId?: string | null;
  active?: boolean;
  projects?: unknown;
  modules?: unknown;
}>(
  async (req) => {
    const by = await requireSuper(req);
    const uid = str(req.data.uid, "badUid", 1, 128);
    const before = await loadAdmin(uid);
    if (!before) fail("not-found", "adminNotFound");

    const patch: Partial<AdminDoc> = {};
    if (req.data.name !== undefined) patch.name = str(req.data.name, "badName", 2, 60);
    if (req.data.role !== undefined) patch.role = role(req.data.role);
    if (req.data.roleId !== undefined) patch.roleId = await parseRoleId(req.data.roleId);
    if (typeof req.data.active === "boolean") patch.active = req.data.active;
    if (req.data.projects !== undefined) patch.projects = await parseAccess(req.data.projects);
    if (req.data.modules !== undefined) patch.modules = parseModules(req.data.modules);

    // Swatahla chukun lock-out hou naye.
    if (uid === by.uid && ((patch.role && patch.role !== "superAdmin") || patch.active === false)) {
      fail("failed-precondition", "cannotLockSelf");
    }

    const after: AdminDoc = { ...before!, ...patch };
    await db.collection("admins").doc(uid).set({ ...patch, updatedAt: now() }, { merge: true });

    if (patch.role && patch.role !== before!.role) {
      await auth.setCustomUserClaims(uid, { superAdmin: patch.role === "superAdmin" });
    }
    if (patch.name && patch.name !== before!.name) await auth.updateUser(uid, { displayName: patch.name });
    if (patch.active !== undefined && patch.active !== before!.active) {
      await auth.updateUser(uid, { disabled: !patch.active });
      if (!patch.active) await auth.revokeRefreshTokens(uid);
    }

    await syncAll(uid, before, after);
    await audit(by, "update", { uid, email: before!.email }, { changes: patch });
    return { ok: true };
  },
);

/**
 * Super admin → kontyahi Core User (admin / super admin) sathi password reset link.
 * Link panel la parat deto (copy / share); email panel Firebase Auth ne pathavto.
 */
export const adminResetPassword = callable<{ uid?: string }>(async (req) => {
  const by = await requireSuper(req);
  const uid = str(req.data.uid, "badUid", 1, 128);
  const target = await loadAdmin(uid);
  if (!target) fail("not-found", "adminNotFound");
  const user = await auth.getUser(uid).catch(() => null);
  if (!user?.email) fail("not-found", "adminNotFound");
  if (user!.disabled) fail("failed-precondition", "resetDisabledUser");
  // Reset nantar panel cha login page (authorized domain asel tar); nahitar Firebase cha default.
  const link = await auth
    .generatePasswordResetLink(user!.email!, { url: "https://core.multisarv.com/login" })
    .catch(() => auth.generatePasswordResetLink(user!.email!));
  await audit(by, "passwordReset", { uid, email: user!.email });
  return { email: user!.email, link };
});

export const deleteAdmin = callable<{ uid?: string }>(async (req) => {
  const by = await requireSuper(req);
  const uid = str(req.data.uid, "badUid", 1, 128);
  if (uid === by.uid) fail("failed-precondition", "cannotLockSelf");
  const before = await loadAdmin(uid);
  if (!before) fail("not-found", "adminNotFound");

  await syncAll(uid, before, null);
  const projects = (await listProjects()).filter((p) => p.connected);
  await Promise.all(projects.map((p) => projectAuth(p).then((a) => a.deleteUser(panelUid(uid))).catch(() => {})));
  await auth.deleteUser(uid).catch(() => {});
  await db.collection("admins").doc(uid).delete();
  await audit(by, "delete", { uid, email: before!.email });
  return { ok: true };
});
