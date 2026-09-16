KUDOS - HARD DELETE CHALLENGES

Upload to the ROOT of elliottbrown77-cpu/KUDOS on main:
- rep-admin.js: replace existing
- index.html: replace existing

challenge-teams.js is included in the ZIP only for completeness and is unchanged.

The required Supabase backend changes are ALREADY LIVE.

Deletion now permanently removes:
- the challenge row
- linked progress_entries
- linked challenge_psfs
- derived challenge progress/score/report data is recalculated by existing triggers

Admin "Delete from all teams" deletes every challenge copy sharing the same challenge_group_id.
There is no inactive challenge archive.
