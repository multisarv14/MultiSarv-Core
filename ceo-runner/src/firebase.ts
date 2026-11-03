/**
 * Admin SDK (core project). Kramane:
 *  1. `GOOGLE_APPLICATION_CREDENTIALS` — service account key (24×7 server sathi).
 *  2. `firebase login` kelela account (Mac var — vegli key nako).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

export const PROJECT_ID = process.env.CORE_PROJECT_ID || "multisarv-core";
export const BUCKET = process.env.CORE_BUCKET || `${PROJECT_ID}.firebasestorage.app`;

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const cli = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
  const token = fs.existsSync(cli) ? JSON.parse(fs.readFileSync(cli, "utf8")).tokens?.refresh_token : null;
  if (!token) {
    console.error("✘ Credentials nahit: `firebase login` kara kinva GOOGLE_APPLICATION_CREDENTIALS dya.");
    process.exit(1);
  }
  // Firebase CLI cha public OAuth client (core/functions/scripts/_admin.cjs sarkha).
  const adc = path.join(os.tmpdir(), `ceo-runner-adc-${process.pid}.json`);
  fs.writeFileSync(
    adc,
    JSON.stringify({
      type: "authorized_user",
      client_id: "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com",
      client_secret: "j9iVZfS8kkCEFUPaAeJV0sAi",
      refresh_token: token,
      quota_project_id: PROJECT_ID,
    }),
    { mode: 0o600 },
  );
  process.on("exit", () => fs.rmSync(adc, { force: true }));
  process.env.GOOGLE_APPLICATION_CREDENTIALS = adc;
}

initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });

export const db = getFirestore();
export const bucket = () => getStorage().bucket();
export const now = () => FieldValue.serverTimestamp();
