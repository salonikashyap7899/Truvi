import { describe, expect, it } from "vitest";
import { buildRequirementSubmissionEmail, escapeEmailHtml, type RequirementSubmissionForEmail } from "./requirementSubmissionNotification";

const requirement: RequirementSubmissionForEmail = {
  _id: "12345678-1234-1234-1234-123456789012",
  title: '<img src=x onerror="alert(1)"> buyer request',
  requirementKind: "BUYER",
  submittedByRole: "BUYER",
  propertyType: "PLOTTED",
  city: "Lucknow",
  location: "Sultanpur Road",
  minBudget: 1000000,
  maxBudget: 2500000,
  minAreaSqft: null,
  maxAreaSqft: 1200,
  purpose: "INVESTMENT",
  timeline: "WITHIN_3_MONTHS",
  visibility: "TRUVI",
  publicSummary: "Near main road",
  details: "Please contact me after 6 PM.",
  clientName: null,
  clientPhone: null,
  clientEmail: null,
  contactConsent: false,
  createdAt: new Date("2026-10-27T07:00:00.000Z"),
};

describe("requirement submission team email", () => {
  it("escapes untrusted HTML text", () => {
    expect(escapeEmailHtml('<script>alert("x")</script>')).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });

  it("sends an internal message from Truvi with the registered submitter as Reply-To", () => {
    const email = buildRequirementSubmissionEmail(requirement, {
      name: "Buyer Example",
      email: "buyer@example.com",
      role: "BUYER",
    });

    expect(email.subject).toContain("New Truvi requirement [12345678]");
    expect(email.replyTo).toBe("buyer@example.com");
    expect(email.html).toContain("buyer@example.com");
    expect(email.html).toContain("Open Admin Requirements");
    expect(email.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(email.html).not.toContain('<img src=x onerror="alert(1)">');
  });

  it("does not include third-party client contact information without consent", () => {
    const email = buildRequirementSubmissionEmail({
      ...requirement,
      clientName: "Private Client",
      clientPhone: "+91 98765 43210",
      clientEmail: "private@example.com",
      contactConsent: false,
    }, {
      name: "Partner Example",
      email: "partner@example.com",
      role: "CP",
    });

    expect(email.html).not.toContain("Private Client");
    expect(email.html).not.toContain("+91 98765 43210");
    expect(email.html).not.toContain("private@example.com");
    expect(email.replyTo).toBe("partner@example.com");
  });

  it("includes third-party client contacts only after consent is recorded", () => {
    const email = buildRequirementSubmissionEmail({
      ...requirement,
      clientName: "Private Client",
      clientPhone: "+91 98765 43210",
      clientEmail: "private@example.com",
      contactConsent: true,
    }, {
      name: "Partner Example",
      email: "partner@example.com",
      role: "CP",
    });

    expect(email.html).toContain("Private Client");
    expect(email.html).toContain("+91 98765 43210");
    expect(email.html).toContain("private@example.com");
  });
});
