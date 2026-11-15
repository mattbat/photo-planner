# Implementation status

Tracks every requirement in [REQUIREMENTS.md](../REQUIREMENTS.md). Update this file in the same change that implements something.

**Legend:** ✅ Done · 🟡 Partial · ⬜ Not started · ➖ Dropped · 📱 Needs checking on a real iPhone

**Done:** M0, the scaffold from next5: an empty but real app (Shoots, Families and Poses tabs, Settings), the full data model and database, backup and restore, theme that follows the phone, update banner, install hint, error banner, wake-lock hook, What's new, Diagnostics, CI, release script and beta builds. **M1 (families and the tree)** is done apart from the relationship finder (V6) and the shot/attendance views (V7, V8), which wait for later milestones. **Next:** M2, the shot engine (see §16 in the requirements).

Last updated: 2026-11-15 (M1)

## Milestones

| # | Milestone | Status |
|---|-----------|--------|
| M0 | Scaffold from next5 | ✅ |
| M1 | Families + tree | ✅ |
| M2 | Shot engine | ⬜ |
| M3 | Shoots + shot list | ⬜ |
| M4 | Ordering + shoot day | ⬜ |
| M5 | Light | ⬜ |
| M6 | Assistant hand-off | ⬜ |
| M7 | Pose library | ⬜ |
| M8 | Help + polish → 1.0 | ⬜ |

## Release and tooling (REL, Q)

| ID | Status | Notes |
|----|--------|-------|
| REL1 | ✅ | Changelog notes in `changes/`; `npm run release` moves them into `CHANGELOG.md` and `src/changelog.json` (M0, copied from next5). |
| REL2 | ✅ | CI deploys to GitHub Pages only when a push to `main` raises the version (M0). Not yet exercised: no release made. |
| REL3 | ✅ | What's new sheet after an update, and under Settings (M0). |
| REL4 | ✅ | CI checks that a pull request has a note or is a complete release (M0). |
| REL5 | 🟡 | Beta builds on Cloudflare Pages: `CF_PAGES=1` builds are marked Beta, kept apart and list "Coming next" (M0). The Cloudflare project itself still has to be connected. |
| Q-1…Q-7 | 🟡 | `npm run check` runs lint, types, unit tests with coverage, build and e2e (M0). Coverage thresholds: 80% overall; 95% for `src/engine`, `src/tree` and `src/sun` switch on automatically once each folder has code. |


## 3. Platform and technical constraints

| ID | Status | Notes |
|----|--------|-------|
| T1 | 🟡 | Manifest, standalone display and generated icons are in place (M0). Installing on a real iPhone still to be checked. 📱 |
| T2 | ✅ | Base path `/photo-planner/` and hash routing (M0). The final address depends on the name decision (Q13). |
| T3 | 🟡 | Workbox precache and an offline-launch test in Chromium (M0). The online extras arrive in M5. |
| T4 | 🟡 | Dexie database `photo-planner` v1 with all tables; persistent storage requested at startup (M0). Migration tests grow with each new version. |
| T5 | 🟡 | Update banner never applies silently, with an hourly check; hidden on shoots in progress via `useInLiveShoot` (M0). Shoot routes arrive in M3/M4. |
| T6 | ✅ | React, TypeScript, Vite, vite-plugin-pwa, Dexie, Vitest, fast-check, Testing Library, Playwright (WebKit at iPhone 17 size). |
| T7 | 🟡 | `src/sun` (position, golden hour, plan, time zones) is in with tests; the screens arrive in M5. |
| T8 | ⬜ | Photo resizing arrives with the pose library (M7); photos are stored as data URLs. |
| T9 | ✅ | No analytics or tracking. The only network calls are the app's own update checks (M0). |

## 5. Families and people

| ID | Status | Notes |
|----|--------|-------|
| F1 | ✅ | Families list with add, rename, archive/unarchive, delete with confirm and search; demo family on the empty state (M1). |
| F2 | ✅ | Quick add family sheet: name, grandparents, children, then partner and kids for each; one transaction (M1). |
| F3 | ✅ | Tree and List views on the family screen; tap a person to edit (M1). |
| F4 | ✅ | Single parents, step-children (one parent), separated partners, unmarried grown children all draw and edit; shown by the demo family (M1). |
| F5 | ✅ | "Not usually at shoots" switch on the person sheet; used when a shoot is created (M1). |
| F6 | ✅ | Several top couples joined by marriage in one tree (demo family). Templates that start from each couple come with M2. |
| F7 | ✅ | `src/domain/familyChecks.ts`: own ancestor, own parent, more than two parents, child of a person and their parent, parent who is also a partner; shown as a list on the family screen (M1). |
| F8 | ✅ | Guests and pets with a name, kind and emoji, per family (per-shoot extras arrive with shoots, M3). |

