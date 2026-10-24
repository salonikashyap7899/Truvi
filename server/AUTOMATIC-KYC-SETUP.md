# Truvi automatic KYC setup

Truvi can send customers to IDfy's hosted identity-verification journey and poll the provider's final result. User dashboard access remains locked until the provider returns an explicit approval. Uploading a document, a valid-looking Aadhaar/PAN number, or merely opening the capture link is not approval.

## Provider account required

Create/enable a Profile Gateway account with IDfy and obtain the API key, account ID, and workflow ID from IDfy. The workflow is account-specific; IDfy's docs say the workflow ID is supplied by their team. The workflow must be set up to run the role-appropriate document validation, source verification, selfie liveness/face checks, and automatic final decision. Do not configure a human-review-only workflow if the goal is straight-through auto-approval for passing checks.

Official documentation:
- https://api-docs.kyc.idfy.com/
- https://www.idfy.com/identity-verification-solutions-by-idfy/kyc-verification/

## Environment variables

Set these in the server environment (for this VPS, the private `server/.env` file is one option). Never put these values in the browser or commit them to Git:

```dotenv
IDFY_KYC_API_KEY=replace_with_real_IDfy_api_key
IDFY_KYC_ACCOUNT_ID=replace_with_real_IDfy_account_id
IDFY_KYC_WORKFLOW_ID=replace_with_configured_default_workflow_id
```

Optional role-specific workflow IDs override the default for that role:

```dotenv
IDFY_KYC_WORKFLOW_ID_BUYER=...
IDFY_KYC_WORKFLOW_ID_DEVELOPER=...
IDFY_KYC_WORKFLOW_ID_CP=...
IDFY_KYC_WORKFLOW_ID_AMBASSADOR=...
```

Every workflow ID used must belong to the same configured IDfy account. Configure a workflow that collects and checks the required evidence for that role; Truvi's ambassador flow preserves the existing PAN exemption.

## User flow

1. A customer opens the KYC gate and starts the hosted verification flow.
2. Truvi records the IDfy profile reference and opens the provider's secure capture page in another tab.
3. While the user is in Truvi, the client polls the authenticated status endpoint every six seconds.
4. Only an explicit approved result updates the user's KYC flags and issues a refreshed access token. An explicit rejection is stored with a bounded reason. In-progress, ambiguous, unavailable, or unconfigured states stay locked and can be retried.

The credentials are optional in code to keep existing deployments bootable, but automatic KYC will not work until real credentials and a suitable workflow are configured. Without them, legacy Channel Partner/Ambassador submissions still follow the existing manual review path; Buyer/Developer workspaces remain gated rather than bypassing identity checks.

## Required rollout checks

- Test passing, rejected, and inconclusive provider profiles in the IDfy test environment.
- Confirm that an approval unlocks a dashboard without signing out or refreshing the page.
- Confirm an unverified account receives HTTP 403 on protected role APIs.
- Confirm admin routes still work and that no provider secret or raw identity document is exposed in logs/responses.
- Never test with real Aadhaar/PAN details unless you have appropriate authorization and consent.
