# Truvi Compliance & Security Implementation Plan (2026–2027)

**Baseline reviewed:** `main` at `350c23d8f33a1d51971104fb1e6a944f0170feac` (3 November 2026)  
**Scope:** Technical implementation plan for the Truvi web platform and its operations.  
**Status:** Work plan — not a legal opinion, security certification, or statement that Truvi is compliant.

## 1. Release principles

1. Work only on this feature branch until the changes have passed review and tests.
2. Do not merge to `main`, deploy to the VPS, change production data, or rotate production secrets as part of this work without a separate explicit deployment step.
3. Preserve existing roles, dashboards, authentication, projects, CRM, notifications, payments, KYC, and other product features. Compliance work must be additive unless a security defect requires a narrowly scoped correction.
4. Do not invent the company's CIN, registered office, GSTIN, RERA registration, licence, or legal status. Obtain verified details and supporting documents before publishing them.
5. Keep privacy/legal text versioned. Record evidence of user actions; do not treat OTP verification, account creation, or continued use as a substitute for a specific consent where consent is required.
6. Apply retention and deletion rules with legal holds and statutory recordkeeping in mind. Do not indiscriminately delete KYC, payment, tax, grievance, or audit records.

## 2. Baseline findings from repository review

### Existing controls worth preserving

- Express security middleware includes Helmet-based headers, a CORS allowlist, request IDs, and login/OTP rate limits.
- Authentication uses server-side role checks and an HTTP-only refresh-cookie/session approach.
- KYC documents and buyer identity documents have private-storage/access-control protections.
- Payment verification checks Razorpay signatures and fetches provider-side order/payment state before granting paid access.
- Razorpay webhook handling is mounted before the JSON body parser so the raw body can be used for signature verification.
- Legal documents have an approval workflow and public responses are intended to expose verified documents only.

These are useful controls, not proof that the entire application is secure or compliant.

### Gaps to address

| Priority | Area | Baseline gap / implementation requirement |
|---|---|---|
| Critical | Privacy governance | No universal, versioned user-consent ledger was identified for all roles. The existing Ambassador privacy-request flow is role-specific and does not cover every user's complete data footprint. |
| Critical | RERA / listing claims | Project data includes developer-entered authority/registration fields. Verification evidence, reviewer identity, validity, phase, and re-check history need a consistent, auditable workflow. A supplied number or generic approval reference must not by itself be represented as independently verified. |
| High | Signup disclosures | Signup needs clear links to the applicable Terms and Privacy Notice and a recorded acknowledgement of the exact versions shown. Optional marketing consent must be separate, optional, and withdrawable. |
| High | Company disclosures | The website's current company information does not establish all statutory company website disclosures. Add the verified legal name, registered office, CIN, contact details, and grievance contact only after company records are checked. |
| High | Grievances | Add one traceable grievance workflow for buyers, developers, channel partners, ambassadors, employees, and other users, with acknowledgement, assignment, response deadlines, escalation, and closure evidence. |
| High | Customer rights | Extend access/correction/erasure/grievance request handling beyond the Ambassador-specific flow. Include identity checks, status tracking, response evidence, legal holds, and reasoned exceptions. |
| High | Payments | Implement and test customer self-service subscription cancellation against the Razorpay subscription lifecycle; define refund initiation/status tracking and customer notifications. Review the current blanket non-refund language with counsel. |
| High | Upload security | Legal-document upload validation should verify actual file content/signature (not only extension and client MIME), enforce size limits, and add malware scanning/quarantine where operationally feasible. |
| High | GST | Confirm service classification, GST treatment, SAC, place-of-supply, invoice numbering, recipient fields, credit-note/refund processes, and any e-invoice applicability with the CA; implement invoices from approved rules, not a hard-coded assumption for every service. |
| High | Incident readiness | Confirm CERT-In point of contact, reportable-incident playbook, evidence preservation, escalation, and required log retention/location with the VPS/provider architecture. |
| Medium | Vendor governance | Maintain a processor/subprocessor register covering VPS/hosting, database, email/SMS, payments, storage/CDN, maps, AI, analytics, and marketing providers; record purpose, data categories, access, location, retention, and contractual safeguards. |
| Medium | Consumer-facing UX | If counsel classifies Truvi as covered by the e-commerce rules, implement sponsored-result disclosure, ranking transparency, seller/project disclosures, pricing/discount history disclosures where applicable, grievance processes, and the required dark-pattern review. |

## 3. Phased implementation

### Phase 0 — Legal and operational facts (approval gate)

