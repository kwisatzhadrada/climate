# Staging Validation Checklist

Run this against a staging deployment set up per
[`STAGING_DEPLOYMENT.md`](./STAGING_DEPLOYMENT.md). Each section is
independently checkable — record Pass/Fail and notes as you go, and paste
the completed table into the tracking issue/PR for this validation pass.

**A note on authenticated requests below**: the app authenticates via
Supabase's SSR cookie session, not a bearer token, so `curl` commands for
already-logged-in actions need that session's cookies. The easiest way to
get them: open the deployed app in a browser, log in, open DevTools →
Network tab, perform the action once through the UI, then right-click the
request → **Copy as cURL** (or Copy → Copy as cURL (bash)). That gives you
a fully authenticated command you can re-run or modify (e.g. repeat with a
different `Idempotency-Key`, or loop it for the rate-limit test) without
reimplementing the auth flow yourself.

Two separate user accounts are needed for §13 (RLS) — create both up front
(e.g. `qa+a@yourdomain.test`, `qa+b@yourdomain.test`).

---

## 1. Signup / login

**Steps**: Go to `/signup`, create an account with a real (or real-ish,
inbox-reachable) email + password. Confirm via the emailed link. Log in at
`/login`.

**Expected**: Signup shows "check your email"; confirmation link redirects
successfully; login redirects to `/dashboard`.

- [ ] Pass / Fail: ______

## 2. Profile row created automatically

**Verification** (Supabase SQL editor):
```sql
select id, email, subscription_tier, created_at
from public.profiles
where email = 'qa+a@yourdomain.test';
```

**Expected**: exactly one row, `subscription_tier = 'free'`, `id` matches
the user's `auth.users.id`.

- [ ] Pass / Fail: ______

## 3. Property creation succeeds

**Steps**: On `/dashboard/properties/new`, submit a label ("Test Home") and
a real address or city (e.g. "Austin, TX").

**Expected**: Redirected to the new property's detail page; property also
appears on `/dashboard`.

**Verification**:
```sql
select id, label, address, lat, lon, created_at
from public.properties
where user_id = '<user A id>'
order by created_at desc limit 1;
```
`lat`/`lon` should be non-null and roughly match the address (geocoding
succeeded).

- [ ] Pass / Fail: ______

## 4. Property photo upload succeeds

**Steps**: Repeat property creation, this time attaching a photo (JPEG/PNG
under 5MB).

**Expected**: Property detail page shows the photo thumbnail.

**Verification**: Supabase Storage → `property-photos` bucket →
`<user id>/...` contains the uploaded file; `properties.photo_url` for that
row is a reachable HTTPS URL (paste it into a browser tab directly).

- [ ] Pass / Fail: ______

## 5. Weather data retrieval succeeds

**Steps**: On a property's detail page, click **Generate risk report**.

**Expected**: No error toast; request completes (may take 5-20s for the AI
call).

**Verification**:
```sql
select lat_bucket, lon_bucket, fetched_at
from public.climate_cache
order by fetched_at desc limit 1;
```
A row exists for a bucket matching the property's rounded lat/lon — confirms
Open-Meteo was actually reached (geocoding, forecast, and historical-extremes
calls all happen inside this step; if any failed, report generation would
have errored instead of succeeding).

- [ ] Pass / Fail: ______

## 6. Report generation succeeds

**Expected** (continuing from §5): the property detail page now shows a
populated report — overall risk score, 3-5 risk category cards, a 4-6 step
adaptation roadmap, a cost/ROI table, and insurance notes. Content should be
specific to the address (not generic boilerplate) and should not claim
certainty ("your home will flood") — check the disclaimer is visible.

**Verification**:
```sql
select id, overall_risk_score, model, created_at
from public.risk_reports
where property_id = '<property id from §3>'
order by created_at desc limit 1;
```
`model` should read like `anthropic:claude-...` or `openai:gpt-...` — confirms
a real provider call happened, not a mocked/stubbed path.

- [ ] Pass / Fail: ______

## 7. `ai_usage_log` records `property_id` and `report_id`

**Verification**:
```sql
select id, user_id, property_id, report_id, feature, provider, model,
       input_tokens, output_tokens, estimated_cost_usd, succeeded, created_at
from public.ai_usage_log
order by created_at desc limit 1;
```

