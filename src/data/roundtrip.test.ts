import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearDb } from '../test/helpers';
import { createBackup, parseBackup, restoreBackup } from './backup';
import { db } from './db';
import { buildHandoff, decideReceive, decodeHandoff, encodeHandoff, lockedAway } from './handoff';
import {
  addCustomShot, addExtra, addLocation, addPose, addPosePhoto, createShoot, doShotNow, finishShoot, markSent, markShotOnDay, moveShotsUpNext,
  quickAddFamily, receiveShoot, removeShot, renameShot, reopenShoot, setAttending, setShootPresence, startShoot, takeBack, undoLastOnDay, updatePerson, updateSettings, updateShot,
} from './repo';
import type { Pose } from './types';

beforeEach(clearDb);

// Made-up names only.
const NAMES = ['Ada', 'Bram', 'Cleo', 'Dov', 'Esme', 'Finn', 'Gus', 'Hana', 'Ines', 'Jory', 'Kit', 'Lark'];
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ';

const familyArb = fc.record({
  couple: fc.boolean(),
  kids: fc.array(
    fc.record({ partner: fc.boolean(), grand: fc.integer({ min: 0, max: 3 }), grown: fc.boolean() }),
    { minLength: 1, maxLength: 5 },
  ),
});

type Action =
  | { k: 'rename'; i: number; text: string }
  | { k: 'remove'; i: number }
  | { k: 'done'; i: number; how: 'done' | 'skip' | 'retake' | 'reset' }
  | { k: 'now'; i: number }
  | { k: 'presence'; p: number; to: 'here' | 'left' | 'expected' }
  | { k: 'undo' }
  | { k: 'custom'; text: string }
  | { k: 'must'; i: number; notes: string }
  | { k: 'up'; p: number };
const actionArb: fc.Arbitrary<Action> = fc.oneof(
  fc.record({ k: fc.constant('rename' as const), i: fc.nat(40), text: fc.string({ maxLength: 20 }) }),
  fc.record({ k: fc.constant('remove' as const), i: fc.nat(40) }),
  fc.record({ k: fc.constant('done' as const), i: fc.nat(40), how: fc.constantFrom('done', 'skip', 'retake', 'reset') }),
  fc.record({ k: fc.constant('now' as const), i: fc.nat(40) }),
  fc.record({ k: fc.constant('presence' as const), p: fc.nat(40), to: fc.constantFrom('here', 'left', 'expected') }),
  fc.record({ k: fc.constant('undo' as const) }),
  fc.record({ k: fc.constant('custom' as const), text: fc.string({ minLength: 1, maxLength: 12 }) }),
  fc.record({ k: fc.constant('must' as const), i: fc.nat(40), notes: fc.string({ maxLength: 30 }) }),
  fc.record({ k: fc.constant('up' as const), p: fc.nat(40) }),
);

/** Runs one action against a shoot the way the screens do. */
async function act(shootId: string, a: Action): Promise<void> {
  const shoot = (await db.shoots.get(shootId))!;
  const shot = shoot.shots[(a as { i?: number }).i ?? 0 % Math.max(1, shoot.shots.length)] ?? shoot.shots[0];
  const person = shoot.attendingIds[((a as { p?: number }).p ?? 0) % Math.max(1, shoot.attendingIds.length)];
  switch (a.k) {
    case 'rename': if (shot) await renameShot(shootId, shot.id, a.text || 'Renamed'); break;
    case 'remove': if (shot) await removeShot(shootId, shot.id); break;
    case 'done': if (shot) await markShotOnDay(shootId, shot.id, a.how); break;
    case 'now': if (shot) await doShotNow(shootId, shot.id); break;
    case 'presence': if (person) await setShootPresence(shootId, person, a.to); break;
    case 'undo': await undoLastOnDay(shootId); break;
    case 'custom': if (person) await addCustomShot(shootId, { name: a.text, personIds: [person] }); break;
    case 'must': if (shot) await updateShot(shootId, shot.id, { mustHave: true, notes: a.notes }); break;
    case 'up': if (person) await moveShotsUpNext(shootId, person); break;
  }
}

