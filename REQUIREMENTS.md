# Photo Planner — Requirements

**Status:** Draft v0.2 · 2026-11-15 · plan only, nothing built yet (first round of questions answered)
**Owner:** Matt
**Primary user:** An amateur photographer who takes family and group pictures, plus an assistant who marks shots off during the shoot

Built the same way as [next5](https://github.com/mattbat/next5): an iPhone PWA on GitHub Pages, everything stored on the phone, a pure and heavily tested "engine" at the core, and the same CI, release, changelog, beta-preview and help setup.

Items marked **❓** depend on an open question in §17. Decisions so far are in §17a.

---

## 1. Purpose

Family shoots go wrong in one way more than any other: you get home and realize you never got Grandma with just the grandkids. Photo Planner lets the photographer describe the family once (who is married to whom, who is whose child), then builds every grouping worth taking: the full group, each generation, each household, grandparents with each family, all the sons, all the cousins, solo portraits and so on. The photographer trims that into the shot list for the day.

On the day, the shot list becomes a checklist. The assistant holds the phone, calls out who is in the next shot (and who can step out), and taps **Done** after each one. Nothing is forgotten, and people aren't kept standing around longer than needed.

Around that, the app helps plan the shoot: when golden hour is at the location on the chosen date, how long the shot list will take, and a library of poses to try for each kind of shot.

Success means: every requested combination is taken, the shoot runs in an order that keeps people moving, and it's planned for the best light.

## 2. Goals and non-goals

### Goals (v1)
- Manage several shoots: upcoming, in progress and finished.
- Keep a library of families (clients), entered once and reused for later shoots.
- Generate shot combinations automatically from the family's relationships, from a set of templates the photographer can switch on and off.
- Show the family as a tree diagram that makes every relationship easy to see and check (§5a).
- Let the photographer edit the list: remove, rename, add custom shots, mark must-haves, reorder.
- Suggest a shooting order that keeps people moving in and out as little as possible.
- Run the shoot as a fast, one-handed checklist that an assistant can use.
- Show golden hour and blue hour for the shoot's location and date, and suggest a start time.
- Offer a pose library with an example image and a written description for each pose, linked to the shots it suits.
- Work offline at the shoot (parks and venues often have no signal).
- Document the app in a README and with in-app help.

### Non-goals (v1)
- Taking or storing the actual photos, or connecting to the camera.
- Client billing, contracts, galleries or delivery.
- Android- or desktop-first layouts (they may work but aren't designed for).
- Live sync between two phones (decided 2026-11-15: hand-off like next5 instead, §9).
- Gear checklists and per-shoot location notes (skipped for now).

## 3. Platform and technical constraints

Same as next5 unless noted.

| ID | Requirement |
|----|-------------|
| T1 | PWA installed to the iPhone Home Screen, standalone mode. No App Store, no developer account. |
| T2 | Hosted on GitHub Pages at `mattbat.com/photo-planner/` (name may change; ideas in §17). Base path and hash routing set for the subpath, as in next5. |
| T3 | Works completely offline after the first load (Workbox precache), **except** the optional online extras: address search, map, weather forecast (§10). Those say clearly when there is no signal and never block anything else. |
| T4 | Data in IndexedDB through Dexie, with `navigator.storage.persist()`. Versioned migrations; never edit an existing `version(n)`. |
| T5 | Updates are never applied silently; the update banner is hidden while a shoot is running. |
| T6 | Stack: React + TypeScript + Vite, vite-plugin-pwa, Dexie, Vitest + fast-check + Testing Library, Playwright (WebKit at iPhone 17 size). |
| T7 | Sun position is calculated on the phone (the standard NOAA/SunCalc formulas), so golden hour works offline. |
| T8 | Photos the user adds (pose examples) are resized on the phone (longest side ~1600 px, JPEG/WebP) before being stored, to keep storage and backups small. |
| T9 | No analytics or tracking. The only network calls are app updates and the online extras in T3, made only when the user asks for them. |

## 4. Core concepts

- **Family (client):** one connected family tree for one or more shoots, e.g. "The Carters". It can be as big as a reunion: several related households, and the in-laws' side too (e.g. Jen's parents, who share the grandkids). Reused across shoots; edits show up in future shoots, not finished ones.
- **Person:** belongs to a family. Has a name, an optional nickname, and optionally: sex (only used for "sons / daughters / grandsons…" shots), a birth year or "child / adult" (for kid-friendly ordering and pose suggestions), and notes ("uses a wheelchair", "shy, warm up first").
- **Relationship:** *partner of* (married or together) and *child of*. That's all the user enters. Everything else is worked out: generations, siblings, households, branches, cousins, in-laws.
  - **Generation:** grandparents = G1, their children = G2, grandchildren = G3, great-grandchildren = G4. Partners take the generation of the person they married in through.
  - **Household:** a couple (or single parent) and their children who are not grown. A grown child is their own household, alone or with their partner and kids (decided 2026-11-15). A person is marked *grown* by age or by a toggle; anyone with a partner or children of their own counts as grown.
  - **Branch:** one child of the top couple, plus their partner and all their descendants (e.g. "Mike's family").
- **Shot:** one photo setup: a name ("Grandparents + all grandkids"), the exact set of people in it, which template made it (or *custom*), and a must-have flag, notes and a suggested pose.
- **Shot template:** a rule that turns the family tree into shots (§6). Each shoot chooses which templates to use; Settings holds the starting choice for new shoots.
- **Extra people:** guests and pets (a friend, a nanny, the dog 🐶) who aren't part of the tree. They're left out of generated shots and added to custom shots or chosen templates (decided 2026-11-15).
- **Shoot:** a session for one family tree (which may contain several related households): date, location, planned start, attending people, the shot list, its order, and on the day each shot's status.
- **Shot status:** *to do*, *done*, *skipped*, *needs retake*. Plus whether it's *blocked* because someone in it isn't there yet or has left.
- **Pose:** an entry in the pose library: name, category, group size it suits, example image, description, step-by-step direction, tips.

## 5. Families and people

| ID | Requirement |
|----|-------------|
| F1 | Add, edit, archive and delete families. A family list with search. |
| F2 | Add people quickly: name first, everything else optional. A "Quick add family" flow walks the generations: "Who are the grandparents? → Their children? → Who is each child's partner? → Their kids?" |
| F3 | A family tree view showing generations, couples and children, so the photographer can check the structure at a glance. Tap a person to edit. |
| F4 | Relationships handle real families: single parents, step-children (child of one partner only), remarriage, partners who aren't married, children with no partner, a person with no children. |
| F5 | A person can be marked "not usually at shoots" (e.g. lives abroad) so they're unchecked by default. |
| F6 | **Several top couples in one tree:** both sets of grandparents (or a reunion with great-aunts and uncles) live in the same family, joined through marriages. Templates work from each top couple ("Jen's parents + all their grandkids"). |
| F7 | Validation in plain language: "Emma is listed as a child of both Mike and Mike's mother." |
| F9 | **Link people already in the family.** Wherever one person is linked to another (quick add, parent, partner, child on the person sheet, "+ child" on a couple), offer **Choose someone already in the family** next to adding a new person: a searchable list that leaves out impossible choices (themselves, own descendants as a parent, own ancestors as a child, existing links, a third parent). A link that would still break the tree (F7) is refused with the reason. Quick add can also add into an existing family and pick existing people (decided 2026-11-15). |
| F10 | A new name that matches someone already in the family ("Emma") shows a light "Is this the same Emma?" hint with **Link instead**; it never blocks adding (decided 2026-11-15). |
| F8 | Extra people (guests, pets) per family or per shoot, with a name and an optional photo or emoji. |

## 5a. Family tree diagram

A diagram of the family, drawn by the app from the relationships (nobody arranges boxes by hand). It's the main way to check the family is entered right, and it's reused wherever people are picked.

| ID | Requirement |
|----|-------------|
| V1 | **Layout:** one row per generation, top to bottom. Partners sit side by side joined by a line (a solid line for together, dashed for separated); their children hang below from that line. Step-children connect only to their own parent. Families joined by marriage (both sets of grandparents) appear side by side in one diagram. |
| V2 | **Branches are color-coded:** each child of a top couple and everyone descended from them share a color, which is reused on the shot list and shoot day ("Mike's family" is always blue). |
| V3 | Each person is a card: name (or nickname), a generation label, an optional photo or initials, and icons for *kid* and *not usually at shoots*. Grown children show a household outline around them, their partner and their kids. |
| V4 | Pinch to zoom and drag to pan; **Fit** shows the whole family; it works for 4 to 60 people on an iPhone screen. |
| V5 | **Tap a person** to edit them, add a partner, child or parent from there ("+ child" on a couple line), or see how they're related to everyone else. |
| V6 | **Relationship finder:** tap two people to read how they're related in plain words: "Emma is Dan's niece", "Jen is Ruth's daughter-in-law", "Liam and Ava are first cousins". |
| V7 | **Shot view:** on the shot list or on shoot day, tap a shot to see its people highlighted on the tree and everyone else dimmed. Useful to check a shot is what you meant, and for the assistant to spot who to call. |
| V8 | **Attendance view:** on a shoot, people not attending are grayed out; on shoot day, people who have arrived, are waiting or have left are marked. |
| V9 | **Share the tree** as an image (to send to the family: "Is this everyone?"). |
| V10 | The layout is a pure module (`src/tree`) with tests: no overlapping cards or crossing child lines for common family shapes (blended families, remarriage, single parents, two sets of grandparents), and the same family always draws the same way. Drawn as SVG. |

A clickable mockup of the tree and the shoot-day screen is reviewed before the full build (as next5 did for its game screens).

## 6. Shot generation (the engine)

A pure TypeScript module (`src/engine`), no React, Dexie or DOM, tested like next5's rotation engine: example tests for every template and a fast-check property test.

### 6.1 Templates (first set; the user picks which are on)

| Group | Template | Example for the Carters |
|-------|----------|-------------------------|
| Everyone | **Full group** | All 18 people |
| Everyone | **Full group, no partners** (blood relatives only) | 13 people |
| Generations | **Each generation** | Grandparents · all children · all grandkids · all great-grandkids |
| Generations | **Each generation with partners** | All children + their partners |
| Generations | **Grandparents + all children** | |
| Generations | **Grandparents + all grandkids** | |
| Generations | **Grandparents + all grandkids + great-grandkids** | |
| Siblings | **All siblings** (each set of siblings) | Mike, Sarah, Dan |
| Siblings | **All sons / all daughters** (needs sex) | Mike + Dan |
| Siblings | **All grandsons / granddaughters** | |
| Siblings | **Cousins** (all of a generation across branches) | All 9 grandkids |
| Branches | **Each branch** | Mike's family (Mike, Jen, 3 kids) |
| Branches | **Grandparents + each branch** | Grandparents + Mike's family |
| Households | **Each household** | |
| Households | **Each couple** | Mike + Jen |
| Households | **Each parent + their children** | Mike + his 3 kids; Jen + her 3 kids |
| Households | **Each child's kids only** | Mike's 3 kids |
| Pairs | **Each grandparent + each grandkid** (off by default: it multiplies fast) | |
| Pairs | **Each parent + each child** (mother-daughter, father-son…) | |
| Pairs | **Grandma with the granddaughters / Grandpa with the grandsons** | |
| Solo | **Solo portraits** (choose generations: everyone, kids only, adults only) | |
| Custom | **Custom shot**: pick people by tapping them | "Sarah + her college roommate" |

| Grown children | **Parents + all their grown children** (no partners or grandkids) | Grandma, Grandpa, Mike, Sarah, Dan |
| Grown children | **Parents + each grown child** | Grandma, Grandpa + Mike |
| Grown children | **Parents + each grown child's household** | Grandma, Grandpa + Mike, Jen and their kids |
| Grown children | **Each grown child's household alone** | Mike, Jen and their kids |
| Extras | **Add pets / guests to a template** (e.g. the dog in the full group and in its household's photo) | |

The grown-children templates exist because grown children are their own households but you still want them with their parents (decided 2026-11-15).

### 6.2 Engine rules

| ID | Requirement |
|----|-------------|
| E1 | Each template produces zero or more shots. A shot with fewer than its minimum size (e.g. a "siblings" shot with one sibling) is not produced. |
| E2 | **Duplicates merge:** two templates that produce the same set of people give one shot, named by the more specific template, with both listed as reasons ("Each household" + "Each branch"). |
| E3 | Only people attending the shoot are used. A person marked absent drops out of every shot; a shot left identical to another merges; a shot left meaningless (e.g. "all sons" with one son) is flagged rather than silently deleted. |
| E4 | Names are generated in plain language from the tree: "Grandparents + Mike's family", "Carter cousins", "Jen & the kids". Editable. |
| E5 | **Preview before generating:** each template shows how many shots it would add, so it's obvious when "each grandparent + each grandkid" would add 18 photos. |
| E6 | Manual edits are kept when the list is regenerated (e.g. after adding a new baby): removed shots stay removed, renamed shots keep their names, custom shots are kept. Like next5's locks: regenerating changes as little as possible. |
| E7 | The engine is deterministic: the same family, attendance and templates always give the same list in the same order. |

### 6.3 Shooting order

| ID | Requirement |
|----|-------------|
| O1 | **Suggested order** that minimizes changes between consecutive shots (people stepping in or out), i.e. a shortest path through the shots where the cost is how many people change. Groups naturally "peel off": full group → grandparents + all children → grandparents + each branch → each branch → each household → couples → solos. |
| O2 | Options that shape the order (each on/off): **Kids first** (little ones' patience runs out), **Release older people early** (grandparents done early so they can sit down), **Big group first** (everyone is fresh and tidy), **Must-haves early**. |
| O3 | Each step shows **call in** (green ▲) and **can leave / step aside** (red ▼), like next5's IN/OUT pairs. |
| O4 | The photographer can drag shots into any order; the suggestion never overrides a manual order unless asked (**↻ Re-order rest**). |
| O5 | **Time estimate:** minutes per shot by group size (defaults in Settings, e.g. 2 min for 1–2 people, 3 min for 3–6, 5 min for 7+, plus a set-up allowance). Shows the total and when each shot is expected to happen, so it can be matched to the light (§10). |
| O7 | **Early and late people.** On a shoot the photographer marks people **Early** (finish them first: an older guest, someone with special needs) or **Late** (push to the end: someone called away briefly, a little one who needs a break); everyone else is Normal. Set per person or for several at once on the shoot screen, shown as a small Early/Late badge on people chips. Stored on the shoot (`priorities`), validated in backups and carried in the hand-off. Guarantee: after any shots fixed by hand or already done, the order is grouped in three tiers that never interleave: shots with an Early person and no Late one, then all other shots, then shots with a Late person and no Early one. With no shot that mixes Early and Late people, every shot with an Early person comes before every shot without one, and every shot with a Late person comes after every shot without one. Inside a tier the fewest-changes order applies, and Early people are released as soon as possible (decided 2026-11-15). |
| O8 | On shoot day, **Who's here** has the same Normal / Early / Late control. Changing it re-orders only the shots still to do, keeping the one being photographed first; done, skipped and retake shots never move. A short note says what happened ("Reordered: Grandma's 4 shots are next") (decided 2026-11-15). |
| O9 | **Everyone first** (option, on by default, in Settings and per shoot). The "everyone" shots open the shoot, largest first: the full-group templates (with or without pets and guests) and any shot containing all the people. The rest are ordered as before. A shot with someone marked Late (O7) is not an everyone shot until they are Normal or Early again: the shoot screen says "Full group waits for Dan". Shots fixed by hand or already done keep their place (decided 2026-11-15). |
| O10 | **Group each household** (option, on by default, in Settings and per shoot). A household is a grown child, their partner and their not-grown kids. After the shots fixed by hand or done, the Early people's shots and the everyone shots, the order is: shots with the oldest generation (grandparents, when Release older people early is on; "Grandparents + each household", "Grandparents + all grandkids"); then shots that mix households with no grandparent (cousins, siblings, all the grandkids), ordered for the fewest changes; then one contiguous block per household (all its people from one household), biggest shot first, then couples or kid groups, then solos; blocks are ordered for the fewest changes, ties by branch order in the tree; last, shots with a Late person. Kids first and Must-haves early only break ties inside a tier or block. Off: the order is as before (decided 2026-11-15). |
| O11 | **Camera person's shots together.** When a shoot has a camera person (P6), the shots they are in are kept as one run, first inside each tier and each household block, in their usual relative order, so the camera is handed over once per block instead of back and forth. The Everyone shots (largest first), shots fixed by hand and done shots are untouched, and the Early/Late tiers still never interleave. |
| O6 | Performance: 40 people and 120 shots ordered in under 1 second on an iPhone. |

## 7. Shoot planning

| ID | Requirement |
|----|-------------|
| P1 | Shoots list: upcoming (by date), in progress, finished. Each shows family, date, location, shots done / total. |
| P2 | New shoot: pick a family, date, location (§10), planned start time, and who is attending (everyone checked by default). |
| P3 | Shot list screen: generated shots grouped by template group, toggle templates, add custom shots, mark **must-have ★**, notes, attach a suggested pose (§11). |
| P4 | **Duplicate a shoot** (e.g. same family next year), carrying over templates, custom shots and settings, not statuses. |
| P5 | **Share the shot list as text** (Messages, email, Notes, print) so the family can check it ahead of time: "Anything missing?" |
| P6 | **Behind the camera.** Often the photographer is also in the family. On a shoot, pick who usually takes the photos (`cameraPersonId`) and who takes the shots that include them (`backupCameraPersonId`), from the people attending; either can be cleared. Shots with the camera person say "📷 Priya takes this", or "📷 Use a timer or tripod" when the backup is in the shot too or none is set. Shown on the shot list, the live current and next cards and the shared text list; carried in the hand-off and copied by Duplicate. Both are optional and missing in older data and backups. |

## 8. Shoot day (checklist)

Designed for the assistant's thumb and outdoor glare: large text, big targets, high contrast in both themes.

| ID | Requirement |
|----|-------------|
| D1 | **Current shot** card: shot name, everyone in it in large text (grouped by family branch so the assistant can call "Mike's family!"), the suggested pose, and notes. |
| D2 | **Call in / can leave** list for the next shot (O3). |
| D3 | **Done ✓** marks the shot taken and moves to the next in one tap. **Skip**, **Needs retake** and **↶ Undo** are one more tap away. |
| D4 | The whole list is always one swipe away, with each shot's status, so the assistant can jump around ("Grandpa needs to leave, do all his shots now"). |
| D5 | **Who's here:** mark people as arrived / left. Shots needing someone who isn't here move into a **Waiting** section ("waiting for: Uncle Dan"); when the person arrives, they come back. When someone has to leave, the app offers to move all their remaining shots up next. |
| D6 | **Add a shot on the spot** ("Can we get one with just the girls?") by tapping people. |
| D7 | Progress (12 of 30 done, ★ must-haves left), time elapsed vs. plan, and minutes of golden hour left. |
| D8 | Keeps the screen awake (Wake Lock, reusing next5's `useWakeLock`) and resumes exactly where it was after the phone locks or the app is closed. |
| D9 | **Finish shoot** shows a summary: done, skipped, retakes still owed, custom shots added, and a text to share. Finished shoots can be reopened. |
| D10 | Every tap saves immediately; no Save button. |
| D11 | The current-shot card says **"Shot N of T · X left"**: N is progress (shots done or skipped, plus one), T the shots in the list, X the shots not yet done or skipped. N counts 1, 2, 3 to the end, never drops on Done or Skip, and Undo restores it. It does not depend on the order the shots are taken in (decided 2026-11-15). |

## 9. Photographer and assistant

**Decided 2026-11-15: option B, hand-off like next5.** The three options considered:

| Option | How it works | Pros | Cons |
|--------|--------------|------|------|
| **A. One phone** | The assistant uses the photographer's phone (or their own, with the shoot shared to it). | Simplest. No server. | The photographer can't see progress on their own phone. |
| **B. Hand-off, like next5** (recommended for v1) | Share the shoot by link or AirDrop file (SH1–SH6 in next5, reused nearly as-is). One phone runs the checklist at a time; send it back at the end so the photographer's copy is complete. | Proven code, no server, works with no signal (AirDrop). | Not live: the photographer's phone doesn't update during the shoot. |
| **C. Live sync** | Both phones see every check mark within a second or two, via a tiny server (e.g. Cloudflare Worker + Durable Object, which fits the Cloudflare account already used for next5's betas). Joined by a short code or QR. | Both phones always current; the photographer can glance at what's left. | A server to run (free tier), needs signal at the shoot (must queue offline changes and merge later), more to build and test. Breaks next5's "no server" decision. |

Hand-off details (adapted from next5's SH1–SH6): share the shoot by link or AirDrop file at any point; the receiving phone gets the family, attendance and shot list (with suggested poses, without your own pose photos to keep links small); one phone runs the checklist at a time, with **Take back control**; send it back at the end so the photographer's copy has every check mark, retake and added shot.

## 10. Light: golden hour and location

| ID | Requirement |
|----|-------------|
| L1 | **Location** for each shoot, set by: current GPS position; searching an address or place (online, e.g. Open-Meteo or OpenStreetMap geocoding, no API key); or typing coordinates, or dropping a pin on a map (OpenStreetMap tiles via Leaflet; online only). All three were wanted (decided 2026-11-15). Saved locations can be reused ("Riverside Park"). |
| L2 | **Light for the shoot's session.** One headline sentence ("Golden hour 4:56–5:48 PM · sunset 5:32 PM"), one line on how the planned shoot fits ("✓ All of your shoot is in golden hour", "starts 11 min before golden hour and ends during it"), and a zoomed timeline of just that session: about 2.5 hours before golden hour to 30 minutes after it (mirrored for the morning, widened to hold the shoot), in daylight, golden hour and "too dark", with hour ticks, the shoot's span (O5) as a bar labelled with its times, and a "now" marker on the day. Evening by default, morning when the planned start is before noon, with a toggle. Times in the location's zone, with a note when that differs from the phone's. The place shows by name only. Sun direction, weather and other dates sit in a **More** fold (decided 2026-11-15). |
| L3 | Definition shown in help: golden hour = sun between about 6° above and 4° below the horizon. Blue hour is not shown anywhere in the UI (the sun module still computes it). |
| L4 | **Suggested start time**: so the planned shoot ends as golden hour ends (evening) or starts as it begins (morning), with must-have and big-group shots in the best light. A warning if the shot list is longer than golden hour. |
| L5 | **Sun direction**: the sun's compass bearing at the planned time, shown as a sun symbol on a rose with N, E, S and W labelled and a caption ("Where the sun will be at 4:45 PM"); "Use compass" turns the rose with the phone and marks where you are facing so the photographer knows where to put the family relative to the sun. |
| L6 | **Pick a date**: a small calendar or list showing golden-hour times for the next weeks, to help choose a date. |
| L7 | **Weather forecast** (cloud cover, rain chance, wind, temperature; **US units, °F and mph, by default**, metric in Settings. The saved forecast stays as the service sends it and is converted when shown, so switching needs no new download) for shoots in the next ~14 days from Open-Meteo (free, no key). Online only; cached for offline viewing. |
| L8 | Shoot day shows a countdown to the end of golden hour (D7). |

The sun calculation lives in a pure module (`src/sun`) with tests against published NOAA times for a few cities and dates, including polar and daylight-saving edge cases.

## 11. Pose library

| ID | Requirement |
|----|-------------|
| PL1 | Categories: **Individual** (adult, man, woman, teen, senior), **Couples**, **Parent + child**, **Kids & babies**, **Siblings**, **Small family (3–6)**, **Large group (7+)**, **Generations**, **Candid / movement**. |
| PL2 | Each pose: name, example image, short description, how to direct it (step by step, in words you can say to people), tips and common mistakes, group size range, tags (sitting, standing, walking, lying down, close-up, full-length, playful, formal), and difficulty. |
| PL3 | **Starter library** of about 60 poses built into the app, works offline. Example images can be drawn illustrations, AI-generated images or free-license stock photos (Pexels/Unsplash, credited) (decided 2026-11-15). Plan: one consistent illustration style for the whole starter set, so it looks like one library; photos the user adds sit alongside. Each image's source and license is recorded. |
| PL4 | The photographer can **add their own poses** and **add their own example photos** to any pose (from Photos or the camera), and mark favorites. |
| PL5 | **Suggested poses** on each shot, matched by group size and who is in it (e.g. kids present, three generations). Tap to attach poses: **a shot can have several**, shown with a count ("3 poses"), in an order the photographer can change with up/down arrows, and cleared all at once. Every attached pose shows on shoot day as a row of thumbnails with names; tapping one opens its directions. |
| PL6 | Search and filter by category, size and tags. |
| PL7 | A **pose sheet** per shoot: all the poses attached to each shot, to review the night before. |

## 12. Data, backup and sharing

Reuses next5's code and behavior.

| ID | Requirement |
|----|-------------|
| B1 | Back up everything to a file (Save to Files / AirDrop); restore with **Merge** or **Replace everything**. Your own pose photos are included (❓ the file may be large; offer "without photos"). |
| B2 | Back up one family, or share a family with another phone (e.g. the assistant). |
| B3 | Backup reminder after a month. |
| B4 | Received files are validated before anything is saved. |
| B5 | Use made-up names only in tests, demo data and screenshots (the repo is public). |

## 13. Help and documentation

As next5 §12: README for users and developers; a skippable first-run intro ending in "Try the demo family" or "Add my own family"; an in-app Help guide with light/dark screenshots taken automatically from the demo family; ⓘ explanations for each template and ordering option; empty states; an install hint in Safari.

## 14. Design and UX

- iPhone 17 portrait, down to 375 pt wide; safe areas; system font; iOS-style sheets.
- Tap targets ≥ 44 pt; Done is always one tap.
- **Theme follows the phone's light/dark setting by default**, with Light and Dark available in Settings (decided 2026-11-15). Shoot day must be readable in bright sun in either: high contrast, large type.
- A look of its own (warm, photographic accent color) rather than next5's sports style, but the same components.
- Destructive actions confirm first.

## 15. Testing, CI and releases

Same as next5 §14 (Q-1…Q-7, REL1…REL5):
- `npm run check` runs lint, types, unit + property tests with coverage, build, and e2e. Must pass before every commit.
- Engine (§6), sun (§10) and domain helpers ≥ 95% line coverage; app ≥ 90%.
- Property tests: every generated shot only contains attending people; no two shots have identical people; regenerating keeps manual edits; an ordering contains every shot exactly once; respecting "release older people early" never schedules a grandparent shot after one they're not in once they're released; Undo exactly reverses Done.
- E2E in WebKit at iPhone 17: create a family → generate shots → plan a shoot → run it with a late arrival, a skip, an added shot and Undo → finish. Offline launch in Chromium.
- GitHub Actions CI; deploy to GitHub Pages only on a release; changelog notes in `changes/`; Cloudflare Pages beta previews for draft PRs.

## 16. Build plan (milestones)

Each milestone is a draft PR tried on the beta preview before merging.

| # | Milestone | Contents |
|---|-----------|----------|
| M0 | **Scaffold from next5** | Vite/React/TS/PWA setup, Dexie, theme, viewport, update banner, install hint, error banner, wake lock, backup/share, release scripts, changelog, CI, Cloudflare beta, CLAUDE.md, STATUS.md. An empty app that installs and updates. |
| M1 | **Families + tree** | People, relationships, quick-add flow, extra people, tree diagram (layout module, zoom, tap to edit, relationship finder), demo family (made-up). Mockup reviewed first. |
| M2 | **Shot engine** | Templates, merge, naming, preview counts, manual edits kept. Thorough tests. |
| M3 | **Shoots + shot list** | Shoots list, new shoot, attendance, shot list editing, must-haves, share as text. |
| M4 | **Ordering + shoot day** | Ordering engine, call in / can leave, checklist, who's here, waiting shots, add on the spot, Undo, finish summary. *(First version worth using at a real shoot.)* |
| M5 | **Light** | Sun module, location (GPS / search / saved), timeline, suggested start time, sun direction, date picker, (forecast). |
| M6 | **Assistant hand-off** | Option B from §9, adapted from next5's handoff code. |
| M7 | **Pose library** | Data model, starter library and images, own photos, suggestions on shots, pose sheet. |
| M8 | **Help + polish → 1.0** | Help guide, screenshots, icon, README, real-iPhone checks. |

Light (M5) and poses (M7) are independent of M4 and could be swapped if one matters more for an upcoming shoot.

## 17. Open questions

| # | Question | Default assumption until decided |
|---|----------|----------------------------------|
| Q12 | **Starting shot types.** When you create a new shoot, which of the §6.1 shot types should already be ticked? (You can always tick or untick them per shoot.) Put another way: what's on your usual list? | Full group · grandparents · grandparents + all grandkids · parents + all grown children · parents + each grown child's household · each household · each couple · all siblings · cousins · solo portraits of the kids. |
| Q13 | App name. | "Photo Planner" for now. Ideas below. |

**Name ideas** (the address would follow, e.g. `mattbat.com/shotcall/`):

| Name | Why |
|------|-----|
| **ShotCall** | The assistant "calls" each shot; also a pun on calling the shots. |
| **Every Shot** | The promise: you got every combination. |
| **Family Frames** | Plain and warm; says what it's for. |
| **Group Call** | Calling groups in and out. |
| **GoldenList** | The shot list + golden hour. |
| **Who's In** | The question asked before every shot. |
| **Branches** | Family tree + shot groups by branch. |
| **ShotTree** | The family tree that builds your shots. |

## 17a. Decisions log

| Date | Decision |
|------|----------|
| 2026-11-15 | iPhone PWA built like next5 (same stack, hosting, tests, releases, beta previews, help). |
| 2026-11-15 | Assistant gets the shoot by hand-off (link or AirDrop file), one phone running it at a time, as in next5. No server, no live sync. |
| 2026-11-15 | Pose images may be drawn, AI-generated or free-license stock. |
| 2026-11-15 | A shoot can include several related households; they live in one family tree, which can have more than one top couple (both sets of grandparents). |
| 2026-11-15 | Grown children are their own household, and there are templates to photograph them with their parents. |
| 2026-11-15 | Address search, GPS, a map pin and a weather forecast are all wanted (online only; everything else works offline). |
| 2026-11-15 | Guests and pets can be in shots, as extra people. |
| 2026-11-15 | Theme follows the phone's setting by default. |
| 2026-11-15 | Skipped for now: gear checklists, location notes, letting the family use the app, and "keep these people apart". |
| 2026-11-15 | A family tree diagram (§5a) is part of v1, built with the families milestone (M1). |
| 2026-11-15 | The biggest shoot is about 20 people. Design and test for 2–30 people and up to ~80 shots. |
| 2026-11-15 | No deceased people in the tree. |
| 2026-11-15 | People already in a family can be picked wherever people are linked, with a duplicate-name hint (F9, F10), so separately added branches can be joined. |
| 2026-11-15 | People can be marked Early or Late for a shoot, before and on the day, and the order follows (O7, O8). |
| 2026-11-15 | A shot can have several poses, in order (`Shot.poseIds`, replacing the single `poseId`); old data, backups and hand-off files are converted (Dexie version 2, restore, receive) (PL5). |
| 2026-11-15 | Everyone (full-group) shots come first by default; a Late person in the full group makes it wait for them (O9). |
| 2026-11-15 | Each household's shots come together in one run, after the grandparents and the cousins, by default (O10). |
| 2026-11-15 | One time format app-wide, US style ("3:53 PM"); form fields, top-bar icons and tab icons share one style (polish pass). |
| 2026-11-15 | Blue hour removed from the UI; the Light section focuses on the shoot's session (evening or morning) with golden hour and sunset at a glance (L2, L3). |
| 2026-11-15 | Weather shows °F and mph by default; metric is a Settings choice (L7). American English throughout. |
| 2026-11-15 | Build started; the Q12 default shot types are used until changed. Built by Claude with subagents, milestone by milestone. |

## 18. Risks

- **Combination explosion:** pair templates multiply quickly (6 grandkids × 2 grandparents = 12 shots). Mitigated by preview counts (E5) and off-by-default pair templates.
- **Family trees are messy:** divorces, step-families and partners who shouldn't be in the same photo. Relationships stay simple, and any person can be excluded from any shot or template; a "keep apart" option is skipped for now.
- **Golden hour isn't the whole story:** hills, trees and buildings block the sun before sunset. The app shows sun direction and says so in help; it can't know local terrain.
- **Storage:** user photos in IndexedDB can grow; resize on import (T8) and keep backups optional with/without photos.
- **Image licensing** for the pose library (Q7).
- **Public repo:** made-up names only in demo data, tests and screenshots.
