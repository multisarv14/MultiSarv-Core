/**
 * GarageGuru app — "Forgot password" email link.
 *
 * GarageGuru workshops `user_<10 digits>@garageguru.local` ya synthetic email ne login kartat, mhanun
 * Firebase swatah reset email pathavu shakat nahi (address khota aahe). App login nastana ithe mobile
 * number pathavto; core `multisarv-mobileapps` madhe account shodhto, Firebase cha reset link banavto
 * ani to garage chya registered email (`admin/{uid}.contactEmail`) var SMTP ne pathavto.
 *
 * Secret: `SMTP_URL` (e.g. `smtps://no-reply%40multisarv.com:<app-password>@smtp.gmail.com:465`).
 */
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import nodemailer from "nodemailer";

import { appForFirebaseProject, KEYS_SECRET } from "./projects.js";
import { callable, db, fail, now } from "./shared.js";

const SMTP_URL = defineSecret("SMTP_URL");
const MAIL_FROM = defineString("GARAGEGURU_MAIL_FROM", { default: "Garage Guru <no-reply@multisarv.com>" });

const FIREBASE_PROJECT = "multisarv-mobileapps";
/** Ekach number la punha link — itke seconds thamba. */
const COOLDOWN_SECONDS = 60;

/** r***@multisarv.com — konacha email aahe te purna disu naye. */
const mask = (email: string) => {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 1)}${"*".repeat(Math.max(user.length - 1, 3))}@${domain}`;
};

export const garageguruResetLink = callable<{ phone?: unknown }>(async (req) => {
  const digits = String(req.data?.phone ?? "").replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) fail("invalid-argument", "badPhone");

  // Abuse rokhayla — ekach number var sathi email cha bharaav nako.
  const throttle = db.collection("garageguruResets").doc(digits);
  const last = (await throttle.get()).get("at")?.toMillis?.() ?? 0;
  if (Date.now() - last < COOLDOWN_SECONDS * 1000) fail("resource-exhausted", "tooSoon");

  const app = await appForFirebaseProject(FIREBASE_PROJECT);
  if (!app) fail("failed-precondition", "projectNotConnected");

  const loginEmail = `user_${digits}@garageguru.local`;
  const user = await getAuth(app!).getUserByEmail(loginEmail).catch(() => null);
  if (!user) fail("not-found", "notRegistered");
  if (user!.disabled) fail("failed-precondition", "disabled");

  const store = getFirestore(app!);
  const admin = (await store.collection("admin").doc(user!.uid).get()).data() ?? {};
  let to = String(admin.contactEmail ?? "").trim();
  if (!to) {
    const garageId = String(admin.garageId || `garage_${user!.uid}`);
    to = String((await store.collection("garages").doc(garageId).get()).get("contactEmail") ?? "").trim();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) fail("failed-precondition", "noEmail");

  const link = await getAuth(app!).generatePasswordResetLink(loginEmail);
  const name = String(admin.name || "there");

  await nodemailer.createTransport(SMTP_URL.value()).sendMail({
    from: MAIL_FROM.value(),
    to,
    subject: "Reset your Garage Guru password",
    text:
      `Hi ${name},\n\nWe received a request to reset the Garage Guru password for mobile number ${digits}.\n\n` +
      `Open this link to choose a new password:\n${link}\n\n` +
      `After that, log in to the app with your mobile number and the new password.\n` +
      `If you did not ask for this, you can ignore this email.\n\n— Garage Guru`,
    html:
      `<p>Hi ${escapeHtml(name)},</p>` +
      `<p>We received a request to reset the Garage Guru password for mobile number <b>${digits}</b>.</p>` +
      `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none">Reset password</a></p>` +
      `<p>After that, log in to the app with your mobile number and the new password.</p>` +
      `<p style="color:#666">If you did not ask for this, you can ignore this email.</p>`,
  });

  await throttle.set({ at: now(), uid: user!.uid }, { merge: true });
  return { email: mask(to) };
}, [SMTP_URL, KEYS_SECRET]);

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
