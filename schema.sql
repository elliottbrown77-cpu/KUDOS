-- KUDOS / CHF Human Performance
-- Supabase PostgreSQL schema for shared team challenges and aggregate dashboards.
-- Run in the Supabase SQL Editor on a new project.

create extension if not exists pgcrypto;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_order int not null default 0,
  active boolean not null default true
);

create table if not exists public.terms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_date date not null,
  end_date date not null,
  active boolean not null default false,
  constraint terms_dates check (end_date >= start_date)
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  profile_code text not null unique default ('PROF-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  name text not null,
  team_id uuid not null references public.teams(id),
  role text not null default 'user' check (role in ('user','rep','admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.psfs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_order int not null
);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_code text not null unique default ('CH-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  team_id uuid not null references public.teams(id),
  term_id uuid references public.terms(id),
  title text not null,
  description text not null default '',
  target numeric not null check (target >= 0),
  unit text not null,
  source_type text not null default 'progress' check (source_type in ('progress','recognition','innovation','safety')),
  start_date date not null,
  end_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint challenge_dates check (end_date >= start_date)
);

create table if not exists public.challenge_psfs (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  psf_id uuid not null references public.psfs(id) on delete cascade,
  primary_psf boolean not null default false,
  primary key (challenge_id, psf_id)
);

create table if not exists public.progress_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  challenge_id uuid not null references public.challenges(id),
  value numeric not null check (value >= 0),
  entry_date date not null default current_date,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists progress_entries_challenge_idx on public.progress_entries(challenge_id);
create index if not exists progress_entries_profile_idx on public.progress_entries(profile_id);

create table if not exists public.recognition_entries (
  id uuid primary key default gen_random_uuid(),
  submitter_profile_id uuid not null references public.profiles(id),
  recognised_profile_id uuid not null references public.profiles(id),
  reason text not null,
  entry_date date not null default current_date,
  status text not null default 'submitted' check (status in ('submitted','approved','published','closed')),
  created_at timestamptz not null default now()
);
create index if not exists recognition_submitter_idx on public.recognition_entries(submitter_profile_id);

create table if not exists public.innovation_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  title text not null,
  description text not null,
  entry_date date not null default current_date,
  status text not null default 'submitted' check (status in ('submitted','under_review','trial','implemented','closed')),
  created_at timestamptz not null default now()
);
create index if not exists innovation_profile_idx on public.innovation_entries(profile_id);

create table if not exists public.safety_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  category text not null,
  external_reference text not null default '',
  entry_date date not null default current_date,
  status text not null default 'submitted' check (status in ('submitted','validated','closed')),
  created_at timestamptz not null default now()
);
create index if not exists safety_profile_idx on public.safety_entries(profile_id);

-- Protected users for Performance Rep / Admin write access.
create table if not exists public.app_users (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('rep','admin')),
  team_id uuid references public.teams(id),
  created_at timestamptz not null default now()
);

-- Seed standard teams and the nine CHF Performance Shaping Factors.
insert into public.teams(name,display_order)
select 'Team ' || n, n from generate_series(1,8) n
on conflict (name) do nothing;

insert into public.psfs(name,display_order) values
('Fatigue',1),('Stress',2),('Time Pressure',3),('Cognitive Workload',4),
('Physical Conditioning',5),('Environment',6),('Tooling & Equipment',7),
('Motivation',8),('Personal Resilience',9)
on conflict (name) do update set display_order=excluded.display_order;

insert into public.terms(name,start_date,end_date,active)
values ('Autumn 2026','2026-09-01','2026-12-11',true)
on conflict (name) do nothing;

