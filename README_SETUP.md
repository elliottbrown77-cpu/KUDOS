# KUDOS – Contribution and Email Build

This version adds:

- Flight Safety, Recognition and Innovation buttons to the Home page.
- Flight Safety is shown first and highlighted.
- Flight Safety now requires a description of the issue.
- Recognition now accepts a free-text nominated person. The nominee does not need a KUDOS profile.
- Every Recognition, Innovation and Flight Safety submission records the selected KUDOS profile as the creator.
- After saving to Supabase, the app also submits a Netlify form called `kudos-contribution`.

## One Netlify setting is still required for email

After this build has deployed:

1. Open the **chfkudos** project in Netlify.
2. Open **Forms** and make sure **Form detection** is enabled.
3. After the deploy, confirm you can see a form called **kudos-contribution**.
4. Go to **Project configuration → Notifications → Emails and webhooks → Form submission notifications**.
5. Add an **Email notification** for the `kudos-contribution` form.
6. Set the destination email to:

   **elliott.brown283@mod.gov.uk**

After that, each Recognition, Innovation and Flight Safety entry submitted through KUDOS will be included in the Netlify email notification, including the creator's profile name, profile ID/code and team.

## Flight Safety information

The Safety form allows a description, but the app warns users not to enter classified, protectively marked or otherwise security-sensitive information. Netlify Forms stores form submissions as well as sending notifications, so this workflow should only be used for information approved for this hosting route.


## Admin moderation

Authenticated KUDOS users with the `admin` role now have an **Entry moderation** section in the Rep/Admin page.

Admins can review and remove:
- normal challenge progress entries
- recognition entries
- innovation entries
- Flight Safety entries

Removal immediately changes challenge totals, individual KUDOS scores and team scores.

Performance Representatives cannot delete entries.

Important: deleting a KUDOS entry does not recall an email notification that has already been sent by Netlify and does not automatically remove a retained Netlify Forms submission.
