# Staging Deployment Guide

Sets up a throwaway staging environment with real (test-mode) backends, so the
[Validation Checklist](./VALIDATION_CHECKLIST.md) can be executed against
actual infrastructure instead of mocks. Budget ~30-45 minutes for a first pass.

Use a **throwaway Supabase project and a throwaway Stripe account in test
mode** — never point staging at a production database or live Stripe keys.

---

## 1. Supabase project

1. Create a new project at [supabase.com](https://supabase.com) (any region;
   free tier is enough).
2. Open the SQL editor and run these three migrations **in order**, each to
   completion before starting the next:
   - `supabase/migrations/001_initial.sql`
   - `supabase/migrations/002_hardening.sql`
   - `supabase/migrations/003_ai_usage_references.sql`
3. Confirm the following tables exist (Table Editor): `profiles`,
   `properties`, `risk_reports`, `stripe_events`, `idempotency_keys`,
   `climate_cache`, `ai_usage_log`.
4. Confirm the `property-photos` storage bucket exists and is public
   (Storage tab).
5. From **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep this one secret —
     it bypasses RLS)

## 2. Stripe (test mode)

1. Create a Stripe account, or use an existing one — **make sure the
   dashboard is toggled to Test mode** (top-right switch) for everything
   below.
2. **Products → Add product**, create two recurring products:
   - "Premium" — e.g. $19/month → copy its Price ID as `STRIPE_PREMIUM_PRICE_ID`
   - "Business" — e.g. $99/month → copy its Price ID as `STRIPE_BUSINESS_PRICE_ID`
3. **Developers → API keys** → copy the test **Secret key** as
   `STRIPE_SECRET_KEY` (starts `sk_test_`).
4. The webhook signing secret (`STRIPE_WEBHOOK_SECRET`) comes from step 5
   below, after the app is deployed and has a public URL to register.

## 3. One AI provider key

Either is fine; the app tries `AI_PROVIDER` first and falls back to the
other if both are set.

- **Anthropic**: create a key at [console.anthropic.com](https://console.anthropic.com)
  → `ANTHROPIC_API_KEY`. Leave `AI_PROVIDER=anthropic` (default).
- **OpenAI**: create a key at [platform.openai.com](https://platform.openai.com)
  → `OPENAI_API_KEY`, and set `AI_PROVIDER=openai`.

A full validation pass (a handful of report generations) costs well under $1
in AI usage.

## 4. Upstash Redis (rate limiting)

Required for a realistic test of rate limiting, and required outright if you
deploy to Vercel's **Production** environment (see the fail-closed behavior
in the [Production deployment checklist](../README.md#production-deployment-checklist)).

1. Create a free database at [upstash.com](https://upstash.com) (Redis →
   Create Database → any region).
2. From the database's REST API section, copy `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN`.

## 5. Deploy

Any host that runs Next.js 14 works; these steps assume Vercel since it's
the path of least resistance for this stack.

1. Import the `kwisatzhadrada/climate` repo into a new Vercel project.
2. Under **Settings → Environment Variables**, add every variable collected
   above, plus:
   - `NEXT_PUBLIC_APP_URL` = the Vercel deployment URL once you know it (you
     can redeploy after the first deploy to fill this in)
   - `AI_PROVIDER` = `anthropic` or `openai` to match step 3
3. Deploy.
   - If you deploy to Vercel's **Production** environment (`VERCEL_ENV=production`)
     and Upstash isn't configured, the app will 503 on property creation,
     report generation, and checkout by design — check the deploy's runtime
     logs for the `FATAL (production configuration)` block if anything
     503s unexpectedly.
   - Vercel **Preview** deployments (`VERCEL_ENV=preview`) are not treated as
     production by this app's fail-closed check, but configure Upstash for
     preview too if you want the rate-limit tests to be meaningful rather
     than running against the single-instance in-memory fallback.

## 6. Wire up the Stripe webhook

1. Once deployed, go to **Stripe Dashboard → Developers → Webhooks → Add
   endpoint**.
2. Endpoint URL: `https://<your-deployment>/api/stripe/webhook`
3. Select these events (the webhook handler only acts on these — others are
   ignored, which is expected):
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the endpoint's **Signing secret** into `STRIPE_WEBHOOK_SECRET` in
   Vercel's env vars, then redeploy so it takes effect.

## 7. Post-deploy smoke check

Before starting the full validation checklist:

- [ ] Load the deployed URL — landing page renders.
- [ ] Check the deployment's runtime/build logs once for the `FATAL
      (production configuration)` block from `instrumentation.ts`. If
      present, an env var is missing — cross-check against step 5's list
      and the [Production deployment checklist](../README.md#production-deployment-checklist).
- [ ] `/pricing` renders both paid tiers.

Once these pass, proceed to [`VALIDATION_CHECKLIST.md`](./VALIDATION_CHECKLIST.md).
