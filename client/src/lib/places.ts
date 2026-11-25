/**
 * Google Places helpers for the map location picker: address autocomplete and
 * nearby-landmark lookups. Reuses the single Maps JS load from geocoding.ts
 * (which now loads the `places` library). The picker catches Places failures
 * so it still works as a plain click-to-drop map when Places isn't configured.
 *
 * Requires the "Places API" enabled in Google Cloud Console (in addition to
 * Maps JavaScript API + Geocoding API).
 */
import { loadGoogleMaps, isGeocodingConfigured } from "./geocoding";

export interface PlacePrediction {
  placeId: string;
  primary: string;
  secondary: string;
  /** The Maps JS PlacePrediction used by the new Places API for place details. */
  prediction: unknown;
}

/** Create one billing session for a user's autocomplete typing session. */
export async function createPlacesSessionToken(): Promise<unknown> {
  await loadGoogleMaps();
  const places = await window.google.maps.importLibrary("places");
  return new places.AutocompleteSessionToken();
}

/** Address/place suggestions via Google's current Places Autocomplete Data API. */
export async function getPlacePredictions(input: string, sessionToken?: unknown): Promise<PlacePrediction[]> {
  if (!isGeocodingConfigured() || input.trim().length < 3) return [];
  await loadGoogleMaps();
  const places = await window.google.maps.importLibrary("places");
  const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: input.trim(),
    ...(sessionToken ? { sessionToken } : {}),
  });
  return (suggestions ?? []).flatMap((suggestion: any) => {
    const prediction = suggestion.placePrediction;
    if (!prediction) return [];
    return [{
      placeId: prediction.placeId,
      primary: prediction.mainText?.text ?? prediction.text?.text ?? "",
      secondary: prediction.secondaryText?.text ?? "",
      prediction,
    }];
  });
}

export interface ResolvedPlace {
  lat: number;
  lng: number;
  address: string;
}

/** Turn a chosen autocomplete prediction into coordinates + a display address. */
export async function resolvePlace(prediction: unknown): Promise<ResolvedPlace> {
  await loadGoogleMaps();
  const place = (prediction as any)?.toPlace?.();
  if (!place) throw new Error("Place details are unavailable");
  await place.fetchFields({ fields: ["location", "formattedAddress", "displayName"] });
  if (!place.location) throw new Error("Place location is unavailable");
  return {
    lat: +place.location.lat().toFixed(6),
    lng: +place.location.lng().toFixed(6),
    address: place.formattedAddress ?? place.displayName ?? "",
  };
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
 * Returns up to 5 of each category. An unavailable category is skipped.
 */
export async function nearbyLandmarks(lat: number, lng: number, radius = 2500): Promise<Landmark[]> {
  if (!isGeocodingConfigured()) return [];
  await loadGoogleMaps();
  const placesLibrary = await window.google.maps.importLibrary("places");
  const location = new window.google.maps.LatLng(lat, lng);
  const categories = Object.keys(CATEGORY_TYPE) as LandmarkCategory[];

  const perCategory = await Promise.all(
    categories.map(async (category) => {
      try {
        const { places = [] } = await placesLibrary.Place.searchNearby({
          fields: ["displayName", "location", "formattedAddress"],
          locationRestriction: { center: location, radius },
          includedPrimaryTypes: [CATEGORY_TYPE[category]],
          maxResultCount: 5,
          rankPreference: placesLibrary.SearchNearbyRankPreference.DISTANCE,
        });
        return places.flatMap((place: any) => {
          if (!place.location) return [];
          return [{
            name: place.displayName ?? "Nearby place",
            category,
            lat: place.location.lat(),
            lng: place.location.lng(),
            vicinity: place.formattedAddress,
          }];
        });
      } catch {
        return [];
      }
    }),
  );
  return perCategory.flat();
}
