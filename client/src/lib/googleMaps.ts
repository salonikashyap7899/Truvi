/**
 * Client-side Google Maps loader + geocoder.
 *
 * The key lives in VITE_GOOGLE_MAPS_API_KEY and ships in the browser bundle —
 * that is the intended model for a Maps *JavaScript API* key, as long as the
 * key is HTTP-referrer restricted to your domain(s) in Google Cloud Console.
 * (Referrer-restricted keys can't be used with the server-side Geocoding web
 * service, which is exactly why geocoding runs here in the browser.)
 */

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export function isGeocodingConfigured(): boolean {
  return Boolean(API_KEY);
}

declare global {
  interface Window {
    google?: any;
    __truviGmapsPromise?: Promise<void>;
  }
}

/** Load the Maps JS API once (idempotent); resolves when `google.maps` is ready. */
function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.google?.maps) return Promise.resolve();
  if (window.__truviGmapsPromise) return window.__truviGmapsPromise;
  if (!API_KEY) return Promise.reject(new Error("Google Maps key not configured"));

  window.__truviGmapsPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(API_KEY)}&libraries=geocoding&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return window.__truviGmapsPromise;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

/** Resolve an address string to coordinates using the browser Geocoder. */
export async function geocodeAddress(query: string): Promise<GeocodeResult> {
  await loadMaps();
  const geocoder = new window.google.maps.Geocoder();
  let results;
  try {
    ({ results } = await geocoder.geocode({ address: query, region: "in" }));
  } catch (err: any) {
    // Surface Google's actual status (REQUEST_DENIED / OVER_QUERY_LIMIT / …)
    // so the UI can show a precise reason instead of a generic failure.
    const code = err?.code || err?.status || err?.message || "GEOCODE_FAILED";
    throw new Error(String(code));
  }
  if (!results || results.length === 0) throw new Error("ZERO_RESULTS");
  const best = results[0];
  return {
    lat: +best.geometry.location.lat().toFixed(6),
    lng: +best.geometry.location.lng().toFixed(6),
    formattedAddress: best.formatted_address,
  };
}