-- Aggregate challenge progress. Special-source challenges count valid submissions made
-- by members of the challenge team during the challenge date window.
create or replace view public.challenge_progress as
select
  c.id as challenge_id,
  c.team_id,
  c.title,
  c.target,
  c.unit,
  c.source_type,
  case c.source_type
    when 'progress' then coalesce((select sum(pe.value) from public.progress_entries pe where pe.challenge_id=c.id),0)
    when 'recognition' then coalesce((select count(*)::numeric from public.recognition_entries re join public.profiles p on p.id=re.submitter_profile_id where p.team_id=c.team_id and re.entry_date between c.start_date and c.end_date),0)
    when 'innovation' then coalesce((select count(*)::numeric from public.innovation_entries ie join public.profiles p on p.id=ie.profile_id where p.team_id=c.team_id and ie.entry_date between c.start_date and c.end_date),0)
    when 'safety' then coalesce((select count(*)::numeric from public.safety_entries se join public.profiles p on p.id=se.profile_id where p.team_id=c.team_id and se.entry_date between c.start_date and c.end_date),0)
    else 0
  end as actual_progress,
  case c.source_type
    when 'progress' then coalesce((select count(distinct pe.profile_id) from public.progress_entries pe where pe.challenge_id=c.id),0)
    when 'recognition' then coalesce((select count(distinct re.submitter_profile_id) from public.recognition_entries re join public.profiles p on p.id=re.submitter_profile_id where p.team_id=c.team_id and re.entry_date between c.start_date and c.end_date),0)
    when 'innovation' then coalesce((select count(distinct ie.profile_id) from public.innovation_entries ie join public.profiles p on p.id=ie.profile_id where p.team_id=c.team_id and ie.entry_date between c.start_date and c.end_date),0)
    when 'safety' then coalesce((select count(distinct se.profile_id) from public.safety_entries se join public.profiles p on p.id=se.profile_id where p.team_id=c.team_id and se.entry_date between c.start_date and c.end_date),0)
    else 0
  end as contributors,
  least(
    case when c.target > 0 then
      (case c.source_type
        when 'progress' then coalesce((select sum(pe.value) from public.progress_entries pe where pe.challenge_id=c.id),0)
        when 'recognition' then coalesce((select count(*)::numeric from public.recognition_entries re join public.profiles p on p.id=re.submitter_profile_id where p.team_id=c.team_id and re.entry_date between c.start_date and c.end_date),0)
        when 'innovation' then coalesce((select count(*)::numeric from public.innovation_entries ie join public.profiles p on p.id=ie.profile_id where p.team_id=c.team_id and ie.entry_date between c.start_date and c.end_date),0)
        when 'safety' then coalesce((select count(*)::numeric from public.safety_entries se join public.profiles p on p.id=se.profile_id where p.team_id=c.team_id and se.entry_date between c.start_date and c.end_date),0)
        else 0 end) / c.target
      else 0 end, 1
  ) as completion,
  greatest(c.target -
    (case c.source_type
      when 'progress' then coalesce((select sum(pe.value) from public.progress_entries pe where pe.challenge_id=c.id),0)
      when 'recognition' then coalesce((select count(*)::numeric from public.recognition_entries re join public.profiles p on p.id=re.submitter_profile_id where p.team_id=c.team_id and re.entry_date between c.start_date and c.end_date),0)
      when 'innovation' then coalesce((select count(*)::numeric from public.innovation_entries ie join public.profiles p on p.id=ie.profile_id where p.team_id=c.team_id and ie.entry_date between c.start_date and c.end_date),0)
      when 'safety' then coalesce((select count(*)::numeric from public.safety_entries se join public.profiles p on p.id=se.profile_id where p.team_id=c.team_id and se.entry_date between c.start_date and c.end_date),0)
      else 0 end),0) as remaining
from public.challenges c
where c.active=true;

create or replace view public.profile_challenge_totals as
select
  p.id as profile_id,
  p.team_id,
  c.id as challenge_id,
  c.title,
  c.unit,
  case c.source_type
    when 'progress' then coalesce((select sum(pe.value) from public.progress_entries pe where pe.profile_id=p.id and pe.challenge_id=c.id),0)
    when 'recognition' then coalesce((select count(*)::numeric from public.recognition_entries re where re.submitter_profile_id=p.id and re.entry_date between c.start_date and c.end_date),0)
    when 'innovation' then coalesce((select count(*)::numeric from public.innovation_entries ie where ie.profile_id=p.id and ie.entry_date between c.start_date and c.end_date),0)
    when 'safety' then coalesce((select count(*)::numeric from public.safety_entries se where se.profile_id=p.id and se.entry_date between c.start_date and c.end_date),0)
    else 0
  end as contribution
from public.profiles p
join public.challenges c on c.team_id=p.team_id and c.active=true
where p.active=true;

