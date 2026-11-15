# Implementation status

Tracks every requirement in [REQUIREMENTS.md](../REQUIREMENTS.md). Update this file in the same change that implements something.

**Legend:** ✅ Done · 🟡 Partial · ⬜ Not started · ➖ Dropped · 📱 Needs checking on a real iPhone

**Done:** M0, the scaffold from next5: an empty but real app (Shoots, Families and Poses tabs, Settings), the full data model and database, backup and restore, theme that follows the phone, update banner, install hint, error banner, wake-lock hook, What's new, Diagnostics, CI, release script and beta builds. **M1 (families and the tree)** is done apart from the relationship finder (V6) and the shot/attendance views (V7, V8), which wait for later milestones. **M2 (shot engine)** is in `src/engine` (pure, 27 template ids are the single source of truth) with the adapter `src/domain/shotView.ts`. **M3 (shoots and shot list)** is done apart from shoot-day items. **M4 (shoot day)** is done: Start shoot, the live checklist (`#/shoots/:id/live`), who's here, undo, finish and summary, poses on shots. **M6 (hand-off)** is done: share a shoot by link or file, receive, one phone at a time. **M5 (light)**, **M7 (poses)** and **M8 (help, intro, README, polish)** are done. **Next:** check on a real iPhone, then release 1.0.

