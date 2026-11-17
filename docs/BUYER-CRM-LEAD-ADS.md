# Private buyer CRM and Meta Lead Ads

The admin Buyer CRM brings incoming ads, team-entered calls/WhatsApp enquiries, and registered buyer interests into one private workspace at `/admin/buyer-crm`.

## Meta Page connection

The API exposes `GET` and `POST https://<API_ORIGIN>/api/webhooks/meta-leads` for Meta's Page `leadgen` webhook. It verifies Meta's challenge and checks each notification's `X-Hub-Signature-256` against the raw body before fetching the submitted lead. `provider_lead_id` is unique, so Meta retries do not create duplicate CRM entries.

Configure these variables on the API host. Do not add their values to Git or send them in chat:

| Variable | Value |
| --- | --- |
| `META_LEADS_VERIFY_TOKEN` | A strong random string. Enter the same value as the webhook's Verify Token in Meta. |
| `META_LEADS_APP_SECRET` | The Meta app secret used to verify signed notifications. |
| `META_LEADS_ACCESS_TOKEN` | A Page access token authorized to read lead details for the subscribed Page. |
| `META_GRAPH_API_VERSION` | A currently supported Graph API version, for example `v27.0`. |

In Meta for Developers, configure the app's Webhooks product for the **Page** object, subscribe it to the **`leadgen`** field, and subscribe the app to the Page that runs the ads. Use the HTTPS endpoint above and the matching verify token. Give the app the Meta permissions needed to manage Page subscriptions and retrieve leads, and complete any app review/business verification required by Meta for the real Page. Meta's setup instructions are in [Webhooks for Lead Ads](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-leadgen).

The webhook captures name, phone, email, project, property type, location, budget, purpose, timeline, and requirement fields when present. Project answers match an approved project ID or exact project name. Include an explicit consent question whose field name is `contact_consent`, `consent_to_contact`, `marketing_consent`, `agree_to_contact`, or `consent`; only a clear affirmative answer enables contact actions. Other imported leads remain visible but marked as needing permission. Call and WhatsApp leads can be entered with the **Add buyer** form. Google Ads are supported as a manual source; they need a separate Google webhook integration for automatic fetch.

## Production rollout

This feature creates `buyer_crm_leads` and `buyer_crm_activities` through the server's boot-time schema setup. Before deploying a release that applies the schema in production, follow the production backup and staging restore steps in [MAINTENANCE.md](../MAINTENANCE.md#7-database-changes-and-backups). Then add the Meta variables to the API host, configure the Meta Page webhook, and verify a real test lead appears in the private CRM before spending against the integration.