Collect and verify:
- Exact legal company name, CIN, registered office address, GST registrations, and official contact/grievance contact.
- Truvi's role for each workflow: SaaS provider, advertising/listing platform, marketplace, real-estate agent, service provider, or another role. The answer may differ by feature and state.
- Which projects require RERA registration, which are exempt, and which other approval authority applies. Record the legal basis and evidence for each exception.
- Data inventory by role and workflow, including Aadhaar/PAN/selfie/KYC, buyer enquiries, lead/CRM information, employee information, payment records, analytics, AI inputs, and marketing data.
- Processor/subprocessor list and hosting/data-location details.
- GST position for every paid product/service and a CA-approved invoice/refund workflow.

Do not block every project simply because it has no RERA number: statutory exemptions and other approvals must be reviewed and evidenced. Conversely, do not describe an unverified project as RERA-verified.

### Phase 1 — Privacy, consent, and grievance foundation

Build:
- Versioned policy/notice records with effective dates and immutable version identifiers.
- A consent/acknowledgement ledger recording user, role, purpose, notice version, action, timestamp, collection channel, and withdrawal history.
- Separate optional marketing preferences from notices/consents required to provide a requested service.
- Privacy-request workflow for every account role: access, correction, erasure, grievance, and applicable withdrawal/objection requests.
- Grievance ticket workflow with category, acknowledgement timestamp, assignee, response due date, communication history, resolution, and escalation.
- A user-facing Privacy & Support Centre and admin compliance queues with role-based access and audit trails.
- Data inventory and retention schedule with legal holds and deletion-job evidence.

### Phase 2 — RERA and consumer-protection controls

Build:
- Project approval evidence records: authority, registration/reference number, official source URL, uploaded evidence, project phase, applicable validity dates, reviewer, verification status, reason for exemption (where applicable), and audit history.
- Publishing/marketing gates based on the verified legal classification of the project and Truvi's role.
- Clear labels distinguishing developer-provided information, document-reviewed information, independently verified records, and expired/pending information.
- If applicable after legal classification, consumer-facing seller/project disclosures, sponsored-listing labels, transparent ranking rules, discount-price records, grievance workflow, and documented dark-pattern self-audit.

### Phase 3 — Payments, invoices, and operational controls

Build:
- Customer subscription cancellation journey with provider-side cancellation, effective date, renewal state, confirmation, and webhook reconciliation.
- Refund request/decision/processing state machine with reason codes, evidence, provider references, timelines, and customer notifications.
- CA-approved tax invoice/credit-note generation and immutable invoice numbering.
- Strong file upload validation, quarantine/scan workflow, and restricted download access.
- Vendor register and processor contract/evidence tracking.

### Phase 4 — Security assurance and readiness

Test and document:
- Role and object-level authorization (including cross-user/cross-tenant access tests).
- CSRF, XSS, SQL injection, SSRF, IDOR/BOLA, session rotation, refresh-token replay, rate limiting, and brute-force protections.
- Admin MFA and step-up verification for sensitive actions.
- Secrets handling, dependency/SBOM scanning, patching, CSP, CORS, and production configuration.
- Encrypted backups and a successful restore drill; database and file-store recovery.
- CERT-In incident escalation, log retention/location, point-of-contact, and evidence preservation.
- Independent penetration test and remediation retest before a security assurance claim is made.

## 4. Regulatory timing notes to track

- India's DPDP Rules, 2025 have a phased commencement. Certain provisions commence on publication, Rule 4 is scheduled one year after publication, and the principal operational rules in Rules 3 and 5–16 (including safeguards, breach notices, retention, and contact requirements) are scheduled 18 months after publication. Confirm the exact provision and commencement date before assigning a control as legally effective.
- The Consumer Protection (E-Commerce) Amendment Rules, 2026 are scheduled to take effect on 1 January 2027. Whether and how they apply to Truvi depends on the actual operating model and must be confirmed by counsel.
- RERA obligations depend on the project, state rules, statutory exemptions, and whether Truvi acts as promoter, agent, or a platform/service provider in the relevant transaction.
- CERT-In directions and applicable tax/company-law requirements need operational validation with the responsible compliance professionals.

## 5. Definition of done

A feature is not complete merely because a page or database table exists. Each item must include:
- Migration and rollback/recovery plan where applicable.
- Server-side authorization and input validation.
- Audit events without exposing secrets or unnecessary personal data.
- Unit/integration tests and negative authorization tests.
- User-facing explanation and support path where required.
- Evidence of operational ownership, retention, and monitoring.
- Review by the appropriate lawyer, CA, or independent security professional where the requirement is legal/tax/security-assurance related.

## 6. Release checklist

