# Multisarv Admin

Sagle Multisarv projects (NOAI ani same Firebase structure che pudhche projects) sathi ek master admin panel.
Ekda email + password ne login (Multisarv core), mag access aslele sagle projects OTP shivay ughadtat.
Super admin admins add karto ani pratyek admin la project-nihay ani menu-nihay access deto.

**Stack:** React 19 · TypeScript · Vite · Tailwind v4 · TanStack Query · Firebase JS SDK · Recharts

## Pages

| Page | Kay karta yeta | Backend |
|---|---|---|
| Login (`/login`) | Email + password, password reset | core Auth |
| Control center (`/`) | Access aslele projects, connection status, pending queues | count queries |
| Admins (`/admins`, fakt super admin) | Admin add / disable / remove, project × menu access, activity | core `createAdmin`, `updateAdmin`, `deleteAdmin` |
| Dashboard | GMV, platform revenue, escrow, live tasks, users, 7/30/90 day trend | aggregation queries |
| Users | Search (naav / 10-digit phone / uid), role-KYC-blocked filters, CSV, block/unblock | `toggleBlockUser` |
| User drawer | Wallet, profile, KYC photos, tasks, transactions | Firestore reads |
| KYC review | Front/back photos zoom, approve / reject | `reviewKyc` |
| Tasks | Status filter, proof photos, chat, timeline, admin cancel + refund | `cancelTask` |
| Disputes | Customer / partner baju nirnay, close, under review | `resolveDispute` |
| Payouts | UTR sobat paid, failed (wallet refund), CSV | `settlePayout` |
| Ledger | Sagle transactions, type / user filter, CSV | Firestore reads |
| Notifications | Announcement (bhasha-nihay text, audience: sagle / role / category / city / numbers), delivery report (konala push gela, konala fakt inbox, kuthe fail), navin task alert settings, admin alerts | `sendBroadcast`, `updateNotificationSettings` |
| Categories | Catalog (read-only) | — |

Paise / status che sagle writes NOAI Cloud Functions madhunch hotat — panel thet Firestore la lihit nahi,
tyamule app che rules ani audit trail tasech rahtat. `⌘K` / `Ctrl+K` ne page, project, phone kinva task id var thet jaa.

## Bhasha

Panel English, हिन्दी, मराठी, ગુજરાતી madhe (header madhla `EN` menu, login page var pan).
Strings `src/i18n/messages/*.ts` madhe — pratyek key la charhi bhasha nahi tar TypeScript error.
Users la jaanare notifications tyanchya app chya bhashet (`users/{uid}.language`) server render karto.

## Notifications

- **Announcement:** Notifications → Navin ghoshna. Pratyek bhashet vegla text (rikami bhasha → English).
  "Mala test pathva" fakt tumchya admin account la.
- **Report:** pratyek pathavlelyacha live progress ani "konala gela": push pohochla / fakt inbox
  (app madhe notification token nahi) / fail. CSV export.
- **Navin task alert:** Automatic alerts madhe nivda — category jodlele partners (default), same city,
  sagle partners, sagle, kinva konalach nahi. Post karnara customer vagalto.
- **Admin alerts:** navin user signup (on/off), navin task (on/off); KYC / dispute / payout nehmi.
  Header cha bell live; browser push sathi `VITE_NOAI_VAPID_KEY` lagto
  (Console → Project settings → Cloud Messaging → Web Push certificates → Generate key pair).

Backend `noai/functions/src/broadcast.ts` madhe (`deliverBroadcast`, `onUserCreated`, `onTaskCreated`).

## Setup

```bash
npm install
cp .env.example .env.local   # Firebase web config bhara
npm run dev                  # http://localhost:5173
```

### 1. Firebase web app (pratyek project sathi ekda)

Firebase Console → Project settings → **Add app → Web** → config `.env.local` madhe
(`VITE_NOAI_API_KEY`, `VITE_NOAI_APP_ID` …). Android app chi key vaparu naka — ti browser madhun chalat nahi.

### 2. Multisarv core (admins + access) — ekda

Panel cha login ani sagle admins ek vegla Firebase project (`core`) madhe. Code `core/` madhe.

```
Admin ──email/password──▶ core (admins/{uid}: projects + menus)
                            └─ getProjectToken("noai") → NOAI custom token (claims: admin, menus)
Panel ──signInWithCustomToken──▶ NOAI   (phone OTP nahi)
```

1. Core Firebase project → **Authentication → Sign-in method → Email/Password** enable.
   **Firestore** create kara (asia-south1). Plan **Blaze** (Cloud Functions sathi).
2. Core web app config `.env.local` madhe `VITE_CORE_*`.
3. Pratyek project (NOAI) chi service account key core madhe secret mhanun:
   NOAI Console → Project settings → **Service accounts → Generate new private key** →
   ```bash
   cd core
   firebase functions:secrets:set PROJECT_KEY_NOAI --data-file ~/Downloads/noai-xxxx.json --project <core-id>
   rm ~/Downloads/noai-xxxx.json        # key repo / Downloads madhe theu naka
   ```
4. Deploy ani pahila super admin:
   ```bash
   cd core/functions && npm install
   cd .. && firebase deploy --only functions,firestore:rules --project <core-id>
   cd functions && npm run set-super-admin -- you@example.com --project <core-id> --name "Tumche Naav"
   ```
   Password dila nahi tar script random password deto — login nantar "Forgot password" ne badla.

