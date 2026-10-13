import type { HabitatBookingStatus, HabitatPricingModel } from "../db/schema";

export type HabitatActor = "BUYER" | "PROVIDER" | "ADMIN";

const transitions: Record<HabitatActor, Partial<Record<HabitatBookingStatus, HabitatBookingStatus[]>>> = {
  BUYER: {
    REQUESTED: ["CANCELLED"],
    PROVIDER_ASSIGNED: ["CANCELLED", "DISPUTED"],
    ACCEPTED: ["DISPUTED"],
    IN_PROGRESS: ["DISPUTED"],
    COMPLETION_SUBMITTED: ["COMPLETED", "DISPUTED"],
  },
  PROVIDER: {
    PROVIDER_ASSIGNED: ["ACCEPTED", "REJECTED"],
    ACCEPTED: ["IN_PROGRESS"],
    IN_PROGRESS: ["COMPLETION_SUBMITTED"],
  },
  ADMIN: {
    REQUESTED: ["CANCELLED"],
    PROVIDER_ASSIGNED: ["CANCELLED"],
    ACCEPTED: ["CANCELLED"],
    IN_PROGRESS: ["CANCELLED"],
    COMPLETION_SUBMITTED: ["CANCELLED"],
    DISPUTED: ["CANCELLED"],
  },
};

export function canTransitionHabitatBooking(
  actor: HabitatActor,
  from: HabitatBookingStatus,
  to: HabitatBookingStatus,
): boolean {
  return transitions[actor][from]?.includes(to) ?? false;
}

/** Returns the estimate in integer paise; QUOTE services must not show a fake fixed price. */
export function habitatEstimatePaise(
  model: HabitatPricingModel,
  pricePaise: number | null,
): number | null {
  if (model === "QUOTE") {
    if (pricePaise !== null) throw new Error("Quote-based services cannot have a fixed price");
    return null;
  }
  if (pricePaise === null || !Number.isSafeInteger(pricePaise) || pricePaise <= 0) {
    throw new Error("Fixed and starting-price services require a positive integer paise amount");
  }
  return pricePaise;
}

export function isHabitatAreaCovered(serviceAreas: string[], requestedCity: string, requestedLocality?: string): boolean {
  const requested = [requestedCity, requestedLocality]
    .map((value) => value?.trim().toLocaleLowerCase())
    .filter((value): value is string => Boolean(value));
  return serviceAreas.some((area) => {
    const normalizedArea = area.trim().toLocaleLowerCase();
    return requested.some((location) =>
      normalizedArea === location || normalizedArea.includes(location) || location.includes(normalizedArea),
    );
  });
}