## 5a. Family tree diagram

| ID | Status | Notes |
|----|--------|-------|
| V1 | ✅ | One row per generation, partners joined by a solid or dashed line, step-children linked to their own parent (M1). |
| V2 | 🟡 | Branch colours are drawn; reuse on the shot list and shoot day comes with M3/M4. |
| V3 | 🟡 | Cards with name or nickname, generation, initials, kid icon and household outline. Photo and the "not usually at shoots" icon are not on the card yet. |
| V4 | ✅ | Pinch, drag, wheel zoom and Fit inside the tree box; the page never scrolls sideways (M1). 📱 |
| V5 | 🟡 | Tap a person to edit and add parents, partners and children; "+" on a couple line adds a child. "How related" waits for V6. |
| V6 | ⬜ | Hook point left in `src/domain/familyView.ts` (`RelationshipDescriber`) and the person sheet. |
| V7 | 🟡 | `highlightIds` prop exists on the tree; used from the shot list in M3. |
| V8 | 🟡 | `statusById` prop exists on the tree; used on shoots in M3/M4. |
| V9 | ✅ | Share button on the family screen: SVG to PNG on a canvas, then the share sheet or a download (M1). 📱 |
| V10 | 🟡 | Pure layout module with example and property tests (M1); sun and tree modules were integrated with the strict type settings. |

## 6. Shot generation (the engine)

| ID | Status | Notes |
|----|--------|-------|
| E1 | ⬜ |  |
| E2 | ⬜ |  |
| E3 | ⬜ |  |
| E4 | ⬜ |  |
| E5 | ⬜ |  |
| E6 | ⬜ |  |
| E7 | ⬜ |  |
| O1 | ⬜ |  |
| O2 | ⬜ |  |
| O3 | ⬜ |  |
| O4 | ⬜ |  |
| O5 | ⬜ |  |
| O6 | ⬜ |  |

## 7. Shoot planning

| ID | Status | Notes |
|----|--------|-------|
| P1 | ⬜ |  |
| P2 | ⬜ |  |
| P3 | ⬜ |  |
| P4 | ⬜ |  |
| P5 | ⬜ |  |

## 8. Shoot day (checklist)

| ID | Status | Notes |
|----|--------|-------|
| D1 | ⬜ |  |
| D2 | ⬜ |  |
| D3 | ⬜ |  |
| D4 | ⬜ |  |
| D5 | ⬜ |  |
| D6 | ⬜ |  |
| D7 | ⬜ |  |
| D8 | ⬜ |  |
| D9 | ⬜ |  |
| D10 | ⬜ |  |

## 10. Light: golden hour and location

| ID | Status | Notes |
|----|--------|-------|
| L1 | ⬜ |  |
| L2 | ⬜ |  |
| L3 | ⬜ |  |
| L4 | ⬜ |  |
| L5 | ⬜ |  |
| L6 | ⬜ |  |
| L7 | ⬜ |  |
| L8 | ⬜ |  |

## 11. Pose library

| ID | Status | Notes |
|----|--------|-------|
| PL1 | ⬜ |  |
| PL2 | ⬜ |  |
| PL3 | ⬜ |  |
| PL4 | ⬜ |  |
| PL5 | ⬜ |  |
| PL6 | ⬜ |  |
| PL7 | ⬜ |  |

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
| README for users and developers | 🟡 | Short version written in M0; grows each milestone. |
| First-run intro, in-app Help, screenshots | ⬜ | M8. `npm run screenshots` captures the empty shell for now. |
| ⓘ explanations | 🟡 | `Info` component in place and used in Settings (M0). |
| Empty states | 🟡 | Shoots, Families and an empty family (M0, M1); Poses is a placeholder. |
| Install hint in Safari | ✅ | Shown on Shoots until dismissed (M0). |
| iPhone 17 layout, safe areas, 44 pt targets | 🟡 | Tab bar, top bar and sheets respect safe areas; checked in WebKit at 402×874 (M0). 📱 |
| Theme follows the phone, Light and Dark in Settings | ✅ | Default "Match phone"; no flash on launch (M0). |
| Warm photographic look | 🟡 | Amber accent and warm neutral palette; aperture icon (M0). |
| Destructive actions confirm first | ✅ | Replace everything and beta erase confirm (M0). |
