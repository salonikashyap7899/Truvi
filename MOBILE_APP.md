# Truvi Android App — build & Play Store guide

The Truvi Android app is built with **Capacitor**. It wraps the **live website**
(`https://truviventures.com`) in a native Android shell — so:

- You reuse the exact same website code (no separate app to maintain).
- Most changes you make to the website go live in the app **automatically**,
  with **no need to rebuild or re-upload** the app (because the app loads the
  live site). You only rebuild the app for *native* changes (icon, permissions,
  Capacitor version, app name).
- Camera (KYC selfie), Razorpay payments and login all work exactly as they do
  in the mobile browser, because the app's origin is `truviventures.com`.

Config lives in `client/capacitor.config.json` (appId `com.truviventures.app`,
appName **Truvi**).

---

## 0. One-time: install the tools (on your computer)

1. **Android Studio** — https://developer.android.com/studio (includes the
   Android SDK). Open it once and let it finish downloading the SDK.
2. **Java JDK 17+** (Android Studio bundles one; that's fine).
3. Node 20+ (you already have it for the website).

## 1. One-time: add the Android project

From the repo:

```bash
cd client
npm install                 # installs Capacitor (already in package.json)
npm run build               # produces client/dist (Capacitor needs a webDir)
npx cap add android         # creates client/android (the native project)
npx cap sync android        # copies config into the native project
```

This creates a `client/android/` folder — the native Android Studio project.

## 2. One-time: allow the camera (for KYC selfie)

Open `client/android/app/src/main/AndroidManifest.xml` and add these inside the
`<manifest>` tag (above `<application>`):

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```

(INTERNET is usually already there.) Then run `npx cap sync android` again.

## 3. App icon & name

- **Name:** already set to "Truvi" (from `capacitor.config.json`).
- **Icon:** in Android Studio → right-click `app/res` → *New → Image Asset* →
  choose your Truvi logo (512×512 PNG) → Finish. Or use
  https://icon.kitchen to generate the icon set and drop it into `app/res`.

## 4. Build a release AAB (what Play Store wants)

1. Open the `client/android` folder in **Android Studio** (`npm run cap:open`
   from `client/` also opens it).
2. **Build → Generate Signed Bundle / APK → Android App Bundle (.aab)**.
3. **Create a new keystore** the first time (a `.jks` file + passwords).
   ⚠️ **Keep this keystore file and passwords safe forever** — you need the same
   one for every future update; losing it means you can't update the app.
4. Choose **release**, finish → you get an `app-release.aab`.

## 5. Publish on Google Play

1. Create a **Google Play Console** account (one-time **US$25**):
   https://play.google.com/console
2. **Create app** → name "Truvi", language, app (not game), free.
3. **Upload the `.aab`** under *Testing → Internal testing* first (fastest way
   to test on your own phone), then *Production* when ready.
4. Fill the required forms:
   - **Store listing** — short + full description, app icon, a *feature graphic*
     (1024×500), and 2–8 phone screenshots.
   - **Privacy Policy URL** → `https://truviventures.com/privacy` (already live).
   - **Data safety** form → declare: Personal info (name, email, phone),
     Financial info (payments via Razorpay — processor handles card data),
     Photos (selfie for KYC), Location (for on-site verification, optional),
     and that data is encrypted in transit and users can request deletion
     (email `info@truviventures.com`).
   - **Content rating** questionnaire.
   - **Target audience** → 18+.
5. Submit for review. First review usually takes a few days.

## 6. Updating later

- **Website / feature changes:** just deploy the website as usual — the app
  shows them automatically. **No app rebuild, no Play resubmission.**
- **Native changes** (icon, name, new permission, Capacitor upgrade): run
  `npm run build && npx cap sync android`, bump `versionCode`/`versionName` in
  `client/android/app/build.gradle`, rebuild the signed AAB, and upload a new
  release in Play Console.

## Notes / alternatives

- This setup loads the live site. If you later want an **offline-capable** app
  that ships the UI inside the app, remove the `server.url` block from
  `capacitor.config.json` and build with `VITE_API_URL=https://truviventures.com`
  so the bundled app still reaches your API — but then every UI change needs an
  app rebuild + resubmission, and cross-origin auth cookies need extra care.
  The current (live-site) setup avoids all of that.
- **iOS** later: `npx cap add ios` + an Apple Developer account (US$99/yr) and a
  Mac with Xcode. The same web code powers it.
