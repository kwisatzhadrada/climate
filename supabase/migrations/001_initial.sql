-- Resilience Platform: initial schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  subscription_tier text not null default 'free' check (subscription_tier in ('free', 'premium', 'business')),
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- properties
-- ---------------------------------------------------------------------------
create table if not exists public.properties (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text not null,
  address text not null,
  lat double precision,
  lon double precision,
  photo_url text,
  created_at timestamptz not null default now()
);

alter table public.properties enable row level security;

create policy "Users can manage own properties"
  on public.properties for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists properties_user_id_idx on public.properties (user_id);

-- ---------------------------------------------------------------------------
-- risk_reports
-- ---------------------------------------------------------------------------
create table if not exists public.risk_reports (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references public.properties (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  overall_risk_score smallint not null check (overall_risk_score between 0 and 100),
  risks jsonb not null,
  adaptation_roadmap jsonb not null,
  cost_roi jsonb not null,
  insurance_notes text,
  weather_snapshot jsonb,
  model text,
  created_at timestamptz not null default now()
);

alter table public.risk_reports enable row level security;

create policy "Users can manage own risk reports"
  on public.risk_reports for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists risk_reports_property_id_idx on public.risk_reports (property_id);

-- ---------------------------------------------------------------------------
-- storage: property photos
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('property-photos', 'property-photos', true)
on conflict (id) do nothing;

create policy "Users can upload own property photos"
  on storage.objects for insert
  with check (
    bucket_id = 'property-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Anyone can view property photos"
  on storage.objects for select
  using (bucket_id = 'property-photos');

create policy "Users can delete own property photos"
  on storage.objects for delete
  using (
    bucket_id = 'property-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
