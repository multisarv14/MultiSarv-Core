/**
 * CEO runner — `npm start` (ceo-runner/ madhun). Mac chalu asel toparyant panel (phone pan) varun:
 *
 *   command → project olkha → `ceo/<task>` branch → agent badal → checks → preview (link / APK)
 *   "Deploy" → production branch pull + merge → checks → push → backend deploy
 *   "Web live" / "APK" → production code varun hosting deploy / release APK
 *
 * Ek veli ekach task (Flutter build / deploy ekmekanvar padat nahit).
 */
import { randomUUID } from "node:crypto";
import os from "node:os";

import type { DocumentReference } from "firebase-admin/firestore";

import { claudeAccount, runAgent, type AgentResult } from "./claude.ts";
import { db, now } from "./firebase.ts";
import { branchOf, commitAll, changedFiles, diffStat, dropTask, mergeBase, pushAll, releaseWorktree, taskWorktree } from "./git.ts";
import { loadProjects, publishProjects, type Project } from "./projects.ts";
import { buildApk, deployBackend, runChecks, webLive, webPreview } from "./release.ts";
import { matchProject } from "./router.ts";
import { run, sh } from "./sh.ts";

type Action = "pick" | "changes" | "approve" | "reject" | "apk" | "live";

interface Task {
  command: string;
  projectId: string | null;
  status: string;
  pending: { action: Action; text: string | null; projectId: string | null } | null;
  sessionId?: string;
  cost?: number;
}

console.log(`🤖 Claude: ${claudeAccount()}`);
const projects = loadProjects();
const byId = new Map(projects.map((p) => [p.id, p]));
await publishProjects(projects);
console.log(`✔ ${projects.length} projects: ${projects.map((p) => p.id).join(", ")}`);

// ── Heartbeat — panel "runner offline" dakhavto ───────────────────────

const runnerRef = db.collection("ceoRunner").doc("main");
let busy: string | null = null;
const beat = () => runnerRef.set({ host: os.hostname(), at: now(), busy }, { merge: true }).catch(console.error);
beat();
setInterval(beat, 30_000);

// Runner madhech band padla tar atakleli tasks — punha chalu karta yetil ("changes" / reject).
for (const s of ["working", "deploying", "releasing"]) {
  const stuck = await db.collection("ceoTasks").where("status", "==", s).get();
  for (const d of stuck.docs) {
    await d.ref.update({ status: s === "releasing" ? "deployed" : "failed", progress: null, needsRunner: false, updatedAt: now() });
    await d.ref.collection("events").add({ role: "system", text: "Runner restart zala — he kaam adhurach rahila.", at: now() });
  }
}

// ── Queue ─────────────────────────────────────────────────────────────

let chain: Promise<void> = Promise.resolve();
const queued = new Set<string>();
db.collection("ceoTasks")
  .where("needsRunner", "==", true)
  .onSnapshot(
    (snap) => {
      for (const d of snap.docs) {
        if (queued.has(d.id)) continue;
        queued.add(d.id);
        chain = chain.then(() => handle(d.ref)).finally(() => queued.delete(d.id));
      }
    },
    (err) => {
      console.error("✘ listener", err);
      process.exit(1);
    },
  );
console.log("👂 ceoTasks aikat ahe…");

class Ctx {
  private lines: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  readonly ref: DocumentReference;
  readonly task: Task;

  constructor(ref: DocumentReference, task: Task) {
    this.ref = ref;
    this.task = task;
  }

  get id() {
    return this.ref.id;
  }

  set(fields: Record<string, unknown>) {
    return this.ref.update({ ...fields, updatedAt: now() });
  }

  say(role: "ceo" | "system", text: string, extra: Record<string, unknown> = {}) {
    return this.ref.collection("events").add({ role, text, ...extra, at: now() });
  }

  /** Chalu kaam — shevatchya 6 oli, 3 second la ekda Firestore. */
  log = (line: string) => {
    console.log(`  [${this.id}] ${line}`);
    this.lines = [...this.lines, line].slice(-6);
    this.timer ??= setTimeout(() => {
      this.timer = null;
      this.ref.update({ progress: this.lines.join("\n") }).catch(() => {});
    }, 3000);
  };

  stopLog() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  project(): Project {
    const p = this.task.projectId ? byId.get(this.task.projectId) : undefined;
    if (!p) throw new Error(`Project "${this.task.projectId}" ya runner chya projects.json madhe nahi`);
    return p;
  }
}

async function handle(ref: DocumentReference) {
  const task = await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists || s.data()?.needsRunner !== true) return null;
    tx.update(ref, { needsRunner: false });
    return s.data() as Task;
  });
  if (!task) return;
  const ctx = new Ctx(ref, task);
  busy = ref.id;
  beat();
  console.log(`▶ ${ref.id} ${task.pending?.action ?? "command"} (${task.projectId ?? "?"})`);
  try {
    await dispatch(ctx);
  } catch (err) {
    console.error(err);
    ctx.stopLog();
    const releasing = ctx.task.pending?.action === "apk" || ctx.task.pending?.action === "live";
    await ctx.set({ status: releasing ? "deployed" : "failed", progress: null, pending: null });
    await ctx.say("system", `✘ ${err instanceof Error ? err.message : String(err)}`.slice(0, 4000), { error: true });
  } finally {
    ctx.stopLog();
    busy = null;
    beat();
  }
}

