CREATE OR REPLACE FUNCTION public.kudos_engagement_report(p_report_end date, p_weeks integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result jsonb;
begin
  -- Return only aggregated counts, and only to authenticated Workspace Admins.
  if (select auth.uid()) is null or not (
     exists (
       select 1 from public.app_users au
       where au.auth_user_id=(select auth.uid()) and au.role='admin'
     )
     or exists (
       select 1 from public.workspace_access wa
       where wa.auth_user_id=(select auth.uid())
         and wa.active=true and wa.role='workspace_admin'
     )
  ) then
    raise exception 'Workspace Admin access required' using errcode='42501';
  end if;

  if p_report_end is null
     or extract(isodow from p_report_end)::integer <> 4
     or p_report_end > ((now() at time zone 'Europe/London')::date + 7)
     or p_weeks not between 2 and 12
  then
    raise exception 'Invalid reporting window' using errcode='22023';
  end if;

  with
  periods as (
    select (p_report_end - (g.n * 7))::date as week_start,
           (p_report_end - ((g.n - 1) * 7))::date as week_end
    from generate_series(1,p_weeks) as g(n)
  ),
  roster as (
    select t.id as team_id, coalesce(nullif(t.nickname,''),t.name) as team_name,
           count(p.id) filter (where p.active=true)::integer as members
    from public.teams t
    left join public.profiles p on p.team_id=t.id
    where t.active=true
    group by t.id,t.name,t.nickname
  ),
  -- One row per actual logged activity. Values are only meaningful within an individual challenge.
  logged as (
    select pe.profile_id, pr.team_id, pe.entry_date,
           'progress'::text as kind,
           (regexp_replace(lower(trim(c.title)), '[^a-z0-9]+','-','g')
              || '|' || c.source_type || '|' || lower(coalesce(c.unit,''))) as challenge_key,
           c.title as challenge_title, c.unit as challenge_unit,
           pe.value::numeric as volume
    from public.progress_entries pe
    join public.profiles pr on pr.id=pe.profile_id and pr.active=true
    join public.challenges c on c.id=pe.challenge_id
    where pe.entry_date >= p_report_end - p_weeks * 7
      and pe.entry_date < p_report_end

    union all

    select e.submitter_profile_id, pr.team_id, e.entry_date, 'recognition'::text,
           coalesce(
             regexp_replace(lower(trim(c.title)), '[^a-z0-9]+','-','g') || '|' || c.source_type || '|' || lower(coalesce(c.unit,'')),
             'recognition|recognition|submissions'),
           coalesce(c.title,'Recognition'),
           coalesce(c.unit,'submissions'),1::numeric
    from public.recognition_entries e
    join public.profiles pr on pr.id=e.submitter_profile_id and pr.active=true
    left join lateral (
      select c.title,c.unit,c.source_type from public.challenges c
      where c.team_id=pr.team_id and c.source_type='recognition'
        and e.entry_date between c.start_date and c.end_date
      order by c.active desc,c.created_at desc limit 1
    ) c on true
    where e.entry_date >= p_report_end - p_weeks * 7
      and e.entry_date < p_report_end

    union all

    select e.profile_id,pr.team_id,e.entry_date,'innovation'::text,
           coalesce(
             regexp_replace(lower(trim(c.title)), '[^a-z0-9]+','-','g') || '|' || c.source_type || '|' || lower(coalesce(c.unit,'')),
             'innovation|innovation|submissions'),
           coalesce(c.title,'Innovation'),
           coalesce(c.unit,'submissions'),1::numeric
    from public.innovation_entries e
    join public.profiles pr on pr.id=e.profile_id and pr.active=true
    left join lateral (
      select c.title,c.unit,c.source_type from public.challenges c
      where c.team_id=pr.team_id and c.source_type='innovation'
        and e.entry_date between c.start_date and c.end_date
      order by c.active desc,c.created_at desc limit 1
    ) c on true
    where e.entry_date >= p_report_end - p_weeks * 7
      and e.entry_date < p_report_end

    union all

    select e.profile_id,pr.team_id,e.entry_date,'safety'::text,
           coalesce(
             regexp_replace(lower(trim(c.title)), '[^a-z0-9]+','-','g') || '|' || c.source_type || '|' || lower(coalesce(c.unit,'')),
             'safety|safety|submissions'),
           coalesce(c.title,'Flight Safety'),
           coalesce(c.unit,'submissions'),1::numeric
    from public.safety_entries e
    join public.profiles pr on pr.id=e.profile_id and pr.active=true
    left join lateral (
      select c.title,c.unit,c.source_type from public.challenges c
      where c.team_id=pr.team_id and c.source_type='safety'
        and e.entry_date between c.start_date and c.end_date
      order by c.active desc,c.created_at desc limit 1
    ) c on true
    where e.entry_date >= p_report_end - p_weeks * 7
      and e.entry_date < p_report_end
  ),
  tagged as (
    select w.week_start,e.profile_id,e.team_id,e.entry_date,
           e.kind,e.challenge_key,e.challenge_title,e.challenge_unit,e.volume
    from logged e join periods w
      on e.entry_date>=w.week_start and e.entry_date<w.week_end
  ),
  team_week as (
    select w.week_start,r.team_id,r.team_name,r.members,
           count(e.profile_id)::integer as actions,
           count(distinct e.profile_id)::integer as contributors,
           count(e.profile_id) filter (where e.kind='progress')::integer as progress_actions,
           count(e.profile_id) filter (where e.kind='recognition')::integer as recognition_actions,
           count(e.profile_id) filter (where e.kind='innovation')::integer as innovation_actions,
           count(e.profile_id) filter (where e.kind='safety')::integer as safety_actions,
           count(distinct e.challenge_key)::integer as challenges_touched
    from periods w cross join roster r
    left join tagged e on e.week_start=w.week_start and e.team_id=r.team_id
    group by w.week_start,r.team_id,r.team_name,r.members
  ),
  catalog as (
    select distinct on (c.team_id,
      regexp_replace(lower(trim(c.title)), '[^a-z0-9]+','-','g') || '|' || c.source_type || '|' || lower(coalesce(c.unit,'')))
      c.team_id,
      (regexp_replace(lower(trim(c.title)), '[^a-z0-9]+','-','g') || '|' || c.source_type || '|' || lower(coalesce(c.unit,''))) as challenge_key,
      c.title,c.unit,c.source_type
    from public.challenges c
    join roster r on r.team_id=c.team_id
    where c.active=true
    order by c.team_id,
      regexp_replace(lower(trim(c.title)), '[^a-z0-9]+','-','g') || '|' || c.source_type || '|' || lower(coalesce(c.unit,'')),
      c.created_at desc
  ),
  all_catalog as (
    select team_id,challenge_key,title,unit,source_type from catalog
    union
    select distinct e.team_id,e.challenge_key,e.challenge_title,e.challenge_unit,e.kind
    from tagged e
    where not exists (
      select 1 from catalog c where c.team_id=e.team_id and c.challenge_key=e.challenge_key
    )
  ),
  challenge_week as (
    select w.week_start,c.team_id,c.challenge_key,c.title,c.unit,c.source_type,
           count(e.profile_id)::integer as actions,
           count(distinct e.profile_id)::integer as contributors,
           coalesce(sum(e.volume),0)::numeric as volume
    from periods w cross join all_catalog c
    left join tagged e on e.week_start=w.week_start and e.team_id=c.team_id
       and e.challenge_key=c.challenge_key
    group by w.week_start,c.team_id,c.challenge_key,c.title,c.unit,c.source_type
  )
  select jsonb_build_object(
      'report_end',p_report_end,
      'generated_at',now(),
      'basis','Thursday to Wednesday; reporting weeks contain completed days only',
      'teams',coalesce((select jsonb_agg(to_jsonb(r) order by r.team_name) from roster r),'[]'::jsonb),
      'weeks',coalesce((select jsonb_agg(to_jsonb(w) order by w.week_start) from periods w),'[]'::jsonb),
      'team_weeks',coalesce((select jsonb_agg(to_jsonb(t) order by t.week_start,t.team_name) from team_week t),'[]'::jsonb),
      'challenge_weeks',coalesce((select jsonb_agg(to_jsonb(c) order by c.week_start,c.title,c.team_id) from challenge_week c),'[]'::jsonb)
  )
  into result;

  return result;
end;
$function$


revoke all on function public.kudos_engagement_report(date,integer) from public,anon;
grant execute on function public.kudos_engagement_report(date,integer) to authenticated;
