# Truvi — India Compliance Release Gate

**Review date:** 5 November 2026  
**Purpose:** engineering and operational checklist for Indian-law readiness.  
**Status:** implementation aid only; not legal advice, a compliance certificate, or proof that Truvi is compliant.

## What this branch changes

- Adds a public grievance submission route that does not require an account.
- Gives each complaint a case number and immediate acknowledgement status.
- Sends a privacy-minimised email acknowledgement with the case number and summary; the full complaint stays in the restricted case system. Email failure does not discard the case.
- Routes public complaints into the existing administrator Compliance Centre.
- Records complainant contact data and the privacy-notice version/acknowledgement separately from an optional account ID.
- Sets a 15-calendar-day internal response target to support a stricter operational workflow. This is an internal target, not a statement that every complaint is governed by the same statutory deadline.
- Removes a hard-coded 18% GST statement from generic Terms. Tax must be determined per service, registration, place of supply and CA-approved treatment.
- Replaces the duplicate, abbreviated Legal & Methodology privacy/terms text with links to the canonical policy pages.
- Adds environment-driven statutory disclosure fields. No director, officer, CIN, registered office or RERA number is invented.

## Required public build-time disclosures

Populate these in the **client build environment** (for a VPS build, client/.env or the environment used by npm run build). These are public details and will be included in the website bundle. Do not put credentials or secrets in them.

| Variable | Required evidence |
|---|---|
| VITE_LEGAL_ENTITY_NAME | Exact legal name from MCA/LLP records or other constituting document |
| VITE_REGISTERED_OFFICE_ADDRESS | Exact registered office from current statutory record |
| VITE_COMPANY_CIN_OR_LLPIN | CIN/LLPIN where applicable; otherwise obtain advice on correct entity disclosure |
| VITE_COMPANY_GSTIN | Current GSTIN only if the disclosed supplier is registered for GST |
| VITE_COMPANY_BRANCH_ADDRESSES | Current branches relevant to customer service / statutory disclosures, if any |
| VITE_CUSTOMER_CARE_PHONE | Monitored customer-care number |
| VITE_GRIEVANCE_OFFICER_NAME | Person formally appointed and authorised to handle grievances |
| VITE_GRIEVANCE_OFFICER_DESIGNATION | Correct designation |
| VITE_GRIEVANCE_OFFICER_EMAIL | Monitored grievance email address |
| VITE_GRIEVANCE_OFFICER_PHONE | Monitored grievance phone |
| VITE_UP_RERA_AGENT_REGISTRATION | Verified registration number only if counsel confirms Truvi acts as an agent and registration is required |

The site must not publish placeholder values. If a variable is not known, obtain the evidence first; do not enter a made-up value or another person's details without appointment/authority.

### Server-side GST configuration (keep disabled until CA approval)

The backend deliberately defaults tax collection to 0%. Do not infer that 18% applies to every Truvi service. Until the company has a valid GST registration and its CA has confirmed the service-wise classification, rate, place of supply, invoice treatment and who is the supplier, keep these in `server/.env`:

```env
GST_REGISTERED=false
GSTIN=
GST_PERCENT=
```

Only change these after written CA confirmation. `GSTIN` must be the registered supplier's valid GSTIN; `GST_PERCENT` must be the CA-approved rate for every service that uses this global configuration. If rates differ by service or transaction type, do not use one global percentage—implement and test a service-wise tax matrix first. Existing Razorpay recurring plan mappings may need to be refreshed after an approved amount/tax change; the new subscription route blocks a mismatch, and the plan-refresh script creates a new Razorpay plan rather than modifying existing active subscriptions.

## Legal and business decisions that code cannot make

