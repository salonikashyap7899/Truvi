# India compliance release gate — Truvi

**Baseline:** 4 November 2026  
**Status:** Technical readiness checklist only. This is not legal advice, a statutory filing, or a compliance certificate.

Truvi sells/lists or helps customers discover real-estate plots and villas, collects leads and customer data, offers paid digital services, and has developer/channel-partner/ambassador/employee workflows. The law that applies depends on the actual contracting entity, the role Truvi plays in each property transaction, the states in which it operates, and how the services and data are used. Do not make a public “fully compliant” or “100% secure” claim based on code changes alone.

## 1. Public company and grievance disclosures — release blocker

The legal pages read values from Vite build-time variables. Configure these in `client/.env.production` on the VPS/build host (or in the secure build environment) before the next production build. This local file is Git-ignored; do not commit it. All `VITE_*` values become public in the browser bundle, so put only public contact/legal facts here, never secrets:

- `VITE_LEGAL_ENTITY_NAME` — exact legal name from MCA/company records, not the brand name unless they are identical.
- `VITE_REGISTERED_OFFICE_ADDRESS` — complete registered-office address from the latest company record.
- `VITE_PRINCIPAL_OFFICE_ADDRESS` — principal geographic business/headquarters address shown to users, verified against company records.
- `VITE_BRANCH_ADDRESSES` — one confirmed branch-office address per line; include all branches or document that there are none.
- `VITE_COMPANY_CIN` — exact CIN from MCA master data, if the operator is a company.
- `VITE_CUSTOMER_CARE_EMAIL` — monitored customer-care email.
- `VITE_CUSTOMER_CARE_PHONE` — monitored customer-care phone.
- `VITE_GRIEVANCE_OFFICER_NAME` — actual person formally designated for the applicable grievance role.
- `VITE_GRIEVANCE_OFFICER_DESIGNATION` — their actual designation.
- `VITE_GRIEVANCE_OFFICER_EMAIL` and `VITE_GRIEVANCE_OFFICER_PHONE` — monitored contact details.
- `VITE_ECOMMERCE_NODAL_PERSON_NAME`, `VITE_ECOMMERCE_NODAL_PERSON_DESIGNATION`, `VITE_ECOMMERCE_NODAL_PERSON_EMAIL`, `VITE_ECOMMERCE_NODAL_PERSON_PHONE` — the India-resident nodal person / alternate senior designated functionary if Truvi is legally an e-commerce entity.

The `VITE_*` values are public website disclosures, not secrets. Never put passwords, API keys, database URLs, or access tokens in them. Do not invent a CIN, registered-office address, legal name, officer name, or contact details. Verify the company identity and office from MCA records before publication.

The legal pages now show a visible “not configured” warning until the required company/officer fields are supplied. Do not suppress that warning with placeholder or made-up values.

Where the Consumer Protection (E-Commerce) Rules apply to Truvi's operating model, the website must publish the required entity and grievance details and operate the prescribed consumer complaint handling. The current engineering workflow creates a case with SUBMITTED status, sends a best-effort acknowledgement with a copy of the complaint to verified-user email, and marks it ACKNOWLEDGED only when the email provider accepts the message. Provider acceptance is not proof of inbox delivery. The admin queue shows the 48-hour / one-month targets. If email is unverified or delivery fails, authorised staff must acknowledge manually within the applicable deadline. Complaints received from non-account holders by email/phone are not automatically created as in-app cases; staff must register and track them in the organisation's grievance register. From 1 January 2027, where the 2026 E-Commerce Amendment applies, the grievance officer must also provide the complainant a copy of the complaint as recorded.

## 2. GST and tax — currently disabled in checkout

The application now defaults to **no GST added by Truvi checkout**. This is deliberate: an unregistered person must not collect an amount as GST. A valid GST registration, correct supplier identity, service classification/place-of-supply decision, tax rate, invoices/credit notes and filing process must be confirmed with a Chartered Accountant before tax is enabled.

Do not set these variables unless the operating entity has active GST registration and the CA approves the rate and treatment:

```env
GST_COLLECTION_ENABLED=true
GSTIN=the_supplier_gstin_from_the_registration_certificate
GST_PERCENT=the_ca_approved_rate
```

Keep the current safe state while unregistered:

```env
GST_COLLECTION_ENABLED=false
GST_PERCENT=0
```

When the flag is false, any stray `GST_PERCENT=18` is ignored and the application calculates zero GST. If the flag is true, production startup fails unless the GSTIN format and a positive approved rate are supplied. A syntactically valid GSTIN is not proof that registration is active or that the rate is legally correct.

