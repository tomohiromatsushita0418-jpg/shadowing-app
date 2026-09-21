-- Shadowing App — subscription schema
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: every statement is idempotent.

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, holding trial + Stripe subscription state.
-- Writes happen only from the server (service_role key), which bypasses RLS.
-- The client may read its own row and nothing else.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  email                text,
  stripe_customer_id   text unique,
  -- trial  : inside the 7-day full-access window
  -- pro    : paying (or cancelled but still inside the paid period)
  -- expired: trial ran out and there is no active subscription
  plan                 text not null default 'trial'
                         check (plan in ('trial', 'pro', 'expired')),
  -- Raw Stripe subscription status, kept for debugging/analytics.
  status               text,
  trial_ends_at        timestamptz not null default (now() + interval '7 days'),
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id);

-- ---------------------------------------------------------------------------
-- Every new auth user gets a profile with the 7-day trial clock already started.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, plan, trial_ends_at)
  values (new.id, new.email, 'trial', now() + interval '7 days')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at honest.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security: a user can read only their own profile. No client-side
-- writes at all — plan/trial fields must never be editable from the browser.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select
  using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- Single source of truth for "is this user allowed in?". The API and any future
-- SQL both call this so the rule can never drift between them.
-- ---------------------------------------------------------------------------
create or replace function public.has_access(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_id
      and (
        (p.plan = 'pro'
          and (p.current_period_end is null or p.current_period_end > now()))
        or
        (p.plan = 'trial' and p.trial_ends_at > now())
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Backfill: give a profile to any user that predates this migration.
-- ---------------------------------------------------------------------------
insert into public.profiles (id, email, plan, trial_ends_at)
select u.id, u.email, 'trial', now() + interval '7 days'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
