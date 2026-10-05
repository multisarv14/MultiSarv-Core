import { getMessaging, getToken, isSupported } from "firebase/messaging";

import { registerAdminDevice } from "@/api/notifications";
import type { ProjectDef } from "@/config/projects";
import { getLang } from "@/i18n";

import { services } from "./firebase";

export type PushState = "unsupported" | "noVapid" | "denied" | "default" | "granted";

const SW_URL = "/firebase-messaging-sw.js";

/** Browser madhe push chalu shakto ka, ani permission kay aahe. */
export async function pushState(project: ProjectDef): Promise<PushState> {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !(await isSupported())) {
    return "unsupported";
  }
  if (!project.vapidKey) return "noVapid";
  return Notification.permission as PushState;
}

/**
 * Permission maga, FCM token ghya ani server la dya (`registerAdminDevice`).
 * Admin alerts (navin user, KYC, dispute, payout) mag ya browser var yetat.
 */
export async function enablePush(project: ProjectDef): Promise<PushState> {
  const state = await pushState(project);
  if (state === "unsupported" || state === "noVapid") return state;

  const permission = state === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return permission as PushState;

  const registration = await navigator.serviceWorker.register(SW_URL);
  const token = await getToken(getMessaging(services(project).app), {
    vapidKey: project.vapidKey,
    serviceWorkerRegistration: registration,
  });
  await registerAdminDevice(project, { token, language: getLang() });
  return "granted";
}

/** Permission aadhich asel tar token refresh (navin deploy / browser update nantar). */
export async function refreshPush(project: ProjectDef) {
  try {
    if ((await pushState(project)) === "granted") await enablePush(project);
  } catch {
    /* push nasla tari panel chalto */
  }
}