Mag `/admins` madhun baki admins add kara. Menu = page ani tyatli actions; NOAI Cloud Functions
pratyek action la `menus` claim tapastat (`requireAdmin(req, "payouts")`), mhanun fakt UI lapavla nahi.
Access badalla ki tya project cha session revoke hoto ani panel apoaap navin token gheto.

Juna `npm run set-admin` (phone) admin ajun chalto (sagla access) — pan panel ata tyacha vapar karat nahi.

### 3. Authorized domain

Firebase Console → Authentication → Settings → **Authorized domains** madhe panel cha domain add kara
(`localhost` default asto). Prod domain pratyek project madhe add karava lagto.

## Navin project jodne

**Panel madhun (code badal nako):** super admin → **Projects → Add project** (naav, ID, rang) →
**Connect Firebase**:

1. Tya Firebase project cha **web config** (Project settings → General → Your apps → Web app → Config) paste kara.
2. Tyachi **service account JSON** (Project settings → Service accounts → Generate new private key) nivda.
3. **Connect & test** — core key tapasto, encrypt karun `projectKeys` madhe thevto (client la kadhich disat nahi).

Mag Module Access madhe admins la tya project che menus dya. Project che pages tevha chaltat jevha tyacha
backend (NOAI sarkhe functions — `requireAdmin(req, "<menu>")`, ani rules) tyachya repo madhun deploy hoto.
Tickets chya Project dropdown madhe **Multisarv** (master panel) ani sagle projects apoaap distat.

### SocietySarv sarkha (society management) project

Add project madhe **App structure → Society management** nivda (nantar badalta yet nahi). Pages `/s/<id>`
khali yetat: Dashboard (sagle societies), Residents (PIN reset, role badal), Complaints (status badal), Visitors,
Maintenance bills, Expenses & income, Notices, Emergency contacts, **Member roles** (society che staff roles +
role history) ani **Subscription** (plans catalogue, society cha plan assign / renew / cancel, app madhun aalelya
requests). Code `src/pages/society/`, data `src/api/society.ts`.

1. `multisarv-mobileapps` madhe **Web app** register kara (sadhya fakt Android aahe) — tyacha config Connect madhe.
2. Connect madhe **Firestore database ID** = `societysarv-app-db` (default bharlela asto).
3. Service account = `multisarv-mobileapps` chi key. Hi key tya project madhlya **sagle** apps la access dete.
4. `core.multisarv.com` → `multisarv-mobileapps` → Authentication → Authorized domains.

SocietySarv la Cloud Functions nahit — panel app sarkhech thet Firestore la lihito (complaint
`status`/`resolutionNotes`, resident `pin` ani role fields, `roles`, `role_history`, `subscription_plans`,
`subscription/current`, `subscription_history`, `subscription_requests`). Core `syncProject` society projects madhe `users` doc lihit nahi.

Menus `roles` ani `subscriptions` (core `SOCIETY_MENUS`) — Module Access madhun admins la dya. Plans ani society
cha plan fakt `subscriptions` menu aslela panel token lihu shakto (SocietySarv `firestore.rules` madhe
`panelMenu('subscriptions')`), mhanje society app madhun swatahla plan deu shakat nahi. Navin menus sathi core
functions punha deploy kara (`./deploy.sh core`), ani SocietySarv repo madhun rules.
SocietySarv backend `deploy.sh` madhe nahi — tyache rules `SocietySarv` repo madhunch deploy kara.

**Built-in (code madhe, NOAI sarkha):** `src/config/projects.ts` → `BUILT_IN_PROJECTS`, `.env.local` madhe
`VITE_KEY_*`, ani `core/functions/src/projects.ts` → `BUILT_IN` + `PROJECT_KEY_<ID>` secret.

## Local test (emulator)

```bash
cd ../noai && firebase emulators:start      # auth, firestore, functions, storage
cd ../multisarv && npm run dev:emu          # .env.emulator vaparto
```

Emulator mode madhe login live core var hoto; NOAI emulator la jato (auth emulator custom token
signature tapasat nahi).

## Deploy (Firebase Hosting)

Ek command madhe sagla (hosting + core + pratyek project cha backend):

```bash
npm run deploy                    # sagla
./deploy.sh hosting               # fakt admin panel
./deploy.sh core noai             # nivadlele
```

Navin project ala ki `deploy.sh` madhe `PROJECTS` list la `"<naav>:<folder>:<firebase-project-id>"` ek line add kara.
Dogha folders madhe `.firebaserc` aahe, mhanun `firebase deploy` la `--project` dyava lagat nahi.

Manual:

```bash
firebase hosting:sites:create multisarv-admin --project noai-17bdc   # ekda
npm run build
firebase deploy --only hosting --project noai-17bdc
```

Core (admins / access) badal `core/` madhun: `firebase deploy --only functions,firestore:rules,storage --project <core-id>`.

Notifications che backend badal (functions + rules) `noai` madhun deploy kara:

```bash
cd ../noai && firebase deploy --only functions,firestore:rules --project noai-17bdc
```

`firebase.json` madhe SPA rewrite, security headers ani `/assets` long-term cache aahe.
App fakt `core.multisarv.com` var ughadto (`multisarv-admin.web.app` tithe redirect hoto). Ha domain la **core ani sagle** projects che Authorized domains madhe add kara.

## Mahiti asava

- Users search Firestore var substring nahi — loaded rows madhe naav search, ani purna 10-digit phone / uid
  server var shodhto. Users khup vadhle ki Algolia / Typesense lava.
- Filter kelelya users lists `documentId` order ne yetat (composite index lagu naye mhanun).
- Categories edit karayla Firestore rules madhe client write band aahe — `npm run seed` vapra.
