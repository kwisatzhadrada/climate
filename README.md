# Resilience Platform

AI-powered personal & community resilience platform. This MVP ships **Feature 1: Climate
Resilience Auditor & Planner** — auth, a dashboard, property intake (address + optional photo),
and AI-generated risk reports grounded in real weather/climate data.

Food/water optimization and pandemic/biosecurity tools (Features 2 & 3) are intentionally out of
scope for this build — see [Roadmap](#roadmap) below for how they plug into the same schema and
AI plumbing.

## Stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**
- **Supabase** — Postgres, Auth, Storage, Row Level Security
- **Anthropic Claude** (primary) with an **OpenAI-compatible fallback** (also covers Grok, or a
  local Ollama server, via `OPENAI_BASE_URL`) — see `lib/ai/client.ts`
- **Open-Meteo** — free, keyless geocoding, forecast, and 5-year historical extremes (swap for
  NASA POWER / a paid provider later for higher precision)
- **Stripe** — subscription checkout + webhook (optional; app runs fine without it)
- **Upstash Redis** (optional) — sliding-window rate limiting; falls back to an in-memory limiter
  for local dev if unconfigured

## Scope refinements from the original brief

A few deliberate calls worth flagging:

1. **Weather/satellite data**: used Open-Meteo instead of NASA APIs for the MVP — it's free, has
   no API key/quota friction, and its geocoding + archive + forecast endpoints cover flood/heat/
   storm signal well enough to ground the AI. NASA POWER (or a paid provider like Tomorrow.io)
   is a drop-in swap in `lib/weather/` once you need satellite-derived precision (e.g. actual
   flood-plain maps, vegetation indices for wildfire).
2. **Vision**: property photos are sent straight into the Claude/GPT-4o vision call alongside the
   structured prompt (roof material, vegetation proximity, drainage), rather than a separate CV
   pipeline. This is the fastest path to real value; a dedicated vision model (roof damage
   detection, etc.) is a good v2 investment once you have report volume to justify it.
3. **Grok/Ollama**: the AI layer is provider-agnostic by design (`AI_PROVIDER=anthropic|openai`,
   plus `OPENAI_BASE_URL` for any OpenAI-compatible endpoint), but only Anthropic and OpenAI are
   fully wired up. Pointing `OPENAI_BASE_URL` at `https://api.x.ai/v1` gets you Grok; pointing it
   at a local Ollama server's OpenAI-compatible endpoint gets you the local fallback — both
   without code changes, but untested by me here.
4. **Insurance optimization / community matching**: the report includes AI-generated insurance
   notes, but real insurance-product affiliate integration and community-resource matching
   (mentioned in the brief) need partner data feeds that don't exist yet — stubbed as roadmap
   items, not faked with placeholder data.

## Folder structure

```
app/
  page.tsx                          Landing page
  (auth)/login, (auth)/signup       Auth pages
  auth/callback/route.ts            Supabase email-confirmation callback
  dashboard/page.tsx                Property list
  dashboard/properties/new          Add-property form (address + optional photo)
  dashboard/properties/[id]         Property detail + risk report view
  pricing/page.tsx                  Pricing tiers + Stripe checkout trigger
  api/properties/route.ts           POST: create property (geocodes address)
  api/properties/[id]/risk-report/  POST: generate an AI risk report
  api/stripe/checkout/route.ts      POST: create a Stripe Checkout session
  api/stripe/webhook/route.ts       Stripe webhook: flips subscription_tier
components/
  ui/                               Button, Card, Input, Badge primitives
  Navbar, LogoutButton, Disclaimer
  GenerateReportButton, RiskReportView
lib/
  supabase/{client,server,middleware}.ts
  weather/{geocode,openMeteo,cache}.ts  Open-Meteo integrations + Postgres-backed caching
  ai/{client,service,riskReport}.ts     client = provider transport, service = governed entry point
  rateLimit.ts                      Burst/abuse protection (Upstash, in-memory fallback)
  quota.ts                          Hard per-tier monthly caps (the financial backstop)
  idempotency.ts                    Request-level idempotency for expensive/side-effecting calls
  types.ts
supabase/migrations/
  001_initial.sql                   Schema, RLS policies, storage bucket
  002_hardening.sql                 stripe_events, idempotency_keys, climate_cache, ai_usage_log
middleware.ts                       Session refresh + /dashboard route guard
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run `supabase/migrations/001_initial.sql`, then
   `supabase/migrations/002_hardening.sql` in order. The first creates `profiles`,
   `properties`, `risk_reports`, RLS policies, the new-user trigger, and the public
   `property-photos` storage bucket; the second adds `stripe_events` (webhook dedupe),
   `idempotency_keys`, `climate_cache`, and `ai_usage_log`.
3. Copy your project URL, anon key, and service role key (Project Settings → API).

### 3. Environment variables

```bash
cp .env.example .env.local
```

Fill in:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY` (get one at [console.anthropic.com](https://console.anthropic.com)) — or
  `OPENAI_API_KEY` and set `AI_PROVIDER=openai`
- Stripe keys only if you want live checkout; the app degrades gracefully without them (the
  "Upgrade" button returns a friendly "not configured yet" message instead of erroring).
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (free tier at [upstash.com](https://upstash.com))
  — strongly recommended before public launch; without them, rate limiting silently falls back to
  a single-instance in-memory limiter that does not protect a multi-instance deployment.

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign up, confirm your email (check your
inbox — Supabase sends the confirmation link), add a property, and click **Generate risk
report**.

### 5. Optional: Stripe locally

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the printed webhook signing secret into `STRIPE_WEBHOOK_SECRET`.

## Validation & launch steps

1. **Smoke test the golden path** yourself with 3-4 real addresses in different climates (coastal
   flood zone, wildfire-prone hillside, extreme-heat inland city) — check the AI output stays
   grounded in the actual historical numbers rather than generic boilerplate.
2. **Landing page as a funnel test**: the current landing page is enough to run cold traffic
   (paid social, climate/prepper subreddits, Nextdoor) to gauge signup rate before investing in
   Features 2/3. Add basic analytics (Vercel Analytics or Plausible) before spending on ads.
3. **Manual concierge onboarding for first ~20 users**: watch which parts of the report people
   screenshot/share and which they ignore — that tells you what to sharpen before charging.
4. **Soft-launch pricing**: keep Free generous (1 property, 1 report/mo) until you have report
   quality validated; the $19 Premium tier is the one to push hardest since it's the natural
   "I want to check my new place before the next storm season" upgrade moment.
5. **Impact storytelling**: the report screen (score, risk cards, roadmap, cost/ROI table) is
   built to be screenshot-shareable — lean on that for organic/social marketing rather than
   building a separate share feature yet.

## Financial & operational hardening

Before starting Feature 2, the MVP got a pass to make it safe to leave unattended and to run on
a real payment processor. What's now in place:

- **Hard monthly quota** (`lib/quota.ts`) — the actual financial backstop: 1 property / 3
  reports per 30 days on Free, 5 / 100 on Premium, 50 / 1000 on Business. Enforced in Postgres
  on every property-create and report-generate call, independent of any rate limiter, so a bug
  or malicious script can never cost more than `maxReportsPerMonth × cost-per-report` per
  account per month. Tune the numbers in `TIER_LIMITS` once you know real AI cost and margin.
- **Burst-abuse rate limiting** (`lib/rateLimit.ts`) — Upstash Redis sliding window (5
  reports/min, 10 property-creates/min, 10 checkout attempts/min) protects against a script
  hammering an endpoint within the quota window. Falls back to an in-memory limiter if Upstash
  isn't configured — fine for local dev, **not sufficient for a multi-instance production
  deployment** (logs a one-time warning so this doesn't fail silently).
- **Climate data caching** (`lib/weather/cache.ts`) — Open-Meteo responses are cached in
  Postgres per ~1km lat/lon bucket for 6 hours, so regenerating a report (or two nearby
  properties) doesn't re-hit the upstream API every time.
- **Idempotency** (`lib/idempotency.ts`) — the report-generation endpoint accepts an
  `Idempotency-Key` header; a retried request with the same key replays the original result
  instead of re-running (and re-billing) the AI call. Uses a claim-row insert so genuinely
  concurrent duplicate requests can't both slip through.
- **Webhook security** (`app/api/stripe/webhook/route.ts`) — Stripe signature verification
  (already required), plus event-id dedupe via `stripe_events` (Stripe retries on non-2xx and
  can redeliver) and handling for `customer.subscription.updated`/`.deleted` so a cancelled or
  lapsed subscription is downgraded back to `free` — the original version only ever upgraded
  tiers on checkout, never downgraded, which is exactly the kind of gap that quietly leaks paid
  access.
- **Unified AI service layer** (`lib/ai/service.ts`) — the one place every feature's AI calls
  should go through: enforces a 30s timeout per call (so a hung provider request can't tie up a
  serverless invocation indefinitely), and logs every call's provider/model/token
  usage/estimated cost/success to `ai_usage_log`. Deliberately does not add its own retry loop —
  `lib/ai/client.ts` already falls back to a second provider once, and a visible failure that
  lets the user re-click is safer than an automatic retry silently doubling spend on a flaky
  request. Feature 2/3 AI calls should call `runAIJob(...)`, not `lib/ai/client.ts` directly.

**Still open** (call these out before public launch, not before Feature 2):

- **Liability**: risk reports are AI-generated estimates, not licensed engineering/insurance
  advice. The disclaimer is shown on every report and the landing page — do not remove it, and
  don't let copy elsewhere imply certainty ("your home will flood") instead of estimate framing
  ("elevated flood risk based on..."). Get regional legal review before changing that language.
- **Vision payloads**: property photos are capped at 5MB in `fetchImageAsBase64` and silently
  skipped (not failed) if larger/unreachable — a bad upload never blocks report generation, but
  large photos still cost more in image tokens; consider client-side resizing on upload.
- **Security**: RLS policies restrict `properties`/`risk_reports`/`ai_usage_log` to their owning
  `user_id`; the service-role client (`createServiceClient`) is used server-side only (Stripe
  webhook, climate cache, AI usage logging) and must never be imported into a client component.
- **`ai_usage_log` pricing table** in `lib/ai/service.ts` is for cost *observability*, not
  billing — it's a rough per-model $/1K-token estimate you should keep in sync with actual
  provider pricing, not a source of truth for invoicing.
- **Idempotency-key cleanup**: `idempotency_keys` rows aren't automatically pruned; call
  `select public.prune_idempotency_keys();` from a scheduled job (or periodically by hand) once
  you have one, per the comment in `002_hardening.sql`.

## Roadmap

- **Feature 2 — Precision Food/Water Optimizer**: new `gardens`/`resource_plans` tables, reuses
  the same property + AI plumbing; add a soil/irrigation prompt and a recipe-generation prompt.
- **Feature 3 — Pandemic/Biosecurity Shield**: privacy-first by design — favor on-device symptom
  triage logic over server round-trips; a public-data ingestion job (CDC/WHO feeds) for the
  early-warning dashboard.
- Real-time severe-weather push alerts (needs a scheduled job + push/SMS provider).
- Community resource matching and insurance affiliate integrations (needs partner data feeds).
- Swap Open-Meteo for NASA POWER or a paid provider for flood-plain/vegetation-index precision.
- Scheduled pruning job for `idempotency_keys` and `stripe_events` (currently manual).
