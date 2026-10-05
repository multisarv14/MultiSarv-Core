// Pahila super admin banva (ekda):
//   npm run set-super-admin -- you@example.com --project <core-project-id> [--name "Naav"] [--password "..."]
// Account nasel tar banavto (password dila nahi tar random deto). Asel tar fakt super admin karto.
require("./_admin.cjs");
const crypto = require("node:crypto");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("Usage: npm run set-super-admin -- <email> --project <core-project-id> [--name ..] [--password ..]");
    process.exit(1);
  }
  const auth = getAuth();
  let user = await auth.getUserByEmail(email).catch(() => null);
  let password;
  if (!user) {
    password = arg("password") || crypto.randomBytes(9).toString("base64url");
    user = await auth.createUser({ email, password, displayName: arg("name") || email.split("@")[0] });
  }
  await auth.setCustomUserClaims(user.uid, { superAdmin: true });
  await getFirestore()
    .collection("admins")
    .doc(user.uid)
    .set(
      {
        name: arg("name") || user.displayName || email.split("@")[0],
        email,
        role: "superAdmin",
        active: true,
        projects: {},
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  console.log(`Super admin: ${email} (uid ${user.uid})`);
  if (password) console.log(`Password: ${password}   ← login nantar badla`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
