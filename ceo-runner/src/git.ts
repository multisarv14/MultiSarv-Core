/**
 * Pratyek task cha vegla git worktree (`~/.ceo-runner/worktrees/<project>/<task>`) —
 * tumcha mool checkout (ani tyatle uncommitted badal) kadhihi hat lavla jat nahi.
 * Branch `ceo/<task>`; merge pan worktree madhech hoto ani `HEAD:<branch>` push hoto.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Project } from "./projects.ts";
import { q, run, sh } from "./sh.ts";

export const HOME = process.env.CEO_HOME || path.join(os.homedir(), ".ceo-runner");

export const branchOf = (taskId: string) => `ceo/${taskId}`;
const base = (p: Project) => `${p.remotes[0]}/${p.branch}`;

/** node_modules symlink, .env / keystore copy — git madhe nastat. */
function prepare(p: Project, dir: string) {
  for (const rel of p.link ?? []) {
    const src = path.join(p.root, rel);
    const dst = path.join(dir, rel);
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.symlinkSync(src, dst);
    }
  }
  for (const rel of p.copy ?? []) {
    const src = path.join(p.root, rel);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.copyFileSync(src, path.join(dir, rel));
    }
  }
}

async function setup(p: Project, dir: string, log: (l: string) => void) {
  prepare(p, dir);
  for (const cmd of p.setup ?? []) {
    log(`$ ${cmd}`);
    await run(cmd, dir);
  }
}

/** Task cha worktree — nasel tar `<remote>/<branch>` varun navin `ceo/<task>` branch. */
export async function taskWorktree(p: Project, taskId: string, log: (l: string) => void): Promise<string> {
  const dir = path.join(HOME, "worktrees", p.id, taskId);
  if (fs.existsSync(dir)) return dir;
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  await run(`git fetch ${q(p.remotes[0])} ${q(p.branch)}`, p.root);
  await run(`git worktree add -B ${q(branchOf(taskId))} ${q(dir)} ${q(base(p))}`, p.root);
  await setup(p, dir, log);
  return dir;
}

/**
 * Production (`<remote>/<branch>`) cha taja copy — APK / Web live nehmi merge zalelya
 * code varun, task cha juna worktree nahi.
 */
export async function releaseWorktree(p: Project, log: (l: string) => void): Promise<string> {
  const dir = path.join(HOME, "worktrees", p.id, "_release");
  await run(`git fetch ${q(p.remotes[0])} ${q(p.branch)}`, p.root);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    await run(`git worktree add --detach ${q(dir)} ${q(base(p))}`, p.root);
  } else {
    await run(`git checkout --detach -f ${q(base(p))} && git clean -fd`, dir);
  }
  await setup(p, dir, log);
  return dir;
}

/** Agent che badal commit — kahich badal nasel tar false. */
export async function commitAll(dir: string, message: string): Promise<boolean> {
  await run("git add -A", dir);
  const staged = await sh("git diff --cached --quiet", dir);
  if (staged.code === 0) return false;
  await run(`git -c user.name='Multisarv CEO' -c user.email='ceo@multisarv.com' commit -m ${q(message)}`, dir);
  return true;
}

/** Base pasun ya branch var kay badalla (`--stat`). */
export const diffStat = (p: Project, dir: string) => run(`git diff --stat ${q(base(p))}...HEAD`, dir);

/**
 * Production branch cha taja pull ghevun tyat task branch merge.
 * Conflict asel tar conflicted files parat (merge chalu thevto — agent sodvel).
 */
export async function mergeBase(p: Project, dir: string): Promise<string[]> {
  await run(`git fetch ${q(p.remotes[0])} ${q(p.branch)}`, dir);
  const r = await sh(`git -c user.name='Multisarv CEO' -c user.email='ceo@multisarv.com' merge --no-edit ${q(base(p))}`, dir);
  if (r.code === 0) return [];
  const files = (await run("git diff --name-only --diff-filter=U", dir)).split("\n").filter(Boolean);
  if (!files.length) throw new Error(`merge fail:\n${r.out.slice(-1500)}`);
  return files;
}

/** Push adhi production var kay badalnar (deploy `when` sathi). */
export async function changedFiles(p: Project, dir: string): Promise<string[]> {
  return (await run(`git diff --name-only ${q(base(p))}...HEAD`, dir)).split("\n").filter(Boolean);
}

/** Sagalya remotes var `HEAD:<branch>` — force kadhich nahi. */
export async function pushAll(p: Project, dir: string) {
  for (const remote of p.remotes) await run(`git push ${q(remote)} HEAD:${q(p.branch)}`, dir);
}

/** Reject — worktree ani branch kadha. */
export async function dropTask(p: Project, taskId: string) {
  const dir = path.join(HOME, "worktrees", p.id, taskId);
  if (fs.existsSync(dir)) await sh(`git worktree remove --force ${q(dir)}`, p.root);
  await sh(`git branch -D ${q(branchOf(taskId))}`, p.root);
}
