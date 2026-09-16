KUDOS - SHOW ALL HOME CHALLENGES

Cause:
The main app currently renders:
  challenges.slice(0,6)

That hard-codes the Home page to a maximum of six challenge cards.

Upload these files to the ROOT of elliottbrown77-cpu/KUDOS on main:

1. home-challenges.js
   NEW file.
   Replaces the six-card Home rendering with all active challenges for the
   selected individual's team.

2. index.html
   REPLACE current index.html.
   Adds home-challenges.js to the app loader.

No Supabase change is required.

Behaviour:
- If the team has 9 active challenges, Home shows all 9.
- The existing two-column card layout is retained.
- Add progress and View progress continue to use the main app workflows.
- If app.js is later changed natively to remove the six-card cap,
  home-challenges.js detects that all cards are already present and does nothing.

The clean native app.js change, when the core file is next consolidated, is:
FROM:
  challenges.slice(0,6).map(c=>progressCard(c))
TO:
  challenges.map(c=>progressCard(c))
