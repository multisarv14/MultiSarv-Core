import { deleteToken, getMessaging, getToken, isSupported } from "firebase/messaging";

import { callCore, core } from "./firebase";

/**
 * Core push (Internal Chat) — PWA / browser band asla tari message notification.
 * NOAI push `/` scope cha registration vaparto; core la vegla scope, mhanje
 * donhi FCM subscriptions ekmekanna todat nahit (same service worker file).
 */
const SW_URL = "/firebase-messaging-sw.js";
const SCOPE = "/core-push/";
const TOKEN_KEY = "ms-core-push-token";
const DEVICE_KEY = "ms-core-push-device";

/** Ya browser cha sthir id — server var pratyek device chi vegli entry (mobile cha token pusat nahi). */
export function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) localStorage.setItem(DEVICE_KEY, (id = `web-${crypto.randomUUID()}`));
    return id;
  } catch {
    return undefined; // private mode — server token varun id banavto
  }
}

export type CorePushState = "unsupported" | "denied" | "default" | "granted";

export async function corePushState(): Promise<CorePushState> {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !(await isSupported().catch(() => false))) return "unsupported";
  return Notification.permission as CorePushState;
}

/**
 * Permission (user click var), token, ani core la nondni. `fresh` = juna token
 * kadhun navin (login nantar) — server var user cha ekach token rahto.
 */
export async function enableCorePush(fresh = false): Promise<CorePushState> {
  const state = await corePushState();
  if (state === "unsupported" || state === "denied") return state;
  const permission = state === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return permission as CorePushState;

  const registration = await navigator.serviceWorker.register(SW_URL, { scope: SCOPE });
  const vapidKey = (import.meta.env.VITE_CORE_VAPID_KEY as string | undefined)?.trim() || undefined;
  const messaging = getMessaging(core().app);
  if (fresh) await deleteToken(messaging).catch(() => {});
  const token = await getToken(messaging, { serviceWorkerRegistration: registration, vapidKey });
  await callCore("registerCorePush", { token, deviceId: deviceId(), platform: "web" });
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode */
  }
  return "granted";
}

/** Permission aadhich asel tar token taja (app ughadla / login — `fresh` ne navin token). */
export async function refreshCorePush(fresh = false) {
  try {
    if ((await corePushState()) === "granted") await enableCorePush(fresh);
  } catch {
    /* push nasla tari chat chalto */
  }
}

const LOGIN_KEY = "ms-core-push-login";

/** Login zala — pudhcha app load navin token gheil. */
export function markLoginForPush() {
  try {
    sessionStorage.setItem(LOGIN_KEY, "1");
  } catch {
    /* private mode */
  }
}

/** Login nantar pahilyanda: navin token; nahitar cached token taja. */
export async function refreshCorePushOnStart() {
  let login = false;
  try {
    login = sessionStorage.getItem(LOGIN_KEY) === "1";
    sessionStorage.removeItem(LOGIN_KEY);
  } catch {
    /* private mode */
  }
  await refreshCorePush(login);
}

/** Logout — ya browser la dusryache messages yeu naye. */
export async function dropCorePush() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    localStorage.removeItem(TOKEN_KEY);
    await callCore("registerCorePush", { token, remove: true, deviceId: deviceId(), platform: "web" });
  } catch {
    /* offline — server kharab token nantar kadhto */
  }
}
