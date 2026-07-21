/**
 * Google Places helpers for the map location picker: address autocomplete and
 * nearby-landmark lookups. Reuses the single Maps JS load from geocoding.ts
 * (which now loads the `places` library). All functions degrade gracefully —
 * they resolve to empty results if the Places API isn't enabled or a call is
 * denied, so the picker still works as a plain click-to-drop map.
 *
 * Requires the "Places API" enabled in Google Cloud Console (in addition to
 * Maps JavaScript API + Geocoding API).
 */
import { loadGoogleMaps, isGeocodingConfigured } from "./geocoding";

export interface PlacePrediction {
  placeId: string;
  primary: string;
  secondary: string;
}

/** Address/place suggestions for an autocomplete box (India-biased). */
export async function getPlacePredictions(input: string): Promise<PlacePrediction[]> {
  if (!isGeocodingConfigured() || input.trim().length < 3) return [];
  await loadGoogleMaps();
  const service = new window.google.maps.places.AutocompleteService();
  return new Promise((resolve) => {
    service.getPlacePredictions(
      { input, componentRestrictions: { country: "in" } },
      (preds: any[] | null, status: string) => {
        if (status !== "OK" || !preds) return resolve([]);
        resolve(
          preds.map((p) => ({
            placeId: p.place_id,
            primary: p.structured_formatting?.main_text ?? p.description,
            secondary: p.structured_formatting?.secondary_text ?? "",
          })),
        );
      },
    );
  });
}

export interface ResolvedPlace {
  lat: number;
  lng: number;
  address: string;
}

/** Turn a chosen autocomplete prediction into coordinates + a display address. */
export async function resolvePlace(placeId: string): Promise<ResolvedPlace> {
  await loadGoogleMaps();
  const service = new window.google.maps.places.PlacesService(document.createElement("div"));
  return new Promise((resolve, reject) => {
    service.getDetails(
      { placeId, fields: ["geometry", "formatted_address", "name"] },
      (place: any, status: string) => {
        if (status !== "OK" || !place?.geometry?.location) return reject(new Error(status));
        resolve({
          lat: +place.geometry.location.lat().toFixed(6),
          lng: +place.geometry.location.lng().toFixed(6),
          address: place.formatted_address ?? place.name ?? "",
        });
      },
    );
  });
}

export type LandmarkCategory = "school" | "transit" | "hospital";

export interface Landmark {
  name: string;
  category: LandmarkCategory;
  lat: number;
  lng: number;
  vicinity?: string;
}

const CATEGORY_TYPE: Record<LandmarkCategory, string> = {
  school: "school",
  transit: "transit_station",
  hospital: "hospital",
};

/**
 * Nearby schools, transit stations and hospitals around a point (default 2.5km).
 * Returns up to 5 of each category. Empty on any failure (API not enabled etc.).
 */
export async function nearbyLandmarks(lat: number, lng: number, radius = 2500): Promise<Landmark[]> {
  if (!isGeocodingConfigured()) return [];
  await loadGoogleMaps();
  const service = new window.google.maps.places.PlacesService(document.createElement("div"));
  const location = new window.google.maps.LatLng(lat, lng);
  const categories = Object.keys(CATEGORY_TYPE) as LandmarkCategory[];

  const perCategory = await Promise.all(
    categories.map(
      (category) =>
        new Promise<Landmark[]>((resolve) => {
          service.nearbySearch(
            { location, radius, type: CATEGORY_TYPE[category] },
            (places: any[] | null, status: string) => {
              if (status !== "OK" || !places) return resolve([]);
              resolve(
                places.slice(0, 5).map((p) => ({
                  name: p.name,
                  category,
                  lat: p.geometry.location.lat(),
                  lng: p.geometry.location.lng(),
                  vicinity: p.vicinity,
                })),
              );
            },
          );
        }),
    ),
  );
  return perCategory.flat();
}
