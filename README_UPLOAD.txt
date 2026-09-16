KUDOS - SEPARATE INDIVIDUAL / REP / ADMIN CONTEXTS

Upload these THREE files to the ROOT of elliottbrown77-cpu/KUDOS on main:

1. rep-admin.js
   REPLACE the current file.

2. challenge-teams.js
   REPLACE the current file.

3. index.html
   REPLACE the current file.

No SQL needs to be run. The supporting backend change is already live in Supabase.

WHAT CHANGES

The Rep/Admin screen now has an explicit "Acting as" selector:

INDIVIDUAL
- Uses the normal browser-selected KUDOS profile.
- No Rep or Admin controls are shown.
- The individual profile/team remains completely separate from elevated access.

REP
- Team-scoped management context.
- Uses the account's assigned Rep team.
- For an Admin who also acts as a Rep, the Rep team can now be stored separately in Admin > Access accounts.
- If no Rep team has yet been assigned, KUDOS temporarily falls back to the selected individual profile's team.
- Rep challenge creation can target All teams or a selected subset, but the Rep's own team must be included.

ADMIN
- Global administrator context.
- Does NOT inherit the selected individual's team.
- A separate "View / manage team" selector controls which team's entries/challenges/points are being moderated.
- Challenge creation can target All teams or any selected combination of teams.
- "Remove from all teams" remains Admin-only.
- Access management remains Admin-only.

ADMIN ACCESS DASHBOARD CHANGE
- "Team" is now "Rep team".
- Reps must have a Rep team.
- Admins can optionally also have a Rep team, allowing the same account to switch cleanly into Rep mode.
- Admin authority remains global regardless of the Rep team.

SHARED CHALLENGE BACKEND
- The previous automatic Rep cloning trigger has been removed.
- An authenticated Supabase Edge Function now creates selected multi-team challenge sets.
- Every copy receives the same challenge_group_id.
- PSFs are applied consistently across all selected team copies.
- Reps must include their own Rep team.
- Admins may choose any active teams.
- The public SECURITY DEFINER RPC used during development has been removed.

TESTING AFTER NETLIFY DEPLOYS
1. Sign in to Rep.
2. As an Admin, confirm the default mode is Admin.
3. Confirm the heading says GLOBAL ADMIN and does not identify you as Team 1.
4. Click Create challenge and confirm All teams + individual team checkboxes appear.
5. Switch to Rep mode and confirm Team 1 (or your assigned Rep team) is the management context.
6. Switch to Individual and confirm all elevated controls disappear.
7. Return to Admin and verify View / manage team can change between all 8 teams.
