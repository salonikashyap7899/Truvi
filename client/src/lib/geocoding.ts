/**
 * Client-side geocoding (address → coordinates) via OpenStreetMap's Nominatim.
 *
 * Free, no API key, and no billing — the same "no key, no billing" model the
 * project's Leaflet basemaps already use (see lib/leafletTiles.ts). This
 * replaces the old Google Maps Geocoding API, which refused to run unless the
 * Google Cloud project had billing enabled ("You must enable Billing on the
 * Google Cloud Project…") — the error developers hit on "Auto-locate".
 *
 * Nominatim usage policy: at most ~1 request/second and an identifying HTTP
 * header. This only fires when a human clicks "Auto-locate" (nowhere near the
 * rate limit) and the browser sends a Referer automatically, so we stay well
 * within acceptable use. https://operations.osmfoundation.org/policies/nominatim/
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/** Geocoding needs no configuration now (no API key / billing). */
export function isGeocodingConfigured(): boolean {
  return true;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

/** Resolve an address string to coordinates using OpenStreetMap Nominatim. */
export async function geocodeAddress(query: string): Promise<GeocodeResult> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", query);
  url.searchParams.set("countrycodes", "in"); // bias results to India
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "0");

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);

  const results = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (!Array.isArray(results) || results.length === 0) throw new Error("No location found");

  const best = results[0];
  return {
    lat: +Number(best.lat).toFixed(6),
    lng: +Number(best.lon).toFixed(6),
    formattedAddress: best.display_name,
  };
}