- [ ] Phase 0 legal/company facts confirmed by source documents.
- [ ] DPDP applicability and role mapping approved by counsel.
- [ ] RERA applicability and project-specific verification rules approved.
- [ ] E-commerce applicability and 2027 consumer controls approved.
- [ ] GST invoice/refund rules approved by CA.
- [ ] Privacy, consent, grievance, and rights workflows tested across every role.
- [ ] Subscription cancellation and refund flows tested end-to-end.
- [ ] Security test suite and independent penetration test completed.
- [ ] Backups restored successfully and incident response drill completed.
- [ ] Production deployment reviewed, backed up, monitored, and separately approved.

---

**Important:** This plan does not certify Truvi as compliant. Lawful operation depends on accurate business facts, actual processing practices, contracts, staff procedures, and professional legal/tax review—not code alone.


## 7. India legal obligations and applicability register
**Reviewed against publicly available central-government material: 4 November 2026.** This is an engineering applicability register, not a legal opinion. Truvi must obtain advice based on its actual contracts, company records, project/agent activities, employee locations, transaction flows and hosting contracts. A law is not treated as applicable merely because a feature name resembles a regulated activity.

### 7.1 Privacy, cybersecurity and platform obligations

| Framework | Position as at 4 November 2026 | Required Truvi evidence / action |
|---|---|---|
| Information Technology Act, 2000 and SPDI Rules, 2011 | The current framework remains relevant while the scheduled omission of IT Act section 43A is not yet effective. Truvi processes passwords, financial information and identity/KYC information; whether each field is SPDI must be classified against the Rules rather than assumed. | Publish an accurate privacy policy; document consent/notice and purpose for sensitive-data collection; restrict disclosures; identify the grievance contact; maintain reasonable security practices and a documented incident process. Map each field to the SPDI definition and remove collection that is not necessary. |
| Digital Personal Data Protection Act, 2023 and DPDP Rules, 2025 | The commencement is phased. The core processing obligations in sections 3–17 and the main operational Rules 3 and 5–16 are scheduled 18 months after 13 November 2025: **13 May 2027**. Section 6(9) and Rule 4 are scheduled one year after publication: **13 November 2026**; Rule 4 concerns registration of Consent Managers and should not be confused with a general website consent deadline. | Treat Truvi as a likely Data Fiduciary for the personal data for which it decides purposes and means, subject to counsel's role mapping. Prepare itemised notices, purpose-specific and withdrawable consent where consent is the lawful basis, processor contracts, security safeguards, breach notices, user rights handling, deletion/retention, children's data controls and escalation. Do not claim the phased provisions are already in force before their appointed date. |
| CERT-In Directions under section 70B, 28 April 2022 | Applicable directions require reportable cyber incidents to be reported within 6 hours of noticing or being brought to notice, and ICT system logs to be enabled and securely retained for a rolling 180 days within Indian jurisdiction, with a designated Point of Contact and other operational requirements. | Name and test a CERT-In Point of Contact; maintain a 24x7 incident escalation route; document the reportable-incident decision tree and 6-hour workflow; verify system clock synchronisation; retain required ICT logs for at least 180 days in India; test retrieval and evidence export. Verify the VPS, database, backup and log regions separately—do not infer their region from the provider's brand. |
| IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 | Applicability depends on whether Truvi is an intermediary for user-provided information/content, or only publishing its own/editorially approved content. A marketplace/noticeboard or public user-content feature needs a specific role assessment. | Have counsel map each user-content feature. Where Truvi is an intermediary, assess Rule 3 due diligence, user rules/terms, grievance officer, complaint timelines, takedown/legal-order handling and evidence-preservation duties. Do not assume the rules apply to every SaaS feature or that a Terms page alone satisfies them. |
| Consumer Protection Act, 2019; E-Commerce Rules, 2020; 2026 Amendment | Application depends on whether Truvi's actual activity is an e-commerce entity/marketplace, inventory model, intermediary, advertising/listing service or SaaS provider. The 2026 E-Commerce Amendment Rules are scheduled to commence **1 January 2027**. | Determine and record Truvi's operating-model classification. If covered, implement the applicable entity/seller disclosures, grievance officer and consumer complaint workflow (including acknowledgement/redressal timelines), explicit affirmative purchase consent, seller/project information, payment/cancellation/refund disclosures, ranking transparency, sponsored-result labels, price-reduction substantiation and dark-pattern controls before 1 January 2027. |
| Consumer Protection (E-Commerce) Amendment Rules, 2026 and CCPA dark-pattern / misleading-advertising guidelines | Relevant where the platform's listing, ranking, advertising, purchase or lead-conversion activity falls within their scope. A disclaimer does not cure a misleading claim or a deceptive interface. | Keep an evidence record for price, discount, availability, RERA/approval and return/booking claims; label sponsored placements; preserve ranking inputs and changes; audit checkout and lead funnels for dark patterns, pre-ticked choices and false urgency. Obtain counsel's sign-off on the 2027 rules. |

