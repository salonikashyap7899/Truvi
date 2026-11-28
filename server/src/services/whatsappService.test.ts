import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("property-match WhatsApp consent guard", () => {
  it("always excludes property-match alerts until their own opt-in flow exists", async () => {
    const { isWhatsAppEventDisabledPendingConsent } = await import("./whatsappService");
    expect(isWhatsAppEventDisabledPendingConsent("property_match")).toBe(true);
  });

  it("does not disable unrelated pre-existing WhatsApp event types", async () => {
    const { isWhatsAppEventDisabledPendingConsent } = await import("./whatsappService");
    expect(isWhatsAppEventDisabledPendingConsent("project_approved")).toBe(false);
    expect(isWhatsAppEventDisabledPendingConsent("new_lead")).toBe(false);
  });
});

describe("AiSensy inactive-plan circuit breaker", () => {
  it("disables further AiSensy sends after the provider reports no active assistant plan", async () => {
    vi.stubEnv("AISENSY_API_KEY", "test-aisensy-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ message: "No Plan active on assistant!" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = await import("./whatsappService");

    expect(service.isAiSensyEnabled()).toBe(true);
    await expect(service.sendAiSensyCampaign("9876543210", "welcome")).resolves.toBe(false);
    expect(service.isAiSensyEnabled()).toBe(false);
    expect(service.isAiSensyPlanDisabled()).toBe(true);

    // Further scheduler/notification retries are local no-ops, not more 400s.
    await expect(service.sendAiSensyCampaign("9876543210", "welcome")).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the configured Meta template immediately after an inactive-plan response", async () => {
    vi.stubEnv("AISENSY_API_KEY", "test-aisensy-key");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-meta-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123456789");
    vi.stubEnv("WHATSAPP_TPL_WELCOME", "truvi_welcome");

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ message: "No Plan active on assistant!" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ messages: [{ id: "wamid.test" }] }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const service = await import("./whatsappService");

    await expect(service.sendWhatsAppCampaign("WELCOME", "9876543210", "Truvi Investor")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("graph.facebook.com");
    const metaPayload = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(metaPayload.template.name).toBe("truvi_welcome");
    expect(metaPayload.to).toBe("919876543210");
  });

  it("allows operators to disable AiSensy explicitly and use Meta directly", async () => {
    vi.stubEnv("AISENSY_API_KEY", "test-aisensy-key");
    vi.stubEnv("AISENSY_ENABLED", "false");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-meta-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123456789");
    vi.stubEnv("WHATSAPP_TPL_WELCOME", "truvi_welcome");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ messages: [{ id: "wamid.test" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = await import("./whatsappService");

    expect(service.isAiSensyEnabled()).toBe(false);
    await expect(service.sendWhatsAppCampaign("WELCOME", "9876543210", "Truvi Investor")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("graph.facebook.com");
  });
});
