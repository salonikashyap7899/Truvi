import { describe, expect, it } from "vitest";
import { isApprovalEvidenceVerified } from "./approvalEvidence";

const now = new Date("2026-11-05T12:00:00.000Z");
const base = {
  approvalAuthority: "RERA",
  reraStatus: "REGISTERED",
  reraNumber: "UPRERA-EXAMPLE-001",
  verificationDetails: {
    reraVerified: true,
    approvalVerified: false,
    verificationSource: "Official State RERA register",
    lastVerifiedAt: "2026-10-01T12:00:00.000Z",
  },
};

describe("project approval evidence", () => {
  it("requires an independently recorded RERA check", () => {
    expect(isApprovalEvidenceVerified(base, now)).toBe(true);
    expect(isApprovalEvidenceVerified({ ...base, verificationDetails: { ...base.verificationDetails, reraVerified: false } }, now)).toBe(false);
    expect(isApprovalEvidenceVerified({ ...base, reraNumber: "" }, now)).toBe(false);
    expect(isApprovalEvidenceVerified({ ...base, verificationDetails: { ...base.verificationDetails, verificationSource: "" } }, now)).toBe(false);
  });

  it("rejects stale, future-dated and expired evidence", () => {
    expect(isApprovalEvidenceVerified({
      ...base,
      verificationDetails: { ...base.verificationDetails, lastVerifiedAt: "2026-06-01T12:00:00.000Z" },
    }, now)).toBe(false);
    expect(isApprovalEvidenceVerified({
      ...base,
      verificationDetails: { ...base.verificationDetails, lastVerifiedAt: "2026-11-06T12:00:00.000Z" },
    }, now)).toBe(false);
    expect(isApprovalEvidenceVerified({ ...base, reraValidityDate: "2026-11-04T00:00:00.000Z" }, now)).toBe(false);
  });

  it("allows a documented RERA non-applicability review without calling it a registration", () => {
    expect(isApprovalEvidenceVerified({
      ...base,
      reraStatus: "NOT_REGISTERED",
      reraNumber: null,
      verificationDetails: {
        ...base.verificationDetails,
        reraVerified: false,
        reraExemptionVerified: true,
        reraExemptionBasis: "Documented statutory exemption reviewed against official records",
      },
    }, now)).toBe(true);
    expect(isApprovalEvidenceVerified({
      ...base,
      reraStatus: "NOT_REGISTERED",
      reraNumber: null,
      verificationDetails: {
        ...base.verificationDetails,
        reraExemptionVerified: true,
        reraExemptionBasis: "",
      },
    }, now)).toBe(false);
  });

  it("does not treat non-RERA planning approval as a RERA registration", () => {
    expect(isApprovalEvidenceVerified({
      ...base,
      approvalAuthority: "DTCP",
      reraStatus: "NOT_REGISTERED",
      verificationDetails: { ...base.verificationDetails, reraVerified: false, approvalVerified: true },
    }, now)).toBe(true);
    expect(isApprovalEvidenceVerified({
      ...base,
      approvalAuthority: "DTCP",
      verificationDetails: { ...base.verificationDetails, approvalVerified: false },
    }, now)).toBe(false);
  });
});
