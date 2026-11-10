# HostedScan security remediation — 6 November 2026

## Scan baseline

The HostedScan report for `https://truviventures.com`, scanned on 5 November 2026, records 34 findings: 0 critical, 0 high, 27 medium and 7 low. The web findings include a missing SRI attribute on the Google Fonts stylesheet, permissive CSP sources (`form-action https:`, `img-src https:`, `connect-src https:`, `media-src https:`) and `style-src 'unsafe-inline'`. The network section reports TLS 1.0/1.1, weak cipher matches on 443/8443, TCP timestamps, and 13 open TCP ports.

## Code changes in this PR

- Replace scheme-wide `https:` / `wss:` CSP source expressions with exact configured origins.
- Read the frontend API origin from `VITE_API_URL`; the Express policy reads `CLIENT_URL`, `PUBLIC_URL` / `RENDER_EXTERNAL_URL`, and `CSP_MEDIA_ORIGINS`.
- Restrict `form-action` to `'self'`.
- Move required inline React style attributes from `style-src` to `style-src-attr`. Inline style elements remain disallowed.
- Self-host the Inter, Inter Tight, and Playfair Display variable WOFF2 fonts (Latin and Latin-Extended subsets) under `client/public/fonts`. The site keeps the existing family names and variable weight ranges; the primary Playfair Display file is preloaded for first paint.
- Remove the Google Fonts stylesheet/preconnect from `client/index.html` and the Google Fonts CSS import from Founder OS. Remove `fonts.googleapis.com` and `fonts.gstatic.com` from both CSP implementations.
- Include the corresponding SIL Open Font License 1.1 notices beside the redistributed font assets.
- Apply the Vercel CSP in the page proxy so it can use deployment environment variables. The static duplicate in `vercel.json` is removed.

## Required deployment configuration

Before deploying the strict policy:

1. In the frontend host, ensure `VITE_API_URL` is the exact public HTTPS API origin and is available to the Vercel proxy at runtime as well as to the Vite build.
2. Populate `CSP_MEDIA_ORIGINS` with exact HTTPS origins for any legitimate project image/video/audio hosts that are not the frontend or API origin. Leave it empty if all media is served from those same origins. Do not put wildcard hosts or URL paths in this variable.
3. On the API host, keep `CLIENT_URL` and `PUBLIC_URL` / `RENDER_EXTERNAL_URL` accurate. If API-hosted uploads are served through a separate media host, include that host in `CSP_MEDIA_ORIGINS` on both services.
4. Deploy to staging first. Verify sign-in/session refresh, Socket.IO, Google Maps/Places, Razorpay checkout, all project cover/gallery images, master plans, and audio/video materials. Fix the allowlist from verified asset origins, not by adding `https:` back.

## Edge TLS and network findings — dashboard / origin work required

These cannot be fixed by a frontend or Express code change.

- **TLS 1.0 / 1.1 and weak ciphers:** In Cloudflare, open **SSL/TLS → Edge Certificates → Minimum TLS Version** and set **TLS 1.2**. Re-scan both the proxied hostname and the origin directly (from an authorized scanner) after confirming which endpoint the prior scan reached. If TLS 1.0/1.1 is still enabled on the origin, disable it in the origin web-server TLS configuration too. Keep TLS 1.2/1.3 and modern AEAD cipher suites.
- **Open ports:** The report's listed set (80, 443, 2052, 2053, 2082, 2083, 2086, 2087, 2095, 2096, 8080, 8443, 8880) exactly matches the standard HTTP/HTTPS ports Cloudflare proxies. That is not proof those ports are open on the Truvi VPS. Do not close them blindly. First confirm whether the scan resolved to Cloudflare edge addresses or directly to the origin. If it reached the origin, restrict inbound web traffic to the ports actually required by Truvi and allow origin HTTP/HTTPS only from Cloudflare's published IP ranges; keep SSH restricted to administrator IPs.
- **TCP timestamps:** Check this on the actual origin host only after confirming the scanned IP belongs to the VPS. A Cloudflare edge response cannot be corrected from the application. If the VPS itself exposes TCP timestamps and operational testing permits disabling them, apply the OS-level setting through the server's change-control process and verify after reboot.

## Findings requiring separate verification

- **Subresource Integrity on Google Fonts:** Remediated by removing the remote Google Fonts stylesheet and CSS import instead of adding a fragile browser-dependent SRI hash. Inter, Inter Tight, and Playfair Display are now served as same-origin WOFF2 assets with their SIL Open Font License notices. Re-run HostedScan after deployment to confirm the external stylesheet finding is cleared.
- TLS, origin firewall/port exposure and TCP timestamps are not changed by this PR. Cloudflare/VPS settings must be verified and changed by an authorized operator.

## Validation checklist

Run from the repository after checkout:

```bash
cd client && npm run build
cd ../server && npm run typecheck && npm test
```

Then run `npm run test:security` from `truvi-tests/` against staging. The security test verifies the local WOFF2 asset set and source tree on every run; set `EXPECT_SELF_HOSTED_FONTS=true` for the deployed staging/production run to assert that the browser makes no requests to Google Fonts. Do not deploy until the media-origin allowlist is checked against existing production content and payment, authentication and live-update flows pass.
