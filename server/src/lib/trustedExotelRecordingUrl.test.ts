import { describe, expect, it } from "vitest";
import { trustedExotelRecordingUrl } from "./trustedExotelRecordingUrl";

describe("trustedExotelRecordingUrl", () => {
  it("accepts Exotel's documented virtual-hosted S3 recording URL", () => {
    const result = trustedExotelRecordingUrl(
      "https://exotelrecordings.s3.amazonaws.com/Exotel/call-123.mp3?Expires=123&Signature=abc",
    );
    expect(result?.hostname).toBe("exotelrecordings.s3.amazonaws.com");
    expect(result?.pathname).toBe("/Exotel/call-123.mp3");
    expect(result?.search).toContain("Signature=abc");
  });

  it("accepts the regional S3 path-style recording URL", () => {
    const result = trustedExotelRecordingUrl(
      "https://s3-ap-southeast-1.amazonaws.com/exotelrecordings/account/call-123.mp3",
    );
    expect(result?.hostname).toBe("s3-ap-southeast-1.amazonaws.com");
  });

  it("rejects non-HTTPS, custom-port, credentialed, or malformed URLs", () => {
    expect(trustedExotelRecordingUrl("http://exotelrecordings.s3.amazonaws.com/call.mp3")).toBeNull();
    expect(trustedExotelRecordingUrl("https://exotelrecordings.s3.amazonaws.com:8443/call.mp3")).toBeNull();
    expect(trustedExotelRecordingUrl("https://user:pass@exotelrecordings.s3.amazonaws.com/call.mp3")).toBeNull();
    expect(trustedExotelRecordingUrl("not a URL")).toBeNull();
  });

  it("rejects arbitrary public hosts, unrelated S3 buckets, and private IP targets", () => {
    expect(trustedExotelRecordingUrl("https://example.com/recording.mp3")).toBeNull();
    expect(trustedExotelRecordingUrl("https://another-bucket.s3.amazonaws.com/call.mp3")).toBeNull();
    expect(trustedExotelRecordingUrl("https://s3.amazonaws.com/another-bucket/call.mp3")).toBeNull();
    expect(trustedExotelRecordingUrl("http://169.254.169.254/latest/meta-data/")).toBeNull();
    expect(trustedExotelRecordingUrl("https://127.0.0.1/recording.mp3")).toBeNull();
  });

  it("rejects overlong URLs and a regional S3 URL that does not target the Exotel bucket", () => {
    expect(trustedExotelRecordingUrl("https://s3-ap-southeast-1.amazonaws.com/another-bucket/call.mp3")).toBeNull();
    expect(trustedExotelRecordingUrl("https://exotelrecordings.s3.amazonaws.com/" + "a".repeat(8200))).toBeNull();
  });
});
