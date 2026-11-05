/**
 * Public statutory disclosures are build-time configuration, not guessed
 * constants. Management must populate these from MCA/company records and the
 * appointed officer's confirmation before claiming legal compliance.
 *
 * These VITE_ values are public website disclosures. Never place secrets here.
 */
const clean = (value: string | undefined): string | null => value?.trim() || null;

export const legalDisclosure = {
  legalEntityName: clean(import.meta.env.VITE_LEGAL_ENTITY_NAME),
  registeredOfficeAddress: clean(import.meta.env.VITE_REGISTERED_OFFICE_ADDRESS),
  headquartersAddress: clean(import.meta.env.VITE_COMPANY_HEADQUARTERS_ADDRESS),
  cinOrLlpNumber: clean(import.meta.env.VITE_COMPANY_CIN_OR_LLPIN),
  gstin: clean(import.meta.env.VITE_COMPANY_GSTIN),
  branchAddresses: clean(import.meta.env.VITE_COMPANY_BRANCH_ADDRESSES),
  customerCarePhone: clean(import.meta.env.VITE_CUSTOMER_CARE_PHONE),
  customerCareLandline: clean(import.meta.env.VITE_CUSTOMER_CARE_LANDLINE),
  grievanceOfficerName: clean(import.meta.env.VITE_GRIEVANCE_OFFICER_NAME),
  grievanceOfficerDesignation: clean(import.meta.env.VITE_GRIEVANCE_OFFICER_DESIGNATION),
  grievanceOfficerEmail: clean(import.meta.env.VITE_GRIEVANCE_OFFICER_EMAIL),
  grievanceOfficerPhone: clean(import.meta.env.VITE_GRIEVANCE_OFFICER_PHONE),
  grievanceOfficerLandline: clean(import.meta.env.VITE_GRIEVANCE_OFFICER_LANDLINE),
  upReraAgentRegistration: clean(import.meta.env.VITE_UP_RERA_AGENT_REGISTRATION),
} as const;

export const missingLegalDisclosures = [
  ["VITE_LEGAL_ENTITY_NAME", legalDisclosure.legalEntityName],
  ["VITE_REGISTERED_OFFICE_ADDRESS", legalDisclosure.registeredOfficeAddress],
  ["VITE_COMPANY_HEADQUARTERS_ADDRESS", legalDisclosure.headquartersAddress],
  // Set to all current branch addresses, or an explicit "No branch offices" only after management confirms.
  ["VITE_COMPANY_BRANCH_ADDRESSES", legalDisclosure.branchAddresses],
  ["VITE_CUSTOMER_CARE_PHONE", legalDisclosure.customerCarePhone],
  ["VITE_CUSTOMER_CARE_LANDLINE", legalDisclosure.customerCareLandline],
  ["VITE_GRIEVANCE_OFFICER_NAME", legalDisclosure.grievanceOfficerName],
  ["VITE_GRIEVANCE_OFFICER_DESIGNATION", legalDisclosure.grievanceOfficerDesignation],
  ["VITE_GRIEVANCE_OFFICER_EMAIL", legalDisclosure.grievanceOfficerEmail],
  ["VITE_GRIEVANCE_OFFICER_PHONE", legalDisclosure.grievanceOfficerPhone],
  ["VITE_GRIEVANCE_OFFICER_LANDLINE", legalDisclosure.grievanceOfficerLandline],
] as const;
