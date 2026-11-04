import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMailMock, createTransportMock, twilioMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn(async () => ({ accepted: ["test@example.com"], messageId: "smtp-test-id" }));
  return {
    sendMailMock,
    createTransportMock: vi.fn(() => ({ sendMail: sendMailMock })),
    twilioMock: vi.fn(() => ({ messages: { create: vi.fn() } })),
  };
});

vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportMock },
}));
vi.mock("twilio", () => ({
  default: twilioMock,
}));

describe("transactional email provider selection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("SMTP_HOST", "");
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASSWORD", "");
    vi.stubEnv("SMTP_FROM", "");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM", "");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "resend-test-id" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
  });

  it("uses Resend for transactional mail when SMTP is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-resend-key");
    vi.stubEnv("RESEND_FROM", "Truvi Ventures <notices@example.test>");

    const { sendEmail } = await import("./emailService");
    await expect(sendEmail("buyer@example.test", "Test", "<p>Test</p>")).resolves.toBe(true);

    const request = vi.mocked(fetch).mock.calls[0];
    expect(request[0]).toBe("https://api.resend.com/emails");
    const payload = JSON.parse(String(request[1]?.body));
    expect(payload.from).toBe("Truvi Ventures <notices@example.test>");
    expect(payload.to).toEqual(["buyer@example.test"]);
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it("does not report success when no provider is configured", async () => {
    const { sendEmail } = await import("./emailService");
    await expect(sendEmail("buyer@example.test", "Test", "<p>Test</p>")).resolves.toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it("fails clearly when Resend has no verified sender configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-resend-key");

    const { sendEmail } = await import("./emailService");
    await expect(sendEmail("buyer@example.test", "Test", "<p>Test</p>"))
      .rejects.toThrow("RESEND_FROM_REQUIRED");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps SMTP primary when complete SMTP credentials are configured", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.test");
    vi.stubEnv("SMTP_USER", "smtp-user");
    vi.stubEnv("SMTP_PASSWORD", "smtp-password");
    vi.stubEnv("SMTP_FROM", "Truvi Ventures <mail@example.test>");
    vi.stubEnv("RESEND_API_KEY", "test-resend-key");
    vi.stubEnv("RESEND_FROM", "Truvi Ventures <notices@example.test>");

    const { sendEmail } = await import("./emailService");
    await expect(sendEmail("buyer@example.test", "Test", "<p>Test</p>")).resolves.toBe(true);
    expect(createTransportMock).toHaveBeenCalledOnce();
    expect(sendMailMock).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
});
