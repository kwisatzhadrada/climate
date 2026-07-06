# Launch Readiness Report — Feature 1 (Climate Resilience Auditor & Planner)

**Status as of this report: code-complete and unit-tested; live integration
validation not yet performed.** This document exists to make that boundary
explicit — what's actually been verified vs. what's implemented-and-plausible
but unconfirmed against real Supabase/Stripe/AI infrastructure — and to set
the bar for what "validated" means before Feature 2 work starts.

No credentials for a live Supabase/Stripe/Anthropic project were available
during development, so the checks below reflect code review, a clean
`next build`, and a 21-test Vitest suite against mocked clients — not a live
run. [`STAGING_DEPLOYMENT.md`](./STAGING_DEPLOYMENT.md) and
[`VALIDATION_CHECKLIST.md`](./VALIDATION_CHECKLIST.md) are the path to
closing that gap.

## Confidence levels used below

- **✅ Verified (automated)** — covered by a passing Vitest test against a
  mocked client, or directly observed (e.g. the production fail-closed
  startup warning was manually triggered and its log output confirmed).
- **🟡 Implemented, unverified live** — the code path exists, was reviewed,
  and compiles/type-checks, but has never executed against a real
  Postgres instance, a real Stripe webhook delivery, or a real AI API
  response. This is the bulk of the list below.
- **🔴 Known gap** — not implemented, or implemented with a known
  limitation that's documented rather than silently accepted.

## Per-item status

| # | Item | Status | Why |
|---|------|--------|-----|
| 1 | Signup/login | 🟡 | Standard Supabase Auth flow, not custom logic; low risk, but never exercised against a real project's email confirmation flow. |
| 2 | Profile auto-created | 🟡 | `handle_new_user()` trigger in `001_initial.sql` is straightforward SQL, but trigger behavior can only be confirmed by actually inserting into `auth.users` via real signup. |
| 3 | Property creation | 🟡 | Geocoding (Open-Meteo) is a live external call with no test double in the suite — first real confirmation this works end-to-end (network reachability, response shape parsing) happens in staging. |
| 4 | Photo upload | 🟡 | Storage bucket policies are declarative SQL (path-prefix-scoped to `auth.uid()`); never exercised with an actual authenticated upload. |
| 5 | Weather data retrieval | 🟡 | Same as #3 — Open-Meteo forecast/archive calls and the `climate_cache` write path are code-reviewed, not live-tested. |
| 6 | Report generation | 🟡 | The AI call, JSON parsing (`extractJson`), and Zod validation (`riskReportSchema`) have no test coverage against a **real** model response — only the pure surrounding logic (cost estimation, usage logging) is tested. A real model could return prose the parser doesn't expect; this is the single highest-value thing to check live. |
| 7 | `ai_usage_log` property_id/report_id references | ✅ (schema + wiring) / 🟡 (live) | This was actually **broken** during the hardening pass — `ai_usage_log` had no `property_id`/`report_id` columns at all until migration `003`. Fixed and the plumbing (`runAIJob` logs `property_id` at call time, `attachReportId` patches in `report_id` after insert) is in place, but never confirmed against a real insert — worth extra attention in staging given it was a real bug once already. |
| 8 | Free-tier quota (property + report) | ✅ (logic) / 🟡 (live) | Threshold logic is unit-tested exactly at the boundary (`test/quota.test.ts`) against a mocked count query. Never confirmed the real Postgres count query (`.select("id", {count:"exact",head:true})`) returns what the code assumes. |
| 9 | Idempotency | ✅ (logic) / 🟡 (live) | Dedupe, concurrent-claim rejection, and failure-retry are all unit-tested against a stateful in-memory fake of the `idempotency_keys` table (`test/idempotency.test.ts`). The real table's primary-key-conflict behavior under actual Postgres concurrent inserts is unverified — this is exactly the kind of thing a mock can get subtly wrong. Added an `X-Idempotent-Replay` response header specifically so this is observable in staging without a DB console. |
| 10a | Rate limiting (burst) | 🟡 | Upstash's sliding-window algorithm itself is a third-party library, trusted but not independently re-tested; the app's usage of it (`lib/rateLimit.ts`) has no automated test (would require mocking Upstash's HTTP API, judged lower-value than testing it live). |
| 10b | Rate limiting (fail-closed in production) | ✅ | **Actually confirmed**, not just code-reviewed: started the production server (`NODE_ENV=production`) locally without Upstash configured and observed the `FATAL (production configuration)` boot log and the intended 503 code path. This is the one item in this table verified against a running server rather than mocks or review alone. |
| 11 | Stripe checkout upgrade | 🟡 | `checkout.session.completed` handling is code-reviewed; never received a real webhook delivery (real signature verification, real `listLineItems` response shape). |
| 12 | Stripe cancellation/downgrade | 🟡 | This is the item I'd flag as **most likely to surprise you** — `resolveTierForSubscription` (the downgrade decision) is unit-tested for every status in isolation (`test/stripeTier.test.ts`), but the full webhook path (event dedupe via `stripe_events`, looking up the profile by `stripe_customer_id`, actually firing on a real `customer.subscription.deleted`) has never run against a real Stripe test-mode cancellation. Also: this only fires if the webhook endpoint is correctly registered for `customer.subscription.updated`/`.deleted` in the Stripe dashboard, which is a manual step in the deployment guide easy to forget. |
| 13 | RLS cross-user isolation | 🟡 | Policies are declarative SQL reviewed against the intended access pattern (`auth.uid() = user_id`), consistent with how Supabase RLS is meant to work, but **RLS bugs are exactly the kind of thing that looks correct on paper and isn't** (a missing policy, an `OR` that should've been `AND`, a bucket policy typo) — this is the other top-priority live check. |