Last updated: 2026-11-15 (0.2.0 released; ideas for what's next are in [IDEAS.md](IDEAS.md))

## Milestones

| # | Milestone | Status |
|---|-----------|--------|
| M0 | Scaffold from next5 | ✅ |
| M1 | Families + tree | ✅ |
| M2 | Shot engine | ✅ |
| M3 | Shoots + shot list | ✅ |
| M4 | Ordering + shoot day | ✅ |
| M5 | Light | ✅ |
| M6 | Assistant hand-off | ✅ |
| M7 | Pose library | ✅ |
| M8 | Help + polish → 1.0 | ✅ (built; 1.0 waits on M6 and a check on a real iPhone) |

## Release and tooling (REL, Q)

| ID | Status | Notes |
|----|--------|-------|
| REL1 | ✅ | Changelog notes in `changes/`; `npm run release` moves them into `CHANGELOG.md` and `src/changelog.json` (M0, copied from next5). |
| REL2 | ✅ | CI deploys to GitHub Pages only when a push to `main` raises the version (M0). Not yet exercised: no release made. |
| REL3 | ✅ | What's new sheet after an update, and under Settings (M0). |
| REL4 | ✅ | CI checks that a pull request has a note or is a complete release (M0). |
| REL5 | 🟡 | Beta builds on Cloudflare Pages: `CF_PAGES=1` builds are marked Beta, kept apart and list "Coming next" (M0). The Cloudflare project itself still has to be connected. |
| Q-1…Q-7 | 🟡 | `npm run check` runs lint, types, unit tests with coverage, build and e2e (M0). Coverage thresholds: 90% overall; 95% for `src/engine`, `src/tree`, `src/sun` and `src/domain` switch on automatically once each folder has code. |


## 3. Platform and technical constraints

| ID | Status | Notes |
|----|--------|-------|
| T1 | 🟡 | Manifest, standalone display and generated icons are in place (M0). Installing on a real iPhone still to be checked. 📱 |
| T2 | ✅ | Base path `/photo-planner/` and hash routing (M0). The final address depends on the name decision (Q13). |
| T3 | 🟡 | Workbox precache and an offline-launch test in Chromium (M0). Online extras (place search, map, forecast, time zone) are in (M5); map tiles are never precached. |
| T4 | 🟡 | Dexie database `photo-planner` v1 with all tables; persistent storage requested at startup (M0). Migration tests grow with each new version. |
| T5 | ✅ | Update banner never applies silently, with an hourly check; hidden on a shoot in progress and its shoot-day screen via `useInLiveShoot` (M0, M4). |
| T6 | ✅ | React, TypeScript, Vite, vite-plugin-pwa, Dexie, Vitest, fast-check, Testing Library, Playwright (WebKit at iPhone 17 size). |
| T7 | 🟡 | `src/sun` (position, golden hour, plan, time zones) is in with tests; the screens are in (M5). |
| T8 | ⬜ | Photo resizing arrives with the pose library (M7); photos are stored as data URLs. |
| T9 | ✅ | No analytics or tracking. The only network calls are the app's own update checks (M0) and the buttons in the Light section (place search, time zone, map tiles, forecast), each only when tapped (M5); all in `src/data/online.ts`. |

## 5. Families and people

| ID | Status | Notes |
|----|--------|-------|
| F1 | ✅ | Families list with add, rename, archive/unarchive, delete with confirm and search; demo family on the empty state (M1). |
| F2 | ✅ | Quick add family sheet: name, grandparents, children, then partner and kids for each; one transaction (M1). |
| F3 | ✅ | Tree and List views on the family screen; tap a person to edit (M1). |
| F4 | ✅ | Single parents, step-children (one parent), separated partners, unmarried grown children all draw and edit; shown by the demo family (M1). |
| F5 | ✅ | "Not usually at shoots" switch on the person sheet; used when a shoot is created (M1). |
| F6 | ✅ | Several top couples joined by marriage in one tree (demo family). Templates that start from each couple come with M2. |
| F7 | ✅ | Engine `validateFamily` (via `checkFamily` in `src/domain/shotView.ts`; the old `familyChecks.ts` was removed): own ancestor, own parent, more than two parents, child of a person and their parent, parent who is also a partner; shown as a list on the family screen (M1). |
| F9 | ✅ | `ChoosePerson` (searchable list) in the person sheet (parent, partner, child), "+ child" on a couple (`NameSheet`) and Quick add people into an existing family (`QuickAddFamilySheet` `into`). Candidates from `linkCandidates` (`src/domain/links.ts`); `linkParent`, `linkChild`, `linkPartner` and `quickAddFamily` (with `familyId`) in `repo.ts` run `validateFamily` and refuse a link that would add a problem. Unit, property, repo, screen and e2e tests. |
| F10 | ✅ | `DuplicateHint` ("Is this the same Emma? Link instead") from `similarPeople`; never blocks adding. |
| F8 | ✅ | Guests and pets with a name, kind and emoji, per family (per-shoot extras arrive with shoots, M3). |

## 5a. Family tree diagram

| ID | Status | Notes |
|----|--------|-------|
| V1 | ✅ | One row per generation, partners joined by a solid or dashed line, step-children linked to their own parent (M1). |
| V2 | 🟡 | Branch colors are stable (follow the picture left to right, not ids) and used on shot list chips (M3); shoot day comes with M4. |
| V3 | 🟡 | Cards with name or nickname, generation, initials, kid icon and household outline. Photo and the "not usually at shoots" icon are not on the card yet. |
| V4 | ✅ | Pinch, drag, wheel zoom and Fit inside the tree box; the page never scrolls sideways (M1). 📱 |
| V5 | 🟡 | Tap a person to edit and add parents, partners and children; "+" on a couple line adds a child. "How related" waits for V6. |
| V6 | ✅ | "How are they related?" mode on the family screen: tap two people, banner shows `describeRelationship` (M3). |
| V7 | ✅ | Tapping a shot opens a sheet with its people highlighted on the tree (M3); the live screen's Tree view highlights the current shot (M4). |
| V8 | ✅ | Live Tree view: not-attending grayed out, arrived ✓, not yet !, left → badges (M4). |
| V9 | ✅ | Share button on the family screen: SVG to PNG on a canvas, then the share sheet or a download (M1). 📱 |
| V10 | 🟡 | Pure layout module with example and property tests (M1); sun and tree modules were integrated with the strict type settings. |

## 6. Shot generation (the engine)

| ID | Status | Notes |
|----|--------|-------|
| E1 | ✅ | `generateShots` builds the list from the family tree and templates (M2/M3). |
| E2 | ✅ | Templates grouped per §6.1 with toggles and a solo scope picker; duplicates merge with reasons (M3). |
| E3 | ✅ | Attendance sheet; shots that can't be made are listed in a warning section (M3). |
| E4 | ✅ | + Custom shot from a list or the tree (M3). |
| E5 | ✅ | Each template shows its shot count (+N before it is on) (M3). |
| E6 | ✅ | Renames, must-haves, notes, removed and custom shots survive regenerating, which runs on every change (M3). |
| E7 | ✅ | Per-shot notes and pose attach (M4). |
| O1 | ✅ | Suggested order button (M3). |
| O2 | ✅ | Four options as switches on the shoot (M3). |
| O3 | ✅ | Call in ▲ / can leave ▼ / done for the day per step (M3). |
| O4 | ✅ | Drag handle (and arrow keys) sets manual order; ↻ Re-order rest keeps shots already taken first (M3). |
| O5 | ✅ | Total minutes and per-shot clock time from the start time and Settings estimates (M3). |
| O7 | ✅ | `priorities` option in `orderShots` (`src/engine/order.ts`: tiers plus early release, still pure and deterministic); `Shoot.priorities` (optional, no Dexie version); `setPriorities` in `repo.ts`; `PrioritySheet` (per person and multi-select) on the shoot screen; Early/Late badges on shot chips, the live card and Who's here; validated in `validate.ts` and carried in the hand-off. Example, property (permutation, prefix kept, tiers in order, deterministic) and screen tests. |
| O8 | ✅ | Who's here on shoot day has Normal / Early / Late; `suggestDayOrder` in `src/domain/shotView.ts` re-orders only to-do shots into their own slots (done shots never move, the current shot stays first); `reorderNote` gives the note. Undo does not undo a re-order. |
| O9 | ✅ | `everyoneFirst` order option (`src/engine/order.ts`, `everyoneShotKeys`): everyone shots form a front tier, largest first; a shot with a Late person drops out of it. On by default (`DEFAULT_ORDER_OPTIONS`, Settings › New shoots, "Everyone first" on the shoot); missing in older data counts as on. "Full group waits for …" via `everyoneWaitsFor`. Example and property tests. |
| O6 | ⬜ |  |

## 7. Shoot planning

| ID | Status | Notes |
|----|--------|-------|
| P1 | ✅ | Shoots home: upcoming / in progress / finished (M3). |
| P2 | ✅ | New shoot sheet (M3). |
| P3 | 🟡 | Shoot header: date, family, attendees, estimated time (M3). Location picking arrives in M5. |
| P4 | ✅ | Duplicate shoot (M3). |
| P5 | ✅ | Share shot list as text (M3). |

## 8. Shoot day (checklist)

| ID | Status | Notes |
|----|--------|-------|
| D1 | ✅ | Current shot card: big name, people grouped by branch with the tree colors, extras with emoji, pose thumbnail and name, notes, ★ must-have (`LiveScreen`, M4). |
| D2 | ✅ | "Next" card: call in (green ▲), can leave (red ▼) and done for the day, worked out against the shots still to do (`transition` in `src/domain/shootDay.ts`). |
| D3 | ✅ | Big Done ✓ in the bottom thumb zone; Skip, Needs retake and ↶ Undo beside it. Undo reverses the last event exactly (done, skip, retake, put-back, arrive, leave, not-here-yet, add-shot); a property test checks it. |
| D4 | ✅ | List view: To do, Waiting, Retakes, Done, Skipped; tap a shot for Do this now, Mark done, Skip, Needs retake, Put back. |
| D5 | ✅ | Who's here sheet (Here / Not yet / Left). Shots that need someone not here go to Waiting with "waiting for: Dan" and return when they arrive. Leaving offers "Move all of Dan's shots up next". Setting "Treat everyone as here" (default on, in Settings and the sheet): on, a shoot starts with everyone here; off, people start Not yet and their shots wait. |
| D6 | ✅ | "+ Shot" reuses the custom shot sheet; the new shot becomes current and is logged so Undo removes it. |
| D7 | 🟡 | "12 of 30 done · 3 ★ left" and elapsed against planned time. Golden-hour minutes left: `lightBanner` slot in the live screen header, filled by M5. |
| D8 | ✅ | `useWakeLock` while live; everything is in Dexie, so a reload resumes on the same shot (e2e). 📱 check on a real iPhone. |
| D9 | ✅ | Finish shoot shows a summary (done, retakes owed, skipped, not reached, added) with share as text; Reopen shoot goes back to live. |
| D10 | ✅ | Every tap is one atomic `editShoot` write; no Save button. |
| D11 | ✅ | "Shot N of T · X left" from `shotCounter` in `src/domain/shootDay.ts`. The old header showed the shot's place in the stored list (`shots.indexOf(current) + 1`), which jumped with "Do this now", waiting shots and retakes. Unit, property (fast-check) and screen tests. |

## 9. Photographer and assistant

Option B, hand-off like next5 (decided 2026-11-15). Code: `src/data/handoff.ts`, `src/components/ShareShoot.tsx`, `src/screens/ReceiveScreen.tsx`.

| ID | Status | Notes |
|----|--------|-------|
| SH1 | ✅ | Share shoot sheet (Text a link / AirDrop a file) from the shoot screen, the live menu and the finished summary; roles photographer / assistant (M6). 📱 |
| SH2 | ✅ | Format `photo-planner-shoot` v1: the shoot (no hand-off state, forecast or undo log beyond add-shot), family, people, partnerships, used extras, location, and only the user's own poses on shots; no photos. Link = `#/receive/` + deflate-raw base64url (`z`) or plain JSON (`j`) where compression is missing; or a `.json` file (M6). |
| SH3 | ✅ | `#/receive/<data>` shows family, date, progress and Open here; Copy for the app in Safari; Paste shoot and Open shoot file on Shoots. Merging upserts the family by id and deletes nothing (M6). |
| SH4 | ✅ | The hand-off number decides, never clocks; a copy with fewer done shots is refused unless Replace anyway; both changed since the last share asks which to keep; every incoming record is validated first (M6). |
| SH5 | ✅ | After sharing, Shared with the other phone; a planned shoot can still be edited and shared again; a live one is locked (Done, Skip, Undo, who's here, add shot, finish) until Take back control (confirmed). Finished shoots lock nothing (M6). |
| SH6 | ✅ | Shoots list marks shared shoots "Shared" (M6). |

## 10. Light: golden hour and location

| ID | Status | Notes |
|----|--------|-------|
| L1 | ✅ | Light section on the shoot: saved places (reused across shoots, Forget to remove), Use my location, place search (Open-Meteo geocoding, gives the time zone), typed coordinates, and a map pin (Leaflet + OpenStreetMap tiles, lazy-loaded, online only). GPS/pin/coordinates ask the forecast service for the time zone when online, else use the phone's. Offline, online options say "Needs a connection" and never block (M5). 📱 GPS permission to check on iPhone. |
| L2 | ✅ | Headline, shoot-fit line and a zoomed session timeline (`sessionWindow`, `hourTicks`, `lightHeadline`, `shootFit` in `src/domain/light.ts`; `LightSection`): daylight / golden hour / too dark, hour ticks, shoot bar with times, now marker, Morning/Evening toggle (evening unless the start is before noon), zone note, place name only. Sun direction, weather and dates are under "More". Polar days and nights give plain wording. Property and example tests. |
| L3 | ✅ | Golden hour defined in the Help topic "Golden hour and location". Blue hour is gone from the UI and help (the sun module still computes it, `dayTimeline` and `lightRows` remain tested but unused by screens). |
| L4 | ✅ | Morning/Evening choice, suggested start and end, warning from `suggestStart` when the list is longer than golden hour, "Use this start time" sets `startTime` (M5). Must-have-first weighting is not exposed. |
| L5 | ✅ | Bearing, 16-point label and altitude at the planned time, sun symbol on a labelled N/E/S/W rose with a caption under it; "Use compass" ("Compass on", a facing marker at the top) turns the rose live (iOS permission asked on the tap; hidden when the phone has no orientation sensor) (M5). 📱 Compass to check on iPhone. |
| L6 | ✅ | "Pick a date" fold lists the next 21 days with evening and morning golden hours; tap one to set the shoot date (M5). |
| L7 | ✅ | Units: `AppSettings.units` (`us` default, `metric`; missing reads as US; validated on restore), a Units row in Settings, converted at display time by `src/domain/units.ts`; the stored forecast stays metric. "Get forecast" for shoots within 14 days (cloud, rain chance, wind, temperature for the shoot hours). Stored on the shoot as `forecast` (no schema change; backup validates it) and shown offline with its fetch time (M5). |
| L8 | ✅ | `LightBanner({shoot, location, now})` in `src/components/LightBanner.tsx` for the live screen's `lightBanner` slot; not wired into the live screen yet (M5). |

## 11. Pose library

| ID | Status | Notes |
|----|--------|-------|
| PL1 | ✅ | Nine category chips on the Poses tab (`src/poses/labels.ts`). |
| PL2 | ✅ | Detail screen: image, description, numbered "How to direct it", tips, common mistakes, size range, tags, difficulty. Three extra tags (kid-friendly, baby, senior-friendly) feed suggestions. |
| PL3 | ✅ | 60 original illustrations in `public/poses` (precached for offline), starter data in `src/poses/starterPoses.ts`. Seeded into the `poses` table on first visit by `seedStarterPoses` (adds only missing ids, never touches favorites or photos). Credit and license stored per pose. Existing rows are not rewritten when a later release edits starter text. |
| PL4 | ✅ | Add, edit and delete own poses; favorite and add photos (resized to 1600 px JPEG) on any pose. Built-in poses cannot be edited or deleted. 📱 camera picker to check on iPhone. |
| PL5 | ✅ | "Suggested poses" in the shot sheet (group worked out in `src/domain/poseGroup.ts`); tap several to attach (`Shot.poseIds`, ordered; `togglePose`, `movePose`, `clearPoses` in `repo.ts`), a count, up/down arrows to reorder, Clear poses; shown on the live card as a row of thumbnails, tap for directions. Old `poseId` data is converted by Dexie version 2 (`src/domain/shotPoses.ts`), and on restore and receive. `poseIds` is optional in the type (absent means none); `poseId` is only read from old files. |
| PL6 | ✅ | Search, group-size and tag filters, favorites toggle. |
| PL7 | ✅ | Pose sheet button on the shoot screen lists shots in order with all their attached poses (M4). The shot-list text and the hand-off carry every pose. |

## 12. Data, backup and sharing

| ID | Status | Notes |
|----|--------|-------|
| B1 | 🟡 | Back up everything and restore with Merge or Replace work on the full schema (M0). "Without photos" is in the code but not offered in the UI yet. |
| B2 | 🟡 | `createBackup({ familyId })` backs up one family (M0). The per-family UI is still to do; sharing with another phone comes with M6. |
| B3 | 🟡 | Reminder logic (30 days, 7-day snooze) is in `backup.ts` and the update banner offers a backup (M0). The reminder banner on the home screen is not shown yet. |
| B4 | ✅ | Backup files are validated field by field before anything is saved (M0). Shared shoots reuse the same checks in M6. |
| B5 | ✅ | Made-up names only in tests (CLAUDE.md rule). |

## 6.1 Shot templates

The template ids and their starting on/off choices (Q12) are defined in `src/data/types.ts` and `src/data/defaults.ts` (M0). The generating code is M2.

| Template | Status | Notes |
|----------|--------|-------|
| Full group | ⬜ | |
| Full group, no partners | ⬜ | |
| Each generation | ⬜ | |
| Each generation with partners | ⬜ | |
| Grandparents + all children | ⬜ | |
| Grandparents + all grandkids | ⬜ | |
| Grandparents + all grandkids + great-grandkids | ⬜ | |
| All siblings | ⬜ | |
| All sons / all daughters | ⬜ | |
| All grandsons / granddaughters | ⬜ | |
| Cousins | ⬜ | |
| Each branch | ⬜ | |
| Grandparents + each branch | ⬜ | |
| Each household | ⬜ | |
| Each couple | ⬜ | |
| Each parent + their children | ⬜ | |
| Each child's kids only | ⬜ | |
| Each grandparent + each grandkid | ⬜ | |
| Each parent + each child | ⬜ | |
| Grandma with granddaughters / Grandpa with grandsons | ⬜ | |
| Solo portraits | ⬜ | |
| Custom shot | ⬜ | |
| Parents + all their grown children | ⬜ | |
| Parents + each grown child | ⬜ | |
| Parents + each grown child's household | ⬜ | |
| Each grown child's household alone | ⬜ | |
| Add pets / guests to a template | ⬜ | |

## 13–14. Help, documentation, design and UX

| Item | Status | Notes |
|------|--------|-------|
| README for users and developers | ✅ | User section with screenshots; developer section covering the engine, order, tree and sun, tests, deploy and beta (M8). |
| First-run intro (H-3), in-app Help (H-1, H-8), screenshots | ✅ | Skippable intro ending in "Try the demo family" or "Add my own family", replayable from Help. Ten topics at `#/help`, from Settings → Help and guide and "?" links. `npm run screenshots` walks the demo family in light and dark into `public/help/*.webp`, precached (M8). The assistant topic is written from §9 and must match the hand-off (M6). |
| ⓘ explanations (H-4) | ✅ | Each template shows a one-line description; each order option has an ⓘ; Settings too (M8). |
| Empty states (H-6) | ✅ | Shoots, Families, an empty family, the shot list and poses each say what to do next (M8). |
| Install hint in Safari | ✅ | Shown on Shoots until dismissed (M0). |
| iPhone 17 layout, safe areas, 44 pt targets | 🟡 | Tab bar, top bar and sheets respect safe areas; checked in WebKit at 402×874 (M0). 📱 |
| Theme follows the phone, Light and Dark in Settings | ✅ | Default "Match phone"; no flash on launch (M0). |
| Warm photographic look | 🟡 | Amber accent and warm neutral palette; aperture icon (M0). |
| Destructive actions confirm first | ✅ | Every delete, replace and erase asks in one bottom ConfirmSheet (full-width stacked buttons, alertdialog, Escape cancels); no `window.confirm` left. Shoot start time can be cleared. |
