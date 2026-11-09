# KUDOS Safety Log — publication and implementation

Implemented 9 November 2026 for the KUDOS Human Performance application.

## User journey

A new **Safety Log** button is available in the bottom navigation to every
KUDOS user. The Safety Log displays all Safety submissions selected as
**Actioning** by an authorised Safety Manager. Entries stay published when
subsequently changed to **Resolved** or **Closed**; moving them back to
**Submitted** or **Under Review** hides them from the public log.

A prominent **Raise a safety log entry** button on the Safety Log opens
the existing Flight Safety reporting form. New submissions earn the
usual KUDOS contribution points and follow the existing Netlify email
notification workflow. Submissions are not automatically published:
the existing Safety Manager update screen provides the approval gate.

## What is published

All available submission details are visible on published records:
- full, untruncated safety category and description
- contributor name and profile code, team and submission date
- external reference (or a clear 'not provided' label)
- current management status
- the full manager update, including multiline text and updated date
- the KUDOS entry reference ID

The text is HTML-escaped to prevent injected markup executing in visitors'
browsers; no narrative truncation or redaction is applied.

## Secure backend controls

The database change is versioned in
`migrations/20261109_kudos_public_safety_log.sql` and applied to the
live Supabase project `yzrzlexarwgpsqgxbrzn`.

A SELECT-only row-level policy exposes a safety entry to ordinary
`anon` and `authenticated` roles only when its corresponding record
in `contribution_followups` has status `actioning`, `resolved`, or
`closed`. The public `kudos_safety_log` view also enforces that
predicate and uses `security_invoker=true` plus `security_barrier=true`
so it does not bypass the underlying table's row-level security.
Existing manager access policies remain in place. No RLS update or insert
permissions are granted to ordinary viewers.

Because KUDOS permits ordinary users without a sign-in, published entries
are available to anyone with access to the KUDOS website. The existing
submission form cautions users against entering classified, protectively
marked, or security-sensitive details. Managers should assess suitability
before changing a submission to Actioning.

## UI and freshness

The Safety Log loads from `public.kudos_safety_log`, not a browser-only
filter of restricted safety records. It loads in pages of 200 to avoid the
Supabase 1,000-row response limit and supports a live refresh button.
Selecting the Safety Log reloads the current Supabase dataset; active
Safety Log screens also refresh on return to the app and periodically.

Bottom navigation grows to eight buttons for normal users or nine for
workspace administrators with the Weekly report shortcut. The app and
stylesheet imports have new version parameters so the updated scripts
are downloaded on a fresh load.

## Verification

- Database inspection found five existing Safety entries, all linked to
  manager follow-up records, currently two Submitted and three Under Review.
  Therefore the live Safety Log initially contains no published entries.
- The public SELECT view was confirmed to use invoker security and anon
  SELECT permissions; it currently returns zero records.
- Within a transaction, one existing follow-up was temporarily changed to
  Actioning, and a query using the anonymous role confirmed exactly one
  published view record, one RLS-visible safety row and the full manager
  update. The transaction was rolled back, leaving original data unchanged.
- JavaScript tests passed for each public status, untruncated multiline
  descriptions, HTML escaping, contributor metadata, reference details,
  the entry/refresh buttons, the empty state, and a 423-row three-page
  data-load simulation.

Nothing is made public until a manager actively changes status to
Actioning. Authorised managers can later return a record to Under Review
to take it out of the shared log.
