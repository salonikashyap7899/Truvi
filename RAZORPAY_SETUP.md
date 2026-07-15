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

> **Subscriptions** (Buyer/CP/Developer Pro) are shown but route to WhatsApp support
> for now — one-time payments are fully live. See "Enabling subscriptions later" below.

---

## 1. Razorpay dashboard setup

1. Log in at <https://dashboard.razorpay.com> (KYC already complete).
2. Stay in **Test Mode** (toggle, top-left) for now.
3. **Settings → API Keys → Generate Test Key.** Copy `Key Id` (`rzp_test_…`) and `Key Secret`.
4. **Settings → Webhooks → Add New Webhook:**
   - **Webhook URL:** `https://truviventures.com/api/payments/webhook`
   - **Secret:** create a strong random string — you'll put it in `RAZORPAY_WEBHOOK_SECRET`.
   - **Active events:** `payment.captured`, `payment.failed`.
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

The `payments` table is new. On the server:

```bash
cd server && npx drizzle-kit push
```

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

## Enabling subscriptions later

The Pro plans are defined in `server/src/config/pricing.ts` as `type: "subscription"`.
To turn them on:

1. In the Razorpay dashboard, **create Plans** (Subscriptions → Plans) for each Pro tier
   and note the `plan_id`s.
2. Add a `razorpay.subscriptions.create({ plan_id, ... })` flow (mirrors `create-order`),
   store the subscription id on the `payments` row, and handle the
   `subscription.charged` webhook event (already accepted with a 200 today).
3. Point the "Subscribe" buttons at that flow instead of WhatsApp.

## Security notes

- The **key secret never reaches the browser** — only `RAZORPAY_KEY_ID` is public.
- Amounts are **always computed server-side** from the plan id; the client can't set a price.
- Webhook and checkout signatures are verified with **HMAC-SHA256** using `crypto.timingSafeEqual`.
- Webhook handling is **idempotent** — dedupes on `razorpay_payment_id` / order status.
