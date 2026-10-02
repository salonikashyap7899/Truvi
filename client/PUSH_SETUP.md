# Phone push notifications (FCM) — setup

The code for phone-tray push notifications is **already complete**. Notifications
flow to the in-app bell, a real-time pop-up while the app is open, and — once the
steps below are done — the **phone's notification tray even when the app is
closed** (via Firebase Cloud Messaging).

Push stays a safe no-op until it's configured, so nothing breaks before setup.

There are **two halves**: the Android app (so the phone can receive a push) and
the server (so Truvi can send one). Both are needed.

---

## A) Android app — receive pushes

The Android project (`client/android/`) is generated locally (`npx cap sync`),
so these edits are done on your machine, not committed to the repo.

1. **Firebase project**
   - Go to <https://console.firebase.google.com> → Add project (or reuse one).
   - Add app → **Android**. For **Android package name** type exactly:
     ```
     com.truviventures.app
     ```
     (No spaces. It must match `appId` in `client/capacitor.config.json`.)
   - Register the app and **download `google-services.json`**.

2. **Drop the file in**
   ```
   client/android/app/google-services.json
   ```

3. **Add the Google Services Gradle classpath** — ONE line, in ONE file.

   In `client/android/build.gradle` (the **project-level** one), inside
   `buildscript { dependencies { … } }`, add this line **once**:
   ```gradle
   classpath 'com.google.gms:google-services:4.4.2'
   ```

   > ⚠️ Do **NOT** add `apply plugin: 'com.google.gms.google-services'` to
   > `app/build.gradle` yourself. Capacitor's generated `app/build.gradle`
   > already applies it automatically at the bottom, inside a
   > `try { … file('google-services.json') … apply plugin … }` block — so it
   > kicks in as soon as `google-services.json` is present. Adding it again by
   > hand (especially inside the `defaultConfig { }` block) breaks the build.
   > Likewise add the classpath above only **once** — a duplicate line fails
   > the build too.

4. **Rebuild the APK**
   ```bash
   cd client
   npm install
   npm run build
   npx cap sync android
   npx cap open android   # then Build → Generate Signed Bundle/APK
   ```
   Install this new APK on the phone. On first launch (signed in) it asks for
   notification permission — allow it. The app registers a device token with the
   server automatically.

> The app loads the live site (`server.url = https://truviventures.com`), so
> normal web changes don't need a rebuild — **but adding push is a native change,
> so this one APK rebuild is required.**

---

## B) Server — send pushes

1. Firebase Console → **Project settings → Service accounts → Generate new
   private key**. This downloads a service-account JSON.

2. Base64-encode it (base64 avoids private-key newline issues):
   ```bash
   base64 -w0 service-account.json
   ```

3. Put it in `server/.env` as one line:
   ```
   FCM_SERVICE_ACCOUNT_BASE64=<the base64 string>
   ```
   (Alternatively `FCM_SERVICE_ACCOUNT_FILE=/absolute/path/to/service-account.json`.)

4. Restart the server:
   ```bash
   pm2 restart truviventures
   ```

---

## C) Verify it works

1. Open the app on the phone (signed in), allow notifications.
2. On the website, sign in as founder/admin → **Admin → Notifications**
   (`/admin/notifications`).
   - **Push status** should show *FCM push: Configured* and *Your devices: 1+*.
   - Click **Send myself a test**. The pop-up should appear in the phone tray
     (background the app first to confirm the closed-app case).
3. Use **Broadcast announcement** to send a pop-up to a role or all users.

If *Your devices* stays 0: the APK doesn't have `google-services.json` /
the gradle plugin, or notification permission was denied — redo section A.
If *FCM push* stays *Not configured*: the server env var is missing — redo B.
