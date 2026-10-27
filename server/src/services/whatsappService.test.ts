import { describe, expect, it } from "vitest";
import { isWhatsAppEventDisabledPendingConsent } from "./whatsappService";

describe("property-match WhatsApp consent guard", () => {
  it("always excludes property-match alerts until their own opt-in flow exists", () => {
    expect(isWhatsAppEventDisabledPendingConsent("property_match")).toBe(true);
  });

  it("does not disable unrelated pre-existing WhatsApp event types", () => {
    expect(isWhatsAppEventDisabledPendingConsent("project_approved")).toBe(false);
    expect(isWhatsAppEventDisabledPendingConsent("new_lead")).toBe(false);
  });
});
