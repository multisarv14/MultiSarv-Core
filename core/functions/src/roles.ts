/**
 * Settings → Roles — super admin che custom roles (Support, Developer …).
 * Core User la ek role dila jato (`admins/{uid}.roleId`); access level
 * (super admin / admin) ani Module Access vegla rahto.
 */
import { audit, callable, db, fail, now, requireSuper, str } from "./shared.js";

const roles = db.collection("roles");

/** Role ID — null / "" = role nahi; nahitar asnara role. */
export async function parseRoleId(v: unknown): Promise<string | null> {
  if (v === null || v === undefined || v === "") return null;
  const id = str(v, "badRole", 1, 64);
  if (!(await roles.doc(id).get()).exists) fail("invalid-argument", "badRole");
  return id;
}

export const saveRole = callable<{ id?: string; name?: string; description?: string }>(async (req) => {
  const by = await requireSuper(req);
  const name = str(req.data.name, "badRoleName", 2, 40);
  const description = typeof req.data.description === "string" ? req.data.description.trim().slice(0, 200) : "";

  // Naav unique (case ignore) — dropdown madhe don "Support" nakot.
  const key = name.toLowerCase();
  const clash = await roles.where("key", "==", key).limit(2).get();
  if (clash.docs.some((d) => d.id !== req.data.id)) fail("already-exists", "roleExists");

  if (req.data.id) {
    const ref = roles.doc(str(req.data.id, "badRole", 1, 64));
    if (!(await ref.get()).exists) fail("not-found", "badRole");
    await ref.set({ name, key, description, updatedAt: now(), updatedBy: by.uid }, { merge: true });
    await audit(by, "roleUpdate", { uid: ref.id, email: name });
    return { id: ref.id };
  }
  const ref = await roles.add({ name, key, description, createdAt: now(), createdBy: by.uid, updatedAt: now() });
  await audit(by, "roleCreate", { uid: ref.id, email: name });
  return { id: ref.id };
});

/** Konala dila asel tar delete nahi — adhi tya users cha role badla. */
export const deleteRole = callable<{ id?: string }>(async (req) => {
  const by = await requireSuper(req);
  const ref = roles.doc(str(req.data.id, "badRole", 1, 64));
  const snap = await ref.get();
  if (!snap.exists) fail("not-found", "badRole");
  const used = await db.collection("admins").where("roleId", "==", ref.id).count().get();
  if (used.data().count > 0) fail("failed-precondition", "roleInUse");
  await ref.delete();
  await audit(by, "roleDelete", { uid: ref.id, email: String(snap.get("name") ?? "") });
  return { ok: true };
});
