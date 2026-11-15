# Photo Planner: notes for Claude

iPhone PWA for planning family photo shoots: a family tree builds the shot list, and on the day the list becomes a checklist. The spec is in `REQUIREMENTS.md`; progress is tracked in `docs/STATUS.md`. Built the same way as next5 (the reference project), so when in doubt, copy how next5 does it.

## Rules for every change

- Run `npm run check` (lint, type-check, unit tests with coverage, build, e2e) and make sure it passes before committing. Never commit failing work (Q-7).
- Update `docs/STATUS.md` in the same change that implements or alters a requirement.
- Every change to the app adds a changelog note in `changes/` (see `changes/README.md`), written for the photographer in plain words.
- Releases: versions are x.y.z. Propose the bump from `npm run release`, but always ask the user before a minor or major one. A release (`npm run release -- <bump>`) is its own pull request; merging it is what deploys.
- New features go up as a draft pull request and wait for the user to try them on the Cloudflare beta preview (REL5) before merging. Don't merge one until they say so.
- Add tests with every feature. The pure modules need example tests and, where a rule is involved, a property test (fast-check).
- Keep the pure modules pure: no React, Dexie, DOM or `window` imports in `src/engine`, `src/tree`, `src/sun` or `src/domain`. They may import types from `src/data/types.ts` (it imports nothing). Coverage: 95% lines for engine, tree and sun (enforced automatically once a folder has code), 80% overall.
- Data is written only through `src/data/repo.ts`. Screens read with `useLiveQuery`. For quick edits use the `update*` functions (partial update), not a whole-record save, so fast taps can't overwrite each other.
- Never edit an existing Dexie `version(n)` in `src/data/db.ts`. Add a new version with a migration and a test. Backups from older layouts must still restore.
- Use made-up names only (families, people, pets, places). The repo is public.
- Photos are stored as resized data URLs (T8), so backups stay plain JSON.
- Theme default is "follow the phone" (`system`); never force dark.
- Use the Edit/Write tools for files with special characters (· — ↶ ’), not shell redirects on Windows.

## Layout

`src/engine` shot generation and ordering (pure) · `src/tree` family-tree layout (pure) · `src/sun` sun position and golden hour (pure) · `src/domain` other pure helpers · `src/data` types, Dexie db, repo, backup, validation · `src/screens` · `src/components` · `src/hooks` · `src/help` in-app help (M8).
