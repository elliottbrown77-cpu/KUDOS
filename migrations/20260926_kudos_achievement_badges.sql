-- KUDOS rank + achievement badge aggregates
-- 2026-09-26
-- Stores non-sensitive aggregate activity data used by the public KUDOS UI.

create table if not exists public.profile_achievement_totals (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  total_actions integer not null default 0,
  progress_entries integer not null default 0,
  recognition_entries integer not null default 0,
  innovation_entries integer not null default 0,
  safety_entries integer not null default 0,
  distinct_challenges integer not null default 0,
  capped_challenges integer not null default 0,
  active_weeks integer not null default 0,
  first_active_date date,
  last_active_date date,
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_weekly_activity (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  action_count integer not null default 0,
  progress_entries integer not null default 0,
  recognition_entries integer not null default 0,
  innovation_entries integer not null default 0,
  safety_entries integer not null default 0,
  distinct_challenges integer not null default 0,
  kudos_gained numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (profile_id, week_start)
);

create index if not exists profile_weekly_activity_week_idx
on public.profile_weekly_activity(week_start);

alter table public.profile_achievement_totals enable row level security;
alter table public.profile_weekly_activity enable row level security;

revoke all on public.profile_achievement_totals from anon, authenticated;
revoke all on public.profile_weekly_activity from anon, authenticated;
grant select on public.profile_achievement_totals to anon, authenticated;
grant select on public.profile_weekly_activity to anon, authenticated;

create policy "public read profile achievement totals"
on public.profile_achievement_totals
for select to anon, authenticated
using (true);

create policy "public read profile weekly activity"
on public.profile_weekly_activity
for select to anon, authenticated
using (true);

create or replace function private.rebuild_kudos_achievements()
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
begin
  truncate table public.profile_achievement_totals;
  truncate table public.profile_weekly_activity;

  insert into public.profile_achievement_totals (
    profile_id,total_actions,progress_entries,recognition_entries,
    innovation_entries,safety_entries,distinct_challenges,capped_challenges,active_weeks,
    first_active_date,last_active_date,updated_at
  )
  with events as (
    select profile_id, entry_date, 'progress'::text as event_type, challenge_id
    from public.progress_entries
    union all
    select submitter_profile_id, entry_date, 'recognition', null::uuid
    from public.recognition_entries
    union all
    select profile_id, entry_date, 'innovation', null::uuid
    from public.innovation_entries
    union all
    select profile_id, entry_date, 'safety', null::uuid
    from public.safety_entries
  ),
  agg as (
    select
      profile_id,
      count(*)::int as total_actions,
      count(*) filter (where event_type='progress')::int as progress_entries,
      count(*) filter (where event_type='recognition')::int as recognition_entries,
      count(*) filter (where event_type='innovation')::int as innovation_entries,
      count(*) filter (where event_type='safety')::int as safety_entries,
      count(distinct challenge_id) filter (where challenge_id is not null)::int as distinct_challenges,
      count(distinct date_trunc('week',entry_date::timestamp)::date)::int as active_weeks,
      min(entry_date) as first_active_date,
      max(entry_date) as last_active_date
    from events
    group by profile_id
  ),
  progress_totals as (
    select pe.profile_id,pe.challenge_id,sum(pe.value)::numeric as contribution,c.target::numeric as target
    from public.progress_entries pe
    join public.challenges c on c.id=pe.challenge_id
    where c.source_type='progress' and c.target>0
    group by pe.profile_id,pe.challenge_id,c.target
  ),
  capped as (
    select profile_id,count(*)::int as capped_challenges
    from progress_totals
    where contribution>=target*0.1
    group by profile_id
  )
  select
    p.id,
    coalesce(a.total_actions,0),
    coalesce(a.progress_entries,0),
    coalesce(a.recognition_entries,0),
    coalesce(a.innovation_entries,0),
    coalesce(a.safety_entries,0),
    coalesce(a.distinct_challenges,0),
    coalesce(c.capped_challenges,0),
    coalesce(a.active_weeks,0),
    a.first_active_date,
    a.last_active_date,
    now()
  from public.profiles p
  left join agg a on a.profile_id=p.id
  left join capped c on c.profile_id=p.id;

  insert into public.profile_weekly_activity (
    profile_id,week_start,action_count,progress_entries,recognition_entries,
    innovation_entries,safety_entries,distinct_challenges,kudos_gained,updated_at
  )
  with events as (
    select profile_id, entry_date, 'progress'::text as event_type, challenge_id
    from public.progress_entries
    union all
    select submitter_profile_id, entry_date, 'recognition', null::uuid
    from public.recognition_entries
    union all
    select profile_id, entry_date, 'innovation', null::uuid
    from public.innovation_entries
    union all
    select profile_id, entry_date, 'safety', null::uuid
    from public.safety_entries
  ),
  base as (
    select
      profile_id,
      date_trunc('week',entry_date::timestamp)::date as week_start,
      count(*)::int as action_count,
      count(*) filter (where event_type='progress')::int as progress_entries,
      count(*) filter (where event_type='recognition')::int as recognition_entries,
      count(*) filter (where event_type='innovation')::int as innovation_entries,
      count(*) filter (where event_type='safety')::int as safety_entries,
      count(distinct challenge_id) filter (where challenge_id is not null)::int as distinct_challenges
    from events
    group by profile_id,date_trunc('week',entry_date::timestamp)::date
  ),
  progress_weekly as (
    select
      pe.profile_id,
      pe.challenge_id,
      date_trunc('week',pe.entry_date::timestamp)::date as week_start,
      sum(pe.value)::numeric as week_value
    from public.progress_entries pe
    join public.challenges c on c.id=pe.challenge_id
    where c.source_type='progress' and c.target>0
    group by pe.profile_id,pe.challenge_id,date_trunc('week',pe.entry_date::timestamp)::date
  ),
  progress_running as (
    select
      pw.*,
      c.target::numeric as target,
      sum(pw.week_value) over (
        partition by pw.profile_id,pw.challenge_id
        order by pw.week_start
        rows between unbounded preceding and current row
      ) as running_value
    from progress_weekly pw
    join public.challenges c on c.id=pw.challenge_id
  ),
  progress_gain as (
    select
      profile_id,
      week_start,
      sum(
        least((running_value/target)*1000,100)
        -
        least(((running_value-week_value)/target)*1000,100)
      )::numeric as progress_kudos_gained
    from progress_running
    group by profile_id,week_start
  )
  select
    b.profile_id,b.week_start,b.action_count,b.progress_entries,b.recognition_entries,
    b.innovation_entries,b.safety_entries,b.distinct_challenges,
    coalesce(pg.progress_kudos_gained,0)
      + 20*(b.recognition_entries+b.innovation_entries+b.safety_entries),
    now()
  from base b
  left join progress_gain pg
    on pg.profile_id=b.profile_id and pg.week_start=b.week_start;
end;
$function$;

revoke all on function private.rebuild_kudos_achievements() from public,anon,authenticated;

create or replace function private.refresh_kudos_achievements_trigger()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
begin
  perform private.rebuild_kudos_achievements();
  return null;
end;
$function$;

revoke all on function private.refresh_kudos_achievements_trigger() from public,anon,authenticated;

create trigger refresh_achievements_after_progress
after insert or update or delete on public.progress_entries
for each statement execute function private.refresh_kudos_achievements_trigger();

create trigger refresh_achievements_after_recognition
after insert or update or delete on public.recognition_entries
for each statement execute function private.refresh_kudos_achievements_trigger();

create trigger refresh_achievements_after_innovation
after insert or update or delete on public.innovation_entries
for each statement execute function private.refresh_kudos_achievements_trigger();

create trigger refresh_achievements_after_safety
after insert or update or delete on public.safety_entries
for each statement execute function private.refresh_kudos_achievements_trigger();

create trigger refresh_achievements_after_profiles
after insert or update or delete on public.profiles
for each statement execute function private.refresh_kudos_achievements_trigger();

select private.rebuild_kudos_achievements();
