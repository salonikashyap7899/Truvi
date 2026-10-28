import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHostedKycSession,
  getHostedKycProfileStatus,
  isHostedKycConfigured,
} from "./kycService";

const ENV_KEYS = [
  "IDFY_KYC_API_KEY",
  "IDFY_KYC_ACCOUNT_ID",
  "IDFY_KYC_WORKFLOW_ID",
  "IDFY_KYC_WORKFLOW_ID_BUYER",
  "IDFY_KYC_WORKFLOW_ID_DEVELOPER",
  "IDFY_KYC_WORKFLOW_ID_CP",
  "IDFY_KYC_WORKFLOW_ID_AMBASSADOR",
] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function configureProvider() {
  process.env.IDFY_KYC_API_KEY = "test-key";
  process.env.IDFY_KYC_ACCOUNT_ID = "test-account";
  process.env.IDFY_KYC_WORKFLOW_ID = "test-workflow";
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("hosted automatic KYC", () => {
  it("requires API credentials and a workflow for the requested role", () => {
    delete process.env.IDFY_KYC_API_KEY;
    delete process.env.IDFY_KYC_ACCOUNT_ID;
    delete process.env.IDFY_KYC_WORKFLOW_ID;
    expect(isHostedKycConfigured("BUYER")).toBe(false);

    configureProvider();
    expect(isHostedKycConfigured("BUYER")).toBe(true);
    delete process.env.IDFY_KYC_WORKFLOW_ID;
    process.env.IDFY_KYC_WORKFLOW_ID_AMBASSADOR = "ambassador-workflow";
    expect(isHostedKycConfigured("AMBASSADOR")).toBe(true);
    expect(isHostedKycConfigured("BUYER")).toBe(false);
  });

  it("creates a hosted profile with the role-specific workflow and validates its capture URL", async () => {
    configureProvider();
    process.env.IDFY_KYC_WORKFLOW_ID_BUYER = "buyer-workflow";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      profile_id: "11111111-2222-4333-8444-555555555555",
      reference_id: "reference-1",
      capture_link: "https://capture.kyc.idfy.com/captures?t=opaque-token",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createHostedKycSession("reference-1", "BUYER");

    expect(result).toEqual({
      profileId: "11111111-2222-4333-8444-555555555555",
      referenceId: "reference-1",
      captureLink: "https://capture.kyc.idfy.com/captures?t=opaque-token",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.kyc.idfy.com/sync/profiles");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      reference_id: "reference-1",
      config: { id: "buyer-workflow" },
      data: {},
    });
    expect(init.headers.get("api-key")).toBe("test-key");
    expect(init.headers.get("account-id")).toBe("test-account");
  });

  it("rejects untrusted capture URLs", async () => {
    configureProvider();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      profile_id: "11111111-2222-4333-8444-555555555555",
      reference_id: "reference-1",
      capture_link: "https://evil.example/capture",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createHostedKycSession("reference-1", "CP"))
      .rejects.toThrow("untrusted capture link");
  });

  it("returns only the provider decision fields needed for status checks", async () => {
    configureProvider();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      profile_id: "11111111-2222-4333-8444-555555555555",
      reference_id: "reference-1",
      status: "completed",
      reviewer_action: "approved",
      status_detail: "Verification passed",
      aadhaar_number: "should-not-be-returned",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const status = await getHostedKycProfileStatus("11111111-2222-4333-8444-555555555555");

    expect(status).toEqual({
      profileId: "11111111-2222-4333-8444-555555555555",
      referenceId: "reference-1",
      status: "completed",
      reviewerAction: "approved",
      statusDetail: "Verification passed",
    });
    expect(JSON.stringify(status)).not.toContain("should-not-be-returned");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.kyc.idfy.com/profiles/11111111-2222-4333-8444-555555555555?status_only=true",
    );
  });
});
