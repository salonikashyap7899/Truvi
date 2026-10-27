# Truvi Ambassador Operating System — Pilot Runbook

## What this adds

The pilot is integrated into the existing Truvi web application and retains the current authentication, inventory, lead/referral, notification and administration flows.

- Ambassador workspace: `/ambassador/operating-system`
- Internal certificate: `/ambassador/certificate`
- Admin workspace: `/admin/ambassador-operating-system`
- API prefix: `/api/ambassador-os`

## Rollout order

1. Deploy the reviewed code to a staging environment first.
2. Confirm the application database is reachable and the server's existing idempotent schema bootstrap has completed successfully. Verify all `ambassador_os_*` tables and the three new lead-consent columns exist before testing the UI.
3. Sign in as an Admin and confirm existing Ambassador accounts appear in the directory. Their OS profiles are added without deleting or rewriting existing lead/referral records.
4. Sign in as a test Ambassador and complete the program profile, accept the displayed terms and complete the existing Truvi identity/onboarding verification flow.
5. Complete the seven learning modules in sequence. Quiz keys are server-side; 80/100 is necessary but not sufficient. A coordinator must independently approve practical and ethics assessments for every day.
6. Confirm the final approved assessment creates an internal certificate. Use **Print / Save PDF** to export it.
7. From Admin, assign a task and test submission, rejection with a required reason, and approval.
8. Configure a campaign linked to an existing Truvi project. The campaign must remain Planned until the project is Admin-approved, Truvi-verified, has a current price list, has at least the required count of available units, and the Admin records source/document review notes. Activate only after verifying those facts outside this UI.
9. Create incentive policy versions as inactive. Use the recorded written approval reference only after the responsible business/finance approver has approved the actual terms. In Admin, select an Ambassador to load the eligible registered/completed sales list; the form deliberately does not ask staff to paste a raw lead UUID.
10. Test the entire payout state sequence with a non-production sale: Pending → Approved → Payable → Paid. A payment receipt/reference is required for Paid.
11. Check role boundaries with separate Admin, verified/active Ambassador, and unactivated Ambassador accounts. Confirm other Ambassadors cannot read each other's leads or incentive ledger.
12. From the Ambassador workspace, download the JSON data export. Verify it contains only that account's OS data, excludes buyer names/contact details and CRM/follow-up free text, and records an audit event. Confirm the exported data does not contain password or authentication secrets.

## Important business rules

- The Paradise Town project name and targets (114 units, 1,250 sq ft and 60 days) are planning defaults from the operating-system blueprint—not verified property claims. They must be linked to the actual Truvi project and current inventory before publication.
- The proposed ₹1 lakh per 1,000 sq ft incentive stays inactive unless there is a formal written approval. Do not activate an example policy just because the form pre-fills an amount.
- Historical/draft Level 2 or Level 3 referral percentages are not activated by this implementation. Use only a separately approved current policy.
- The operating-system leaderboard's pilot point weights are implementation defaults that need business-owner approval before being used for incentives or promotions. The score is internal recognition only, not a commission formula or promise of earnings.
- The certificate is internal Truvi training evidence, not a government licence, academic degree or guarantee of employment.
- A task submission, enquiry or booking by itself does not make an incentive payable; the sale must meet the eligibility checks and the payout must be approved and recorded.

## Verification completed in this branch

The dedicated GitHub Actions workflow runs:
- `npm ci` + `npm run typecheck` in `server`
- Ambassador Operating System business-rule unit tests
- `npm ci` + `npm run build` in `client`

A green CI run is not a substitute for staging database verification, permission testing, a production security review, or a finance/business policy sign-off.

## Rollback

Do not manually drop the new tables or columns during an application rollback; keep these additive structures and their records unless a reviewed data-retention plan specifically calls for removal. Roll back application code using the platform's usual release procedure. Because schema additions are additive, the previous app version should continue to operate without consuming the new OS tables.

## Known pilot boundaries

- The dashboard extends the existing lead pipeline rather than introducing a parallel CRM data model.
- Career-level changes are Admin-controlled and recorded in audit metadata; they are not automatic promotions.
- Incentive policy approval references are evidence fields, not a digital-signature service. Finance should use its existing formal approval process.
- Automated CI compiles/tests the code but does not exercise the live Postgres schema or end-to-end UI with production identities.
