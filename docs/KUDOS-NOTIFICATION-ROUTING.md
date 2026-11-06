# KUDOS — fully detailed branded HTML contribution emails

## Delivery workflow

When a signed-in KUDOS user submits a Flight Safety, Recognition or Innovation
contribution, KUDOS stores the record in Supabase and submits its Netlify Form
feed. The Netlify-verified formSubmitted event sends the complete form data to
the recipients configured in Admin / Rep → Admin → Overview → Notifications.
The separate aggregate audit form is ignored by the email handler so it
does not trigger a second Amazon SES notification.

Each email contains all submitted fields and the full, unredacted content:
- Submitter name, profile code, profile ID, team, submission date and page URL.
- Flight Safety: category, complete description and external reference.
- Recognition: person recognised and the complete reason or narrative.
- Innovation: category, full title, subject where supplied and full description.
- Additional fields added to Netlify Forms in future also appear automatically,
  except internal honeypot and form-name control fields.

The original content is retained. HTML special characters are safely encoded
so user text displays correctly; they are not redacted or removed. Each email
has a matching full-content plain-text fallback for email clients that block
HTML.

## Branding

Shared renderer: netlify/lib/kudos-email-template.mjs
Automatic sender: netlify/functions/contribution-form-events.mts
Manual test endpoint: netlify/functions/contribution-routing.mts

The HTML design uses KUDOS navy (#0C2338), commando green (#435F46), gold
(#D8C18C), the existing PNG logo (kudos-app-192-v3.png), the Human
Performance Optimisation strapline and the KUDOS tagline. It uses HTML tables
with inline styles to work in Outlook and mobile clients. Recipients may
need to allow remote images; brand name and colours remain visible without
images.

## Manual test mode

The three Send test notification buttons send sample HTML emails in exactly
the same branded template. Test content is clearly marked as invented example
data rather than a genuine KUDOS contribution. The test remains rate-limited
to one per category each minute and requires Workspace Admin authentication.
Existing saved email recipients and SMTP credentials remain unchanged.

## Configuration and information handling

Production uses the dedicated Amazon SES London SMTP credentials in protected
Netlify Functions environment variables; the from address is currently
membership@rnwsa.org with KUDOS Human Performance display name.

Production KUDOS_EMAIL_DELIVERY_ENABLED=true enables automatic sending.
Other deploy contexts remain disabled. Changes to recipient lists take effect
from KUDOS Admin without changing Netlify team membership.

This change supersedes the previous generic-alert approach. The user has
explicitly requested all form details to be included, including safety
narratives and personally identifying fields. The earlier authorisation for
emails to MOD accounts was provided when they carried only generic alerts.
Ensure use of full submission content with this external email platform is
permitted under applicable MOD data-handling rules and by recipient access.
KUDOS is not an official Defence Flight Safety reporting channel.

Legacy built-in Netlify form notification rules might still send their own
emails. Check for duplicates in Netlify; do not disable Netlify Forms capture.

## Checks

- Render all three category examples, including names, IDs, narratives,
  special characters and multiline descriptions.
- Check the plain-text alternative includes every field.
- Click each test button to confirm a branded sample reaches the inbox.
- Submit a legitimate new entry in an authorised test context and verify
  one full-content HTML notification is sent.
- Ensure recipient management and test sending are restricted to Admin users.

## 6 November 2026 — legacy recipient reconciliation (partial)

The initial protected KUDOS routing did not include every address previously
requested for Netlify Form notifications. A separate, already specified MOD
recipient for all three categories was merged into the SQL settings and queued
for a one-off import into the active Netlify Blobs routing. The import is held
in a production-only secret variable, and the importer does not embed personal
email addresses in the public GitHub source. It preserves existing recipients
and uses a persistent completion marker so admins can edit the result
normally afterwards.

**Completeness limitation:** Netlify Form notification email hooks are not
available through the currently connected Netlify API tools. Two additional
external MOD addresses were previously attempted in the Netlify notification
editor but rejected for not being Netlify team members; their specific form
routing was not established. They have NOT been assigned to categories by
guesswork. Obtain the actual Netlify Forms > Submission notifications list
(or Netlify API GET /api/v1/hooks?site_id=...) and reconcile per-form addresses
before declaring migration complete. Do not assume rejected edits became
active legacy notification rules.

Existing built-in Netlify email hooks may still produce duplicate messages,
independently of the KUDOS SES workflow.

## Netlify Forms recipient reconciliation — 6 November 2026 (complete from screenshot)

The user provided a screenshot of the four built-in Netlify Form submission
notification rules. Three are category-specific and have been matched to
KUDOS's new Amazon SES routing:

- kudos-safety: 4 addresses in the screenshot; retain existing personal email
  recipient, giving 5 addresses in KUDOS.
- kudos-recognition: 3 addresses in the screenshot; retain existing personal
  email recipient, giving 4 addresses in KUDOS.
- kudos-innovation: 4 addresses in the screenshot; retain existing personal
  email recipient, giving 5 addresses in KUDOS.
- kudos-contributions: one aggregate-notification address, also present in
  every category above. **Do not create a second SES route** for the aggregate
  form; it is already ignored by the verified-form email handler.

The source of this mapping is the user-provided screenshot; address values
are held in a protected, production-only Functions secret
`KUDOS_VERIFIED_LEGACY_RECIPIENT_IMPORT_V2`, not source control. The v2
migration merges the screenshot lists with the existing active Netlify Blobs
settings, deduplicates case-insensitively, and saves a completion marker to
avoid re-importing recipients after the admin changes them. Matching lists in
`public.contribution_email_routes` were updated as the legacy mirror.

**Avoid duplicated notification emails:** The original native Netlify
Form submission email notification rules remain active unless removed in
Netlify. They cannot be changed by the connected Netlify tools. Once the SES
routes are verified, remove the FOUR legacy *email notification rules only*
from Netlify > Forms > Form submission notifications. Leave Forms processing
enabled; it drives the KUDOS event handler. Until these rules are removed,
some recipients will receive both the old Netlify message and the new branded
SES message.

## Runtime production-context correction — 6 November 2026

A live deploy-event diagnostic confirmed the Netlify Function runtime had
`process.env.CONTEXT === undefined` and `DEPLOY_CONTEXT === undefined`,
even though the production-only Functions-scoped Netlify variables were
available. The previous code incorrectly relied exclusively on
`CONTEXT === "production"` to select the persistent global Netlify Blobs
store and execute recipient migration. It therefore read a deploy-scoped
empty store and displayed the original fallback routes (1 / 1 / 2).

`KUDOS_PRODUCTION_RUNTIME=true` is now set in **Production / Functions**
only. The shared `isKudosProductionRuntime` helper uses this setting,
with a compatibility fallback for runtimes that supply `CONTEXT`.
Both the Admin API and the verified form-submission event now use it.
The full screenshot-verified recipients (5 / 4 / 5 after preserving
pre-existing recipients) are merged into the persistent routing store.

The automatic sender continues to require the independent production-only
`KUDOS_EMAIL_DELIVERY_ENABLED=true` flag and SMTP configuration. Keep
the extra runtime flag isolated to production, rather than exposing sender
credentials or production routing in browser code.
