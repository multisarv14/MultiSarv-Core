// Admin SDK init (core project). Kramane:
//  1. functions/service-account.json — core project chi asel tar.
//  2. `firebase login` kelela account (Firebase CLI che credentials).
// Project id: `--project <id>` kinva CORE_PROJECT_ID env.
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { initializeApp, cert } = require("firebase-admin/app");

const flag = process.argv.indexOf("--project");
const PROJECT_ID = (flag > -1 ? process.argv[flag + 1] : process.env.CORE_PROJECT_ID) || "";
if (!PROJECT_ID) {
  console.error("Core project id dya: --project <core-project-id>");
  process.exit(1);
}

const keyPath = path.join(__dirname, "..", "service-account.json");
const cliConfig = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");

if (fs.existsSync(keyPath) && require(keyPath).project_id === PROJECT_ID) {
  initializeApp({ credential: cert(require(keyPath)), projectId: PROJECT_ID });
} else if (fs.existsSync(cliConfig) && require(cliConfig).tokens?.refresh_token) {
  // Firebase CLI cha public OAuth client (firebase-tools/lib/api.js) — temporary ADC file.
  const adcPath = path.join(os.tmpdir(), `core-adc-${process.pid}.json`);
  fs.writeFileSync(
    adcPath,
    JSON.stringify({
      type: "authorized_user",
      client_id: "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com",
      client_secret: "j9iVZfS8kkCEFUPaAeJV0sAi",
      refresh_token: require(cliConfig).tokens.refresh_token,
      quota_project_id: PROJECT_ID,
    }),
    { mode: 0o600 },
  );
  process.on("exit", () => fs.rmSync(adcPath, { force: true }));
  process.env.GOOGLE_APPLICATION_CREDENTIALS = adcPath;
  process.env.GOOGLE_CLOUD_PROJECT = PROJECT_ID;
  initializeApp({ projectId: PROJECT_ID });
} else {
  console.error("Aadhi `firebase login` kara, kinva core chi service-account.json theva.");
  process.exit(1);
}

module.exports = { PROJECT_ID };
