import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "sonner";
import { addTruviBaseLayers } from "@/lib/leafletTiles";
import { isGeocodingConfigured, reverseGeocode } from "@/lib/geocoding";

/**
 * Leaflet pin picker — click, drag, or use device GPS to set a project's
 * coordinates. Satellite + labels view (free Esri tiles, no API key). When
 * Google geocoding is configured, the dropped pin is reverse-geocoded so the
 * developer sees the actual address it resolved to.
 *
 * Controlled component: `value` is the current pin, `onChange` fires on every
 * placement (click, drag, or GPS).
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
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [address, setAddress] = useState<string | null>(null);

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
  // Guarded against out-of-order responses when the pin moves quickly.
  useEffect(() => {
    if (!value || !isGeocodingConfigured()) {
      setAddress(null);
      return;
    }
    let cancelled = false;
    reverseGeocode(value.lat, value.lng)
      .then((a) => { if (!cancelled) setAddress(a); })
      .catch(() => { if (!cancelled) setAddress(null); });
    return () => { cancelled = true; };
  }, [value]);

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

  return (
    <div>
      <div ref={containerRef} style={{ height }} className="w-full overflow-hidden rounded-xl border border-white/10" />
      <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate">
          {value
            ? address
              ? `📍 ${address}`
              : `Pin: ${value.lat}, ${value.lng}`
            : "Click the map to drop the project pin — then drag it to fine-tune."}
        </span>
        <button type="button" onClick={useMyLocation} className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-white/70 transition hover:bg-white/10">
          Use my location
        </button>
      </div>
    </div>
  );
}