## Everything else already documented

The following were flagged during the hardening pass and haven't changed —
see the README sections linked for detail, don't re-litigate them here:

- Liability/disclaimer language — [README § Financial & operational hardening](../README.md#financial--operational-hardening)
- Vision payload size limits — same section
- `ai_usage_log` pricing table is an estimate, not a billing source of truth — same section
- No scheduled pruning job for `idempotency_keys`/`stripe_events` yet — same section, and `Roadmap`

## Recommendation

**Do not start Feature 2 development until every row above that's currently
🟡 has been run through [`VALIDATION_CHECKLIST.md`](./VALIDATION_CHECKLIST.md)
at least once and reaches Pass.** Priority order if time is limited:

1. **#13 (RLS)** and **#7 (`ai_usage_log` references)** — both are places a
   mock could plausibly hide a real bug (RLS policy correctness, and the
   fact that #7 was already found broken once).
2. **#12 (Stripe downgrade)** — the financial-safety property this whole
   hardening pass was about; an untested webhook path is the highest-risk
   item to leave unverified given real subscriptions will run through it.
3. **#6 (report generation with a real model)** and **#9 (idempotency under
   real Postgres concurrency)** — both have solid logic-level test coverage
   already, so live testing here is mainly about confirming the mocks
   didn't miss something, not about untested logic.
4. Everything else, which is lower-risk standard framework behavior
   (Supabase Auth, Storage, geocoding).

A Fail on any row should block Feature 2 start until root-caused and fixed
— re-run the specific failing check (not the whole suite) after a fix, and
update this report's status column accordingly (change 🟡 → ✅ or record the
fix and re-test date).

## Sign-off

| Field | Value |
|---|---|
| Validated by | _____________________ |
| Staging environment URL | _____________________ |
| Date | _____________________ |
| Checklist result | ☐ All pass · ☐ Pass with exceptions (list below) · ☐ Blocking failures found |
| Exceptions / follow-ups | _____________________ |
| Feature 2 start approved? | ☐ Yes · ☐ No — see follow-ups |
