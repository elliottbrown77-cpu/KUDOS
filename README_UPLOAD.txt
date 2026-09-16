KUDOS - ADMIN REMOVE SHARED CHALLENGE

Upload these two files to the ROOT of elliottbrown77-cpu/KUDOS on main:

1. rep-admin.js
   REPLACE the current rep-admin.js.

2. index.html
   REPLACE the current index.html.
   This bumps the rep-admin cache version so the browser loads the change.

No Supabase SQL changes are required.

New behaviour:
- Performance Rep:
  * Remove from this team only.

- Admin:
  * Remove from this team.
  * Remove from all teams.

"Remove from all teams" deactivates every active challenge row sharing the
same challenge_group_id. It is a soft removal: contribution history remains,
but those challenges stop contributing to active progress, scoring and reports.

Before confirming, KUDOS shows the number of active challenge copies that
will be affected.
