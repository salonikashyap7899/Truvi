# Razorpay Payments — Setup & Go-Live Guide

This integration adds a full pricing + checkout system to truviventures.com using
**Razorpay Standard Checkout**. It is wired **test-first**: nothing charges real
money until you add `rzp_live_*` keys.

## What's included

- **Pricing page** at `/pricing` — three tabs (Buyers · Channel Partners · Developers)
  matching the site's dark/blue theme, with launch-offer strike-through prices.
- **Checkout** — a pre-payment form (name/email/phone) → server-created order →
  Razorpay modal → server-side signature verification → `/payment-success`.
- **Backend** (Express + Drizzle):
  - `POST /api/payments/create-order` — amount decided **server-side** from the plan id.
  - `POST /api/payments/verify` — HMAC-SHA256 signature check before marking PAID.
  - `POST /api/payments/webhook` — raw-body signature-verified, idempotent
    (`payment.captured` / `payment.failed`).
  - `GET  /api/payments` — admin-only transaction list.
  - `GET  /api/payments/config` — public key id + GST % (never the secret).
- **Admin view** at `/admin/payments` (ADMIN login) — all transactions + totals.
- **Legal pages** `/terms`, `/refund-policy`, `/privacy` (required for Razorpay onboarding).
- All money handled in **paise** (integers). Every transaction stored in Postgres (`payments` table).

**Subscriptions** (Buyer/CP/Developer Pro, monthly + yearly) are fully wired via the
Razorpay Subscriptions API. See "Subscriptions setup" below — you run one script to
create the plans, then the Subscribe buttons charge automatically each cycle.

---

## 1. Razorpay dashboard setup

1. Log in at <https://dashboard.razorpay.com> (KYC already complete).
2. Stay in **Test Mode** (toggle, top-left) for now.
3. **Settings → API Keys → Generate Test Key.** Copy `Key Id` (`rzp_test_…`) and `Key Secret`.
4. **Settings → Webhooks → Add New Webhook:**
   - **Webhook URL:** `https://truviventures.com/api/payments/webhook`
   - **Secret:** create a strong random string — you'll put it in `RAZORPAY_WEBHOOK_SECRET`.
   - **Active events:** `payment.captured`, `payment.failed`, `subscription.activated`,
     `subscription.charged`, `subscription.cancelled`, `subscription.completed`.
   - Save.

## 2. Environment variables

Copy `server/.env.example` → `server/.env` and fill in:

```
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_test_key_secret
RAZORPAY_WEBHOOK_SECRET=the_secret_you_set_on_the_webhook
GST_PERCENT=18
```

No frontend env var is needed — the browser fetches the (public) key id from the server.

## 3. Apply the database change

The `payments`, `subscriptions` and `subscription_plans` tables are new. On the server:

```bash
cd server && npx drizzle-kit push
```

## 3b. Subscriptions setup (one time)

Create the Razorpay subscription plans (Buyer/CP/Developer Pro, monthly + yearly)
and store their ids. Run this **after** the keys are in `server/.env`:

```bash
npm --prefix server run razorpay:plans
```

It prints each plan id and is safe to re-run (already-created plans are skipped).
Amounts are created **incl. 18% GST**. After this, the "Subscribe" buttons on
`/pricing` open the Razorpay modal and auto-charge every cycle.

The six plans it creates (base price + 18% GST):

| Plan | Cycle | Base | Charged (incl. GST) |
|------|-------|------|---------------------|
| Buyer Pro | monthly | ₹299 | ₹352.82 |
| Buyer Pro | yearly | ₹1,999 | ₹2,358.82 |
| CP Pro | monthly | ₹999 | ₹1,178.82 |
| CP Pro | yearly | ₹9,999 | ₹11,798.82 |
| Developer Pro | monthly | ₹9,999 | ₹11,798.82 |
| Developer Pro | yearly | ₹99,999 | ₹117,998.82 |

## 4. Deploy & test

```bash
bash deploy.sh
```

Open `/pricing`, pick any paid item, and pay with a **Razorpay test card**:

| Field | Value |
|-------|-------|
| Card number | `4111 1111 1111 1111` |
| Expiry | any future date (e.g. `12/30`) |
| CVV | any 3 digits |
| OTP | `1234` (test) |
| UPI (test success) | `success@razorpay` |

After paying you should land on `/payment-success`, and the row should appear at
`/admin/payments` as **PAID**. The webhook will also mark it PAID independently
(idempotent — no double-processing).

---

## 5. Go-live checklist

- [ ] Verified at least one successful **test** payment end-to-end.
- [ ] Confirmed the row shows **PAID** in `/admin/payments`.
- [ ] Replaced the placeholder copy in `/terms`, `/refund-policy`, `/privacy` with your final legal text.
- [ ] Switched dashboard to **Live Mode** and generated **live** API keys.
- [ ] Updated `server/.env` with `rzp_live_*` `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`.
- [ ] Recreated the **webhook in Live Mode** (live and test webhooks are separate) pointing to
      `https://truviventures.com/api/payments/webhook`, and updated `RAZORPAY_WEBHOOK_SECRET`.
- [ ] Re-ran `npm --prefix server run razorpay:plans` with the **live** keys — subscription
      plans are also separate per mode, so live plans must be created once.
- [ ] Restarted the server (`bash deploy.sh`).
- [ ] Made one small **real** payment to yourself and confirmed it, then refunded it from the dashboard.

---

## 6. What you must do manually

These can't be done from code:

1. **Complete Razorpay KYC** (done) and keep bank/settlement details current.
2. **Generate API keys** (test, then live) in the dashboard.
3. **Create the webhook** in both Test and Live mode with the URL above and a secret.
4. **Add the keys + webhook secret** to `server/.env` on the VPS.
5. **Finalise legal copy** on the three policy pages before going live.
6. **DNS/hosting:** no change — the API and site already run on your VPS behind
   `truviventures.com`; the webhook path is just another route on the same server.

---

## Subscriptions — how it works (already wired)

- Plans are defined in `server/src/config/pricing.ts` (`type: "subscription"`) and
  created in Razorpay by `npm --prefix server run razorpay:plans` (step 3b).
- `POST /api/payments/create-subscription` creates the subscription; the browser
  opens the Razorpay modal with the `subscription_id`.
- `POST /api/payments/verify-subscription` verifies the signature
  (`payment_id | subscription_id`) and marks the row **ACTIVE**.
- The webhook updates status on `subscription.activated/charged` (ACTIVE),
  `subscription.cancelled` (CANCELLED) and `subscription.completed` (COMPLETED).
- All subscriptions are listed at `/admin/payments`.
- **Cancelling:** cancel a subscription from the Razorpay dashboard (Subscriptions →
  select → Cancel); the webhook flips it to CANCELLED here automatically.

To test a subscription: on `/pricing`, click **Subscribe** on any Pro plan, pick
Monthly/Yearly, and authorise with a Razorpay test card. It should appear as
**ACTIVE** under Subscriptions in `/admin/payments`.

## Security notes

- The **key secret never reaches the browser** — only `RAZORPAY_KEY_ID` is public.
- Amounts are **always computed server-side** from the plan id; the client can't set a price.
- Webhook and checkout signatures are verified with **HMAC-SHA256** using `crypto.timingSafeEqual`.
- Webhook handling is **idempotent** — dedupes on `razorpay_payment_id` / order status.
