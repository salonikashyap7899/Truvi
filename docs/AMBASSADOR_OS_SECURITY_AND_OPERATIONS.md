# Ambassador Operating System — Security & Operations Controls

This runbook complements the 35-page Ambassador Operating System blueprint. It distinguishes application controls in code from infrastructure or business controls that must be verified by the responsible Truvi owner.

## Operating-system role matrix

| Capability | Admin | Program Manager | Sales Coordinator | Training Coordinator | Ambassador |
|---|---|---|---|---|---|
| Manage OS staff grants/revocations | Yes | No | No | No | No |
| Registration, activation and lifecycle decisions | Yes | Yes (OS scope) | No | Training-related review only | Own profile/terms |
| Academy modules, attendance, rubric and trainer feedback | Yes | No | No | Yes | Own lessons, work and results |
| Tasks | All | All OS categories | Sales/lead/site-visit | Training/research/verification/marketing categories as assigned | Own assigned tasks |
| Leads, follow-ups, disputes and site visits | Yes | Oversight | Yes | No | Own/attributed lead actions only |
| Property booking verification/history | Yes | Oversight | Yes | No | View own attributed status only |
| Campaigns and approved marketing materials | Yes | Yes | View campaign and sales context | No | Acknowledge rules; submit draft; view approved materials |
| Incentive policy / ledger / payout settlement | Yes | Policy configuration only | No settlement access | No | Own ledger only |
| Weighted scorecards | Yes | Yes | Sales contribution inputs | Training/skills inputs | Own score and published privacy-safe leaderboard |
| Career opportunities and L4–L6 assessments | Yes | Yes | No | No | Apply and view own results |
| Privacy request queue / retention policy | Yes | No | No | No | Submit and view own requests |

The server is the authorization boundary. Hiding a tab or route in the browser is not sufficient authorization. Do not add OS staff roles to global Truvi role enums or grant global Admin to make these screens work.

## Customer data and lead governance

1. Collect and retain only contact details needed for the customer-requested real-estate follow-up. Store the contact-consent timestamp and the consent text/version presented at collection.
2. Preserve lead source and referral attribution history. Duplicate review must not overwrite the first valid referral silently. Resolve disputed ownership with a reviewer and an audit trail.
3. Restrict full customer contact details to users with operational need; do not expose customer PII in a public/global leaderboard or unrestricted reports.
4. Never treat enquiry stage, task completion, a provisional booking, or a payment claim as a verified property sale. The property booking ledger is separate from lead and payout data.
5. Do not place bank credentials, identity-document images, passwords, full payment-card data, or other unnecessary secrets into task text, marketing drafts, comments, or notes.

## Marketing rules and asset approval

- Publish approved, current marketing guidelines for each active, verified campaign with a written approval reference.
- Each Ambassador must explicitly acknowledge the latest version. A new version requires re-acknowledgement; lead intake is blocked until that occurs.
- Marketing materials begin in SUBMITTED state. Only approved, currently valid materials of an active, acknowledged campaign are shown as approved assets.
- Retire outdated prices, inventory claims, discount claims or legal-status claims immediately. A URL is only a pointer; administrators must still validate that hosted asset's permissions and contents are safe/current.

## Incentives and financial controls

- Create each policy as a new version; do not overwrite historical terms.
- Keep policies inactive until the actual business/finance approver, source scope, booking/payment milestone, cancellation/refund handling, authority and effective date are documented.
- Only the designated Admin finance workflow can record incentive status/settlement in this pilot. A payment reference records evidence; it is not bank integration, proof that a bank transfer cleared, or automated tax/accounting reconciliation.
- Never activate an example amount from the PDF solely because it appears in the requirements.

## Privacy requests and approved retention

The application stores access/rectification/deletion requests and their review state; it does not autonomously disclose or erase all linked records on submission. The responsible privacy owner must determine scope, verify the requester, preserve legally-required records, fulfil the request through an approved process, and record evidence/case reference before marking complete.

The retention screen supports three configurable categories only: closed task evidence, completed training assignment text, and rejected/retired marketing content. The PDF provides no retention durations; no duration is pre-approved. Every policy starts inactive and must have a formal legal/privacy approval reference before activation. Retention runs are manually triggered and audit logged; they redact specific evidence/content fields, not rows or entire accounts. They do not delete property bookings, financial ledgers, consent proofs, or audit records.

Before activating retention:
- Obtain written legal/privacy approval for each data category and its duration.
- Confirm the category does not include evidence under dispute, investigation, legal hold, or active business need.
- Run against staging-like sample data and review the affected-row counts.
- Record the operator and approval reference; check the audit event afterwards.
- Have a tested recovery path for accidental or disputed redaction.

## Exports, audit, monitoring and backups

No generic Ambassador OS bulk-export/download endpoint is added by this branch. Keep any existing platform export routes behind appropriate roles, validate filters on the server, prevent cross-Ambassador exports, and audit every export. Do not treat a hidden UI control as an export permission.

Before production, the database/platform owner must configure and verify:
- Automatic backups or point-in-time recovery appropriate to the hosting tier.
- Recovery Point Objective (RPO) and Recovery Time Objective (RTO), approved by the business owner.
- Monitoring for schema/bootstrap failures, repeated 401/403, failed booking updates, consent/duplicate conflicts and retention runs.
- Restricted database/backup access and secret rotation.
- A restore-to-staging drill that validates table counts/constraints, account login, lead/booking reconciliation, incentive-ledger integrity and audit continuity.

**Important limitation:** application code alone cannot prove that the hosting provider's backup, point-in-time recovery, monitoring, retention or access-control settings are enabled. Attach evidence of the successful restore drill and the cloud configuration review to the release record.

## Required staged acceptance tests

Use separate test accounts: platform Admin, Program Manager, Sales Coordinator, Training Coordinator, active Ambassador, and non-active/unverified Ambassador. Test both visible UI behavior and direct API calls. Verify that an unauthorized user receives 403 even if they manually call the endpoint.

Test at minimum:
- Role assignment and revocation changes are effective immediately and audit logged.
- A Training Coordinator cannot read finance payouts or change campaign incentives.
- A Sales Coordinator can handle assigned sales work but cannot activate payout policy or inspect another Ambassador's private payout ledger.
- An Ambassador cannot access another Ambassador's leads, follow-ups, profile or incentives.
- An Ambassador cannot submit a campaign lead before accepting the latest campaign guidelines or without documented customer consent.
- An unapproved/expired marketing asset is not returned by the Ambassador library.
- Duplicate leads and disputed ownership preserve referral history and record review decisions.
- Booking verification/rejection/cancellation/refund updates append history and reconcile sold units without double counting.
- Quiz passing alone does not bypass attendance, rubric, practical and ethics requirements.
- Retention run fails without explicit confirmation, an active formally approved policy and a run approval reference.

Do not move this branch to production until current-head CI passes, the staged acceptance tests pass, and business/finance/privacy/security owners sign off the relevant controls.
