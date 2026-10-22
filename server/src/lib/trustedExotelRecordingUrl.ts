const EXOTEL_VIRTUAL_HOSTED_RECORDING = /^exotelrecordings\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/i;
const AWS_S3_PATH_STYLE = /^s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/i;

/**
 * Accept only the known Exotel recording bucket URL shapes.
 *
 * Exotel's documented recording URLs use the exotelrecordings S3 bucket,
 * either virtual-hosted (exotelrecordings.s3.amazonaws.com/...) or the
 * regional S3 endpoint with /exotelrecordings/... in the path. Never fetch
 * arbitrary webhook-provided URLs through the server.
 */
export function trustedExotelRecordingUrl(rawUrl: string | null | undefined): URL | null {
  if (!rawUrl || rawUrl.length > 8192) return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.hash !== ""
  ) {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  const virtualHosted = EXOTEL_VIRTUAL_HOSTED_RECORDING.test(hostname);
  const pathStyle =
    AWS_S3_PATH_STYLE.test(hostname) &&
    url.pathname.toLowerCase().startsWith("/exotelrecordings/");

  return virtualHosted || pathStyle ? url : null;
}