The applicable GST registration threshold and compulsory-registration exceptions depend on the supply and business facts. A CA must review turnover across the PAN, the type/place of supply, any interstate supply, any agency/commission model, and CGST Act sections 22 and 24. Section 22 generally sets a ₹20 lakh aggregate-turnover threshold for taxable suppliers in most states, but Section 24 has compulsory-registration categories and other exceptions/notifications must be assessed. Do not infer that being below a threshold always removes registration obligations. Do not collect GST until registered; Section 32 prohibits an unregistered person from collecting an amount by way of GST. A registered supplier's tax invoice must contain the applicable Rule 46 particulars, including supplier name/address/GSTIN and invoice details.

The current application has one global `GST_PERCENT` for its checkout, marketing payment and commission calculation paths. Use it only if the CA confirms that every payment path enabled under this configuration has the same lawful tax rate and treatment. If digital subscriptions, agency commissions, platform fees or other supplies require different classifications/rates or place-of-supply treatment, keep the global flag disabled and implement a reviewed per-supply tax mapping before collecting any tax.

The old database platform-setting field is no longer the checkout tax source; admin settings show the server-side tax state read-only. Marketing/offline payment records also use the server tax rate, not a client-submitted percentage. Check any separate payment, referral, commission, subscription or manual ledger flow with the CA before launch.

After changing the approved tax configuration, run `cd server && npm run razorpay:plans` before reopening new recurring subscriptions. The script creates new Razorpay plan IDs when the mapped amount differs and updates the internal mapping. Razorpay does not delete old plans. Existing active subscriptions remain on their old provider plan/amount; do not silently change or cancel them. Review each affected contract, disclose any price/tax changes, obtain any required customer consent, and use a provider-supported migration/cancellation flow. The API returns a conflict instead of starting a new subscription while its stored Razorpay plan amount is stale.

## 3. Real-estate and RERA — project-by-project legal verification

Before listing, advertising, referring, booking or facilitating a property transaction, obtain a written legal determination of Truvi's role and any role played by channel partners/ambassadors. If Truvi or a partner is acting as a real-estate agent for a project requiring registration, verify the required agent registration (including UP RERA where applicable). Verify each project’s promoter, phase, RERA registration and validity, or document the legal basis and evidence for any exemption/other competent-authority approval.

The project RERA card is intentionally labelled “Marked as registered”, not “verified”. It warns that developer-entered project data is not a live RERA certificate. A missing RERA number is not by itself proof that a project is illegal; equally, a claimed exemption or a non-RERA approval must be evidenced and checked with the competent authority. The current code does not independently query UP RERA or verify land title, ownership, encumbrances, land use, sanctioned layout, building approvals or advertising particulars.

Required evidence per project:
- Legal promoter/seller name and authority to market/sell.
- Project/phase registration number, authority, validity and official source/reference where RERA applies.
- If exempt, the exact statutory exemption and supporting order/records.
- Approved layout/land-use/permission records as appropriate to the project.
- Person who reviewed the evidence and review date.
- Required RERA/advertising disclosures on the listing/ad, checked against the project and state rules.

No listing or disclaimer substitutes for the registrations and truthful disclosures required by law.

## 4. Privacy, identity and KYC

The main Privacy Policy describes buyer, developer, partner, employee, KYC, payments, communications, analytics and AI data flows. The separate Legal & Methodology page now links to that canonical policy instead of publishing a contradictory short privacy promise. Signup requires Terms acceptance and Privacy Policy acknowledgement; marketing permission is optional and separate.

The KYC UI no longer asks users to type a full Aadhaar number. It asks for a masked Aadhaar (first eight digits hidden) or another accepted identity document, records an acknowledgement/version, and explains that the current review is manual and is not UIDAI authentication or a government-database check. The acknowledgement is a declaration; the application does **not** technically inspect every image/PDF to prove Aadhaar masking. Reviewers must check this before approval and request a properly masked replacement if necessary. Review existing records created before this change; do not assume legacy scans are masked. Restrict access and apply a documented retention/deletion schedule. Do not request Aadhaar OTPs or biometric data through Truvi.

Before launch:
- Confirm each KYC field is necessary for the role and purpose; document the legal basis and alternatives.
- Verify Aadhaar collection/offline-verification process against UIDAI requirements; do not claim UIDAI authentication or DigiLocker validation without approved integration/authority.
- Review retention, deletion, processor access and incident processes for identity documents.
- Ensure the KYC/consent audit does not log full ID values or document content.

## 5. Consumer and advertising controls

Obtain legal advice on whether each Truvi feature makes the business an e-commerce entity, marketplace, intermediary, advertising/listing service, real-estate agent, promoter, or technology/SaaS vendor. The answer may differ between subscription sales, public listings, referral activity and property bookings.