create or replace view public.profile_scores as
with active_term as (
  select * from public.terms where active=true order by start_date desc limit 1
), progress_pts as (
  select pe.profile_id, coalesce(sum(pe.value),0)::numeric as points
  from public.progress_entries pe
  join public.challenges c on c.id=pe.challenge_id
  join active_term t on pe.entry_date between t.start_date and t.end_date
  group by pe.profile_id
), rec_pts as (
  select re.submitter_profile_id as profile_id, count(*)::numeric*10 as points
  from public.recognition_entries re join active_term t on re.entry_date between t.start_date and t.end_date group by re.submitter_profile_id
), inn_pts as (
  select ie.profile_id, count(*)::numeric*10 as points
  from public.innovation_entries ie join active_term t on ie.entry_date between t.start_date and t.end_date group by ie.profile_id
), safe_pts as (
  select se.profile_id, count(*)::numeric*10 as points
  from public.safety_entries se join active_term t on se.entry_date between t.start_date and t.end_date group by se.profile_id
)
select p.id as profile_id,p.name,p.team_id,
  coalesce(pp.points,0) as challenge_points,
  coalesce(rp.points,0) as recognition_points,
  coalesce(ip.points,0) as innovation_points,
  coalesce(sp.points,0) as safety_points,
  coalesce(pp.points,0)+coalesce(rp.points,0)+coalesce(ip.points,0)+coalesce(sp.points,0) as kudos_score
from public.profiles p
left join progress_pts pp on pp.profile_id=p.id
left join rec_pts rp on rp.profile_id=p.id
left join inn_pts ip on ip.profile_id=p.id
left join safe_pts sp on sp.profile_id=p.id
where p.active=true;

create or replace view public.team_scores as
select t.id as team_id,t.name,
  coalesce(sum(ps.kudos_score),0) as kudos_score,
  count(ps.profile_id) as profiles
from public.teams t
left join public.profile_scores ps on ps.team_id=t.id
group by t.id,t.name;

-- RLS: ordinary users select reference/aggregate data and insert contributions.
alter table public.teams enable row level security;
alter table public.terms enable row level security;
alter table public.profiles enable row level security;
alter table public.psfs enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_psfs enable row level security;
alter table public.progress_entries enable row level security;
alter table public.recognition_entries enable row level security;
alter table public.innovation_entries enable row level security;
alter table public.safety_entries enable row level security;
alter table public.app_users enable row level security;

create policy "public read teams" on public.teams for select to anon, authenticated using (active=true);
create policy "public read terms" on public.terms for select to anon, authenticated using (true);
create policy "public read profiles" on public.profiles for select to anon, authenticated using (active=true);
create policy "public create profiles" on public.profiles for insert to anon, authenticated with check (role='user');
create policy "public read psfs" on public.psfs for select to anon, authenticated using (true);
create policy "public read challenges" on public.challenges for select to anon, authenticated using (active=true);
create policy "public read challenge psfs" on public.challenge_psfs for select to anon, authenticated using (true);
create policy "public add progress" on public.progress_entries for insert to anon, authenticated with check (true);
create policy "public add recognition" on public.recognition_entries for insert to anon, authenticated with check (true);
create policy "public add innovation" on public.innovation_entries for insert to anon, authenticated with check (true);
create policy "public add safety" on public.safety_entries for insert to anon, authenticated with check (true);

create policy "rep read app user" on public.app_users for select to authenticated using (auth.uid()=auth_user_id);
create policy "rep create challenge" on public.challenges for insert to authenticated with check (
  exists(select 1 from public.app_users au where au.auth_user_id=auth.uid() and (au.role='admin' or (au.role='rep' and au.team_id=team_id)))
);
create policy "rep update challenge" on public.challenges for update to authenticated using (
  exists(select 1 from public.app_users au where au.auth_user_id=auth.uid() and (au.role='admin' or (au.role='rep' and au.team_id=team_id)))
) with check (
  exists(select 1 from public.app_users au where au.auth_user_id=auth.uid() and (au.role='admin' or (au.role='rep' and au.team_id=team_id)))
);
create policy "rep manage challenge psfs" on public.challenge_psfs for all to authenticated using (
  exists(select 1 from public.app_users au join public.challenges c on c.id=challenge_id where au.auth_user_id=auth.uid() and (au.role='admin' or (au.role='rep' and au.team_id=c.team_id)))
) with check (
  exists(select 1 from public.app_users au join public.challenges c on c.id=challenge_id where au.auth_user_id=auth.uid() and (au.role='admin' or (au.role='rep' and au.team_id=c.team_id)))
);

-- Aggregate views intentionally expose no safety narrative.
grant select on public.challenge_progress to anon, authenticated;
grant select on public.profile_challenge_totals to anon, authenticated;
grant select on public.profile_scores to anon, authenticated;
grant select on public.team_scores to anon, authenticated;
