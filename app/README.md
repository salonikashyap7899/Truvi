# Truvi — App (mobile)

This folder is the home for everything about the **Truvi Android app**: how it's
built, configured, and published. It's kept separate from the website source so
the "app side" is easy to find — **but the app and the website share one code
base on purpose** (see below).

## How the repo is organised

| Folder | What it is |
| --- | --- |
| `client/` | **The web app** — the React/Vite source for `truviventures.com`. |
| `server/` | **The backend API** (Express) that both web and app talk to. |
| `app/`    | **The mobile app guide & config reference** (this folder). |

### Why web and app share the same code

The Truvi Android app is built with **Capacitor**. It does **not** have its own
separate UI code — it takes the exact same web app that's in `client/`, bundles
that build inside the APK, and runs it as a native app. This is the standard,
recommended Capacitor setup and it means:

- **One source of truth.** A screen fixed once in `client/` is fixed on both web
  and app. There is no second copy to keep in sync.
- The only *app-specific* file is **`client/capacitor.config.json`** (it lives
  next to the web project because the Capacitor build tool requires it there).
  When you generate the native project it appears as **`client/android/`**.

So there is intentionally **no separate "app code" folder** — splitting the code
in two would mean maintaining everything twice. This folder holds the app's
**documentation and release process** instead.

## Where the app-specific pieces live

- **`app/MOBILE_APP.md`** — full build & Google Play publishing guide.
- **`client/capacitor.config.json`** — the app's identity & native settings
  (appId `com.truviventures.app`, appName **Truvi**).
- **`client/android/`** — the generated native Android Studio project
  (created by `npx cap add android`; not committed).
- **`client/PUSH_SETUP.md`** — optional push-notification (FCM) setup.

## Quick build (from the repo root)

```bash
cd client
npm install
npm run build          # builds the web app into client/dist
npx cap add android    # one-time: creates client/android
npx cap sync android   # copies the latest build + config into the app
npx cap open android   # opens Android Studio to build/run the APK/AAB
```

> **Important:** the app now **bundles** the web build (it no longer loads the
> live site), so it opens instantly and survives going offline. The trade-off is
> that **any change to the app's look or features needs a fresh APK build here** —
> the website updates on its own, but the installed app does not until you
> rebuild it. Full details in `MOBILE_APP.md`.