### 7.2 Real estate, KYC, communications and finance

| Framework | Applicability question | Required Truvi evidence / action |
|---|---|---|
| Real Estate (Regulation and Development) Act, 2016, especially sections 9, 10 and 11(2), plus applicable State Rules | Section 9 registration is relevant where Truvi or a person acting through it facilitates sale/purchase of a plot, apartment or building in a project covered by RERA. Section 10 restricts agents from facilitating transactions in projects that should be registered but are not. Whether Truvi is an agent, an advertising/technology vendor or another service provider is a fact-specific legal question. | Obtain a written role assessment for Truvi and each workflow. Verify applicable UP RERA registration for Truvi and/or CP/ambassador agents before activities requiring it. Store project registration number, promoter, authority, phase, official source/evidence, verification date and status; validate exemptions with evidence. Where applicable, ensure advertisements carry the required registration details. Do not label every non-RERA project unlawful: document the correct statutory exemption or other competent approval. |
| Aadhaar Act, 2016; UIDAI Aadhaar Authentication and Offline Verification framework | Truvi's current code-level KYC path accepts identity documents and manual review; it is not evidence that Truvi is an authorised Aadhaar authentication agency or that it has UIDAI access. | Do not promise automated Aadhaar/DigiLocker verification until an authorised provider, permitted use, contract, consent and API workflow exist. Minimise Aadhaar collection; prefer permitted masked/offline verification methods where appropriate; restrict access, mask identifiers, define retention and secure deletion, and have counsel/UIDAI-specialist review before production use. |
| TRAI TCCCPR, 2018 and subsequent directions | Relevant to bulk/commercial SMS and voice campaigns. Provider use (Twilio or another gateway) does not by itself discharge the sender/Principal Entity's obligations. Classification of OTP, transactional/service and promotional messages must be handled correctly. | Confirm Principal Entity and telemarketer registration where required; register sender headers and content templates; use DLT-compliant routes; obtain/register digital consent for commercial communication where required; scrub recipient preferences and process revocation. Keep marketing consent separate from essential account/security messages. |
| CGST Act, 2017 and CGST Rules, including Rules 46 and 47 | Applies according to Truvi's GST registration, supply classification, place of supply, turnover and service model. A configurable 18% software default is not proof that 18% is the correct rate for every supply. | Have a CA approve SAC, tax rate, registration, place-of-supply, invoice series, supplier/recipient particulars, invoice timing, credit notes, refunds, GST returns and e-invoice applicability. Store issued invoices and provider references; test reconciliation. Rule 46 particulars and Rule 47 service-invoice timing must be reflected where applicable. |
| Income-tax Act, 1961, including TDS provisions such as section 194H where relevant | CP/ambassador referral commissions and other payouts may be commission/brokerage, contractual service or salary depending on the real relationship and agreement. | Have a CA classify each payout stream and determine TDS section, threshold, rate, timing, PAN/statement, certificates, ledger and year-end reconciliation. Do not assume every payout has the same TDS treatment. |
| Payment and Settlement Systems Act, 2007, RBI payment-aggregator framework and PCI DSS contractual scope | Truvi uses Razorpay for payment flows. If Truvi only redirects/uses an authorised payment provider and does not itself aggregate, hold or settle customer funds, the regulatory position differs from Truvi operating a wallet, escrow or payment aggregator. | Confirm the payment flow and Razorpay agreement; do not store card credentials or CVV; verify webhook signatures and reconcile provider-side order/payment state; never hold customer funds or advertise escrow unless the required regulated structure and approvals are confirmed. Confirm PCI DSS responsibility allocation with the provider/acquirer. |

### 7.3 Company, employment and business operations

