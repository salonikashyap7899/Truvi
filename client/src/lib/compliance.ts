/** Must match server/src/config/compliance.ts. Bump only with a reviewed policy revision. */
export const POLICY_VERSIONS = {
  TERMS_OF_SERVICE: "terms-2026-08",
  PRIVACY_NOTICE: "privacy-2026-11-04",
  MARKETING: "marketing-2026-11",
} as const;
