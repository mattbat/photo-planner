# Photo Planner

**Plan every family photo before the shoot, and tick them off on the day.**

Photo Planner is an iPhone app for family and group photographers. Describe a family once (who is married to whom, who is whose child) and it builds the shot list: the full group, each generation, each household, grandparents with each family, all the cousins, solo portraits and more. On the day, an assistant holds the phone, calls out who is in the next shot, and taps **Done**. Nothing is forgotten.

- Works with no internet once installed. Everything is stored on your phone.
- Free: no App Store, no account, no tracking.

App: **https://mattbat.com/photo-planner/** (the address may change if the app is renamed).

> **Status: version 0.1.** The app shell is in place (Shoots, Families and Poses tabs, back up and restore, light and dark). Families, the shot engine, shoot day, golden hour and the pose library are being built next; see [docs/STATUS.md](docs/STATUS.md).

---

## For photographers

### Install it on your iPhone

1. Open the app in **Safari**. Other browsers on iPhone can't install apps.
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Open Photo Planner from the new icon on your Home Screen.

### Settings

- **Appearance:** Match phone (the default), Light or Dark.
- **Back up everything** saves a file (to Files, iCloud Drive or by AirDrop). **Restore** puts it back on any phone, either merging with what is there or replacing everything. Back up before deleting the app or clearing Safari's website data: the families and shoots live only on your phone.
- **Check for updates:** updates are never applied without asking. You'll see "A new version is ready" and can update when it suits you.
- **What's new** lists the changes in each version. **Diagnostics** shows what your phone reports, for troubleshooting.

---

## For developers

React 19 + TypeScript + Vite, `vite-plugin-pwa`, Dexie (IndexedDB), Vitest (+ fast-check, Testing Library, fake-indexeddb), Playwright, ESLint. Built like [next5](https://github.com/mattbat/next5). The spec is [REQUIREMENTS.md](REQUIREMENTS.md); the rules for contributors are in [CLAUDE.md](CLAUDE.md).

```
npm install
npm run dev          # http://localhost:5173/photo-planner/
npm run check        # lint, types, unit tests + coverage, build, e2e (run before every commit)
npm run icons        # regenerate PNG icons from public/favicon.svg
npm run release      # what's waiting to be released; `-- minor` makes a release
npm run screenshots  # help screenshots (WebKit, iPhone size)
```

Node 22 or newer. End-to-end tests need browsers: `npx playwright install --with-deps webkit chromium`.

### Layout

| Folder | What lives there |
|--------|------------------|
| `src/engine` | Pure: shot generation and ordering (M2, M4) |
| `src/tree` | Pure: family-tree layout (M1) |
| `src/sun` | Pure: sun position and golden hour (M5) |
| `src/domain` | Pure: other helpers |
| `src/data` | Types, Dexie schema, `repo.ts` (the only writer), backup, validation |
| `src/screens`, `src/components`, `src/hooks`, `src/help` | The UI |

### Data

Dexie database `photo-planner`, schema v1: `families`, `people`, `partnerships`, `extras`, `shoots` (each shoot embeds its shot list), `poses`, `posePhotos`, `locations`, `settings`. A person's parents are stored on the person (`parentIds`); partnerships are their own records because they have a status. Types and the reasoning are in `src/data/types.ts`. Never edit an existing `version(n)`; add a new one with a migration.

### Tests

Unit tests for pure code run in Node, screen tests in jsdom (see `test.projects` in `vite.config.ts`). Coverage must stay at 80% overall and 95% for `src/engine`, `src/tree` and `src/sun`. End-to-end tests (`e2e/`) run in WebKit at iPhone 17 size (402×874), plus an offline-launch test in Chromium. Use made-up names only: the repo is public.

### Releases

Merging is not releasing. Every pull request adds a note in `changes/`. `npm run release -- <patch|minor|major>` moves the notes into `CHANGELOG.md` and `src/changelog.json` and bumps the version, in a pull request of its own. CI deploys to GitHub Pages only when a push to `main` raises the version, and then tags a GitHub release. Branches build as **beta** previews on Cloudflare Pages (`CF_PAGES=1`): own name, own data, "Coming next" notes in Settings.
