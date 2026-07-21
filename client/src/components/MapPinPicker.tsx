import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "sonner";
import { addTruviBaseLayers } from "@/lib/leafletTiles";
import { isGeocodingConfigured, reverseGeocode, geocodeAddress, GeocodeError, geocodeErrorMessage } from "@/lib/geocoding";
import {
  getPlacePredictions,
  resolvePlace,
  nearbyLandmarks,
  type PlacePrediction,
  type Landmark,
  type LandmarkCategory,
} from "@/lib/places";

/**
 * Leaflet pin picker with advanced location tooling:
 *  - click, drag or GPS to set the pin (satellite Esri tiles, no API key)
 *  - an address search box with Google Places autocomplete
 *  - a reverse-geocoded address readout of the current pin
 *  - optional nearby-landmark markers (schools / transit / hospitals)
 *
 * The Google-powered extras only appear when a Maps key is configured; without
 * one this stays a plain click-to-drop map. Controlled component: `value` is
 * the current pin, `onChange` fires on every placement.
 */

/** Lucknow — sensible initial view for a UP-focused platform. */
const DEFAULT_CENTER: [number, number] = [26.8467, 80.9462];

/** Purple dot with a white ring — reads well on satellite imagery, draggable. */
const PIN_ICON = L.divIcon({
  className: "truvi-map-pin",
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#7C5CFF;border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const LANDMARK_COLORS: Record<LandmarkCategory, string> = {
  school: "#38bdf8",
  transit: "#f59e0b",
  hospital: "#f43f5e",
};
const LANDMARK_LABELS: Record<LandmarkCategory, string> = {
  school: "Schools",
  transit: "Transit",
  hospital: "Hospitals",
};

export default function MapPinPicker({
  value,
  onChange,
  height = 280,
}: {
  value: { lat: number; lng: number } | null;
  onChange: (pin: { lat: number; lng: number }) => void;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const landmarkLayerRef = useRef<L.LayerGroup | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const debounceRef = useRef<number | undefined>(undefined);

  const [address, setAddress] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);
  const [landmarksOn, setLandmarksOn] = useState(false);
  const [loadingLandmarks, setLoadingLandmarks] = useState(false);
  const [searching, setSearching] = useState(false);

  const geoReady = isGeocodingConfigured();

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: value ? [value.lat, value.lng] : DEFAULT_CENTER,
      zoom: value ? 16 : 12,
      scrollWheelZoom: false,
    });
    addTruviBaseLayers(L, map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      onChangeRef.current({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      landmarkLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the (draggable) marker in sync with the controlled value.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const marker = L.marker([value.lat, value.lng], { draggable: true, icon: PIN_ICON }).addTo(map);
      marker.on("dragend", () => {
        const ll = marker.getLatLng();
        onChangeRef.current({ lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) });
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng([value.lat, value.lng]);
    }
    map.panTo([value.lat, value.lng]);
  }, [value]);

  // Reverse-geocode the current pin to show the real address it resolved to.
  useEffect(() => {
    if (!value || !geoReady) {
      setAddress(null);
      return;
    }
    let cancelled = false;
    reverseGeocode(value.lat, value.lng)
      .then((a) => { if (!cancelled) setAddress(a); })
      .catch(() => { if (!cancelled) setAddress(null); });
    return () => { cancelled = true; };
  }, [value, geoReady]);

  // Address autocomplete (debounced).
  useEffect(() => {
    if (!geoReady || query.trim().length < 3) {
      setPredictions([]);
      return;
    }
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      getPlacePredictions(query)
        .then((p) => { setPredictions(p); setShowPredictions(true); })
        .catch(() => setPredictions([]));
    }, 250);
    return () => window.clearTimeout(debounceRef.current);
  }, [query, geoReady]);

  /** Search the typed text directly via the Geocoding API (works even when the
   *  Places autocomplete library/API isn't enabled). Triggered by the Search
   *  button or the Enter key. */
  async function runSearch() {
    const q = query.trim();
    if (q.length < 2) return;
    setShowPredictions(false);
    setSearching(true);
    try {
      const r = await geocodeAddress(q);
      onChangeRef.current({ lat: r.lat, lng: r.lng });
      mapRef.current?.setView([r.lat, r.lng], 16);
    } catch (err) {
      const status = err instanceof GeocodeError ? err.status : undefined;
      toast.error(geocodeErrorMessage(status));
    } finally {
      setSearching(false);
    }
  }

  async function pickPrediction(p: PlacePrediction) {
    setShowPredictions(false);
    setQuery(`${p.primary}${p.secondary ? ", " + p.secondary : ""}`);
    try {
      const place = await resolvePlace(p.placeId);
      onChangeRef.current({ lat: place.lat, lng: place.lng });
      mapRef.current?.setView([place.lat, place.lng], 16);
    } catch {
      toast.error("Couldn't open that place — try another, or click the map.");
    }
  }

  // Fetch nearby landmarks when enabled (or when the pin moves while enabled).
  useEffect(() => {
    if (!landmarksOn || !value) {
      setLandmarks([]);
      return;
    }
    let cancelled = false;
    setLoadingLandmarks(true);
    nearbyLandmarks(value.lat, value.lng)
      .then((l) => { if (!cancelled) setLandmarks(l); })
      .catch(() => { if (!cancelled) setLandmarks([]); })
      .finally(() => { if (!cancelled) setLoadingLandmarks(false); });
    return () => { cancelled = true; };
  }, [landmarksOn, value]);

  // Render landmark markers on the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    landmarkLayerRef.current?.remove();
    landmarkLayerRef.current = null;
    if (!landmarks.length) return;
    const group = L.layerGroup(
      landmarks.map((lm) =>
        L.circleMarker([lm.lat, lm.lng], {
          radius: 6,
          color: "#ffffff",
          weight: 1.5,
          fillColor: LANDMARK_COLORS[lm.category],
          fillOpacity: 0.9,
        }).bindTooltip(lm.name, { direction: "top" }),
      ),
    ).addTo(map);
    landmarkLayerRef.current = group;
    return () => {
      group.remove();
    };
  }, [landmarks]);

  function useMyLocation() {
    if (!navigator.geolocation) {
      toast.error("Your browser can't share location — click the map to drop the pin.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const pin = { lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) };
        onChangeRef.current(pin);
        mapRef.current?.setView([pin.lat, pin.lng], 15);
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Location permission is blocked. Allow location for this site in your browser, or click the map to drop the pin."
            : err.code === err.TIMEOUT
              ? "Getting your location timed out — try again, or click the map."
              : "Couldn't get your location — click the map to drop the pin.";
        toast.error(msg);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function toggleLandmarks() {
    if (!value) {
      toast.error("Drop the pin first — then I'll show nearby schools, transit and hospitals.");
      return;
    }
    setLandmarksOn((v) => !v);
  }

  return (
    <div>
      {/* 🔎 Address search with autocomplete */}
      {geoReady && (
        <div className="relative mb-2">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch();
                }
              }}
              onFocus={() => predictions.length > 0 && setShowPredictions(true)}
              onBlur={() => window.setTimeout(() => setShowPredictions(false), 150)}
              placeholder="🔎 Search an address or place, then press Search…"
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-card px-3 py-2 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-violet-500"
            />
            <button
              type="button"
              onClick={runSearch}
              disabled={searching || query.trim().length < 2}
              className="shrink-0 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-60"
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
          {showPredictions && predictions.length > 0 && (
            <ul className="absolute z-[1000] mt-1 max-h-60 w-full overflow-auto rounded-lg border border-white/15 bg-[#0b0b12] shadow-xl">
              {predictions.map((p) => (
                <li key={p.placeId}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickPrediction(p)}
                    className="block w-full px-3 py-2 text-left text-sm text-white/90 transition hover:bg-white/10"
                  >
                    <span className="font-medium">{p.primary}</span>
                    {p.secondary && <span className="text-muted-foreground"> · {p.secondary}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div ref={containerRef} style={{ height }} className="w-full overflow-hidden rounded-xl border border-white/10" />

      <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate">
          {value
            ? address
              ? `📍 ${address}`
              : `Pin: ${value.lat}, ${value.lng}`
            : "Click the map to drop the project pin — then drag it to fine-tune."}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {geoReady && (
            <button
              type="button"
              onClick={toggleLandmarks}
              className={`rounded-full border px-2.5 py-1 text-[10px] transition ${
                landmarksOn ? "border-violet-500 bg-violet-600/30 text-white" : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {loadingLandmarks ? "Loading…" : landmarksOn ? "Hide landmarks" : "🏙 Nearby landmarks"}
            </button>
          )}
          <button
            type="button"
            onClick={useMyLocation}
            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-white/70 transition hover:bg-white/10"
          >
            Use my location
          </button>
        </div>
      </div>

      {/* 🏙 Nearby-landmark legend + counts */}
      {landmarksOn && landmarks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-3 rounded-lg border border-white/10 bg-white/5 p-2 text-[10px]">
          {(Object.keys(LANDMARK_LABELS) as LandmarkCategory[]).map((cat) => (
            <span key={cat} className="inline-flex items-center gap-1 text-white/80">
              <span className="inline-block size-2 rounded-full" style={{ background: LANDMARK_COLORS[cat] }} />
              {LANDMARK_LABELS[cat]} ({landmarks.filter((l) => l.category === cat).length})
            </span>
          ))}
        </div>
      )}
      {landmarksOn && !loadingLandmarks && landmarks.length === 0 && value && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          No nearby schools, transit or hospitals found — or the Google Places API isn't enabled on your project.
        </p>
      )}
    </div>
  );
}
