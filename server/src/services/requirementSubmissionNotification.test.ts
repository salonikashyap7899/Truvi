import { describe, expect, it } from "vitest";
import {
  buildRequirementSubmissionEmail,
  buildRequirementSubmitterConfirmationEmail,
  escapeEmailHtml,
  getRequirementTeamRecipients,
  type RequirementSubmissionForEmail,
} from "./requirementSubmissionNotification";

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

  it("defaults requirement alerts to the Truvi team inbox, not the SMTP sender account", () => {
    const oldRequirementTeamEmail = process.env.REQUIREMENT_TEAM_EMAIL;
    const oldTeamEmail = process.env.TEAM_EMAIL;
    const oldSmtpUser = process.env.SMTP_USER;
    delete process.env.REQUIREMENT_TEAM_EMAIL;
    delete process.env.TEAM_EMAIL;
    process.env.SMTP_USER = "smtp-sender@example.com";

    try {
      expect(getRequirementTeamRecipients()).toEqual(["truviventures@gmail.com"]);
    } finally {
      if (oldRequirementTeamEmail === undefined) delete process.env.REQUIREMENT_TEAM_EMAIL;
      else process.env.REQUIREMENT_TEAM_EMAIL = oldRequirementTeamEmail;
      if (oldTeamEmail === undefined) delete process.env.TEAM_EMAIL;
      else process.env.TEAM_EMAIL = oldTeamEmail;
      if (oldSmtpUser === undefined) delete process.env.SMTP_USER;
      else process.env.SMTP_USER = oldSmtpUser;
    }
  });

  it("supports the configured team inbox and comma/semicolon-separated recipients", () => {
    const oldRequirementTeamEmail = process.env.REQUIREMENT_TEAM_EMAIL;
    const oldTeamEmail = process.env.TEAM_EMAIL;
    process.env.REQUIREMENT_TEAM_EMAIL = "Sales@Example.com; ops@example.com, sales@example.com";
    process.env.TEAM_EMAIL = "ignored@example.com";

    try {
      expect(getRequirementTeamRecipients()).toEqual(["sales@example.com", "ops@example.com"]);
    } finally {
      if (oldRequirementTeamEmail === undefined) delete process.env.REQUIREMENT_TEAM_EMAIL;
      else process.env.REQUIREMENT_TEAM_EMAIL = oldRequirementTeamEmail;
      if (oldTeamEmail === undefined) delete process.env.TEAM_EMAIL;
      else process.env.TEAM_EMAIL = oldTeamEmail;
    }
  });
  it("builds a separate receipt email for the registered submitter", () => {
    const email = buildRequirementSubmitterConfirmationEmail(requirement, {
      name: "Buyer Example",
      email: "buyer@example.com",
      role: "BUYER",
    });

    expect(email.subject).toContain("We received your Truvi requirement [12345678]");
    expect(email.html).toContain("We've received your requirement");
    expect(email.html).toContain("Hi Buyer");
    expect(email.html).toContain("12345678-1234-1234-1234-123456789012");
    expect(email.html).toContain("View my requirements");
    expect(email.html).toContain("This email confirms receipt only");
    expect(email.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(email.html).not.toContain('<img src=x onerror="alert(1)">');
  });

  it("keeps third-party client contacts and private notes out of submitter confirmations", () => {
    const email = buildRequirementSubmitterConfirmationEmail({
      ...requirement,
      details: "Private internal notes must not be in the confirmation.",
      clientName: "Private Client",
      clientPhone: "+91 98765 43210",
      clientEmail: "private@example.com",
      contactConsent: true,
    }, {
      name: "Partner Example",
      email: "partner@example.com",
      role: "CP",
    });

    expect(email.html).not.toContain("Private Client");
    expect(email.html).not.toContain("+91 98765 43210");
    expect(email.html).not.toContain("private@example.com");
    expect(email.html).not.toContain("Private internal notes");
  });

  it("escapes untrusted HTML text", () => {
    expect(escapeEmailHtml('<script>alert("x")</script>')).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });

  it("sends an internal message from Truvi with the registered submitter as Reply-To", () => {
    const email = buildRequirementSubmissionEmail(requirement, {
      name: "Buyer Example",
      email: "buyer@example.com",
      role: "BUYER",
    });

    expect(email.subject).toContain("New requirement:");
    expect(email.subject).toContain("buyer@example.com");
    expect(email.subject).toContain("Truvi Ventures");
    expect(email.replyTo).toBe("buyer@example.com");
    expect(email.html).toContain("TRUVI VENTURES · TRUVIVENTURES.COM");
    expect(email.html).toContain("Submitted by Truvi user");
    expect(email.html).toContain("Buyer Example");
    expect(email.html).toContain("Registered email:");
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
