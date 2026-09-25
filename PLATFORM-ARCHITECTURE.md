# KUDOS Platform Architecture

## Goal

Evolve the current 846 NAS KUDOS application into a reusable platform without disrupting the live 846 service.

KUDOS should support two independent scaling paths:

1. Organisational scale: 846 NAS → Commando Helicopter Force → Fleet Air Arm.
2. Programme scale: separate KUDOS workspaces for use cases such as the Naval Women's Network, with their own branding, terminology, modules and scoring.

## Foundation now live

The production database now has a workspace and organisation hierarchy.

Current structure:

- Workspace: **CHF Performance**
  - Fleet Air Arm
    - Commando Helicopter Force
      - 846 Naval Air Squadron
        - Team 1–8

Every existing 846 team is linked to both the CHF Performance workspace and 846 NAS. Existing profile IDs, team IDs, challenge IDs, scores and contribution records have not been replaced.

## Workspace configuration

A workspace stores configuration for:

- branding
- terminology
- enabled features/modules
- scoring configuration

The first workspace is seeded with the existing CHF/KUDOS behaviour.

## Organisation hierarchy

Organisations are hierarchical using a parent organisation. This supports adding 845 NAS, 847 NAS, CHF HQ and later other FAA units without changing the 846 structure.

## Security principle

Workspace and organisation tables use Row Level Security. Current active hierarchy data is readable by the app; management is restricted to KUDOS administrators.

Future multi-workspace access must be enforced in database RLS, not just hidden in the UI.

## Next increments

### 1. Organisation administration
Add Admin controls for creating/editing organisations and assigning teams to them.

### 2. Workspace-aware access
Replace the current single global Admin/Rep model with workspace memberships and organisation-scoped roles.

### 3. Configurable contribution types
Move Recognition, Innovation and Flight Safety towards workspace-configured contribution types and fields.

### 4. Configurable branding
Read logos, colours, hero graphics, wording and navigation modules from workspace configuration.

### 5. Second workspace pilot
Create a Naval Women's Network workspace as the first proof that KUDOS can have a completely different UI and contribution model while using the same platform.

### 6. Higher-level reporting
Add authorised roll-up dashboards at Squadron, CHF and FAA levels while preserving access boundaries for individual submissions.

## Compatibility rule

Until workspace-aware RLS and UI routing are complete, the live application continues to behave as the current 846 KUDOS deployment. New platform tables are additive and must not alter current scoring or contribution behaviour.


## Stage 2 now implemented

The platform now has a scoped access model in `workspace_access`.

Roles:
- `workspace_admin` — full administration of a workspace.
- `organisation_admin` — administration of the selected organisation and descendant units/teams.
- `team_rep` — administration of one team.
- `report_viewer` — reserved for future read-only hierarchical reporting.

The existing 846 Admin and Rep accounts have been mirrored into this model so current access continues to work while the platform transitions away from the original single-role `app_users` design.

The production hierarchy now also includes:
- 845 NAS
- 847 NAS
- CHF HQ

No teams have been created inside those organisations yet.

The Admin UI can now:
- view the organisation hierarchy,
- add organisations,
- add teams beneath an organisation,
- assign scoped platform access to existing accounts,
- create new Team Rep, Organisation Admin or Workspace Admin accounts.

Organisation Admins can manage teams within their hierarchy without becoming global Workspace Admins. Database RLS enforces the scope.

Read-only report-viewer access remains intentionally unexposed in the UI until reports themselves are filtered by workspace/organisation scope.
