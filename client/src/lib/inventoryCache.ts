import { api } from "@/lib/api";
import type { Project } from "@/types";

/**
 * A tiny shared cache for the project list. The app home (banner + carousels)
 * and the Explore page both need `/inventory`; without this they each fetch it
 * and show a spinner every time. Here we fetch once, share the result, dedupe
 * concurrent calls, and let pages render instantly from the cached list while a
 * fresh copy loads in the background.
 */
let cache: { at: number; projects: Project[] } | null = null;
let inflight: Promise<Project[]> | null = null;
const TTL = 60_000; // 1 minute

/** The cached list if we have one (for instant first paint); otherwise null. */
export function peekInventory(): Project[] | null {
  return cache?.projects ?? null;
}

/** Fetch the project list, served from cache when it's fresh. */
export async function getInventory(force = false): Promise<Project[]> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.projects;
  if (inflight) return inflight;
  inflight = api
    .get("/inventory")
    .then((res) => {
      const projects = (res.data.projects ?? []) as Project[];
      cache = { at: Date.now(), projects };
      return projects;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
