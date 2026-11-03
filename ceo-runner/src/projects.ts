/**
 * `projects.json` — runner kontya projects var kaam karu shakto. Paths ani commands
 * fakt ya Mac var (Firestore madhe nahi) — panel madhun kontihi command chalvta yet nahi.
 * Panel la fakt naav / prakar / context `ceoProjects` madhe jato.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db, now } from "./firebase.ts";

export type ProjectType = "web" | "mobile" | "webMobile" | "backend";

export interface ProjectConfig {
  id: string;
  name: string;
  /** Multisarv repo root pasun relative kinva absolute. */
  repo: string;
  /** Approve nantar ya sagalya remotes var push (pahila = fetch / merge cha base). */
  remotes: string[];
  /** Production branch — `ceo/<task>` ithun nighto ani ithech merge hoto. */
  branch: string;
  type: ProjectType;
  /** Project kashasathi — command konta project ahe he olkhayla ani agent la samjayla. */
  context: string;
  keywords?: string[];
  /** Mool checkout madhun symlink (node_modules — punha install nako). */
  link?: string[];
  /** Git madhe nasleli files copy (.env.local, keystore) — nasel tar sodun deto. */
  copy?: string[];
  /** Worktree banlyavar ekda. */
  setup?: string[];
  /** Agent nantar ani merge nantar — fail tar preview / deploy nahi. */
  checks?: string[];
  /** Firebase Hosting — preview channel ani "Web live". */
  web?: { firebaseProject: string; only?: string };
  mobile?: { dir: string };
  /** Approve nantar: badallelya files paiki konti `when` ne survat hote tar `run`. */
  deploy?: { when: string; run: string }[];
}

export type Project = ProjectConfig & { root: string };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MULTISARV = path.resolve(HERE, "../..");
const FILE = path.resolve(HERE, "../projects.json");

export function loadProjects(): Project[] {
  const list = JSON.parse(fs.readFileSync(FILE, "utf8")) as ProjectConfig[];
  return list
    .map((p) => ({ ...p, root: path.resolve(MULTISARV, p.repo) }))
    .filter((p) => {
      const ok = fs.existsSync(path.join(p.root, ".git"));
      if (!ok) console.warn(`⚠ ${p.id}: ${p.root} git repo nahi — sodla`);
      return ok;
    });
}

/** README / CLAUDE.md chi survat — project olkhayla madat. */
export function docsOf(p: Project, max = 1500): string {
  for (const f of ["CLAUDE.md", "README.md"]) {
    const file = path.join(p.root, f);
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").slice(0, max);
  }
  return "";
}

export const hasWeb = (p: Project) => !!p.web;
export const hasMobile = (p: Project) => !!p.mobile;

/** Panel cha dropdown — runner suru zala ki taja; kadhlele projects kadhto. */
export async function publishProjects(projects: Project[]) {
  const col = db.collection("ceoProjects");
  const old = await col.get();
  const batch = db.batch();
  for (const d of old.docs) if (!projects.some((p) => p.id === d.id)) batch.delete(d.ref);
  for (const p of projects) {
    batch.set(col.doc(p.id), {
      name: p.name,
      type: p.type,
      context: p.context,
      keywords: p.keywords ?? [],
      branch: p.branch,
      web: hasWeb(p),
      mobile: hasMobile(p),
      updatedAt: now(),
    });
  }
  await batch.commit();
}
