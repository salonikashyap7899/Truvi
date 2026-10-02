# Truvi Android App — build & Play Store guide

The Truvi Android app is built with **Capacitor**. It **bundles the web app**
(the React code in `client/`) inside a native Android shell — so:

- You reuse the exact same website code (**no separate app to maintain**).
- The app **opens instantly** from the phone (the UI is shipped inside the app,
  not downloaded from the network on every launch).
- The app **keeps working offline**: its screens load from the device, and only
  live data needs the internet. When the connection drops it shows a small
  "You're offline" banner instead of going blank.
- Camera (KYC selfie), Razorpay payments and login all work as they do in the
  mobile browser. Login is remembered on the device, so users stay signed in.

> **Trade-off vs the old setup:** the app used to load the live site, so website
> changes appeared in the app automatically. Now the app is self-contained, so
> **any change to the app's UI or features needs a new APK/AAB build and upload**
> (steps 4–5 below). The website still updates on its own.

Config lives in **`client/capacitor.config.json`** (appId `com.truviventures.app`,
appName **Truvi**). There is deliberately no `server.url` — that's what makes the
app bundle its UI locally. Native builds call the API at
`https://truviventures.com` automatically (see `client/src/lib/api.ts`), and the
server already allows the app's origin (`https://localhost`) through CORS.

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
npm run build               # produces client/dist (the UI the app bundles)
npx cap add android         # creates client/android (the native project)
npx cap sync android        # copies the build + config into the native project
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

1. **Rebuild the web + sync first** (do this every time you have new changes):
   ```bash
   cd client
   npm run build
   npx cap sync android
   ```
2. Open the `client/android` folder in **Android Studio** (`npm run cap:open`
   from `client/` also opens it).
3. **Build → Generate Signed Bundle / APK → Android App Bundle (.aab)**.
4. **Create a new keystore** the first time (a `.jks` file + passwords).
   ⚠️ **Keep this keystore file and passwords safe forever** — you need the same
   one for every future update; losing it means you can't update the app.
5. Choose **release**, finish → you get an `app-release.aab`.

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

Because the app now bundles its UI, an update is always a **rebuild + reupload**:

1. Deploy your website/server changes as usual (for the web + the API).
2. `cd client && npm run build && npx cap sync android`.
3. Bump `versionCode`/`versionName` in `client/android/app/build.gradle`.
4. Rebuild the signed AAB (step 4 above) and upload a new release in Play
   Console.

> If you ever want the app to also auto-update its UI without a Play resubmission,
> that's a separate feature (Capacitor **Live Updates / OTA**) that can be added
> on top of this setup.

## Notes / alternatives

- **Push notifications** (phone-tray pop-ups when the app is closed) are optional
  and configured separately — see `client/PUSH_SETUP.md`.
- **iOS** later: `npx cap add ios` + an Apple Developer account (US$99/yr) and a
  Mac with Xcode. The same web code powers it.
