# Naval Servicewomen's Network KUDOS — Branding & Workspace Pack

Status: Draft / inactive
Workspace slug: `naval-servicewomens-network`

## Brand source

The supplied NSN logo is the source of truth.

Dominant navy extracted from the supplied artwork:
- Primary navy: `#00163B`

Supporting UI palette:
- Primary: `#00163B`
- Primary text: `#00163B`
- Surface: `#FFFFFF`
- App background: `#F6F8FA`
- Muted surface/card header: `#EEF2F5`
- Soft accent: `#DCE6EE`

The NSN experience should feel clean, modern, professional and network-focused rather than squadron/engineering-focused.

## Naming

Platform: **KUDOS**

Workspace/programme name: **Naval Servicewomen's Network**

Short name: **NSN**

Recommended public treatment:
**Naval Servicewomen's Network — powered by KUDOS**

KUDOS remains the underlying platform identity rather than dominating the NSN visual hierarchy.

## Logo usage

### Header
Use the horizontal NSN logo in the top header. The full wordmark is preferred on desktop.

### Mobile header
Use the NSN symbol/mark plus `NSN` to avoid squeezing the full wordmark.

### App icon / PWA icon
Use the standalone navy NSN mark with the white female/anchor symbol, centred on a white or transparent-safe square.

### Login / welcome screen
Use the full NSN logo above the sign-in/profile area. Avoid combining the existing CHF squadron crest row with NSN.

### Reports / exports
Use the NSN full logo in report headers. Add a small `Powered by KUDOS` line only where appropriate.

## Typography and hierarchy

Retain the existing KUDOS system font stack unless NSN provides a formal corporate font requirement.

Headings:
- heavy/bold navy
- short and direct

Supporting copy:
- regular weight
- softer grey/navy
- avoid military engineering terminology

## Workspace terminology

| KUDOS core concept | NSN label |
|---|---|
| Team | Group |
| Teams | Groups |
| Challenge | Activity |
| Challenges | Activities |
| Performance Rep | Group Lead |
| Admin | NSN Admin |
| Recognition | Recognition |
| Innovation | Ideas |

These labels are stored as workspace configuration and should be rendered dynamically rather than hard-coded.

## Modules

### Enabled initially
- Activities / progress
- Recognition
- Ideas
- Group and individual leaderboards
- Notifications
- Moderation / Admin dashboard

### Disabled initially
- Flight Safety
- Performance Shaping Factors
- CHF-specific engineering/human-performance language
- Squadron crest strip

The disabled modules remain available in the KUDOS core but are hidden for NSN.

## Proposed NSN contribution model

The first NSN-specific contribution types should be configurable rather than hard-coded.

Recommended initial types:

### Recognition
Purpose: recognise positive contribution to the network.

Suggested fields:
- person being recognised
- reason
- area/category
- date

### Ideas
Purpose: capture suggestions to improve the network.

Suggested fields:
- category
- title
- description
- optional owner
- status

Suggested categories:
- Mentoring
- Networking
- Outreach
- Events
- Professional Development
- Communications
- Policy / Service Improvement
- Other

### Participation
Potential later module.

Suggested fields:
- activity/event
- role
- date
- impact/note

This should not be added until NSN confirms it is useful.

## Screen-by-screen UI

### 1. Welcome / profile selection
Replace CHF/KUDOS hero treatment with:
- full NSN logo
- `Naval Servicewomen's Network`
- concise welcome copy
- profile/group selector

No squadron crests.

### 2. Header
Desktop:
- full NSN wordmark or mark + NSN
- small `KUDOS` platform reference if required

Mobile:
- NSN mark
- profile chip
- navy-on-white treatment

### 3. Home
Recommended card order:
1. My KUDOS
2. Current NSN Activities
3. Recognition
4. Ideas
5. Group position / network activity

Avoid CHF-specific headings such as PSF coverage or Fight Tonight.

### 4. Activities
Same KUDOS challenge engine underneath, labelled `Activities`.

Examples could include:
- mentoring participation
- outreach targets
- event engagement
- professional-development campaigns

### 5. Log
Use `Log activity` rather than `Log challenge progress`.

Units must remain configurable:
- events
- hours
- people reached
- sessions
- actions
- custom numeric units

### 6. Progress
Use a clean NSN progress view with:
- group progress
- individual contribution
- activity leaderboard
- no CHF engineering terminology

### 7. Contribute
Replace current CHF contribution menu with:
- Recognition
- Ideas

Any future NSN contribution type should appear from workspace configuration.

### 8. Reports
NSN reports should prioritise:
- participation
- recognition
- ideas by category/status
- group engagement
- activity delivery
- trends over time

No Flight Safety or PSF reporting.

### 9. Group Lead
Equivalent of Team Rep.

Group Leads should:
- manage their own group
- moderate group entries
- create/manage permitted activities
- change group display name
- view group reporting

### 10. NSN Admin
NSN Admin should:
- manage NSN groups
- assign Group Leads
- manage activity definitions
- manage contribution types/categories
- manage NSN branding/config
- review network-wide reporting
- manage scoped access

## Workspace configuration already seeded

The production KUDOS database now contains an **inactive draft NSN workspace** with:
- workspace name and slug
- NSN palette
- NSN terminology
- module switches
- configurable scoring defaults
- root NSN organisation

It is deliberately inactive, so it does not affect or appear in the live CHF user experience.

## Required platform work before NSN activation

1. Make frontend routing workspace-aware.
2. Load branding/terminology/features from the selected workspace.
3. Scope profiles, activities, contributions, scores and reports by workspace.
4. Replace hard-coded contribution tables/forms with configurable contribution types where practical.
5. Add workspace-aware PWA manifest/icons.
6. Add NSN image assets to the production asset pipeline.
7. Create NSN-specific groups and access accounts.
8. Run cross-workspace RLS tests to prove CHF and NSN data cannot leak across workspaces.
9. Test mobile install and notifications separately for NSN.
10. Only then set the NSN workspace `active=true`.

## Recommended rollout

### Phase A — visual proof
Build an NSN preview using the existing core screens but NSN branding/terminology.

### Phase B — functional pilot
Create a small number of NSN groups, Group Leads and test users.

### Phase C — contribution configuration
Move NSN Recognition/Ideas into the generic contribution model.

### Phase D — production
Activate NSN workspace, enable its own URL/path and complete access/RLS testing.

## Design principle

NSN should feel like its own product to the user, while technically remaining a tenant/workspace on the shared KUDOS platform.

The target experience is:

**Naval Servicewomen's Network**
*powered by KUDOS*

—not a recoloured copy of the 846 app.
