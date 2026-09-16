KUDOS ADMIN DASHBOARD - GITHUB UPLOAD

Upload/replace these files in the ROOT of elliottbrown77-cpu/KUDOS on the main branch:

1. rep-admin.js
   REPLACE the current rep-admin.js.
   Adds:
   - Admin Dashboard inside the Rep/Admin screen.
   - Counts for Admins, Reps, unassigned accounts and pending invites.
   - Invite a new Rep/Admin by email.
   - Assign/change role and Rep team.
   - Revoke access.
   - Email passwordless sign-in links.
   - Pending invitation management.
   - Access audit history.
   - Passwordless email-link sign-in option on the Rep/Admin login screen.
   - Retains all previous challenge/entry/KUDOS moderation controls.

2. index.html
   REPLACE the current index.html.
   This only bumps the rep-admin.js cache version so the new code is served immediately.

3. ADMIN_DASHBOARD_BACKEND_ALREADY_APPLIED.sql
   Optional source-control/reference file.
   The backend changes are ALREADY LIVE in Supabase. Do NOT run this file against the live project.

How invitations work:
- Admin enters email, role and team (team is required only for Rep).
- KUDOS stores the pending access role.
- Supabase sends a passwordless email sign-in link.
- When the account is created, the stored KUDOS role is applied automatically.
- The recipient opens KUDOS from the email and has the assigned access.
- Existing Auth accounts can be granted/changed immediately without using Supabase.

Safety:
- Only Admins can see/manage the access directory.
- Reps remain limited to their own team.
- The final Admin cannot be revoked or downgraded.
- All access grants, changes and revocations are audited.
- No Supabase service-role key is exposed in the browser.
