# Truvi Ambassador Operating System — PDF-to-Code Coverage Audit

**Requirement source:** `TRUVI-AMBASSADOR-OPERATING-SYSTEM.pdf`, Version 1.0, 35 pages, Lucknow pilot / Paradise Town Sales Mission.

**Purpose:** Track requirement coverage honestly. This audit describes the code in this branch; it is not a claim that the feature has been deployed or that production data and infrastructure are verified.

## Current implementation status

| PDF area | Priority | Current code coverage | Remaining qualification |
|---|---:|---|---|
| Management hierarchy and permissions | Operating model | Implemented in code: Admin plus scoped Program Manager, Sales Coordinator, and Training Coordinator assignments; role-filtered workspace and server-side route gates | Needs multi-role staging/E2E verification and least-privilege review |
| Ambassador registration and lifecycle | P0 | Registration profile, city-coded Ambassador ID, terms, verification/activation gates, lifecycle statuses, Admin updates, audit and notifications | Review/backfill existing users and city codes in staging; actual identity/onboarding providers remain external dependencies |
| Seven-day Learning Academy | P0 | Sequential modules, admin-publishable versioned lessons, written/video URL support, key points, assignment, server-held quiz answers, 80/100 quiz threshold, attendance, five-part 20-mark rubric, practical/ethics approvals, feedback, certificate | Must validate lessons/quiz/rubric content with Training Coordinator; attendance evidence is operationally entered, not attendance hardware integration |
| Task engine | P0 | Seven PDF categories, assignment, acceptance, in-progress, evidence, review, reject reason, due date, timestamps, notifications, category-specific reviewer access, and a required structured checklist for Verification tasks | Verify customized checklist needs and all category-specific transitions through staged E2E; lead duplicate/consent review remains a separate CRM workflow |
| Lead management | P0 | Structured purchase purpose/budget/plot size/timeline, project/unit, source channel, consent timestamp/version, duplicate checks, referral attribution, follow-up scheduling, ownership review fields and audit | Existing Truvi CRM remains the source of truth; validate exact stage mapping and every intake source in staging |
| Sales pipeline and campaign reporting | P0 | Distinct real-estate property-booking ledger/status history; pending/review/verified/cancelled/refund lifecycle; dashboard/funnel conversion metrics; channel cost, lead, qualification, visit, verified-sale and cost-per-qualified-lead reporting | Verify reconciliation against production inventory/CRM and that all booking mutations update the authoritative unit state correctly |
| Incentives and payout | P0 | Versioned policies; source restrictions, booking status, payment milestone, cancellation/refund treatment, approval authority/reference, payout delay/expected date; eligibility tied to property booking; status transitions and payment reference; Ambassador sees own ledger | Policy amounts and approval references must be signed off by finance; recording PAID is a ledger action, not bank/payment-processor integration |
| Performance and leaderboard | P0 | Seven-dimension 100% configurable-weight scorecard, review evidence/notes, serious-misconduct override, privacy-conscious leaderboard; source-channel economics | Customer-feedback evidence and the actual team/channel source data need operational validation; defaults/weights should be formally approved |
| Career progression L0–L6 | P1 | Level requirements and Admin updates; evidence-backed L4 mentoring, L5 team-management and L6 advanced assessments; internship/job/mentoring opportunities and application review | Job/internship selection remains manual and must not be represented as guaranteed employment |
| Marketing guidelines and material | Campaign governance | Versioned campaign rules, written approval reference, per-version Ambassador acknowledgement, new-version re-acknowledgement gate on lead submission, submitted/approved/rejected/retired marketing assets | Program owner must publish correct, current legal/pricing/inventory content before campaign launch |
| Privacy, retention and auditing | Security requirement | Consent records; audit events; self-service access/rectification/deletion request intake and review queue; versioned retention policies inactive until an approval reference is provided; explicit, audited redaction run for supported evidence/content categories | A privacy request is not automatically fulfilled/deleted by code: staff must execute and record the approved case. Legal-approved retention durations are intentionally not assumed from the PDF |
| Database and app architecture | P0 / future phase | OS entities for users/roles, profiles, modules, training, tasks, campaigns, leads and activities, property bookings/history, incentive policies/ledger, notifications and audits; web Ambassador, scoped internal and Admin workspaces | Builder Dashboard is explicitly a future phase in the PDF; hosted DB migration/bootstrap and backup/restore must be verified against the actual deployment |
| Security operations | Required | Server-side role checks, narrow staff grants instead of global Admin escalation, restricted finance access, audit history, consent/version evidence, limited Ambassador-owned data views; no generic OS export endpoint added | Restore-to-staging test, RPO/RTO approval, production permission/E2E tests, privacy/deletion runbooks, asset-link security and deployment review remain release gates |

## Current operational safeguards

- Paradise Town's 114-unit target, 1,250 sq ft/unit and 60-day mission are **planning inputs copied from the PDF**, not evidence of actual inventory, title/legal status, price, or availability.
- Campaigns require an approved/verified Truvi project, a price list, enough available units and an Admin-entered source-review note before activation.
- A verified active campaign cannot accept an Ambassador lead until the latest published campaign guidelines are acknowledged. If rules have not been published, submission remains blocked.
- Only approved, unexpired marketing materials from currently active, acknowledged campaigns are displayed in the Ambassador library.
- Incentive policies and retention policies are inactive until their respective approval references are recorded. Do not infer a real commission entitlement from the example policy amount or sample targets in the PDF.
- Property booking records are intentionally separate from service/Habitat bookings and from the incentive ledger. A lead/enquiry alone is not a verified property sale.
- Program Manager/Sales Coordinator/Training Coordinator assignments are OS-scoped and do not elevate a user's global Truvi role. Payout creation/settlement remains Admin-only in this implementation.
- Privacy requests are tracked with case references. Access requests do not yet automatically generate a downloadable data export; deletion requests are not a promise that lawfully-required booking, finance, consent, or audit records will be erased.

## CI, staging and release

The workflow `.github/workflows/ambassador-os-checks.yml` runs backend TypeScript checks, Ambassador OS business-rule tests, and the frontend production build. Use the latest branch head's workflow result; checks for an older commit do not validate newer changes.

A successful CI run alone does not validate the live database bootstrap, production identities, role boundaries in-browser, real inventory reconciliation, finance/legal approvals, or infrastructure backup/recovery. Before production use, deploy to staging; exercise each role with separate test accounts; verify every workflow against the real schema; reconcile bookings to inventory; test duplicate/consent/ownership cases; and perform a documented restore drill with the database/platform owner.

## Remaining completion gates

1. Review/approve actual lesson, project and marketing content; verify existing profile backfill and city-coded IDs.
2. Run browser end-to-end tests for Admin, each scoped internal role, certified/active Ambassador and an unactivated Ambassador.
3. Validate every CRM source/stage and booking transition against the authoritative existing data model; ensure sale-verified inventory cannot be double-counted across booking records.
4. Obtain written policy approval for incentive amounts, eligible sources/milestones, cancellation/refunds, payment authority, scorecard weights and each retention schedule.
5. Configure and test provider-level backups/PITR, disaster recovery, alerting and restore-to-staging. Code in this PR cannot prove these cloud settings are enabled.
6. Confirm the privacy-request handling process, data access/export fulfillment, approved deletion exceptions and audit-retention obligations with the privacy/legal owner.
7. Only mark full PDF parity after all P0 requirements pass the above checks, P1 is implemented/accepted, and remaining differences are documented and signed off.

**Release status:** This branch/PR is still a code change, not a merged or deployed production system. Do not describe it as live or security-certified until the above release gates have passed.
