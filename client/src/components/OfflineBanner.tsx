import { useEffect, useState } from "react";

/**
 * Thin, non-blocking banner shown whenever the device loses its connection.
 *
 * With the Android app now bundled (served from the device, not the live
 * site), the UI shell keeps working offline — only data that needs the network
 * fails. This banner gives that an honest, visible signal instead of leaving
 * users staring at a screen whose data silently won't load. On the web it
 * behaves the same. Renders nothing while online.
 */
export default function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2147483647,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "10px 16px calc(10px + env(safe-area-inset-bottom, 0px))",
        background: "rgba(10,13,20,0.96)",
        borderTop: "1px solid rgba(255,255,255,0.12)",
        color: "#fff",
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
        fontWeight: 600,
        backdropFilter: "blur(6px)",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#f59e0b",
          boxShadow: "0 0 0 3px rgba(245,158,11,0.2)",
        }}
      />
      You're offline — some features need internet. We'll reconnect automatically.
    </div>
  );
}
