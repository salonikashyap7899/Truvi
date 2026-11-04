/**
 * Bump these identifiers whenever the corresponding user-facing policy or
 * notice changes. Consent events preserve the exact version the user saw.
 * These identifiers do not by themselves make policy wording legally approved.
 */
export const CURRENT_POLICY_VERSIONS = {
  TERMS_OF_SERVICE: "terms-2026-11-04",
  PRIVACY_NOTICE: "privacy-2026-11-04",
  MARKETING: "marketing-2026-11",
} as const;

export type ConsentPolicyType = keyof typeof CURRENT_POLICY_VERSIONS;
export type ConsentAction = "ACKNOWLEDGED" | "GRANTED" | "WITHDRAWN";

export const POLICY_DOCUMENTS = [
  {
    type: "TERMS_OF_SERVICE" as const,
    version: CURRENT_POLICY_VERSIONS.TERMS_OF_SERVICE,
    title: "Terms of Service",
    href: "/terms",
    required: true,
    description: "The terms that govern use of the Truvi platform and services.",
  },
  {
    type: "PRIVACY_NOTICE" as const,
    version: CURRENT_POLICY_VERSIONS.PRIVACY_NOTICE,
    title: "Privacy Policy",
    href: "/privacy-policy",
    required: true,
    description: "How Truvi describes its collection, use, sharing, and protection of personal information.",
  },
  {
    type: "MARKETING" as const,
    version: CURRENT_POLICY_VERSIONS.MARKETING,
    title: "Optional marketing communications",
    href: null,
    required: false,
    description: "Optional permission to receive promotional updates. You can withdraw this preference at any time.",
  },
] as const;
