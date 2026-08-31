# KUDOS – Clean Contribution Email Build

This build fixes the contribution email layout.

Netlify now detects THREE separate forms:

- `kudos-safety`
- `kudos-recognition`
- `kudos-innovation`

Each form contains only the fields relevant to that contribution type, plus the creator identity:
- submitted by
- profile code
- profile ID
- team
- submission date

## Netlify email setup

Your old `kudos-contribution` form can be left in Netlify for historical submissions, but new KUDOS submissions no longer use it.

In Netlify, add an email notification to `elliott.brown283@mod.gov.uk` for EACH of these three forms:

1. `kudos-safety`
2. `kudos-recognition`
3. `kudos-innovation`

This means:
- a Safety email contains only Safety fields
- a Recognition email contains only Recognition fields
- an Innovation email contains only Innovation fields

## KUDOS score fix

The Autumn 2026 term start date has been corrected in the live Supabase database to 31 August 2026.

The existing test data now calculates as:
- Challenge progress: 1000 points
- Recognition: 10 points
- Innovation: 10 points
- Flight Safety: 10 points
- Total KUDOS score: 1030 points


## Scoring rebalance

This build changes KUDOS scoring so challenge measures do not swamp the behaviour contributions.

New scoring:
- Challenge KUDOS: 1% of the team target contributed = 10 KUDOS, capped at 100 KUDOS per person per challenge
- Recognition: 20 KUDOS each
- Innovation: 20 KUDOS each
- Flight Safety: 20 KUDOS each

Example:
- 1,000 kg logged against a 105,000 kg challenge = 9.52 KUDOS
- 1 Recognition = 20 KUDOS

The live Supabase scoring migration has already been applied. Do not run SCORING_PATCH.sql.
