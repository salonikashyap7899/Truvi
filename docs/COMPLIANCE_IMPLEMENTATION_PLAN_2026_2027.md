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
