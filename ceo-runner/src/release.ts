/**
 * Preview, deploy, APK, web live — sagle commands `projects.json` madhun.
 *  - Web preview: Firebase Hosting preview channel (7 divas, phone var ughadto; live la hat nahi).
 *  - Mobile preview: release APK (arm64) → core Storage → download link.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";

import { bucket, BUCKET } from "./firebase.ts";
import type { Project } from "./projects.ts";
import { q, run, sh, tail } from "./sh.ts";

type Log = (line: string) => void;

/** Checks (typecheck / analyze) — pahila fail zalela output parat, sagle pass tar null. */
export async function runChecks(p: Project, dir: string, log: Log): Promise<string | null> {
  for (const cmd of p.checks ?? []) {
    log(`✔︎ ${cmd}`);
    const r = await sh(cmd, dir);
    if (r.code !== 0) return `\`${cmd}\` fail:\n${tail(r.out, 3000)}`;
  }
  return null;
}

export async function webPreview(p: Project, dir: string, taskId: string, log: Log): Promise<string> {
  const web = p.web!;
  const channel = `ceo-${taskId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10)}`;
  log(`🌐 preview channel ${channel}`);
  const only = web.only ? ` --only ${q(web.only)}` : "";
  const out = await run(`firebase hosting:channel:deploy ${q(channel)} --project ${q(web.firebaseProject)} --expires 7d --json${only}`, dir);
  const url = out.match(new RegExp(`https://[^\\s"]+--${channel}-[^\\s"]+\\.web\\.app`))?.[0];
  if (!url) throw new Error(`Preview URL milala nahi:\n${tail(out, 1000)}`);
  return url;
}

/** Web live — production hosting. */
export async function webLive(p: Project, dir: string, log: Log) {
  const web = p.web!;
  log("🚀 hosting deploy");
  await run(`firebase deploy --only ${q(web.only ? `hosting:${web.only}` : "hosting")} --project ${q(web.firebaseProject)}`, dir);
}

/**
 * Release APK build karun core Storage var. `preview` = fakt arm64 (lahan, lavkar);
 * production = sagle ABIs (universal).
 */
export async function buildApk(p: Project, dir: string, taskId: string, kind: "preview" | "release", log: Log): Promise<string> {
  const appDir = path.join(dir, p.mobile!.dir);
  const abi = kind === "preview" ? " --target-platform android-arm64" : "";
  log(`📦 flutter build apk --release${abi}`);
  await run(`flutter build apk --release${abi}`, appDir);
  const file = path.join(appDir, "build/app/outputs/flutter-apk/app-release.apk");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const dest = `ceo/${taskId}/${p.id}-${kind}-${stamp}.apk`;
  const token = randomUUID();
  log("☁️ APK upload");
  await bucket().upload(file, {
    destination: dest,
    metadata: {
      contentType: "application/vnd.android.package-archive",
      contentDisposition: `attachment; filename="${p.id}-${kind}.apk"`,
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(dest)}?alt=media&token=${token}`;
}

/** Approve nantar — badallelya files nusar backend deploy. Kay chalavla te parat. */
export async function deployBackend(p: Project, dir: string, files: string[], log: Log): Promise<string[]> {
  const ran: string[] = [];
  for (const d of p.deploy ?? []) {
    if (!files.some((f) => f.startsWith(d.when))) continue;
    log(`🚀 ${d.run}`);
    await run(d.run, dir);
    ran.push(d.run);
  }
  return ran;
}
