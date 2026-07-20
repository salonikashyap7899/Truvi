import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Leaflet pin picker — click the map (or use device GPS) to set a project's
 * coordinates. Free CARTO/OSM tiles, no API key. Controlled component:
 * `value` is the current pin, `onChange` fires on every placement.
 */
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** Lucknow — sensible initial view for a UP-focused platform. */
const DEFAULT_CENTER: [number, number] = [26.8467, 80.9462];

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
  const markerRef = useRef<L.CircleMarker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: value ? [value.lat, value.lng] : DEFAULT_CENTER,
      zoom: value ? 14 : 11,
      scrollWheelZoom: false,
    });
    L.tileLayer(DARK_TILES, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      onChangeRef.current({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the marker in sync with the controlled value.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      markerRef.current = L.circleMarker([value.lat, value.lng], {
        radius: 9,
        color: "#A855F7",
        weight: 2,
        fillColor: "#7C5CFF",
        fillOpacity: 0.7,
      }).addTo(map);
    } else {
      markerRef.current.setLatLng([value.lat, value.lng]);
    }
    map.panTo([value.lat, value.lng]);
  }, [value]);

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const pin = { lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) };
        onChangeRef.current(pin);
        mapRef.current?.setView([pin.lat, pin.lng], 15);
      },
      () => { /* denied — user can click the map instead */ },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div>
      <div ref={containerRef} style={{ height }} className="w-full overflow-hidden rounded-xl border border-white/10" />
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{value ? `Pin: ${value.lat}, ${value.lng}` : "Click the map to drop the project pin."}</span>
        <button type="button" onClick={useMyLocation} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-white/70 transition hover:bg-white/10">
          Use my location
        </button>
      </div>
    </div>
  );
}
