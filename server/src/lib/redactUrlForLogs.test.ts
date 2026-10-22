import { describe, expect, it } from "vitest";
import { redactUrlForLogs } from "./redactUrlForLogs";

describe("redactUrlForLogs", () => {
  it("redacts webhook tokens and document signatures while preserving safe query parameters", () => {
    expect(redactUrlForLogs("/api/calls/webhook/exotel?token=private-token&event=completed"))
      .toBe("/api/calls/webhook/exotel?token=%5BREDACTED%5D&event=completed");
    expect(redactUrlForLogs("/api/documents/file/abc?exp=123&sig=private-signature"))
      .toBe("/api/documents/file/abc?exp=123&sig=%5BREDACTED%5D");
  });

  it("redacts credentials regardless of key casing and supports absolute referrer URLs", () => {
    expect(redactUrlForLogs("https://truviventures.com/login?Password=secret&code=123456"))
      .toBe("https://truviventures.com/login?Password=%5BREDACTED%5D&code=%5BREDACTED%5D");
  });

  it("hides an unparseable query rather than logging its contents", () => {
    expect(redactUrlForLogs("/path?token=%E0%A4%A"))
      .toBe("/path?token=%EF%BF%BD%25A");
  });

  it("uses a safe fallback for malformed URL input", () => {
    expect(redactUrlForLogs("/path?secret=a b"))
      .toBe("/path?[REDACTED]");
    expect(redactUrlForLogs(undefined)).toBe("-");
  });
});
