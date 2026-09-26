-- Weekly PSF engagement, including Innovation -> Tooling & Equipment
-- 2026-09-26

create table if not exists public.profile_weekly_psf_engagement (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  psf_name text not null,
  action_count integer not null default 0,
  source_types text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (profile_id, week_start, psf_name)
);

create index if not exists profile_weekly_psf_week_idx
on public.profile_weekly_psf_engagement(week_start);

alter table public.profile_weekly_psf_engagement enable row level security;

revoke all on public.profile_weekly_psf_engagement from anon, authenticated;
grant select on public.profile_weekly_psf_engagement to anon, authenticated;

create policy "public read profile weekly psf engagement"
on public.profile_weekly_psf_engagement
for select to anon, authenticated
using (true);

-- In private.rebuild_kudos_achievements(), rebuild this table alongside
-- profile_achievement_totals and profile_weekly_activity using:
--
-- 1. progress_entries -> challenge_psfs -> psfs
-- 2. innovation_entries -> fixed PSF 'Tooling & Equipment'
--
-- The deployed function is authoritative; this migration documents the
-- feature addition and the public aggregate table. New Innovation entries
-- are therefore counted as Tooling & Equipment PSF engagement for the
-- individual's weekly PSF coverage and CHF reporting.
