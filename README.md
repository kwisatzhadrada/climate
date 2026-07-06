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
  weather/{geocode,openMeteo}.ts    Open-Meteo integrations
  ai/{client,riskReport}.ts         Provider-agnostic AI call + prompt + schema
  types.ts
supabase/migrations/001_initial.sql Schema, RLS policies, storage bucket
middleware.ts                       Session refresh + /dashboard route guard
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run `supabase/migrations/001_initial.sql`. This creates `profiles`,
   `properties`, `risk_reports`, RLS policies, the new-user trigger, and the public
   `property-photos` storage bucket.
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

## Risks, costs, and optimizations

**AI cost per report**: one report = one multimodal call (~1-2K input tokens of prompt + climate
data, optionally +1 image, ~1-2K output tokens of JSON). At Claude Sonnet pricing this is roughly
$0.02–0.05/report; at GPT-4o similar. At 1,000 reports/month that's $20–50 — cheap relative to the
$19/mo Premium price, but **meter it**: a free-tier user generating reports in a loop is your main
cost-abuse vector. The MVP has no rate limiting yet — add a per-tier monthly report cap
(check `risk_reports` count by `user_id` + date range) before public launch.

**Weather API limits**: Open-Meteo's free tier is generous (10K calls/day) but not SLA-backed;
if you scale past a few thousand reports/day, either cache climate snapshots per
`(lat, lon)` rounded to ~1km for a day, or move to a paid provider.

**Liability**: risk reports are AI-generated estimates, not licensed engineering/insurance advice.
The disclaimer is shown on every report and the landing page — do not remove it, and don't let
copy elsewhere imply certainty ("your home will flood") instead of estimate framing ("elevated
flood risk based on..."). If you add per-region legal review before charging money in a given
market, do it before the disclaimer language changes.

**Vision payloads**: property photos are capped at 5MB in `fetchImageAsBase64` and silently
skipped (not failed) if larger/unreachable, so a bad upload never blocks report generation —
but very large photos still cost more in image tokens; consider client-side resizing on upload.

**Security**: RLS policies restrict `properties`/`risk_reports` to their owning `user_id`; the
service-role client (`createServiceClient`) is only used server-side in the Stripe webhook and
must never be imported into a client component.

## Roadmap

- **Feature 2 — Precision Food/Water Optimizer**: new `gardens`/`resource_plans` tables, reuses
  the same property + AI plumbing; add a soil/irrigation prompt and a recipe-generation prompt.
- **Feature 3 — Pandemic/Biosecurity Shield**: privacy-first by design — favor on-device symptom
  triage logic over server round-trips; a public-data ingestion job (CDC/WHO feeds) for the
  early-warning dashboard.
- Real-time severe-weather push alerts (needs a scheduled job + push/SMS provider).
- Community resource matching and insurance affiliate integrations (needs partner data feeds).
- Rate limiting / usage metering per subscription tier.
- Swap Open-Meteo for NASA POWER or a paid provider for flood-plain/vegetation-index precision.