/** A family, a place, a pet, an own pose and a shoot, then some random work on it. */
async function scenario(f: { couple: boolean; kids: { partner: boolean; grand: number; grown: boolean }[] }, actions: Action[], live: boolean) {
  const family = await quickAddFamily({
    familyName: 'The Quillfeathers',
    grandparents: f.couple ? ['Ada Quillfeather', 'Bram Quillfeather'] : ['Ada Quillfeather'],
    children: f.kids.map((k, i) => ({
      name: `${NAMES[(i + 2) % NAMES.length]} Quillfeather`,
      grown: k.grown,
      ...(k.partner ? { partner: `${NAMES[(i + 7) % NAMES.length]} Marsh` } : {}),
      kids: Array.from({ length: k.grand }, (_, j) => `${NAMES[(i + j + 3) % NAMES.length]} Jr ${i}${j}`),
    })),
  });
  const people = await db.people.where('familyId').equals(family.id).toArray();
  await updatePerson(people[0]!.id, { photo: PHOTO });
  await addExtra(family.id, { name: 'Pepper', kind: 'pet', emoji: '🐶' });
  const place = await addLocation({ name: 'Heron Lake', latitude: 40.1, longitude: -105.2, source: 'coordinates' });
  const shoot = await createShoot(family, { date: '2026-10-10', title: 'Autumn', locationId: place.id });
  const pose = await addPose({
    name: 'Huddle', category: 'siblings', minSize: 2, maxSize: 4, description: '', directions: [], tips: [], mistakes: [], tags: [], difficulty: 'easy', favorite: false, builtIn: false,
  } satisfies Omit<Pose, 'id' | 'createdAt' | 'updatedAt'>);
  await addPosePhoto({ poseId: pose.id, dataUrl: PHOTO, width: 4, height: 4 });
  if (shoot.shots[0]) await updateShot(shoot.id, shoot.shots[0].id, { poseId: pose.id });
  if (live) await startShoot(shoot.id);
  for (const a of actions) await act(shoot.id, a);
  return { family, shootId: shoot.id };
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe('hand-off round trip on random shoots', () => {
  it('pack, encode, decode, unpack gives the same shoot and records', async () => {
    await fc.assert(
      fc.asyncProperty(familyArb, fc.array(actionArb, { maxLength: 12 }), fc.boolean(), fc.boolean(), async (f, actions, live, compress) => {
        await clearDb();
        const { shootId } = await scenario(f, actions, live);
        const handoff = await buildHandoff(shootId);
        expect(handoff).toBeDefined();
        const parsed = await decodeHandoff(await encodeHandoff(handoff!, compress));
        if (!parsed.ok) throw new Error(parsed.message);
        expect(parsed.handoff).toEqual(clone(handoff));
        // Photos never travel.
        for (const p of parsed.handoff.people) expect(p.photo).toBeUndefined();

        // The other phone: empty, takes the shoot.
        await clearDb();
        expect(decideReceive(undefined, parsed.handoff)).toEqual({ kind: 'add' });
        await receiveShoot(parsed.handoff);
        const got = (await db.shoots.get(shootId))!;
        expect(got.shots).toEqual(handoff!.shoot.shots);
        expect(got.order).toEqual(handoff!.shoot.order);
        expect(got.presence).toEqual(handoff!.shoot.presence);
        expect(got.status).toBe(handoff!.shoot.status);
        expect(got.handoff).toMatchObject({ n: 1, role: 'assistant', away: false });
        expect((await db.people.toArray()).length).toBe(handoff!.people.length);
        expect(await db.families.count()).toBe(1);
        // Sending it straight back is the next number, from the other role.
        const back = (await buildHandoff(shootId))!;
        expect(back).toMatchObject({ n: 2, from: 'assistant' });
        expect(back.shoot.shots).toEqual(handoff!.shoot.shots);
      }),
      { numRuns: 15 },
    );
  });
});

describe('backup round trip on random data sets', () => {
  async function snapshot() {
    const b = await createBackup();
    const { exportedAt, ...rest } = b;
    void exportedAt;
    return rest;
  }
  it('replace restores exactly what was backed up, photos and a live shoot with events included', async () => {
    await fc.assert(
      fc.asyncProperty(familyArb, fc.array(actionArb, { maxLength: 12 }), fc.string({ maxLength: 15 }), async (f, actions, famName, ) => {
        await clearDb();
        const { shootId } = await scenario(f, actions, true);
        await updateSettings({ timeEstimates: { small: 1, medium: 2, large: 3, setup: 4 } });
        await db.families.toCollection().modify({ notes: famName } as never);
        const before = await snapshot();
        expect(before.posePhotos.length).toBe(1);
        expect((await db.shoots.get(shootId))!.status).toBe('live');

        // Through a file and back, as the Settings screen does.
        const text = JSON.stringify(await createBackup());
        const parsed = parseBackup(text);
        if (!parsed.ok) throw new Error(parsed.message);

        await clearDb();
        await restoreBackup(parsed.backup, 'replace');
        expect(await snapshot()).toEqual(clone(before));

        // Replace over a phone with other data: the other data is gone.
        await quickAddFamily({ familyName: 'Intruders', grandparents: ['Zed Intruder'], children: [] });
        await restoreBackup(parsed.backup, 'replace');
        expect(await snapshot()).toEqual(clone(before));
      }),
      { numRuns: 12 },
    );
  });
  it('merge onto an empty phone matches, onto the same phone changes nothing, and onto newer data keeps the newer', async () => {
    await fc.assert(
      fc.asyncProperty(familyArb, fc.array(actionArb, { maxLength: 10 }), async (f, actions) => {
        await clearDb();
        const { shootId, family } = await scenario(f, actions, true);
        const backup = await createBackup();
        const before = await snapshot();

        const same = await restoreBackup(backup, 'merge');
        expect(same.added + same.updated).toBe(0);
        expect(await snapshot()).toEqual(clone(before));

        await clearDb();
        const fresh = await restoreBackup(backup, 'merge');
        expect(fresh.updated + fresh.kept).toBe(0);
        expect(await snapshot()).toEqual(clone(before));

        // A later edit here survives merging the older backup, and a missing record comes back.
        await db.shoots.update(shootId, { title: 'Edited after the backup', updatedAt: Date.now() + 5000 });
        await db.people.where('familyId').equals(family.id).limit(1).delete();
        await restoreBackup(backup, 'merge');
        expect((await db.shoots.get(shootId))!.title).toBe('Edited after the backup');
        expect(await db.people.count()).toBe(backup.people.length);
      }),
      { numRuns: 12 },
    );
  });
});

describe('a hand-off lock turns every live action into a no-op', () => {
  it('Done, Skip, Undo, presence, Finish and the rest change nothing while the other phone runs the shoot', async () => {
    await fc.assert(
      fc.asyncProperty(familyArb, fc.array(actionArb, { maxLength: 8 }), fc.array(actionArb, { minLength: 1, maxLength: 12 }), async (f, first, locked, ) => {
        await clearDb();
        const { shootId } = await scenario(f, first, true);
        await markSent(shootId, 1);
        const away = (await db.shoots.get(shootId))!;
        expect(lockedAway(away)).toBe(true);
        for (const a of locked) {
          if (a.k === 'rename' || a.k === 'remove' || a.k === 'custom' || a.k === 'must') continue; // planning edits are not day taps
          await act(shootId, a);
        }
        await finishShoot(shootId);
        await reopenShoot(shootId);
        expect(await db.shoots.get(shootId)).toEqual(away);

        // Taking control back unlocks it again.
        await takeBack(shootId);
        const mine = (await db.shoots.get(shootId))!;
        expect(lockedAway(mine)).toBe(false);
        await setAttending(shootId, mine.attendingIds[0]!, true);
      }),
      { numRuns: 12 },
    );
  });
});