1. **Operating model:** obtain a written legal classification for Truvi's own plot/villa sales, third-party developer listings, buyer leads, CP/ambassador referrals, and any transaction facilitation. The RERA promoter, real-estate-agent and platform obligations differ.
2. **RERA:** verify Truvi's agent registration where required; verify each project in the relevant State RERA register, including phase and validity. Where registration is not required, retain the statutory exemption/approval evidence. Never infer that a project is compliant from a developer-entered number.
3. **Entity disclosure:** verify legal entity, registered office, CIN/LLPIN, contact channels and branch addresses from source records.
4. **Tax:** obtain CA approval for GST registration, SAC, rate, place-of-supply, invoice numbering, credit notes, refunds and e-invoice applicability. Generic Terms no longer assume 18%.
5. **KYC/Aadhaar:** have counsel/UIDAI-specialist confirm lawful collection and offline verification route, necessity, masking, consent, access and retention. The app's manual KYC review is not government Aadhaar authentication.
6. **Privacy:** approve purposes, legal bases, processor/subprocessor contracts, hosting/data locations, retention schedule, erasure exceptions, rights handling and breach communications.
7. **CERT-In:** name a Point of Contact; verify required ICT logs are securely retained for 180 days within India; maintain a 24x7 escalation process and six-hour reportability assessment for specified incidents.
8. **Consumer/e-commerce classification:** if covered by the Consumer Protection (E-Commerce) Rules, confirm entity/seller disclosures, complaint acknowledgement within 48 hours and redress within one month, seller/project information, rankings and sponsored-listing labels, checkout consent, cancellation/refunds and dark-pattern review. The 2026 amendment takes effect on 1 January 2027. The public grievance form in this branch creates a case and acknowledgement; staff must actually operate the queue and meet the legally applicable response timeline.
9. **Intermediary classification:** if user-provided listing/noticeboard content makes Truvi an intermediary, obtain counsel's Rule 3 assessment and operate the applicable 24-hour acknowledgement / 15-day grievance response process, including legal-order/takedown handling.
10. **Employment, POSH, TDS/PMLA and telecom:** applicability depends on workforce size/location, actual relationship/transactions and commercial messaging setup. Obtain professional review and operational evidence.

## Regulatory timing to track

- DPDP Act/Rules commencement is phased. Under the 13 November 2025 notifications, Rule 4 of the DPDP Rules and the corresponding specified Act provisions commence on **13 November 2026**. The principal processing provisions and Rules 3 and 5–16 are scheduled for **13 May 2027**. Confirm corrigenda and notifications before each release.
- Consumer Protection (E-Commerce) (Amendment) Rules, 2026 are scheduled to commence **1 January 2027**.
- RERA requirements depend on project, state rules, exemptions and Truvi's actual role.

## Deployment / operational verification

- Review this branch and merge only after CI passes.
- Configure the public legal disclosures before production release.
- After deployment, submit a test grievance from a non-logged-in browser using an address controlled by Truvi; confirm the case number, acknowledgement email, support inbox notification and administrator queue. Test public replies/updates and case closure.
- Confirm no email/phone/complaint details appear in public logs or telemetry.
- Verify RERA details and project approval evidence in UP RERA / the relevant State authority.
- Run database permission and backup audits separately. Do not run the public API role lockdown on production until staging has passed all workflows.
- Complete a backup and file-store restore drill.
- Obtain written lawyer/CA approvals and retain evidence.

## Official references

- DPDP Act commencement notification G.S.R. 843(E), 13 November 2025: https://egazette.gov.in/WriteReadData/2025/267647.pdf
- DPDP Rules, 2025 and enforcement timeline: https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa
- Consumer Protection (E-Commerce) Rules and 2026 amendments: https://consumeraffairs.gov.in/pages/consumer-protection-acts
- PIB summary and 1 January 2027 commencement: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2308759
- CERT-In directions: https://www.cert-in.org.in/Directions70B.jsp
- UP RERA project/agent verification: https://www.up-rera.in/verify
- UP RERA registration portal: https://up-rera.in/RegHome
- CBIC GST invoice Rule 46: https://cbic-gst.gov.in/gst-invoice-rules.html

**Release rule:** never say “100% compliant”, “DPDP certified”, “RERA verified” or “100% secure” solely because a code check passes. The responsible management, lawyer, CA and security reviewer must approve the applicable facts and operations.
