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
  cinOrLlpNumber: clean(import.meta.env.VITE_COMPANY_CIN_OR_LLPIN),
  customerCarePhone: clean(import.meta.env.VITE_CUSTOMER_CARE_PHONE),
  grievanceOfficerName: clean(import.meta.env.VITE_GRIEVANCE_OFFICER_NAME),
  grievanceOfficerDesignation: clean(import.meta.env.VITE_GRIEVANCE_OFFICER_DESIGNATION),
  grievanceOfficerEmail: clean(import.meta.env.VITE_GRIEVANCE_OFFICER_EMAIL),
  grievanceOfficerPhone: clean(import.meta.env.VITE_GRIEVANCE_OFFICER_PHONE),
  upReraAgentRegistration: clean(import.meta.env.VITE_UP_RERA_AGENT_REGISTRATION),
} as const;

export const missingLegalDisclosures = [
  ["VITE_LEGAL_ENTITY_NAME", legalDisclosure.legalEntityName],
  ["VITE_REGISTERED_OFFICE_ADDRESS", legalDisclosure.registeredOfficeAddress],
  ["VITE_CUSTOMER_CARE_PHONE", legalDisclosure.customerCarePhone],
  ["VITE_GRIEVANCE_OFFICER_NAME", legalDisclosure.grievanceOfficerName],
  ["VITE_GRIEVANCE_OFFICER_DESIGNATION", legalDisclosure.grievanceOfficerDesignation],
  ["VITE_GRIEVANCE_OFFICER_EMAIL", legalDisclosure.grievanceOfficerEmail],
  ["VITE_GRIEVANCE_OFFICER_PHONE", legalDisclosure.grievanceOfficerPhone],
] as const;
