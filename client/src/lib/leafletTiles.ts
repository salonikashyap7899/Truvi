import type L from "leaflet";

/**
 * Shared basemap layers for every Truvi Leaflet map. Defaults to a clear
 * satellite + labels (hybrid) view like a Google-Maps satellite look, with a
 * Street toggle. All tiles are free (Esri World Imagery + CARTO Voyager) — no
 * API key and no per-map-load billing.
 */
const ESRI_SATELLITE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_LABELS = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const ESRI_ROADS = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}";
const STREET = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

const ESRI_ATTR = "Imagery &copy; <a href='https://www.esri.com'>Esri</a>";
const STREET_ATTR = "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> &copy; <a href='https://carto.com/attributions'>CARTO</a>";

/**
 * Adds a Satellite (default) + Street base-layer switcher to a Leaflet map.
 * Returns nothing; the map is mutated in place.
 */
export function addTruviBaseLayers(Lmod: typeof L, map: L.Map): void {
  const satellite = Lmod.layerGroup([
    Lmod.tileLayer(ESRI_SATELLITE, { maxZoom: 19, attribution: ESRI_ATTR }),
    Lmod.tileLayer(ESRI_ROADS, { maxZoom: 19 }),
    Lmod.tileLayer(ESRI_LABELS, { maxZoom: 19 }),
  ]);
  const street = Lmod.tileLayer(STREET, { maxZoom: 19, attribution: STREET_ATTR });

  satellite.addTo(map); // satellite is the default view
  Lmod.control
    .layers({ "🛰 Satellite": satellite, "🗺 Street": street }, {}, { position: "topright", collapsed: false })
    .addTo(map);
}
