/**
 * Super Admin → Notifications — fakt Core Users (`admins`) na.
 * Project users (NOAI app che) core madhe nastat, mhanun tyanna jat nahi.
 *
 * `coreNotices/{id}` = pathavleli notice (history); pratyek recipient la
 * `admins/{uid}/inbox/{id}` — master panel cha bell live vachto.
 */
import { callable, db, fail, now, requireSuper, str, type AdminDoc } from "./shared.js";

type Audience = { kind: "all" } | { kind: "roles"; roleIds: string[] } | { kind: "users"; uids: string[] };

function parseAudience(v: unknown): Audience {
  const a = (v ?? {}) as { kind?: unknown; roleIds?: unknown; uids?: unknown };
  const ids = (x: unknown) =>
    Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === "string" && s.length > 0 && s.length <= 128))] : [];
  if (a.kind === "roles") {
    const roleIds = ids(a.roleIds);
    if (!roleIds.length) fail("invalid-argument", "badAudience");
    return { kind: "roles", roleIds };
  }
  if (a.kind === "users") {
    const uids = ids(a.uids);
    if (!uids.length || uids.length > 500) fail("invalid-argument", "badAudience");
    return { kind: "users", uids };
  }
  return { kind: "all" };
}

export const sendCoreNotice = callable<{ title?: string; body?: string; audience?: unknown }>(async (req) => {
  const by = await requireSuper(req);
  const title = str(req.data.title, "badNoticeTitle", 2, 80);
  const body = str(req.data.body, "badNoticeBody", 2, 500);
  const audience = parseAudience(req.data.audience);

  // Fakt active core users.
  const snap = await db.collection("admins").where("active", "==", true).get();
  const recipients = snap.docs.filter((d) => {
    const a = d.data() as AdminDoc & { roleId?: string | null };
    if (audience.kind === "roles") return !!a.roleId && audience.roleIds.includes(a.roleId);
    if (audience.kind === "users") return audience.uids.includes(d.id);
    return true;
  });
  if (!recipients.length) fail("failed-precondition", "noRecipients");

  const notice = db.collection("coreNotices").doc();
  await notice.set({
    title,
    body,
    audience,
    targeted: recipients.length,
    createdBy: by.uid,
    byName: by.me.name,
    byEmail: by.me.email,
    createdAt: now(),
  });

  for (let i = 0; i < recipients.length; i += 450) {
    const batch = db.batch();
    for (const r of recipients.slice(i, i + 450)) {
      batch.set(r.ref.collection("inbox").doc(notice.id), {
        title,
        body,
        byName: by.me.name,
        isRead: false,
        createdAt: now(),
      });
    }
    await batch.commit();
  }
  return { id: notice.id, targeted: recipients.length };
});
