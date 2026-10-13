// Sagle Core users che push (FCM) tokens kadhto — `pushDevices` ani juna `pushTokens`.
//   npm run reset-push-tokens -- --project <core-project-id> [--dry-run]
// Nantar pratyek device app / panel ughadla ki swatah navin token nondavto
// (phone app: start; web: permission aadhich dili asel tar ChatDock load).
require("./_admin.cjs");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

async function main() {
  const dry = process.argv.includes("--dry-run");
  const db = getFirestore();
  const snap = await db.collection("admins").get();
  let n = 0;
  const batch = db.batch();
  for (const d of snap.docs) {
    const x = d.data();
    const count = Object.keys(x.pushDevices || {}).length + (x.pushTokens || []).length;
    if (!count) continue;
    n++;
    console.log(`${x.email || d.id}: ${count} token(s)`);
    batch.update(d.ref, { pushDevices: FieldValue.delete(), pushTokens: FieldValue.delete() });
  }
  if (!n) return console.log("Konachehi tokens nahit.");
  if (dry) return console.log(`--dry-run: ${n} user(s) — kahich badalla nahi.`);
  await batch.commit();
  console.log(`${n} user(s) che tokens reset zale.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
