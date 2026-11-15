# Changelog notes

Every pull request that changes the app adds a note here: one file per change, named for it (for example `duplicate-shoot.md`). CI fails a pull request that changes `src/`, `public/` or `index.html` without one, unless it has the `no-changelog` label (for changes photographers won't notice, like tests or tooling).

```markdown
---
type: new
---
Duplicate a shoot to plan the same family next year.
```

- `type` is `new` (something you can now do), `improved` (works better or looks clearer) or `fixed` (a bug).
- Write one or two lines in plain words, as a photographer would say them. They appear in the app under **What's new**.

`npm run release` lists the waiting notes and suggests a version. Making the release (`npm run release -- minor`, for example) moves them into `CHANGELOG.md` and `src/changelog.json` and deletes them here.
