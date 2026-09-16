KUDOS REP TOOLS - GITHUB UPLOAD

Upload these two files to the ROOT of the elliottbrown77-cpu/KUDOS repository on the main branch:

1. rep-admin.js
   - New file.
   - Adds Rep/Admin controls for:
     * soft-removing a challenge from the selected team
     * deleting individual Progress, Recognition, Innovation and Flight Safety entries
     * deducting KUDOS points with a mandatory reason and audit trail

2. index.html
   - Replace the existing root index.html with this file.
   - The only functional change is that it loads rep-admin.js after app.js.
   - The query-string version is bumped so browsers and the service worker fetch the new code.

No Supabase SQL needs to be run for this upload. The required backend tables, RLS permissions,
score recalculation changes and audit mechanism have already been applied to the live KUDOS Supabase project.

Expected deployment:
GitHub main -> existing Netlify deployment for chfkudos.netlify.app.

After Netlify deploys:
- Open KUDOS.
- Sign in on the Rep tab with a Performance Rep or Admin account.
- Rep controls should appear below the normal Rep dashboard.
- Reps are restricted by Supabase RLS to their own team.
- Admins can choose which team to manage from the Rep controls panel.

Safety controls:
- Reps can only act on their own team; Supabase RLS enforces this server-side.
- Point deductions require a reason and cannot exceed the person's current KUDOS balance.
- Challenge removal is a soft removal; historic contribution records remain in the database.
