import { Capacitor } from "@capacitor/core";

export interface Coords {
  lat: number;
  lng: number;
}

/**
 * Get the user's current position. Uses the Capacitor Geolocation plugin inside
 * the installed app (it handles the native permission prompt), and the browser
 * Geolocation API on the web. Resolves to null if unavailable or denied.
 */
export async function getCurrentPosition(): Promise<Coords | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Geolocation } = await import("@capacitor/geolocation");
      try {
        const perm = await Geolocation.checkPermissions();
        if (perm.location !== "granted") {
          const req = await Geolocation.requestPermissions();
          if (req.location !== "granted") return null;
        }
      } catch {
        /* older plugin / no checkPermissions — fall through to getCurrentPosition */
      }
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) return null;
    return await new Promise<Coords | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      );
    });
  } catch {
    return null;
  }
}

/** Great-circle distance in km between two lat/lng points (Haversine). */
export function haversineKm(a: Coords, b: Coords): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Human-friendly distance label, e.g. "850 m away" or "12.4 km away". */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}