async function dispatch(ctx: Ctx) {
  const { task } = ctx;
  const action = task.pending?.action;
  if (!action) {
    if (!task.projectId && !(await route(ctx))) return;
    return work(ctx, task.command);
  }
  switch (action) {
    case "pick":
      return work(ctx, task.command);
    case "changes":
      return work(ctx, task.pending!.text ?? "");
    case "approve":
      return approve(ctx);
    case "reject":
      return reject(ctx);
    case "apk":
      return apk(ctx);
    case "live":
      return live(ctx);
  }
}

// ── Project olkha ─────────────────────────────────────────────────────

async function recent(excludeId?: string) {
  const snap = await db.collection("ceoTasks").orderBy("createdAt", "desc").limit(30).get();
  return snap.docs
    .filter((d) => d.id !== excludeId && d.data().projectId)
    .map((d) => ({ projectId: d.data().projectId as string, command: d.data().command as string, status: d.data().status as string }));
}

/** true = project milala (task.projectId set). */
async function route(ctx: Ctx): Promise<boolean> {
  ctx.log("🧭 project olkhat ahe…");
  const m = await matchProject(ctx.task.command, projects, await recent(ctx.id));
  if (!m.projectId) {
    await ctx.set({ status: "needsProject", match: m, progress: null });
    await ctx.say("ceo", `Ha command konta project cha he nakki nahi (${m.reason}). Project nivda.`);
    return false;
  }
  ctx.task.projectId = m.projectId;
  await ctx.set({ projectId: m.projectId, match: m });
  await ctx.say("system", `Project: ${byId.get(m.projectId)!.name} — ${m.reason}`);
  return true;
}

// ── Kaam (agent) → checks → commit → preview ─────────────────────────

