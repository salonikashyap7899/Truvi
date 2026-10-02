import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * Native-app glue for the Capacitor (Android) build. Renders nothing.
 *
 * On a normal browser this is a complete no-op — `isNativePlatform()` is false,
 * so none of the plugin code runs and web visitors are unaffected.
 *
 * Inside the installed app it does two things every real Android app does:
 *
 *  1. Hardware BACK button → step back through the in-app history instead of
 *     killing the whole app. Previously, pressing back on (say) the dashboard
 *     closed the entire app; now it behaves like every other app — back walks
 *     you to the previous screen, and only exits once there's nowhere left to
 *     go back to.
 *
 *  2. Status bar → don't let the WebView draw under the status bar, and match
 *     its colour to the app's dark theme, so the top nav never hides behind the
 *     clock / battery icons.
 *
 *  3. Splash screen → the app loads the live site over the network, so there's
 *     a moment before the page paints. We keep the branded splash up during
 *     that load (launchAutoHide is false in capacitor.config) and hide it here
 *     the instant React has mounted — so the app opens onto the splash, not a
 *     blank white screen, and never feels "stuck" while it loads.
 *
 * The Capacitor plugins are imported dynamically so they're only pulled in on
 * the native platform and never affect the web bundle's startup.
 */
export default function NativeShell() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let removeBackListener: (() => void) | undefined;

    // Hide the splash now that the web app has actually rendered.
    import("@capacitor/splash-screen")
      .then(({ SplashScreen }) => {
        SplashScreen.hide().catch(() => {});
      })
      .catch(() => {});

    // Hardware back button
    import("@capacitor/app")
      .then(({ App }) => {
        App.addListener("backButton", ({ canGoBack }) => {
          if (canGoBack || window.history.length > 1) {
            window.history.back();
          } else {
            // At the first screen with nowhere to go back — exit like a
            // normal app instead of getting stuck.
            App.exitApp();
          }
        }).then((handle) => {
          removeBackListener = () => handle.remove();
        });
      })
      .catch(() => {
        /* plugin missing (older build) — back button just keeps default */
      });

    // Status bar: keep the WebView below the status bar, dark theme.
    import("@capacitor/status-bar")
      .then(({ StatusBar, Style }) => {
        StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
        StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
        StatusBar.setBackgroundColor({ color: "#0a0d14" }).catch(() => {});
      })
      .catch(() => {});

    return () => {
      removeBackListener?.();
    };
  }, []);

  return null;
}
