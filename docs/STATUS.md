# Implementation status

Tracks every requirement in [REQUIREMENTS.md](../REQUIREMENTS.md). Update this file in the same change that implements something.

**Legend:** ✅ Done · 🟡 Partial · ⬜ Not started · ➖ Dropped · 📱 Needs checking on a real iPhone

**Done:** M0, the scaffold from next5: an empty but real app (Shoots, Families and Poses tabs, Settings), the full data model and database, backup and restore, theme that follows the phone, update banner, install hint, error banner, wake-lock hook, What's new, Diagnostics, CI, release script and beta builds. **Next:** M1, families and the tree diagram (see §16 in the requirements).

Last updated: 2026-11-15 (M0)

## Milestones

| # | Milestone | Status |
|---|-----------|--------|
| M0 | Scaffold from next5 | ✅ |
| M1 | Families + tree | ⬜ |
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
| T7 | ⬜ | Sun module arrives in M5. |
| T8 | ⬜ | Photo resizing arrives with the pose library (M7); photos are stored as data URLs. |
| T9 | ✅ | No analytics or tracking. The only network calls are the app's own update checks (M0). |

## 5. Families and people

| ID | Status | Notes |
|----|--------|-------|
| F1 | ⬜ |  |
| F2 | ⬜ |  |
| F3 | ⬜ |  |
| F4 | ⬜ |  |
| F5 | ⬜ |  |
| F6 | ⬜ |  |
| F7 | ⬜ |  |
| F8 | ⬜ |  |

## 5a. Family tree diagram

| ID | Status | Notes |
|----|--------|-------|
| V1 | ⬜ |  |
| V2 | ⬜ |  |
| V3 | ⬜ |  |
| V4 | ⬜ |  |
| V5 | ⬜ |  |
| V6 | ⬜ |  |
| V7 | ⬜ |  |
| V8 | ⬜ |  |
| V9 | ⬜ |  |
| V10 | ⬜ |  |

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
| B2 | 🟡 | `createBackup({ familyId })` backs up one family (M0). The per-family UI comes with M1; sharing with another phone with M6. |
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
| Empty states | 🟡 | Shoots and Families (M0); Poses is a placeholder. |
| Install hint in Safari | ✅ | Shown on Shoots until dismissed (M0). |
| iPhone 17 layout, safe areas, 44 pt targets | 🟡 | Tab bar, top bar and sheets respect safe areas; checked in WebKit at 402×874 (M0). 📱 |
| Theme follows the phone, Light and Dark in Settings | ✅ | Default "Match phone"; no flash on launch (M0). |
| Warm photographic look | 🟡 | Amber accent and warm neutral palette; aperture icon (M0). |
| Destructive actions confirm first | ✅ | Replace everything and beta erase confirm (M0). |
