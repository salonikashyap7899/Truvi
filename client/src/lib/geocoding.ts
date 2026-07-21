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
 * landmark features work off the same single script load. Exported so the
 * places helpers can await the same shared promise.
 */
export function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.google?.maps) return Promise.resolve();
  if (window.__truviGmapsPromise) return window.__truviGmapsPromise;
  if (!API_KEY) return Promise.reject(new Error("Google Maps key not configured"));

  window.__truviGmapsPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(API_KEY)}&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return window.__truviGmapsPromise;
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
 * Whether a geocoder status points at a Google Cloud misconfiguration (API not
 * enabled, key restricted, billing/quota) rather than a genuine no-match. Used
 * to show the developer an actionable message instead of "no results".
 */
export function isGeocodeConfigError(status?: string): boolean {
  return (
    status === "REQUEST_DENIED" ||
    status === "OVER_QUERY_LIMIT" ||
    status === "INVALID_REQUEST" ||
    status === "ERROR"
  );
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

/**
 * Resolve an address string to coordinates. Uses the callback form so we can
 * read Google's real status and surface config problems (REQUEST_DENIED etc.)
 * instead of a generic failure.
 */
export async function geocodeAddress(query: string): Promise<GeocodeResult> {
  await loadGoogleMaps();
  const geocoder = new window.google.maps.Geocoder();
  const { results, status } = await new Promise<{ results: any[]; status: string }>((resolve) => {
    geocoder.geocode({ address: query, region: "in" }, (r: any, s: any) =>
      resolve({ results: r ?? [], status: s }),
    );
  });
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
  await loadGoogleMaps();
  const geocoder = new window.google.maps.Geocoder();
  const { results, status } = await new Promise<{ results: any[]; status: string }>((resolve) => {
    geocoder.geocode({ location: { lat, lng } }, (r: any, s: any) =>
      resolve({ results: r ?? [], status: s }),
    );
  });
  if (status !== "OK" || results.length === 0) throw new GeocodeError(status || "UNKNOWN_ERROR");
  return results[0].formatted_address as string;
}