/** Agent la project cha context — kontya project madhe, kashasathi, alikade kay kela. */
function systemPrompt(p: Project, history: { projectId: string; command: string; status: string }[]) {
  const mine = history.filter((h) => h.projectId === p.id).slice(0, 8);
  return [
    `You are the Multisarv "CEO" coding agent. This task belongs ONLY to this project:`,
    `Project: ${p.name} (id ${p.id}, ${p.type}); working tree is a fresh branch off ${p.branch}.`,
    `Context: ${p.context}`,
    mine.length ? `Recent CEO work on this project (newest first):\n${mine.map((h) => `- [${h.status}] ${h.command.slice(0, 200)}`).join("\n")}` : "",
    "Rules:",
    "- Work only inside this repository. Do not touch other projects or folders outside it.",
    "- Follow the repo's conventions (CLAUDE.md / README / surrounding code: naming, comments, i18n, file layout).",
    "- Never run git commit / push / merge or any deploy — the runner does that after the CEO approves.",
    p.checks?.length ? `- When done, run these checks and fix failures: ${p.checks.join(" ; ")}` : "",
    "- If the command is ambiguous, choose the safest reasonable interpretation and say so.",
    "- Finish with a short summary in the same language as the command: what changed, which files, and how to test it.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function agent(ctx: Ctx, p: Project, dir: string, prompt: string): Promise<AgentResult> {
  const system = systemPrompt(p, await recent(ctx.id));
  const resume = !!ctx.task.sessionId;
  const sessionId = ctx.task.sessionId ?? randomUUID();
  if (!resume) {
    ctx.task.sessionId = sessionId;
    await ctx.set({ sessionId });
  }
  let res = await runAgent({ cwd: dir, prompt, system, sessionId, resume, onProgress: ctx.log });
  if (!res.ok && resume && !res.text) {
    // Juna session ya Mac var nahi — navin session, mool command sobat.
    const fresh = randomUUID();
    ctx.task.sessionId = fresh;
    await ctx.set({ sessionId: fresh });
    res = await runAgent({
      cwd: dir,
      prompt: `Original command: ${ctx.task.command}\n\n(The branch already contains earlier work for it.)\n\nNow: ${prompt}`,
      system,
      sessionId: fresh,
      resume: false,
      onProgress: ctx.log,
    });
  }
  await ctx.set({ cost: (ctx.task.cost = (ctx.task.cost ?? 0) + res.cost) });
  if (!res.ok) throw new Error(`Agent atakla: ${res.text || "uttar nahi"}`);
  return res;
}

async function work(ctx: Ctx, instruction: string) {
  const p = ctx.project();
  await ctx.set({ status: "working", pending: null, progress: null, previewUrl: null, apkUrl: null });
  const dir = await taskWorktree(p, ctx.id, ctx.log);
  let res = await agent(ctx, p, dir, instruction);

  let failed = await runChecks(p, dir, ctx.log);
  for (let i = 0; failed && i < 2; i++) {
    ctx.log("🔁 checks fail — agent sodvat ahe");
    res = await agent(ctx, p, dir, `The checks failed. Fix the cause (do not disable checks):\n\n${failed}`);
    failed = await runChecks(p, dir, ctx.log);
  }
  if (failed) throw new Error(`Checks pass zale nahit:\n${failed}`);

  await commitAll(dir, `ceo: ${instruction.replace(/\s+/g, " ").slice(0, 72)}`);
  const stat = (await diffStat(p, dir)).trim();
  if (!stat) {
    await ctx.set({ status: "failed", progress: null });
    await ctx.say("ceo", `${res.text}\n\n(Code madhe kahich badal nahit.)`);
    return;
  }

  const files = await changedFiles(p, dir);
  const inMobile = (f: string) => !!p.mobile && (p.mobile.dir === "." || f.startsWith(`${p.mobile.dir}/`));
  let previewUrl: string | null = null;
  let apkUrl: string | null = null;
  const notes: string[] = [];
  if (p.web && files.some((f) => !inMobile(f))) {
    previewUrl = await webPreview(p, dir, ctx.id, ctx.log).catch((e) => (notes.push(`Web preview fail: ${e.message}`), null));
  }
  if (p.mobile && files.some(inMobile)) {
    apkUrl = await buildApk(p, dir, ctx.id, "preview", ctx.log).catch((e) => (notes.push(`Preview APK fail: ${e.message}`), null));
  }

  ctx.stopLog();
  await ctx.set({ status: "preview", progress: null, previewUrl, apkUrl, branch: branchOf(ctx.id) });
  await ctx.say("ceo", [res.text, "```\n" + stat + "\n```", ...notes.map((n) => `⚠ ${n.slice(0, 1500)}`)].join("\n\n"));
}

// ── Approve → merge → checks → push → deploy ─────────────────────────

async function approve(ctx: Ctx) {
  const p = ctx.project();
  await ctx.set({ status: "deploying", pending: null, progress: null });
  const dir = await taskWorktree(p, ctx.id, ctx.log);

  ctx.log(`⤵ ${p.remotes[0]}/${p.branch} pull + merge`);
  const conflicts = await mergeBase(p, dir);
  if (conflicts.length) {
    ctx.log(`⚠ conflict: ${conflicts.join(", ")}`);
    await agent(ctx, p, dir, `Merging the latest ${p.branch} produced conflicts in: ${conflicts.join(", ")}. Resolve them keeping both sides' intent, remove all conflict markers. Do not commit.`);
    const left = await sh(`git grep -l -e '^<<<<<<< ' -e '^>>>>>>> ' -- ${conflicts.map((f) => `'${f}'`).join(" ")}`, dir);
    if (left.code === 0) throw new Error(`Conflict sutle nahit: ${left.out.trim()}`);
    await commitAll(dir, `ceo: merge ${p.branch}`);
  }

  const failed = await runChecks(p, dir, ctx.log);
  if (failed) throw new Error(`Merge nantar checks fail — deploy kela nahi:\n${failed}`);

  const files = await changedFiles(p, dir);
  ctx.log(`⬆ push ${p.remotes.join(", ")} → ${p.branch}`);
  await pushAll(p, dir);
  const ran = await deployBackend(p, dir, files, ctx.log);
  const head = (await run("git rev-parse --short HEAD", dir)).trim();

  ctx.stopLog();
  await ctx.set({ status: "deployed", progress: null, deployedCommit: head, deployedAt: now() });
  await ctx.say(
    "ceo",
    [
      `✔ ${p.branch} var merge + push (${head}).`,
      ran.length ? `Deploy:\n${ran.map((r) => `• ${r}`).join("\n")}` : "Backend madhe deploy karaycha badal navhta.",
      [p.web && "Web live karaycha asel tar \"Web live\"", p.mobile && "production APK sathi \"APK\""].filter(Boolean).join(", ") || "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
}

async function reject(ctx: Ctx) {
  const p = ctx.task.projectId ? byId.get(ctx.task.projectId) : undefined;
  if (p) await dropTask(p, ctx.id);
  await ctx.set({ status: "rejected", pending: null, progress: null });
  await ctx.say("system", "Radd kela — branch ani badal kadhle.");
}

// ── Release (production branch varun) ────────────────────────────────

async function apk(ctx: Ctx) {
  const p = ctx.project();
  if (!p.mobile) throw new Error(`${p.name} mobile app nahi`);
  await ctx.set({ status: "releasing", pending: null, progress: null });
  const dir = await releaseWorktree(p, ctx.log);
  const url = await buildApk(p, dir, ctx.id, "release", ctx.log);
  ctx.stopLog();
  await ctx.set({ status: "deployed", progress: null, apkUrl: url });
  await ctx.say("ceo", `📦 Production APK tayar (${p.branch}).`, { link: url });
}

async function live(ctx: Ctx) {
  const p = ctx.project();
  if (!p.web) throw new Error(`${p.name} sathi web hosting configure nahi`);
  await ctx.set({ status: "releasing", pending: null, progress: null });
  const dir = await releaseWorktree(p, ctx.log);
  await webLive(p, dir, ctx.log);
  ctx.stopLog();
  await ctx.set({ status: "deployed", progress: null, liveAt: now() });
  await ctx.say("ceo", `🌍 ${p.name} live zala (${p.branch}).`);
}
