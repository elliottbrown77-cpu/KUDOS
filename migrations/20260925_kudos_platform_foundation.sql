-- KUDOS platform foundation
-- 2026-09-25
-- Adds workspace + organisation hierarchy without changing the existing 846 user experience.

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  branding jsonb not null default '{}'::jsonb,
  terminology jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  scoring_config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint workspaces_branding_object check (jsonb_typeof(branding) = 'object'),
  constraint workspaces_terminology_object check (jsonb_typeof(terminology) = 'object'),
  constraint workspaces_features_object check (jsonb_typeof(features) = 'object'),
  constraint workspaces_scoring_config_object check (jsonb_typeof(scoring_config) = 'object')
);

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_organisation_id uuid,
  slug text not null,
  name text not null,
  short_name text not null default '',
  organisation_type text not null default 'unit',
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisations_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint organisations_type_check check (
    organisation_type in ('service','force','unit','network','department','group','other')
  ),
  constraint organisations_workspace_slug_unique unique (workspace_id, slug),
  constraint organisations_id_workspace_unique unique (id, workspace_id),
  constraint organisations_parent_same_workspace
    foreign key (parent_organisation_id, workspace_id)
    references public.organisations(id, workspace_id)
    on delete restrict
);

alter table public.teams
  add column if not exists workspace_id uuid,
  add column if not exists organisation_id uuid;

insert into public.workspaces (
  slug,name,description,branding,terminology,features,scoring_config
)
values (
  'chf-performance',
  'CHF Performance',
  'Human performance and KUDOS programme for Commando Helicopter Force.',
  jsonb_build_object(
    'product_name','KUDOS',
    'programme_name','CHF Human Performance',
    'primary_colour','#0C2338'
  ),
  jsonb_build_object(
    'team','Team',
    'challenge','Challenge',
    'rep','Performance Rep'
  ),
  jsonb_build_object(
    'challenges',true,
    'recognition',true,
    'innovation',true,
    'flight_safety',true,
    'performance_shaping_factors',true
  ),
  jsonb_build_object(
    'progress_points_per_percent',10,
    'progress_points_cap_per_challenge',100,
    'recognition_points',20,
    'innovation_points',20,
    'flight_safety_points',20
  )
)
on conflict (slug) do update
set name=excluded.name,
    description=excluded.description,
    branding=excluded.branding,
    terminology=excluded.terminology,
    features=excluded.features,
    scoring_config=excluded.scoring_config,
    active=true,
    updated_at=now();

insert into public.organisations (
  workspace_id,parent_organisation_id,slug,name,short_name,organisation_type,display_order
)
select w.id,null,'fleet-air-arm','Fleet Air Arm','FAA','service',10
from public.workspaces w
where w.slug='chf-performance'
on conflict (workspace_id,slug) do update
set name=excluded.name,
    short_name=excluded.short_name,
    organisation_type=excluded.organisation_type,
    display_order=excluded.display_order,
    active=true,
    updated_at=now();

insert into public.organisations (
  workspace_id,parent_organisation_id,slug,name,short_name,organisation_type,display_order
)
select w.id,faa.id,'commando-helicopter-force','Commando Helicopter Force','CHF','force',20
from public.workspaces w
join public.organisations faa
  on faa.workspace_id=w.id and faa.slug='fleet-air-arm'
where w.slug='chf-performance'
on conflict (workspace_id,slug) do update
set parent_organisation_id=excluded.parent_organisation_id,
    name=excluded.name,
    short_name=excluded.short_name,
    organisation_type=excluded.organisation_type,
    display_order=excluded.display_order,
    active=true,
    updated_at=now();

insert into public.organisations (
  workspace_id,parent_organisation_id,slug,name,short_name,organisation_type,display_order
)
select w.id,chf.id,'846-nas','846 Naval Air Squadron','846 NAS','unit',30
from public.workspaces w
join public.organisations chf
  on chf.workspace_id=w.id and chf.slug='commando-helicopter-force'
where w.slug='chf-performance'
on conflict (workspace_id,slug) do update
set parent_organisation_id=excluded.parent_organisation_id,
    name=excluded.name,
    short_name=excluded.short_name,
    organisation_type=excluded.organisation_type,
    display_order=excluded.display_order,
    active=true,
    updated_at=now();

update public.teams t
set workspace_id=w.id,
    organisation_id=o.id
from public.workspaces w
join public.organisations o
  on o.workspace_id=w.id and o.slug='846-nas'
where w.slug='chf-performance'
  and (t.workspace_id is null or t.organisation_id is null);

alter table public.teams
  alter column workspace_id set not null,
  alter column organisation_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='teams_workspace_id_fkey'
      and conrelid='public.teams'::regclass
  ) then
    alter table public.teams
      add constraint teams_workspace_id_fkey
      foreign key (workspace_id)
      references public.workspaces(id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='teams_organisation_workspace_fkey'
      and conrelid='public.teams'::regclass
  ) then
    alter table public.teams
      add constraint teams_organisation_workspace_fkey
      foreign key (organisation_id, workspace_id)
      references public.organisations(id, workspace_id)
      on delete restrict;
  end if;
end $$;

create index if not exists teams_workspace_idx
  on public.teams(workspace_id);

create index if not exists teams_organisation_workspace_idx
  on public.teams(organisation_id,workspace_id);

create index if not exists organisations_workspace_idx
  on public.organisations(workspace_id);

create index if not exists organisations_parent_workspace_idx
  on public.organisations(parent_organisation_id,workspace_id);

alter table public.workspaces enable row level security;
alter table public.organisations enable row level security;

grant select on public.workspaces to anon, authenticated;
grant select on public.organisations to anon, authenticated;
grant insert, update, delete on public.workspaces to authenticated;
grant insert, update, delete on public.organisations to authenticated;

create policy "anon read active workspaces"
on public.workspaces for select to anon
using (active = true);

create policy "authenticated read permitted workspaces"
on public.workspaces for select to authenticated
using (active = true or (select private.current_kudos_role()) = 'admin');

create policy "admins insert workspaces"
on public.workspaces for insert to authenticated
with check ((select private.current_kudos_role()) = 'admin');

create policy "admins update workspaces"
on public.workspaces for update to authenticated
using ((select private.current_kudos_role()) = 'admin')
with check ((select private.current_kudos_role()) = 'admin');

create policy "admins delete workspaces"
on public.workspaces for delete to authenticated
using ((select private.current_kudos_role()) = 'admin');

create policy "anon read active organisations"
on public.organisations for select to anon
using (
  active = true
  and exists (
    select 1 from public.workspaces w
    where w.id=organisations.workspace_id and w.active=true
  )
);

create policy "authenticated read permitted organisations"
on public.organisations for select to authenticated
using (
  (
    active = true
    and exists (
      select 1 from public.workspaces w
      where w.id=organisations.workspace_id and w.active=true
    )
  )
  or (select private.current_kudos_role()) = 'admin'
);

create policy "admins insert organisations"
on public.organisations for insert to authenticated
with check ((select private.current_kudos_role()) = 'admin');

create policy "admins update organisations"
on public.organisations for update to authenticated
using ((select private.current_kudos_role()) = 'admin')
with check ((select private.current_kudos_role()) = 'admin');

create policy "admins delete organisations"
on public.organisations for delete to authenticated
using ((select private.current_kudos_role()) = 'admin');