| Framework | Applicability question | Required Truvi evidence / action |
|---|---|---|
| Companies Act, 2013 and applicable Companies (Incorporation) Rules | Depends on the exact legal entity operating the website, whether it is a company/LLP/other entity, and the content/publication in question. The current product label must not be treated as proof of the registered company name. | Verify legal name, CIN/LLPIN, registered office and status from MCA/company records. Make the disclosures required by section 12 and applicable rules on official business documents and required publications; keep website/contact disclosures consistent. Do not publish invented company identifiers or addresses. |
| Applicable labour codes, State Shops and Establishments law, EPF/ESI/gratuity and wage requirements | Depends on employee count, establishment type, employee work locations, wages, contract type and the commencement/status of the relevant labour provisions at the time of operation. | Have an employment-law adviser map each employee's work location and category. Implement required appointment letters, wage slips, attendance/leave, payroll, working hours/holidays, minimum wages, social-security contributions, registers, retention and separation process. |
| Sexual Harassment of Women at Workplace Act, 2013 (POSH) | Internal Committee requirement generally arises at a workplace with 10 or more employees; other obligations can apply below that threshold. | Confirm employee count and workplaces; maintain policy, Internal Committee where required, complaint process, confidentiality, awareness training and annual reporting. Keep POSH complaint data under restricted access and a separate retention policy. |
| PMLA, 2002 and applicable Rules | Whether Truvi is a reporting entity or is carrying out a covered real-estate-agent activity requires advice on its actual transaction role and thresholds. Being a property website alone is not enough to conclude every PMLA duty applies. | Obtain a written AML/PMLA applicability assessment. Where covered, implement customer/beneficial-owner due diligence, record retention, risk assessment, designated reporting officer, suspicious/threshold transaction escalation and FIU-IND reporting as required. |
| Contract, IP, consumer and advertising law | Applies according to Truvi's agreements, content, marketing, role in property transactions and use of third-party materials. | Maintain seller/developer warranties and evidence, content licensing, takedown/complaint process, ad substantiation, partner agreements, commission terms, cancellation/refund terms and dispute/records process. |

### 7.4 Mandatory proof before a “compliant” release claim

The following are evidence gates, not code-only tasks:

1. **Entity and business facts:** MCA certificate/master data, CIN, registered office, GST registration, operating states, relevant UP RERA registration(s), and a legal opinion on whether Truvi/CPs/ambassadors are acting as real-estate agents, e-commerce marketplace participants, intermediaries or SaaS/advertising providers.
2. **Data governance:** signed data inventory and purpose register; processor/subprocessor agreements; actual Supabase, Hostinger, email, SMS, maps, AI and telephony regions; transfer/retention schedule; backup deletion rules; access review; DPDP notice and rights workflow readiness.
3. **Security operations:** CERT-In POC and incident drill; 180-day in-India log evidence; secrets/key rotation; MFA and step-up authentication for privileged actions; database/file restore drill; vulnerability remediation; independent penetration test and retest; access-control/tenant-isolation tests.
4. **Consumer and real-estate controls:** project-wise registration/exemption evidence; agent registration evidence where needed; substantiated property/price/availability claims; seller disclosures; ranking/sponsored-result rules; grievance workflow and refund/payment disclosures.
5. **Finance and workforce:** CA-signed GST/SAC/TDS decision; tax invoice/credit-note reconciliation; employee-state labour-law register; payroll and statutory filing evidence; POSH process where required.
6. **Release proof:** tests for every role and negative cross-account access; OTP and recovery abuse cases; verified deletion/anonymisation jobs with legal-hold exceptions; provider delivery tests; monitoring alerts; signed owner approvals.

### 7.5 No blanket assurance

Do not display “100% secure”, “100% compliant”, “DPDP certified”, “RERA verified” or similar unqualified claims. Security is continuously managed, and legal applicability depends on the actual company, services, locations, contracts and transactions. A clean automated scan is not a penetration test; a policy page is not proof of operational compliance; and a code workflow is not proof that a legal duty has been met.

### 7.6 Official references to verify at each release

- DPDP Act commencement notification G.S.R. 843(E), 13 November 2025: https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf
- DPDP Rules notification G.S.R. 846(E), 13 November 2025: https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf
- CERT-In Directions under section 70B, 28 April 2022: https://www.cert-in.org.in/Directions70B.jsp
- IT Act, 2000: https://www.indiacode.nic.in/indiacode/handle/123456789/1999?locale=en
- Consumer Protection (E-Commerce) Rules and amendments: https://consumeraffairs.gov.in/pages/consumer-protection-acts
- Consumer Protection (E-Commerce) Amendment Rules 2026 announcement and commencement date: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2308759
- RERA Act Sections 9 and 10: https://indiacode.ecourtsindia.com/real-estate-regulation-development-act-2016/section/9/ and https://indiacode.ecourtsindia.com/real-estate-regulation-development-act-2016/section/10/
- CGST Rule 46: https://taxinformation.cbic.gov.in/content-page/explore-rules/1000136/1000001
- TRAI TCCCPR and sender guidance: https://trai.gov.in/tcccpr and https://trai.gov.in/advice-to-senders

**Release owner:** Truvi management must assign an accountable owner and lawyer/CA/security professional for each applicability decision. Re-check notifications, commencement dates, state rules and provider contracts immediately before deployment.
