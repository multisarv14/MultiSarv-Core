# MultiSarv Chat (Flutter)

Web panel chya Internal Chat (`/chat`) chi Android + iOS app — fakt Core Users, tech email + password login.
Backend vegla nahi: `../core` (functions `chat.ts`, firestore/storage rules) ch vaparte.

**Stack:** Flutter 3.44 · Stacked (MVVM, `noai` sarkha) · Firebase (Auth, Firestore, Storage, Functions, Messaging)

| Screen | Kay |
|---|---|
| Login | Core email + password, forgot password. `admins/{uid}.active` nasel tar logout |
| Chats | Sagle Core users, recent adhi, unread, search, test notification, logout |
| Conversation | WhatsApp sarkha: bubbles, divas, swipe = reply, long press = reply / copy, photo / file / voice message |
| Composer | Pill (emoji · text · attach · camera) + gol mic / send; recording (5 min kamal, mag apoaap jato) |
| Push | Navin message → notification (app band / background / dusra chat ughda); tap → to chat |

App ID: `com.multisarv.core` (Android ani iOS).

## Setup (ekda)

1. **Firebase apps register + config** (core project):
   ```bash
   firebase login --reauth
   cd mobile
   ~/.pub-cache/bin/flutterfire configure --project=multisarv-core --platforms=android,ios \
     --android-package-name=com.multisarv.core --ios-bundle-id=com.multisarv.core --yes
   ```
   He `lib/firebase_options.dart`, `android/app/google-services.json`, `ios/Runner/GoogleService-Info.plist` banavto.
2. **Backend deploy** (multi-device push — phone ani web donhi la notification):
   `../deploy.sh core` — `dev1@` la `multisarv-core` var **Service Account User** role lagto.
3. **iOS push:** Apple Developer → Keys → APNs key (.p8) → Firebase Console → Project settings →
   Cloud Messaging → Apple app configuration → upload. Xcode madhe Runner → Signing → Team nivda.

## Chalva

```bash
flutter run                        # connected phone / emulator
flutter build apk --release        # Android (signing khali)
flutter build ipa                  # iOS → App Store Connect / TestFlight
```

## Release

- **Android:** `android/app/build.gradle.kts` madhe release signing (keystore) — sadhya debug key. Play Console account.
- **iOS:** Apple Developer Program, App Store Connect madhe app (`com.multisarv.core`), TestFlight.
