# KUDOS reporting data validation — 9 November 2026

## Issue

Admin > Entry Moderation lists multiple **Act Of Remembrance** progress
submissions, but a team tile in Reports can show **1 one act**. The reports
previously omitted a combined all-team figure, did not automatically fetch
current data when the Reports navigation button was selected, and relied on
an activity feed query cut off at the Supabase API's 1,000-row response cap.

## Live data reconciliation

Read-only Supabase queries verified:

- 2,671 `progress_entries` rows; 2,671 unique IDs and unique exact-content
  tuples. No missing challenge or profile references, and no cross-team
  challenge entries.
- 72/72 `source_type='progress'` challenge summary rows reconcile exactly
  with raw progress values across all dates (0 discrepancies).
- 364/364 recorded positive profile/challenge contributions reconcile with
  underlying progress totals (0 discrepancies).
- All 8 team KUDOS score summaries equal their underlying profile scores.
- 191 profiles have scores. All 72 configured challenges are of source type
  progress.
- 2,671 rows in `progress_entry_feed`; the old single-query feed loaded at
  most 1,000 into client state.

### Act Of Remembrance

All eight team challenge records belong to the same shared
`challenge_group_id` and run from 8 to 15 November 2026.
Seven recorded progress entries dated 8 November 2026 are present,
with no omissions: Team 4 = 1, Team 5 = 1, Team 6 = 3,
Team 7 = 2; Teams 1/2/3/8 = 0.
Combined total = **7 acts**; **7 recorded entries** from **6 individuals**.
Reports showing **1** for Team 4 or Team 5 was factually correct for
that team, but visually ambiguous without a combined figure.

### Separate date-range quality finding

There are 35 historic `progress_entries` whose entry dates precede
their challenge's currently configured start date (Run Together or
Walk Together). This is likely a historical challenge-date edit or
transition. Current database summary tables include those entries,
which is consistent with the current all-date totals. No records,
targets, challenge dates or accumulated scores were modified as part
of this reporting fix. If a challenge-window-only rule is wanted,
it requires a separate agreed business rule and recalculation of the
derived totals.

## Code changes

- Use shared `challenge_group_id` first to group equivalent challenges
  across the eight teams, falling back to title/unit/source for legacy data.
- Reports show a prominent **Combined result — all teams** with aggregated
  challenge value, full count of recorded progress entries, unique
  contributors and participating teams; per-team cards retain their
  existing figures.
- Handle the unusual unit `one act` correctly as **act** / **acts**.
- Refresh Supabase data when entering Reports; add an explicit
  **Refresh live report** button and UK-time last-refresh display.
  Refresh stale reports when returning to the browser window.
- Paginate the progress-entry feed using ordered 500-row pages so
  the Reports count and Progress comments are not capped at 1,000.
- Version the imported `app.js` URL so browsers fetch this release.

## Acceptance checks

A local JS functional test with eight team challenge records and seven
Remembrance progress entries passed:
- One group based on the shared challenge ID, even with a renamed title.
- Combined summary: 7 acts, 7 recorded entries, 6 contributors,
  four contributing teams.
- Team cards: Team 6 = 3, Team 7 = 2, Teams 4 and 5 = 1 each.
- Simulated paged feed: all 2,671 records loaded in 6 pages.

The production database was not changed by this release.
