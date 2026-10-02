/** Approval authorities a project can be listed under. Not every project is
 *  RERA-registered — many layouts are cleared by the District Panchayat or a
 *  development authority (DTCP) instead. The listing form lets a developer pick
 *  whichever body issued their approval so a valid non-RERA project isn't
 *  blocked from listing. */
export type ApprovalAuthority = "RERA" | "DISTRICT_PANCHAYAT" | "DTCP";

export interface ApprovalAuthorityMeta {
  value: ApprovalAuthority;
  /** Short name shown in the selector. */
  label: string;
  /** Label for the number/ID input, tailored to the authority. */
  numberLabel: string;
  /** Example format to guide the developer. */
  placeholder: string;
}

export const APPROVAL_AUTHORITIES: ApprovalAuthorityMeta[] = [
  {
    value: "RERA",
    label: "RERA",
    numberLabel: "RERA registration number",
    placeholder: "e.g. TS RERA.P0200000…",
  },
  {
    value: "DISTRICT_PANCHAYAT",
    label: "District Panchayat",
    numberLabel: "District Panchayat approval no.",
    placeholder: "e.g. DP / LP / 2024 / …",
  },
  {
    value: "DTCP",
    label: "Development Authority (DTCP)",
    numberLabel: "DTCP / LP number",
    placeholder: "e.g. L.P. No. 287/2020/H",
  },
];

/** Metadata for an authority value, falling back to RERA when unset/unknown. */
export function authorityMeta(value?: string | null): ApprovalAuthorityMeta {
  return APPROVAL_AUTHORITIES.find((a) => a.value === value) ?? APPROVAL_AUTHORITIES[0];
}

/** Human label for an authority value, for read-only display to buyers. */
export function authorityLabel(value?: string | null): string {
  return authorityMeta(value).label;
}
