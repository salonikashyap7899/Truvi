/**
 * Client-side geocoding (address → coordinates) via the Google Maps JavaScript
 * API.
 *
 * The key lives in VITE_GOOGLE_MAPS_API_KEY and ships in the browser bundle —
 * that is the intended model for a Maps *JavaScript API* key, as long as the
 * key is HTTP-referrer restricted to your domain(s) in Google Cloud Console.
 * (Referrer-restricted keys can't be used with the server-side Geocoding web
 * service, which is exactly why geocoding runs here in the browser.)
 *
 * Requires, in Google Cloud Console: billing enabled on the project, and the
 * "Maps JavaScript API", "Geocoding API" and "Places API" enabled. Leave the
 * key blank to disable auto-locate (developers can still drop the map pin
 * manually).
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

/**
 * Load the Maps JS API once (idempotent); resolves when `google.maps` is ready.
 * Loads the `places` library too so the search box, autocomplete and nearby-
 * landmark features work off the same single script load. Rejects (and clears
 * its cache so a retry is possible) if the script fails or never loads within
 * the timeout — so callers never hang forever on a bad key / blocked network.
 */
export function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.google?.maps) return Promise.resolve();
  if (window.__truviGmapsPromise) return window.__truviGmapsPromise;
  if (!API_KEY) return Promise.reject(new Error("Google Maps key not configured"));

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(API_KEY)}&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;
    const timer = window.setTimeout(() => reject(new Error("Google Maps load timed out")), 12_000);
    script.onload = () => {
      window.clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("Failed to load Google Maps"));
    };
    document.head.appendChild(script);
  }).catch((err) => {
    // Don't cache a permanently-rejected promise — let a later call retry.
    window.__truviGmapsPromise = undefined;
    throw err;
  });
  window.__truviGmapsPromise = promise;
  return promise;
}

/** Error carrying Google's geocoder status (e.g. ZERO_RESULTS, REQUEST_DENIED). */
export class GeocodeError extends Error {
  status: string;
  constructor(status: string) {
    super(status);
    this.name = "GeocodeError";
    this.status = status;
  }
}

/**
 * A user-friendly, actionable message for a geocoder status. Keeps the wording
 * consistent between auto-locate and the map search box.
 */
export function geocodeErrorMessage(status?: string): string {
  switch (status) {
    case "TIMEOUT":
    case "LOAD_FAILED":
      return "Google Maps didn't respond. Check that your API key is valid and the Maps JavaScript API + Geocoding API are enabled in Google Cloud.";
    case "REQUEST_DENIED":
      return "Google denied the request (REQUEST_DENIED). Enable the Geocoding API and add your site to the API key's HTTP-referrer restrictions.";
    case "OVER_QUERY_LIMIT":
      return "Google usage limit reached (OVER_QUERY_LIMIT). Check billing and quota on your Google Cloud project.";
    case "ZERO_RESULTS":
      return "No match for that address — try a fuller address, or click the map to drop the pin.";
    default:
      return "Could not locate this address — drop the pin on the map manually.";
  }
}

/** Reject with a GeocodeError("TIMEOUT") if `p` doesn't settle within `ms`. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new GeocodeError("TIMEOUT")), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

async function ensureMaps(): Promise<void> {
  try {
    await withTimeout(loadGoogleMaps(), 12_000);
  } catch {
    throw new GeocodeError("LOAD_FAILED");
  }
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

/**
 * Resolve an address string to coordinates. Uses the callback form so we can
 * read Google's real status, and a timeout so a non-responding API (bad key /
 * API not enabled) fails fast with a clear message instead of hanging.
 */
export async function geocodeAddress(query: string): Promise<GeocodeResult> {
  await ensureMaps();
  const geocoder = new window.google.maps.Geocoder();
  const { results, status } = await withTimeout(
    new Promise<{ results: any[]; status: string }>((resolve) => {
      geocoder.geocode({ address: query, region: "in" }, (r: any, s: any) =>
        resolve({ results: r ?? [], status: s }),
      );
    }),
    9_000,
  );
  if (status !== "OK" || results.length === 0) throw new GeocodeError(status || "UNKNOWN_ERROR");
  const best = results[0];
  return {
    lat: +best.geometry.location.lat().toFixed(6),
    lng: +best.geometry.location.lng().toFixed(6),
    formattedAddress: best.formatted_address,
  };
}

/** Resolve coordinates back to a human address (used to label a dropped pin). */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  await ensureMaps();
  const geocoder = new window.google.maps.Geocoder();
  const { results, status } = await withTimeout(
    new Promise<{ results: any[]; status: string }>((resolve) => {
      geocoder.geocode({ location: { lat, lng } }, (r: any, s: any) =>
        resolve({ results: r ?? [], status: s }),
      );
    }),
    9_000,
  );
  if (status !== "OK" || results.length === 0) throw new GeocodeError(status || "UNKNOWN_ERROR");
  return results[0].formatted_address as string;
}
