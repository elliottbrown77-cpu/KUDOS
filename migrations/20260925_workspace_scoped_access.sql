-- KUDOS scoped access and organisation administration
-- 2026-09-25
-- Builds on 20260925_kudos_platform_foundation.sql.

alter table public.teams
  add constraint teams_id_workspace_unique unique (id, workspace_id);

create table if not exists public.workspace_access (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  role text not null,
  organisation_id uuid,
  team_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_access_role_check check (
    role in ('workspace_admin','organisation_admin','team_rep','report_viewer')
  ),
  constraint workspace_access_scope_check check (
    (role='workspace_admin' and organisation_id is null and team_id is null)
    or
    (role in ('organisation_admin','report_viewer') and organisation_id is not null and team_id is null)
    or
    (role='team_rep' and organisation_id is null and team_id is not null)
  ),
  constraint workspace_access_org_workspace_fkey
    foreign key (organisation_id,workspace_id)
    references public.organisations(id,workspace_id)
    on delete cascade,
  constraint workspace_access_team_workspace_fkey
    foreign key (team_id,workspace_id)
    references public.teams(id,workspace_id)
    on delete cascade
);

create unique index if not exists workspace_access_workspace_role_unique
on public.workspace_access(auth_user_id,workspace_id,role)
where role='workspace_admin' and active=true;

create unique index if not exists workspace_access_org_role_unique
on public.workspace_access(auth_user_id,workspace_id,organisation_id,role)
where organisation_id is not null and active=true;

create unique index if not exists workspace_access_team_role_unique
on public.workspace_access(auth_user_id,workspace_id,team_id,role)
where team_id is not null and active=true;

create index if not exists workspace_access_user_idx on public.workspace_access(auth_user_id);
create index if not exists workspace_access_workspace_idx on public.workspace_access(workspace_id);
create index if not exists workspace_access_org_idx on public.workspace_access(organisation_id);
create index if not exists workspace_access_team_idx on public.workspace_access(team_id);

alter table public.workspace_access enable row level security;
grant select,insert,update,delete on public.workspace_access to authenticated;

create policy "workspace access read own or legacy admin"
on public.workspace_access for select to authenticated
using (
  auth_user_id=(select auth.uid())
  or (select private.current_kudos_role())='admin'
);

create policy "legacy admins insert workspace access"
on public.workspace_access for insert to authenticated
with check ((select private.current_kudos_role())='admin');

create policy "legacy admins update workspace access"
on public.workspace_access for update to authenticated
using ((select private.current_kudos_role())='admin')
with check ((select private.current_kudos_role())='admin');

create policy "legacy admins delete workspace access"
on public.workspace_access for delete to authenticated
using ((select private.current_kudos_role())='admin');

-- Seed CHF children ready for expansion.
insert into public.organisations (workspace_id,parent_organisation_id,slug,name,short_name,organisation_type,display_order)
select w.id,chf.id,'845-nas','845 Naval Air Squadron','845 NAS','unit',31
from public.workspaces w
join public.organisations chf on chf.workspace_id=w.id and chf.slug='commando-helicopter-force'
where w.slug='chf-performance'
on conflict (workspace_id,slug) do update
set parent_organisation_id=excluded.parent_organisation_id,name=excluded.name,short_name=excluded.short_name,
    organisation_type=excluded.organisation_type,display_order=excluded.display_order,active=true,updated_at=now();

insert into public.organisations (workspace_id,parent_organisation_id,slug,name,short_name,organisation_type,display_order)
select w.id,chf.id,'847-nas','847 Naval Air Squadron','847 NAS','unit',32
from public.workspaces w
join public.organisations chf on chf.workspace_id=w.id and chf.slug='commando-helicopter-force'
where w.slug='chf-performance'
on conflict (workspace_id,slug) do update
set parent_organisation_id=excluded.parent_organisation_id,name=excluded.name,short_name=excluded.short_name,
    organisation_type=excluded.organisation_type,display_order=excluded.display_order,active=true,updated_at=now();

insert into public.organisations (workspace_id,parent_organisation_id,slug,name,short_name,organisation_type,display_order)
select w.id,chf.id,'chf-hq','Commando Helicopter Force Headquarters','CHF HQ','unit',33
from public.workspaces w
join public.organisations chf on chf.workspace_id=w.id and chf.slug='commando-helicopter-force'
where w.slug='chf-performance'
on conflict (workspace_id,slug) do update
set parent_organisation_id=excluded.parent_organisation_id,name=excluded.name,short_name=excluded.short_name,
    organisation_type=excluded.organisation_type,display_order=excluded.display_order,active=true,updated_at=now();

-- Mirror current management access into scoped platform access.
insert into public.workspace_access(auth_user_id,workspace_id,role,team_id)
select au.auth_user_id,t.workspace_id,'team_rep',au.team_id
from public.app_users au
join public.teams t on t.id=au.team_id
where au.role='rep'
on conflict do nothing;

insert into public.workspace_access(auth_user_id,workspace_id,role)
select distinct au.auth_user_id,w.id,'workspace_admin'
from public.app_users au
cross join public.workspaces w
where au.role='admin' and w.slug='chf-performance'
on conflict do nothing;

-- Team names can repeat in different organisations.
alter table public.teams drop constraint if exists teams_name_key;
alter table public.teams
  add constraint teams_organisation_name_unique unique (organisation_id,name);

-- Private helper functions enforce team/organisation hierarchy in RLS.
-- See production migration history for the definitions of:
-- private.can_manage_organisation(uuid)
-- private.can_manage_team(uuid)
-- private.can_view_team(uuid)
-- private.can_administer_team(uuid)
