/**
 * CEO agent — super admin command deto, Mac varcha runner (`ceo-runner/`) kaam karto.
 *
 * `ceoTasks/{id}` = ek command; `events` subcollection = sambhashan (tumhi / CEO / system).
 * Panel fakt he callables vaparto; runner Admin SDK ne `needsRunner == true` tasks uchalto.
 * Merge / push / deploy nehmi `approve` nantarch — runner swatahun karat nahi.
 */
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

import { pushTo } from "./push.js";
import { callable, db, fail, now, requireSuper, str } from "./shared.js";

export type CeoStatus =
  | "routing"
  | "needsProject"
  | "working"
  | "preview"
  | "deploying"
  | "deployed"
  | "releasing"
  | "rejected"
  | "failed";

type Action = "pick" | "changes" | "approve" | "reject" | "apk" | "live";

/** Konti action kontya status madhun chalte (runner pan hech tapasto). */
const ALLOWED: Record<Action, CeoStatus[]> = {
  pick: ["needsProject"],
  changes: ["preview", "failed", "deployed"],
  approve: ["preview"],
  reject: ["needsProject", "preview", "failed"],
  apk: ["deployed"],
  live: ["deployed"],
};

const projectId = (v: unknown) =>
  typeof v === "string" && /^[a-z0-9-]{2,40}$/.test(v) ? v : fail("invalid-argument", "ceoBadProject");

export const ceoCommand = callable<{ command?: string; projectId?: string | null }>(async (req) => {
  const by = await requireSuper(req);
  const command = str(req.data.command, "ceoBadCommand", 3, 4000);
  // Project nivadla nasel tar runner command cha context baghun olkhto.
  const pid = req.data.projectId ? projectId(req.data.projectId) : null;
  if (pid && !(await db.collection("ceoProjects").doc(pid).get()).exists) fail("not-found", "ceoBadProject");

  const task = db.collection("ceoTasks").doc();
  const batch = db.batch();
  batch.set(task, {
    command,
    projectId: pid,
    status: "routing" satisfies CeoStatus,
    pending: null,
    needsRunner: true,
    previewUrl: null,
    apkUrl: null,
    progress: null,
    createdBy: by.uid,
    byName: by.me.name,
    createdAt: now(),
    updatedAt: now(),
  });
  batch.set(task.collection("events").doc(), { role: "you", text: command, at: now() });
  await batch.commit();
  return { id: task.id };
});

export const ceoAction = callable<{ taskId?: string; action?: string; text?: string; projectId?: string }>(async (req) => {
  await requireSuper(req);
  const taskId = str(req.data.taskId, "ceoBadTask", 1, 64);
  const action = req.data.action as Action;
  if (!(action in ALLOWED)) fail("invalid-argument", "ceoBadAction");
  const text = action === "changes" ? str(req.data.text, "ceoBadCommand", 3, 4000) : null;
  const pid = action === "pick" ? projectId(req.data.projectId) : null;

  const ref = db.collection("ceoTasks").doc(taskId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "ceoBadTask");
    const t = snap.data()!;
    // Runner adhichi action karat asel tar navin nako — double deploy talto.
    if (t.pending || t.needsRunner) fail("failed-precondition", "ceoBusy");
    if (!ALLOWED[action].includes(t.status)) fail("failed-precondition", "ceoBadAction");
    tx.update(ref, {
      pending: { action, text, projectId: pid },
      needsRunner: true,
      ...(pid && { projectId: pid }),
      updatedAt: now(),
    });
    tx.set(ref.collection("events").doc(), { role: "you", action, text: text ?? null, projectId: pid, at: now() });
  });
  return { ok: true };
});

/** Tumchi vaat pahanare status — phone var push (preview tayar, project vicharla, deploy zala, fail). */
const NOTIFY: Partial<Record<CeoStatus, string>> = {
  needsProject: "Konta project? Nivda",
  preview: "Changes tayar — preview bagha",
  deployed: "Deploy purna",
  failed: "Kaam atakla",
};

export const onCeoTaskUpdated = onDocumentUpdated("ceoTasks/{id}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  // APK / Web live nantar status parat "deployed" — fail zala tar apkUrl / liveAt badalat nahit.
  const released = before.status === "releasing" && after.status === "deployed";
  const wentLive = !!after.liveAt && !(before.liveAt && after.liveAt.isEqual(before.liveAt));
  const title = released
    ? after.apkUrl !== before.apkUrl
      ? "APK tayar"
      : wentLive
        ? "Web live zala"
        : "Release atakla"
    : before.status !== after.status
      ? NOTIFY[after.status as CeoStatus]
      : undefined;
  if (!title) return;
  await pushTo(after.createdBy, {
    title: `CEO · ${title}`,
    body: String(after.command).slice(0, 120),
    link: `/ceo?task=${event.params.id}`,
    tag: `ceo-${event.params.id}`,
  });
});
