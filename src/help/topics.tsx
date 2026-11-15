import type { ReactNode } from 'react';
import { Shot, Steps, Tip, TopicLink } from './parts';

/**
 * The in-app guide (H-1, H-8): what Photo Planner does and how to use every
 * part of it. Words in bold match the labels on screen, so you can find them.
 * Keep it in step with the README's photographer section.
 */

export interface Topic {
  id: string;
  title: string;
  /** One line for the list of topics. */
  summary: string;
  group: (typeof GROUPS)[number];
  body: ReactNode;
}

export const GROUPS = ['Getting started', 'Planning', 'Light', 'Shoot day', 'Sharing and your data', 'Questions'] as const;

const ALL: Topic[] = [
  {
    id: 'start',
    title: 'Getting started and install',
    summary: 'Put it on your Home Screen and plan your first shoot.',
    group: 'Getting started',
    body: (
      <>
        <p>
          Photo Planner turns a family tree into a shot list. Before the shoot you describe the family and pick the kinds
          of photo you want. On the day, an assistant holds the phone, calls out who is in the next shot, and taps{' '}
          <b>Done</b>. Everything is saved on your phone, and it works without internet once installed.
        </p>
        <h2>Install it on your iPhone</h2>
        <Steps>
          <li>
            Open the app in <b>Safari</b>. Other browsers on iPhone can’t install apps.
          </li>
          <li>
            Tap the <b>Share</b> button (the square with an arrow pointing up).
          </li>
          <li>
            Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.
          </li>
          <li>Open Photo Planner from the new icon. It now opens like an app and works offline.</li>
        </Steps>
        <h2>Your first shoot</h2>
        <Steps>
          <li>
            <b>Add a family.</b> On the Families tab tap <b>Quick add family</b> (type names, one per line) or{' '}
            <b>New family</b>. Just looking around? Tap <b>Load demo family</b> for a made-up family of eighteen.{' '}
            <TopicLink id="families">More about families</TopicLink>.
          </li>
          <li>
            <b>Plan a shoot.</b> On the Shoots tab tap <b>+ New shoot</b>, pick the family and a date.
          </li>
          <li>
            <b>Choose the shots.</b> Switch templates on or off and the list rebuilds.{' '}
            <TopicLink id="shot-types">Shot types</TopicLink> · <TopicLink id="shot-list">Building the list</TopicLink>.
          </li>
          <li>
            <b>Pick a place and time</b> to see golden hour. <TopicLink id="light">Golden hour and location</TopicLink>.
          </li>
          <li>
            <b>Start the shoot</b> and tap <b>Done</b> after each photo. <TopicLink id="shoot-day">Shoot day</TopicLink>.
          </li>
        </Steps>
        <Shot name="shoots" caption="Shoots: upcoming, in progress and finished." />
        <Tip>
          There is no Save button: every change is saved as you make it. Make a backup now and then (
          <TopicLink id="backup">how</TopicLink>).
        </Tip>
      </>
    ),
  },
  {
    id: 'families',
    title: 'Families and the tree',
    summary: 'Add people, partners and children; extras; the relationship finder.',
    group: 'Planning',
    body: (
      <>
        <p>
          A family is described once and reused for every shoot. You say who is who; the tree and the shot list work out
          the rest.
        </p>
        <Shot name="tree" caption="The tree: each generation on its own row, couples side by side, children underneath." />
        <h2>Adding people</h2>
        <ul>
          <li>
            <b>Quick add family</b> takes a list of names and sets everyone up as a starting point.
          </li>
          <li>
            In a family, tap <b>Add a person</b>. Give a name (and, if you like, a nickname shown on the tree, a birth
            year and whether they are a boy or a girl or a man or a woman). Sex is optional and only used by shots such as
            “all the sons”.
          </li>
          <li>
            Open a person to add a <b>partner</b>, a <b>parent</b> or a <b>child</b>. A partner can be marked
            separated: they still appear but are not counted as part of the household.
          </li>
          <li>Children can have two parents, one parent, or a step-parent. Pick who the child is with.</li>
        </ul>
        <h2>Someone who is already in the family</h2>
        <p>
          Wherever you link people (a parent, partner or child on a person, <b>+ child</b> on a couple, and{' '}
          <b>Quick add people</b>), tap <b>Choose someone already in the family</b> instead of adding a new person. It is
          a searchable list that leaves out anyone who can’t be chosen, such as the person themselves or their own
          descendants as a parent. Use it to join two branches you added separately. If you start typing a name that
          matches someone already there, the app asks “Is this the same Emma?” and <b>Link instead</b> links her rather than making a twin.
        </p>
        <h2>Kids and grown children</h2>
        <p>
          Each person is a kid or grown. Anyone with a partner or children of their own is treated as grown. Kids sit
          under their parents and are photographed first; grown children get their own “Grown children” shots (parents
          with each grown child, or with their whole household). You can change this on the person.
        </p>
        <h2>Extras: guests and pets</h2>
        <p>
          <b>Extras</b> are guests and pets: Biscuit the dog, a family friend. Choose which kinds of shot they join (for
          example only the full group and household shots) and who they belong to.
        </p>
        <h2>Tree and List</h2>
        <p>
          Switch between <b>Tree</b> and <b>List</b> at the top. The list groups people by generation and is easier to
          scan on a small screen. <b>Share</b> saves the tree as a picture you can send.
        </p>
        <Shot name="tree-list" caption="The List view groups people by generation." />
        <h2>How are they related?</h2>
        <p>
          Tap <b>How are they related?</b>, then tap two people. The app says it in words: “Emma is Noah’s sister”, “Zoe
          is Mike’s granddaughter”, “Theo is Noah’s brother-in-law”.
        </p>
        <h2>Something looks off</h2>
        <p>
          A red box appears if the family has a problem, such as two people each being the other’s parent. Tap it to jump
          to the person.
        </p>
      </>
    ),
  },
  {
    id: 'shot-types',
    title: 'Shot types',
    summary: 'What each template makes, with examples.',
    group: 'Planning',
    body: (
      <>
        <p>
          A <b>template</b> is a rule for making shots from the tree. Switch it on and its shots join the list; the
          number beside each switch is how many it makes, so you can see the cost before you add it. Shots that would
          be the same people are combined, never repeated. The examples below use the demo family.
        </p>
        <Shot name="templates" caption="Templates in groups. Each shows how many shots it makes." />
        <dl className="help-terms">
          <dt>Everyone</dt>
          <dd>
            <b>Full group</b> is everyone attending in one photo. <b>Full group, no partners</b> leaves out people who
            married in, for a blood-relatives-only picture.
          </dd>
          <dt>Generations</dt>
          <dd>
            <b>Each generation</b>: the grandparents, then their children, then the grandkids. <b>With partners</b>{' '}
            includes each generation’s partners. <b>Grandparents + all children / grandkids</b> pairs the top couple with
            a younger generation.
          </dd>
          <dt>Siblings</dt>
          <dd>
            <b>All siblings</b>: Emma and Noah together. <b>All sons / all daughters</b> and{' '}
            <b>grandsons / granddaughters</b> need sex filled in. <b>Cousins</b> gathers a generation across branches:
            Emma, Noah, Ava, Ben and Mia.
          </dd>
          <dt>Branches</dt>
          <dd>
            <b>Each branch</b> is one child of the top couple with their partner and everyone below them: Mike, Jen,
            Emma, Noah and Zoe. <b>Grandparents + each branch</b> adds the top couple to each.
          </dd>
          <dt>Households</dt>
          <dd>
            <b>Each household</b>: a couple or single parent with their children who are not grown. <b>Each couple</b>{' '}
            on their own. <b>Each parent + their children</b>, and <b>each child’s kids only</b> (the children without
            the parents).
          </dd>
          <dt>Pairs</dt>
          <dd>
            <b>Each grandparent + each grandkid</b> and <b>each parent + each child</b> make one photo per pair, so they
            multiply quickly. That’s why they start off. Check the count before switching them on.
          </dd>
          <dt>Solo</dt>
          <dd>
            A portrait of each person: <b>Everyone</b>, <b>Kids</b> or <b>Adults</b>, or Off.
          </dd>
          <dt>Grown children</dt>
          <dd>
            <b>Parents + all their grown children</b> (no partners or grandkids), <b>parents + each grown child</b>,{' '}
            <b>parents + each grown child’s household</b>, and <b>each grown child’s household alone</b>.
          </dd>
        </dl>
        <Tip>
          Tap the ⓘ beside a heading or option for a one-line reminder. A template that can’t make any shots (for
          example because nobody in the family fits) says “no new shots”.
        </Tip>
      </>
    ),
  },
  {
    id: 'shot-list',
    title: 'Building the shot list',
    summary: 'Custom shots, must-haves, remove and restore, order and time.',
    group: 'Planning',
    body: (
      <>
        <p>
          The shot list on a shoot is built from the templates you switched on and the people who are coming. Change who
          is coming (<b>attending</b>) and it rebuilds.
        </p>
        <Shot name="shot-list" caption="The list in order. ★ marks must-haves; each shot says who to call in and who can leave." />
        <h2>Changing the list</h2>
        <ul>
          <li>
            <b>+ Custom shot</b> adds your own: a name and who is in it (“Grandma with her three sisters”).
          </li>
          <li>
            Open any shot to mark it a <b>must-have</b> ★, add notes, or <b>remove</b> it. Removed shots wait under{' '}
            <b>Removed shots</b> and a tap on <b>Restore</b> brings them back. Switching a template off and on again
            doesn’t bring back a shot you removed.
          </li>
          <li>
            <b>Can’t make these shots</b> lists anything a template wanted but couldn’t build, and why.
          </li>
        </ul>
        <h2>Order</h2>
        <p>
          <b>Suggested order</b> arranges the list so people leave when they’re done and kids get photographed before they
          get tired. <b>↻ Re-order rest</b> redoes the order but keeps the shots you moved by hand. Drag the handle on a
          shot to move it yourself.
        </p>
        <p>Under <b>Order options</b>:</p>
        <ul>
          <li>
            <b>Everyone first</b> (on by default): the full-group shots open the shoot, largest first, while everyone is
            fresh. If you mark someone in the full group <b>Late</b>, it says “Full group waits for …” and that shot comes
            later.
          </li>
          <li>
            <b>Kids first</b>: little ones before they tire.
          </li>
          <li>
            <b>Release older people early</b>: grandparents’ shots come first so they can sit down.
          </li>
          <li>
            <b>Big group first</b>: the full group before anyone is worn out.
          </li>
          <li>
            <b>Must-haves early</b>: starred shots sooner, while energy is high.
          </li>
        </ul>
        <h2>Early and late people</h2>
        <p>
          Tap <b>Early or late people</b> at the top of the shoot. Mark someone <b>Early</b> to finish their shots first
          (an older guest, someone who needs a break soon) or <b>Late</b> to keep them to the end (someone called away,
          a little one who needs a rest). Tick several people to set them at once. A small <b>Early</b> or{' '}
          <b>Late</b> badge shows on their names. If you ordered the list by hand it stays as it is until you tap{' '}
          <b>Suggested order</b>.
        </p>
        <h2>Call in and can leave</h2>
        <p>
          Each shot shows <b>Call in:</b> the people who aren’t in the shot before it, and <b>Can leave:</b> people whose
          last shot this is. On the day the assistant uses these to keep the group moving.
        </p>
        <h2>Time estimate</h2>
        <p>
          The top of the shoot shows <b>about 1 h 10 min</b>. It adds a few minutes per shot, more for big groups and a
          little for moving people around. It is a guide and updates as you change the list.
        </p>
      </>
    ),
  },
  {
    id: 'light',
    title: 'Golden hour and location',
    summary: 'Pick a place, see the light, get a suggested start time.',
    group: 'Light',
    body: (
      <>
        <p>
          The <b>Light</b> section of a shoot shows the sun for your date and place. Set the place and everything else
          appears.
        </p>
        <Shot name="light" caption="The Light section: golden hour at a glance, a bar for the session and a suggested start." />
        <h2>Setting the place</h2>
        <p>
          Choose <b>Set a new place</b> and use your phone’s position, search for an address, type coordinates, or drop a
          pin on a map. Save the place (“Riverside Park”) to reuse it. The map and search need a connection; saved places
          and the sun times work offline.
        </p>
        <h2>Reading the section</h2>
        <p>
          The big line gives golden hour and sunset (or sunrise). Under it, one sentence says how your planned shoot
          fits: “✓ All of your shoot is in golden hour”, or how many minutes it starts before or ends after. The bar
          shows just that evening (or morning, if your start is before noon, or if you tap <b>Morning</b>): daylight,
          golden hour and “too dark”, with the hours marked, your shoot underneath, and a red line for now on the day.
          Sun direction, weather and other dates are under <b>More</b>.
        </p>
        <h2>Words you’ll see</h2>
        <dl className="help-terms">
          <dt>Golden hour</dt>
          <dd>
            The soft, warm light when the sun is between about 6° above and 4° below the horizon: just after sunrise and
            before sunset.
          </dd>
          <dt>Suggested start</dt>
          <dd>
            When to begin so your planned shoot ends as evening golden hour ends, or starts as the morning one begins,
            with the best light for the must-haves and the big group. A warning appears if the shot list is longer than
            golden hour.
          </dd>
          <dt>Sun direction</dt>
          <dd>
            The little sun on the compass shows where the sun will be at your start time (“Where the sun will be at 4:45
            PM”). Tap <b>Use compass</b> and turn your phone: the sun marker then points the real way, and the top of the
            rose is the way you are facing. Put the sun behind the family for a glowing edge, or beside you for soft light
            on faces.
          </dd>
        </dl>
        <h2>Pick a date</h2>
        <p>Pick a date lists the next three weeks with golden hour for each day, so you can choose a good one.</p>
        <h2>Weather forecast</h2>
        <p>
          For shoots in the next 14 days you’ll see cloud cover, rain chance, temperature (°F) and wind (mph). Switch to °C and km/h in Settings › Units. This <b>needs a
          connection</b>; the last forecast is kept so you can still read it offline, and it tells you if it no longer
          covers your shoot time.
        </p>
      </>
    ),
  },
  {
    id: 'shoot-day',
    title: 'Shoot day',
    summary: 'Done, Skip, Retake and Undo; who’s here; adding shots; finishing.',
    group: 'Shoot day',
    body: (
      <>
        <p>
          Tap <b>Start shoot</b> on a shoot. The screen stays awake, the text is large for outdoor glare, and everything
          saves as you tap. If the phone locks or the app closes, it opens where you left off.
        </p>
        <Shot name="live" caption="Shoot day: who is in the shot, who to call in, and a big Done button." />
        <h2>The main buttons</h2>
        <ul>
          <li>
            <b>Done ✓</b> marks the shot taken and moves to the next.
          </li>
          <li>
            <b>Skip</b> sets the shot aside. <b>Needs retake</b> keeps it on the list to come back to.
          </li>
          <li>
            <b>↶ Undo</b> reverses the last tap, as many times as you need.
          </li>
        </ul>
        <h2>The list</h2>
        <p>
          The <b>Now</b>, <b>List</b> and <b>Tree</b> switch at the top shows the whole list at any time. Tap a shot to do
          it now, mark it done or skipped, or reset it. Use this when “Grandpa has to leave, do all his shots now”.
        </p>
        <Shot name="live-list" caption="List view: every shot and its status." />
        <h2>Who’s here</h2>
        <p>
          Tap <b>Who’s here</b> to mark people arrived or gone. A shot that needs someone who isn’t here moves to{' '}
          <b>Waiting</b> (“Waiting for: Uncle Dan”) and returns when they arrive. When someone has to leave, you can pull
          their remaining shots up next. In Settings, <b>Treat everyone as here</b> sets whether a new shoot starts with
          everyone present.
        </p>
        <p>
          The same sheet has <b>Normal / Early / Late</b> for each person. Marking someone <b>Early</b> brings their
          remaining shots up next; <b>Late</b> sends them to the end. Only shots still to do move; done shots stay put and
          the shot you are on stays on top. A short note says what changed.
        </p>
        <h2>Add a shot on the spot</h2>
        <p>
          Tap <b>+ Shot</b> and tap the people to include: “Can we get one with just the girls?”. It is added and marked
          as a custom shot.
        </p>
        <h2>Progress and golden hour</h2>
        <p>
          The shot card says <b>Shot 3 of 12 · 10 left</b>: shots finished so far plus one, out of all shots, and how many are left. The top shows how many are done and how many ★ must-haves are left. When golden hour is coming to an end, a
          countdown appears.
        </p>
        <h2>Finish</h2>
        <p>
          <b>Finish shoot</b> (under ⋯) shows a summary: done, skipped, retakes still owed and shots added. You can share
          it as text or reopen the shoot if you’re not done.
        </p>
        <Shot name="summary" caption="The summary after finishing." />
      </>
    ),
  },
  {
    id: 'assistant',
    title: 'Working with an assistant',
    summary: 'Hand the shoot to another phone, one phone at a time.',
    group: 'Shoot day',
    body: (
      <>
        <p>
          An assistant can run the checklist on their own phone while you shoot. Photo Planner has no server, so the shoot
          is <b>handed over</b>, not synced: one phone runs the checklist at a time.
        </p>
        <Steps>
          <li>
            On the shoot screen (or the shoot-day menu), tap <b>Share shoot</b>.
          </li>
          <li>
            Choose <b>Text a link</b> (Messages, email) or <b>AirDrop a file</b>. A link is quickest; the file works with
            no signal.
          </li>
          <li>
            The assistant opens it and taps <b>Open here</b> (in the Home Screen app: <b>Paste shoot</b> or <b>Open shoot file</b> on Shoots). Their phone gets the family, who is
            coming, and the shot list with suggested poses. Your own pose photos stay on your phone so the link stays
            short.
          </li>
          <li>
            They run the checklist as usual: <TopicLink id="shoot-day">Done, Skip, Needs retake</TopicLink>.
          </li>
          <li>
            When finished (or any time), they send it back. Opening that on your phone brings in every tick, retake and
            added shot, so your copy is complete.
          </li>
        </Steps>
        <h2>One phone at a time</h2>
        <p>
          While a running shoot is on the assistant’s phone, yours shows <b>Shared with the other phone</b> and won’t
          let you tick shots. If their phone dies, tap <b>Take back control</b>. A newer copy always replaces an older
          one, and an older copy can’t wipe out ticks without <b>Replace anyway</b>.
        </p>
        <h2>Take back control</h2>
        <p>
          If the handoff doesn’t come back (a flat battery, a lost phone), tap <b>Take back control</b> on your phone to
          carry on from your own copy. Anything done only on the other phone won’t be in it.
        </p>
        <Tip>
          Phones are not live with each other. If you also want to see progress, ask the assistant to send the shoot back
          now and then.
        </Tip>
      </>
    ),
  },
  {
    id: 'poses',
    title: 'Poses',
    summary: 'A library of poses to browse and suggest on shots.',
    group: 'Planning',
    body: (
      <>
        <p>
          The <b>Poses</b> tab is a library of pose ideas, each drawn as a simple figure, sorted by category and the size
          of the group.
        </p>
        <Shot name="poses" caption="Filter by category, group size and tags. Star your favourites." />
        <ul>
          <li>
            Use the category pills, <b>Group size</b> and tags to narrow it down; search by name.
          </li>
          <li>
            Tap <b>★</b> to favourite a pose. Open one for the description, tips and your own photos.
          </li>
          <li>
            On a shot, open it and tap as many poses as you like under <b>Suggested poses</b> (tap again to take one off).
            The sheet shows how many you picked, and the ↑ ↓ arrows put them in order. On shoot day they appear as a row
            under the people; tap one to read its directions. The <b>Pose sheet</b> on a shoot lists the poses on every
            shot, to look at before you start.
          </li>
          <li>You can add your own poses, with your own reference photo.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'backup',
    title: 'Backups and your data',
    summary: 'Where your data lives and how to keep it safe.',
    group: 'Sharing and your data',
    body: (
      <>
        <p>
          Everything lives <b>only on this phone</b>: no account, no server, nothing tracked. That’s private, but it means
          that if you delete the app or clear Safari’s website data, your families and shoots are gone, unless you backed
          up.
        </p>
        <Shot name="settings" caption="Settings: back up, restore, appearance and updates." />
        <Steps>
          <li>
            Open <b>Settings</b> (the ⚙︎ on a tab) and tap <b>Back up everything</b>.
          </li>
          <li>Save the file to Files, iCloud Drive, or AirDrop it. Settings shows when you last did this.</li>
          <li>
            To bring it back, tap <b>Restore from a backup file</b>. <b>Merge into this phone</b> adds what’s missing and
            keeps the newer copy of anything in both. <b>Replace everything</b> makes the phone match the backup and
            tells you what it would delete first.
          </li>
        </Steps>
        <h2>Appearance and updates</h2>
        <p>
          <b>Match phone</b> follows your iPhone’s light or dark setting; pick Light or Dark to override it. Updates are
          never applied without asking: you’ll see “A new version is ready” and can update when it suits you.
        </p>
      </>
    ),
  },
  {
    id: 'faq',
    title: 'Common questions',
    summary: 'Quick answers.',
    group: 'Questions',
    body: (
      <>
        <dl className="help-faq">
          <dt>Does it need internet?</dt>
          <dd>
            Not once installed. Only the map, address search and weather forecast need a connection, and the last
            forecast is kept.
          </dd>
          <dt>I added a person and nothing changed on the shoot.</dt>
          <dd>
            A shoot lists who is attending. Open <b>attending</b> and tick the new person; the shot list rebuilds.
          </dd>
          <dt>A shot I expected isn’t there.</dt>
          <dd>
            Check the template is switched on, that the people are attending, and <b>Can’t make these shots</b>. A
            shot you removed stays removed until you restore it.
          </dd>
          <dt>There are too many shots.</dt>
          <dd>
            Switch off templates that are costly (look at the number beside each), or remove single shots. The time
            estimate at the top shows the effect.
          </dd>
          <dt>Can the assistant and I both use the checklist?</dt>
          <dd>
            One phone at a time. <TopicLink id="assistant">Working with an assistant</TopicLink>.
          </dd>
          <dt>How do I move to a new phone?</dt>
          <dd>
            Back up, send the file to the new phone, install Photo Planner and restore.
          </dd>
          <dt>The screen locked during the shoot.</dt>
          <dd>
            Photo Planner asks the phone to stay awake. If that isn’t allowed it says so; raise Auto-Lock in Settings ›
            Display. When you unlock, you’re back where you were.
          </dd>
          <dt>How do I see this guide again?</dt>
          <dd>
            Settings › <b>Help and guide</b>, or the <b>?</b> link on a screen. <b>Replay the intro</b> is at the top.
          </dd>
        </dl>
      </>
    ),
  },
];

/** In reading order: grouped as in `GROUPS`, in the order written within each group. */
export const TOPICS: Topic[] = [...ALL].sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group));

export function topicById(id: string): Topic | undefined {
  return TOPICS.find((t) => t.id === id);
}
