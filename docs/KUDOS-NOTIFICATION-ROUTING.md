# KUDOS contribution email routing

## Purpose
Workspace Admins can open **Admin/ Rep → Admin → Overview → Notifications** to manage
recipient addresses for Flight Safety, Recognition and Innovation without inviting
recipients into the Netlify hosting team.

## How notifications work
1. An entry is saved in the KUDOS Supabase database.
2. The browser posts the corresponding existing Netlify Forms record, plus the
   legacy aggregate record for established audit workflows.
3. Netlify verifies the form submission. The `formSubmitted` Netlify Function
   handles the *specific* form once; the aggregate form is ignored.
4. The function reads the Admin-managed recipients from the protected Netlify
   Blobs routing store.
5. **Only a generic notification** containing the contribution type and the KUDOS
   home-page URL is emailed. No free text, names, reference numbers, report
   narratives or user-entered field content are included.

The former public `/api/contribution-email` endpoint is disabled with HTTP 410
to prevent unauthenticated email triggering and arbitrary user-submitted
notification text. The browser never reports that email was successfully delivered
until the server has confirmed delivery; a form submission is merely queued for
verification.

## Activation and approval
The SMTP sender is deliberately **not activated by adding recipients**. Configure
the following in Netlify's site Environment variables, scoped to Functions
and Production, only after confirming that the email supplier and the content
are authorised for this use:

- `KUDOS_SMTP_HOST` — approved mail relay hostname
- `KUDOS_SMTP_PORT` — 587 (STARTTLS) or 465 (TLS), as instructed by the provider
- `KUDOS_SMTP_USER` — mail relay username
- `KUDOS_SMTP_PASS` — secret credential (mark as secret)
- `KUDOS_EMAIL_FROM` — provider-authorised sender address
- `KUDOS_EMAIL_DELIVERY_ENABLED` — **true** only after authorisation and a test.
  The default when absent is disabled.

Redeploy KUDOS after changing environment variables. In the Notifications tile,
save recipients and use **Send test notification**. The test contains no submission
details.

## Security and operations
- Recipient read/write/test endpoints validate the signed-in Supabase user and
  require the legacy KUDOS Workspace Admin role.
- No SMTP credential or server secret is exposed to the browser.
- Only Netlify-verified form-submission events trigger automatic email.
- No user-entered content is included in outgoing emails or delivery logs.
- The latest delivery result for each category is shown in Admin, without a list
  of personal data.
- Saved recipient lists are mirrored into existing `contribution_email_routes`
  for compatibility. Netlify Blobs is the active delivery source.
- Legacy Netlify's own form-notification emails may still be configured. Review
  those separately; do not change them until this route is tested.
- **Do not use KUDOS as a replacement for formal Defence Flight Safety reporting.**
  Classify all data correctly and obtain appropriate MOD approval for any service
  that processes it.

## Verification
- Test a new, non-sensitive Recognition submission and confirm the verified-form
  handler records `sent` in Admin, *after* approved SMTP configuration.
- Confirm exactly one message is generated (the aggregate audit form is ignored).
- Confirm no entry narrative or personal data appears in that message.
- Confirm a Rep or unsigned-in user cannot fetch or change recipient lists.
- Confirm the browser does not call `/api/contribution-email`.
