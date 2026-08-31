# KUDOS — Simple Setup

## You are here

Your Supabase project is already created, the database SQL has already been run, and this copy of KUDOS already contains your Supabase Project URL and Publishable key.

**Do not edit `config.js`.**

**Do not run `schema.sql` again.**

## The only job now: publish this test version

The app needs a normal web address before it can properly use the database and behave like an installable phone app.

The easiest temporary option is Netlify Drop:

1. Open `https://app.netlify.com/drop` in your browser.
2. Sign in or create a free Netlify account if it asks you to.
3. Drag `KUDOS_CONNECTED_READY_TO_PUBLISH.zip` onto the Netlify Drop page.
4. Wait while Netlify publishes it.
5. Netlify will give you a temporary address ending in `.netlify.app`.
6. Open that address.

Then send the `.netlify.app` address back to ChatGPT.

## What happens next

We will test only three things first:

1. The app can read the eight teams from Supabase.
2. We can create one test profile.
3. We can add one test challenge and one contribution and see the total update.

Once those work, we will add the real profiles/challenges and finish the Performance Rep/Admin controls.

## Security

This website contains only your Supabase **Publishable key**, which is intended for browser applications. It does **not** contain your Secret or `service_role` key.

Before wider use, we will tighten the database permissions and administrator access.
