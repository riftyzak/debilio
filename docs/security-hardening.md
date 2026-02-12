# Security hardening notes

## New database objects

Run `migrations/20260212_security_claim_tokens.sql` in Supabase.

It creates:

- `claim_tokens`: single-use, expiring browser claim tokens
- `processed_events`: Stripe webhook idempotency table (`event_id` primary key)

## New environment variables

Set these in Cloudflare Pages Functions environment:

- `FULFILL_INTERNAL_SECRET`: required by internal `/api/fulfill` calls
- existing required vars still apply:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `KEY_SECRET`
  - `DELIVERY_ENC_KEY_B64`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `COINBASE_WEBHOOK_SECRET` (if Coinbase flow is enabled)
  - `RESEND_API_KEY`
  - `EMAIL_FROM`

## Secure success-page flow

1. Stripe webhook verifies signature + timestamp tolerance.
2. Webhook fulfills order via internal `/api/fulfill`.
3. Fulfillment creates a one-time `claim_...` token (30 minute expiry), stores it in `claim_tokens`, and emails:
   - keys
   - `/rosina-shop/success.html?claim=...` link
4. Browser reveals keys only via `POST /api/claim`.

`/api/claim` marks token as used before keys are returned.

## Node modules hygiene

`node_modules/` is already ignored in `.gitignore`.

If `node_modules` was ever tracked in another branch/history, untrack it with:

```bash
git rm -r --cached node_modules
git commit -m "Remove node_modules from repository"
```

Use lockfiles and deterministic install:

```bash
npm ci
npm audit --audit-level=high
```

## Rate limit scope

Rate limiting is implemented in this repository for:

- `/api/auth/*`
- `/api/redeem`
- `/api/claim`

Checkout session/charge creation currently goes through Supabase Edge Functions
(`create-stripe-session`, `create-coinbase-charge`) that are outside this repository.
Apply equivalent limits there in production.
