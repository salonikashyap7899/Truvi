/**
 * Formats a project locality and city without repeating location text.
 * Project records can contain a full address in `location` and repeat its
 * locality/state in `city`; keep the most complete value in that case.
 */
export function formatProjectLocation(location?: string | null, city?: string | null): string {
  const cleanLocation = (location ?? "").trim().replace(/\\s+/g, " ");
  const cleanCity = (city ?? "").trim().replace(/\\s+/g, " ");

  if (!cleanLocation) return cleanCity;
  if (!cleanCity) return cleanLocation;

  const normalize = (value: string) =>
    value.normalize("NFKC").toLowerCase().replace(/[.,\\s]+/g, " ").trim();
  const normalizedLocation = normalize(cleanLocation);
  const normalizedCity = normalize(cleanCity);

  if (normalizedLocation.includes(normalizedCity)) return cleanLocation;
  if (normalizedCity.includes(normalizedLocation)) return cleanCity;

  const locationParts = cleanLocation.split(",").map((part) => part.trim()).filter(Boolean);
  const cityParts = cleanCity.split(",").map((part) => part.trim()).filter(Boolean);
  const maxOverlap = Math.min(locationParts.length, cityParts.length);

  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const locationSuffix = locationParts.slice(-overlap).map(normalize).join("|");
    const cityPrefix = cityParts.slice(0, overlap).map(normalize).join("|");
    if (locationSuffix === cityPrefix) {
      return [...locationParts, ...cityParts.slice(overlap)].join(", ");
    }
  }

  return `${cleanLocation}, ${cleanCity}`;
}