Where applicable, review the Consumer Protection Act, E-Commerce Rules, CCPA misleading-advertising/dark-pattern guidance and the 2026 E-Commerce Amendment Rules (scheduled to commence 1 January 2027). Before launch, verify:
- Seller/promoter/legal-entity disclosures and customer-care / grievance information.
- Clear all-inclusive checkout price and applicable tax before affirmative purchase.
- Cancellation, subscription renewal and refund terms; a policy must not waive statutory consumer rights.
- Sponsored-result and ranking disclosures where applicable.
- No false “verified”, “approved”, “guaranteed return”, scarcity, countdown or discount claims.
- No pre-ticked marketing consent, disguised ads, forced action, or other dark patterns.

The Terms and Refund pages have been revised to remove a blanket 18% GST claim and avoid blanket non-refund wording, but a lawyer and CA must approve the final wording against Truvi's real offerings and payment flows.

## 6. Cybersecurity and incident readiness

CERT-In directions require covered entities to maintain specified ICT logs for a rolling 180 days within Indian jurisdiction, synchronise system clocks, designate a Point of Contact, and report specified cyber incidents within six hours of noticing them. App-level Sentry/logging does not prove compliance by itself.

Assign a named CERT-In point of contact and 24x7 escalation route. Confirm the actual region and log/backup location for Hostinger, Supabase, email/SMS, payment, maps, AI and telephony providers. Confirm the 180-day log period and retrieval process, preserve evidence, and rehearse the six-hour escalation/report decision. Obtain the current CERT-In directions and legal advice on whether each entity/system is covered.

Also complete:
- Admin MFA / step-up controls for privileged actions.
- Independent security/penetration test and remediation retest.
- Cross-account/role/object access tests, upload content validation and malware scanning.
- Production secret rotation, least privilege and database privilege audit.
- Alert ownership and response coverage.

## 7. Supabase Free plan and recovery

The current Supabase Free plan does not provide the Pro plan's daily automatic database backups. Until an upgrade or another backup service is active, implement encrypted off-site database dumps and a documented schedule, access controls, retention, failure alerts and restore drills. Database dumps do not include Supabase Storage objects; back up project media and private buyer/KYC documents separately.

A green backup inventory is not a restore test. Restore to a separate staging project and verify users, projects, inventory, requirements, leads, site visits, payments, consent/audit and document references. Never test by restoring over production. Do not run the public API role-lockdown utility on production until a staging clone has been tested against every frontend, PostgREST, Edge Function and integration workflow.

## 8. DPDP readiness dates

The Digital Personal Data Protection Act and DPDP Rules have phased commencement. As of 4 November 2026, the Rule 4 / section 6(9) commencement date is 13 November 2026; Rule 4 concerns Consent Manager registration, not a general website-consent deadline. The main processing obligations in sections 3–17 and the principal operational rules are scheduled for 13 May 2027. Prepare now for itemised notices, purpose limitation, consent where relied upon, rights/grievance handling, processor contracts, reasonable safeguards, breach response, children's data, retention and deletion. Re-check official notifications and legal advice before each release.

## 9. Go-live approval checklist

- [ ] Legal operator name, legal form, registered office, principal office and branch addresses checked against current records; add CIN only if the operator is a company, or the applicable identifier for another legal form.
- [ ] Real named Grievance Officer designated if required; email/phone monitored; public disclosures completed.
- [ ] Principal office/headquarters and all branch addresses verified and displayed where required; if Truvi is covered as an e-commerce entity, India-resident nodal person details are published.
- [ ] Truvi's real-estate agent / marketplace / e-commerce / intermediary role assessed in writing.
- [ ] Truvi and channel partner registration requirements checked; each project's RERA status or exemption evidenced.
- [ ] GST registration and tax treatment signed off by CA; GST collection remains disabled unless that approval and valid GSTIN exist.
- [ ] Refund/cancellation and pricing wording reviewed by counsel and CA.
- [ ] Privacy/KYC notices, consent and retention schedule checked against actual data flows and providers.
- [ ] CERT-In applicability, POC, 180-day log location/retrieval and incident drill evidenced.
- [ ] Database grants/RLS, uploads, roles and cross-account access tests passed.
- [ ] Off-site database and file backups are configured and a restore drill passes.
- [ ] Independent penetration test and remediation retest completed.
- [ ] Release is approved by Truvi management, Indian real-estate counsel and CA.

**Release rule:** until the factual company fields, grievance officer and project/business-model checks are complete, public legal pages will deliberately show “not configured”. Do not suppress that warning with invented data. Do not call Truvi fully compliant or certified until the applicable legal and operational evidence is complete.
