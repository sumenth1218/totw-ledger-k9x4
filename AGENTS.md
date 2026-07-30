# Tale of Two Weddings — Studio Ledger

## Cursor Cloud specific instructions

This repo is a **static HTML frontend (no build step) + an optional Firebase Cloud Functions backend** (`functions/`). Node 22 is used for the backend only; the frontend is plain HTML/CSS/vanilla JS with the Firebase SDK loaded from a CDN.

### Running the frontend (core product)
- Serve the repo root with any static server, e.g. `python3 -m http.server 8000`, then open `http://localhost:8000/index.html`. There is no bundler/build.
- The Firebase web config is **hardcoded in each HTML file and points at the live production project `tot-ledger`** (Realtime Database + Auth). There is no local emulator wiring: `firebase.json` only configures `functions` and there is no `.firebaserc`, so pages always talk to the live cloud project.

### Auth / access caveats (non-obvious)
- `index.html` (Studio Ledger) and `crew.html` require **Google sign-in**, and `index.html` additionally requires the signed-in uid to be present under `admins/` in RTDB. Without owner credentials you only see the sign-in gate — this is expected, not a bug.
- `checklist-candid.html` and `checklist-traditional.html` require **no auth**. They read public RTDB paths (`shotLists`, `shotEventMoods`) and can write `shotChecklists`. `bookings`/`enquiries`/`calendarSeed` are permission-denied without auth, so the "Select the couple…" dropdown stays empty when unauthenticated — use the **"Not listed — type it in"** option. Event-type shot lists still populate (from live `shotLists` overrides, falling back to hardcoded defaults).
- Because the DB is a **live, shared production project**, do not submit test checklists / write junk data (e.g. do not click the checklist Submit button during setup testing).

### Backend functions (optional)
- `functions/` is Firebase Functions v2 (Node 22): Telegram reminder pilot + legacy WhatsApp + scheduled reminders. Install with `npm --prefix functions install`.
- No lint or test scripts exist. Quick sanity check: `node --check functions/index.js`.
- Actually running functions requires `firebase-tools`, secrets (e.g. `TELEGRAM_BOT_TOKEN`), and deploy/emulator setup; scheduled functions need the Blaze plan. See `REMINDER-SETUP.md`. Not needed for core frontend development.
