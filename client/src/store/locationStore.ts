import { create } from "zustand";
import { getCurrentPosition, type Coords } from "@/lib/geo";

type LocationStatus = "idle" | "loading" | "granted" | "denied";

interface LocationState {
  coords: Coords | null;
  status: LocationStatus;
  /** Ask for the user's location (permission prompt on first call). Cached. */
  request: (force?: boolean) => Promise<Coords | null>;
}

const STORAGE_KEY = "truvi_last_location";

function loadCached(): Coords | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return typeof c?.lat === "number" && typeof c?.lng === "number" ? c : null;
  } catch {
    return null;
  }
}

export const useLocationStore = create<LocationState>((set, get) => ({
  // Start from the last known location so distances show instantly on reopen.
  coords: loadCached(),
  status: "idle",
  request: async (force = false) => {
    const { status, coords } = get();
    if (status === "loading") return coords;
    if (coords && !force) return coords;

    set({ status: "loading" });
    const next = await getCurrentPosition();
    if (next) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      set({ coords: next, status: "granted" });
      return next;
    }
    set({ status: "denied" });
    return get().coords; // keep any cached coords even if a fresh fix failed
  },
}));
