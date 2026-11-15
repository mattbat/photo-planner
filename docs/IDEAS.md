# Feature ideas

Ideas for after 0.2.0, collected 2026-11-15 and not yet decided. Nothing here is in `REQUIREMENTS.md` until it's chosen; when one is, move it there with requirement IDs and add it to `docs/STATUS.md`.

⭐ = suggested first (the next milestone, if you agree).

## Before the shoot

| Idea | What it does | Notes |
|------|--------------|-------|
| ⭐ **Client questionnaire link** | Send the family a link to confirm who's coming, add a must-have shot or a new baby, and send it back. | Uses the same no-server link as the assistant hand-off (§9). Needs a limited "client" view and a merge of their answers. |
| ⭐ **Shot list presets by event** | Saved sets of shot types and order options: "Extended family", "Holiday card", "Wedding family formals", "Reunion". | Builds on the per-shoot template choices; a preset is just a saved `templates` + `orderOptions`. |
| **Outfit and colour notes** | Per-household notes, plus a ready-to-send reminder text ("muted blues, no logos"). | Share as text like P5. |
| **Location scouting notes** | Photos of spots, parking, restrooms, and where the light falls at shoot time. | Attach to saved locations; photos resized like T8. Skipped for v1 (Q8). |
| **Gear checklist** | A to-bring list per shoot or per event preset. | Skipped for v1 (Q8). |
| **Rain plan** | A backup indoor location and time when the forecast looks bad. | Uses the cached forecast (L7). |

## Golden hour and light

| Idea | What it does | Notes |
|------|--------------|-------|
| ⭐ **Golden-hour reminder** | A notification about 90 minutes before the suggested start. | Web push works for Home Screen apps on recent iOS, but it needs a push server; a local reminder via the Calendar (an .ics file) needs none. |
| **Horizon height** | Hills and trees hide the sun early: set a horizon angle per saved location and golden hour shifts to match. | Small change in `src/sun` (use the horizon angle instead of 0°). |
| **Moon phase and moonrise** | For evening and blue-hour shoots. | Pure calculation, like the sun module. |
| **Best day this month** | Ranks upcoming dates by golden-hour timing and forecast cloud cover. | Forecast only reaches about 14 days ahead. |

## Shoot day

| Idea | What it does | Notes |
|------|--------------|-------|
| ⭐ **"They can go" banner** | When someone's last shot is done: "Grandma can sit down 🎉". | `doneForDay` already exists in the ordering engine; this just shows it at the right moment. |
| **Voice Done** | The assistant says "done" or "next" with full hands. | Safari speech recognition; must not trigger by accident. |
| **Shot timer** | Records how long each shot took, to make the time estimates (O5) better over time. | Feeds the default minutes-per-size in Settings. |
| **Attention sound** | A button that plays a squeaky toy or bird sound to get toddlers to look. | A few bundled sounds, precached. |
| **Frame numbers** | Note the camera's frame-number range per shot, to match photos to the list when editing. | A number field on each done shot. |

## After the shoot

| Idea | What it does | Notes |
|------|--------------|-------|
| ⭐ **Editing checklist** | After the shoot, mark each shot culled / edited / delivered, and star the client's favourites. | A post-shoot status alongside the shoot-day status. |
| **Delivery summary** | The list of shots taken, ready to paste into a gallery email. | Extends the finish summary (D9). |
| **Stats across shoots** | Average minutes per shot by group size, most-used poses, how often big groups need retakes. | Needs the shot timer for minutes. |

## Families

| Idea | What it does | Notes |
|------|--------------|-------|
| **Share a family** | Send a family to another photographer or to your assistant ahead of time. | A family-only version of the hand-off link. |
| **Faces on the tree** | Take a quick headshot of each person on arrival so the assistant learns names fast. | `Person.photo` already exists; add a camera button on shoot day. |
| **Ages move on** | Kids become "grown" automatically from their birth year. | Already partly there (`grown` from birth year); make it update each year. |
| **Keep apart** | Never put two people in the same shot (separated or estranged relatives). | Skipped for v1 (Q11). An engine rule plus a property test. |

## Poses

| Idea | What it does | Notes |
|------|--------------|-------|
| **Practice mode** | A pose of the day, practised with a timer and its directions read aloud. | |
| **Your photos first** | Show your own example photos before the illustration once you've added some. | Small change on the pose detail screen. |
| **Lighting diagrams** | For each pose: sun behind, open shade, reflector placement. | More drawings in the same style as the pose illustrations. |

## Technical

| Idea | What it does | Notes |
|------|--------------|-------|
| **Live sync with the assistant** | Both phones see every tick within a second (option C in §9). | Needs a small server (e.g. a Cloudflare Worker with Durable Objects) and offline queueing. Decided against for v1. |
| **Automatic backups** | Regular backup files without remembering to tap. | A web app can't write files in the background; at best a reminder that opens the share sheet. |
| **Lock-screen next shot** | The next shot on the lock screen or a watch. | Needs a native wrapper; out of reach for a PWA. |
