-- Resilience Platform: financial/operational hardening
-- Adds webhook idempotency, generic request idempotency, weather caching,
-- and AI usage/cost observability. Run after 001_initial.sql.

-- ---------------------------------------------------------------------------
-- stripe_events: dedupe Stripe webhook deliveries (Stripe retries on non-2xx,
-- and can occasionally deliver the same event twice under normal operation).
-- ---------------------------------------------------------------------------
create table if not exists public.stripe_events (
  id text primary key, -- Stripe event.id
  type text not null,
  created_at timestamptz not null default now()
);

-- No RLS policy: this table is only ever touched by the service-role client
-- from the webhook handler, never from an authenticated user session.
alter table public.stripe_events enable row level security;

-- ---------------------------------------------------------------------------
-- idempotency_keys: generic request-level idempotency so client retries or
-- accidental double-clicks on expensive endpoints (AI report generation)
-- return the original result instead of doing (and billing for) the work twice.
-- ---------------------------------------------------------------------------
create table if not exists public.idempotency_keys (
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  key text not null,
  -- null response = request in flight (row inserted as a claim before the
  -- handler runs); a concurrent duplicate request hits the primary key
  -- conflict and knows to wait/retry rather than doing the work twice.
  response jsonb,
  status_code smallint,
  created_at timestamptz not null default now(),
  primary key (user_id, endpoint, key)
);

alter table public.idempotency_keys enable row level security;

create policy "Users can manage own idempotency keys"
  on public.idempotency_keys for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Old keys are harmless to keep, but prune anything older than a few days so
-- the table doesn't grow unbounded. Call this from a scheduled job/cron if
-- you have one; safe to run manually/periodically otherwise.
create or replace function public.prune_idempotency_keys()
returns void
language sql
security definer set search_path = public
as $$
  delete from public.idempotency_keys where created_at < now() - interval '7 days';
$$;

-- ---------------------------------------------------------------------------
-- climate_cache: cache Open-Meteo responses per ~1km lat/lon bucket so
-- re-generating a report (or two nearby properties) doesn't re-fetch from
-- the upstream API every time.
-- ---------------------------------------------------------------------------
create table if not exists public.climate_cache (
  lat_bucket double precision not null,
  lon_bucket double precision not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (lat_bucket, lon_bucket)
);

alter table public.climate_cache enable row level security;
-- No user-facing policy: accessed only via the service-role client. Weather
-- data for a lat/lon bucket isn't sensitive, but there's no reason to expose
-- direct table access to clients either.

-- ---------------------------------------------------------------------------
-- ai_usage_log: per-call cost/usage observability, keyed by feature so
-- Feature 2/3 additions show up in the same ledger.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles (id) on delete set null,
  feature text not null,
  provider text not null,
  model text not null,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric(10, 5),
  succeeded boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);

alter table public.ai_usage_log enable row level security;

create policy "Users can view own AI usage"
  on public.ai_usage_log for select
  using (auth.uid() = user_id);

create index if not exists ai_usage_log_user_id_idx on public.ai_usage_log (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Hard monthly quota support: index risk_reports so counting "reports this
-- month per user" (the financial backstop enforced in lib/quota.ts) is cheap.
-- ---------------------------------------------------------------------------
create index if not exists risk_reports_user_created_idx on public.risk_reports (user_id, created_at desc);
create index if not exists properties_user_created_idx on public.properties (user_id, created_at desc);