**Expected**: one row for the §6 call —
- `user_id` = the account that generated the report
- `property_id` = the property from §3 (populated at call time)
- `report_id` = the report from §6 (patched in *after* the report row was
  created — see `attachReportId` in `lib/ai/service.ts`; if this is `null`
  but everything else in §6 succeeded, that's a real bug worth flagging)
- `input_tokens` / `output_tokens` are non-null positive integers
- `estimated_cost_usd` is a small positive number (a few cents at most)
- `succeeded = true`

- [ ] Pass / Fail: ______

## 8. Free-tier quota limits are enforced

Two sub-checks — use a fresh free-tier account for a clean count.

**8a. Property limit (free = 1)**

Create one property (succeeds). Attempt to create a second.

**Expected**: second attempt returns **HTTP 403** with a message like "Your
free plan allows up to 1 property."

- [ ] Pass / Fail: ______

**8b. Report limit (free = 3 / rolling 30 days)**

On the one allowed property, generate 3 reports (each via **Generate risk
report** — wait for each to finish before starting the next, to avoid
tripping rate limiting, which is a separate check). Attempt a 4th.

**Expected**: 4th attempt returns **HTTP 403** with a message like "Your
free plan allows 3 risk reports per rolling 30 days."

- [ ] Pass / Fail: ______

## 9. Idempotency prevents duplicate AI charges

**Steps**: Get an authenticated `curl` command for
`POST /api/properties/<property id>/risk-report` (see the note at the top of
this doc). Add a header `Idempotency-Key: qa-test-key-001`. Run it twice in
a row with the **same** key.

```bash
curl -i -X POST 'https://<staging-url>/api/properties/<property-id>/risk-report' \
  -H 'Idempotency-Key: qa-test-key-001' \
  -H 'Cookie: <copied from browser>' \
  --cookie-jar -
```

**Expected**:
- First response: `X-Idempotent-Replay: false`, status 201, a `report` body.
- Second response (same key): `X-Idempotent-Replay: true`, same `report.id`
  as the first response, returned near-instantly (no AI call happened).
- Note: this counts as only **one** report toward the §8b quota, and should
  produce only **one** new `ai_usage_log` row, not two — check
  `select count(*) from risk_reports where property_id = '<id>'` before and
  after to confirm the count only went up by 1.

- [ ] Pass / Fail: ______

## 10. Rate limiting works

**10a. Burst limiting (report generation, default 5/min)**

Using the same authenticated curl command as §9 but with a **different**
`Idempotency-Key` each time (or omit the header), fire 6+ requests in quick
succession (a small shell loop is fine):

```bash
for i in $(seq 1 7); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST \
    'https://<staging-url>/api/properties/<property-id>/risk-report' \
    -H "Idempotency-Key: burst-test-$i" \
    -H 'Cookie: <copied from browser>'
done
```

**Expected**: the first ~5 return 201 or 403 (quota, if you've already used
up §8b's budget — reset with a fresh property/account if so), and requests
beyond the burst limit return **429**.

- [ ] Pass / Fail: ______

**10b. Fail-closed in production without Upstash**

Only run this if you can toggle Upstash env vars off and redeploy (or run a
second deployment without them, classified as `VERCEL_ENV=production`):

Remove `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, redeploy to a
**Production**-classified environment, then attempt property creation,
report generation, or checkout.

**Expected**: **HTTP 503** on all three, with a message pointing to the
production deployment checklist. Deployment logs show the `FATAL (production
configuration)` block at boot.

Restore the Upstash env vars and redeploy before continuing — the rest of
this checklist needs rate limiting actually enabled.

- [ ] Pass / Fail: ______

## 11. Stripe checkout upgrades the user

**Steps**: On `/pricing`, click **Upgrade to Premium**. Complete Stripe
Checkout using a [test card](https://docs.stripe.com/testing) (`4242 4242
4242 4242`, any future expiry, any CVC).

**Expected**: redirected to `/dashboard?upgraded=1`.

**Verification**:
```sql
select subscription_tier, stripe_customer_id from public.profiles
where id = '<user id>';
```
`subscription_tier = 'premium'`, `stripe_customer_id` populated. Also
confirm in the Stripe dashboard (test mode) that a subscription was created
for this customer.

Re-run §8 afterward: the same account should now be able to create up to 5
properties and 100 reports/30 days instead of 1/3.

- [ ] Pass / Fail: ______

## 12. Stripe cancellation / downgrade removes premium access

**Steps**: In the Stripe dashboard (test mode), find the subscription
created in §11 and cancel it immediately (not "at period end" — for this
test you want the `customer.subscription.deleted` event to fire now).

**Expected**: within a few seconds, the webhook fires and:
```sql
select subscription_tier from public.profiles where id = '<user id>';
```
returns `'free'` again. Confirm the account is back to free-tier limits by
re-running §8a/8b's boundary (should now block at 1 property / 3 reports).

If it's not registering, check **Stripe Dashboard → Developers → Webhooks →
[your endpoint] → recent deliveries** for a non-2xx response or signature
failure, and cross-check `STRIPE_WEBHOOK_SECRET` against the endpoint's
actual signing secret.

- [ ] Pass / Fail: ______

## 13. RLS prevents cross-user access

Requires two accounts (User A, User B) from the top of this doc. User A has
at least one property from §3.

**13a. Via the app (server-rendered page)**

Log in as User B. Navigate directly to User A's property detail URL:
`/dashboard/properties/<User A's property id>`.

**Expected**: Next.js "not found" page — User A's data is never rendered to
User B's session, even though User B is authenticated and the ID is valid
for *someone*.

- [ ] Pass / Fail: ______

**13b. Via the API**

As User B (their cookies), attempt:
```bash
curl -i -X POST 'https://<staging-url>/api/properties/<User A property id>/risk-report' \
  -H 'Idempotency-Key: rls-test' \
  -H 'Cookie: <User B session cookies>'
```

**Expected**: **HTTP 404** `{"error": "Property not found"}` — not a 403,
because RLS makes the row invisible to the query entirely rather than
visible-but-forbidden.

- [ ] Pass / Fail: ______

---

## Summary table (fill in after running the above)

| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| 1 | Signup/login | | |
| 2 | Profile auto-created | | |
| 3 | Property creation | | |
| 4 | Photo upload | | |
| 5 | Weather data retrieval | | |
| 6 | Report generation | | |
| 7 | `ai_usage_log` references | | |
| 8a | Free-tier property quota | | |
| 8b | Free-tier report quota | | |
| 9 | Idempotency | | |
| 10a | Rate limiting (burst) | | |
| 10b | Rate limiting (fail-closed) | | |
| 11 | Stripe checkout upgrade | | |
| 12 | Stripe cancellation downgrade | | |
| 13a | RLS (page) | | |
| 13b | RLS (API) | | |

See [`LAUNCH_READINESS_REPORT.md`](./LAUNCH_READINESS_REPORT.md) for what
"all pass" vs. "some fail" means for starting Feature 2.
