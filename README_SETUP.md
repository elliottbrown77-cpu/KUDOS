# KUDOS – Netlify Forms Fix

This build fixes the contribution form submission path and adds a combined contribution feed.

## Netlify forms in this build

Netlify should detect these four static forms after deployment:

- `kudos-contributions` — combined feed containing every special contribution
- `kudos-safety` — structured Flight Safety submissions
- `kudos-recognition` — structured Recognition submissions
- `kudos-innovation` — structured Innovation submissions

Every Safety / Recognition / Innovation action now makes two Netlify submissions:

1. the relevant structured form; and
2. `kudos-contributions`.

This is intentional. It gives administrators a single combined contributions feed while retaining clean, type-specific records.

## Recommended email notification

Set ONE Netlify email notification on `kudos-contributions` to:

`elliott.brown283@mod.gov.uk`

Do not add email notifications to the other three unless you deliberately want duplicate email messages.

The combined email contains only:

- contribution type
- submitted by
- profile code / ID
- team
- date
- subject
- contribution details

## Why this build is different

The JavaScript now creates its POST body from the exact static HTML form that Netlify detected, including an empty honeypot field. This follows Netlify's documented AJAX form pattern more closely than the previous manually constructed payload.

## After deployment

1. Let Netlify finish the new deployment.
2. Open Netlify > Forms and confirm all four form names exist.
3. Submit one test Recognition from KUDOS.
4. In Netlify Forms you should see the same submission appear in both `kudos-recognition` and `kudos-contributions`.
5. Configure the email notification on `kudos-contributions`.

If a test submission does not appear under Verified submissions, also check the Spam submissions view before assuming it was not received.


## Profile first-launch behaviour

This build fixes profile selection on a new browser/device.

- A saved ordinary profile is stored only in that browser's localStorage.
- A brand-new browser/device no longer defaults to the first profile in the database.
- First use requires the user to explicitly select an existing profile or create a new one.
- If a previously cached profile is removed/deactivated, the local selection is cleared and the user is prompted again.
- Existing users on devices that already have a valid saved profile continue straight into KUDOS.


## Hidden Netlify form layout fix

The four static Netlify forms remain in `index.html` for Netlify form detection,
but are now forced to `display:none !important`.

This removes the blank input boxes that were appearing below the Home screen.
The AJAX submission code can still create `FormData` from forms that are not displayed,
so Netlify capture and email notifications continue to work.
