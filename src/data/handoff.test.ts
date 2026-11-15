import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  buildHandoff,
  changedSinceSent,
  dataFromText,
  decideReceive,
  decodeHandoff,
  doneCount,
  encodeHandoff,
  handoffFileName,
  handoffLink,
  lockedAway,
  parseHandoff,
  sharedAway,
  type ShootHandoff,
} from './handoff';
import { addExtra, addLocation, addPose, createShoot, finishShoot, markShotOnDay, markSent, receiveShoot, setShootPresence, startShoot, takeBack, undoLastOnDay, updateShot } from './repo';
import type { Handoff, Shoot } from './types';
import { clearDb, seedFamily } from '../test/helpers';

beforeEach(clearDb);

/** A planned shoot as the photographer's phone has it, with a place and one of the user's own poses on a shot. */
async function planned() {
  const seeded = await seedFamily();
  const place = await addLocation({ name: 'Lakeside Park', latitude: 41.9, longitude: -87.6, source: 'search' });
  const shoot = await createShoot(seeded.family, { date: '2026-12-05', title: 'Winter', locationId: place.id });
  const pose = await addPose({
    name: 'My lean', category: 'couples', minSize: 2, maxSize: 2, description: 'Lean in', directions: [], tips: [], mistakes: [], tags: [], difficulty: 'easy', favorite: false, builtIn: false,
  });
  const first = shoot.shots[0]!;
  await updateShot(shoot.id, first.id, { poseId: pose.id });
  return { ...seeded, place, pose, shootId: shoot.id };
}
const get = async (id: string) => (await db.shoots.get(id))!;
const build = async (id: string) => (await buildHandoff(id))!;

/** Sends the shoot and wipes this "phone", leaving it as the other phone would be. */
async function toOtherPhone(shootId: string) {
  const handoff = await build(shootId);
  const parsed = await decodeHandoff(await encodeHandoff(handoff));
  if (!parsed.ok) throw new Error(parsed.message);
  await markSent(shootId, handoff.n);
  const mine = await db.shoots.get(shootId);
  await clearDb();
  return { handoff: parsed.handoff, mine: mine! };
}

describe('buildHandoff', () => {
  it('carries the shoot, family, place and own poses, but not hand-off state, photos or the forecast', async () => {
    const { shootId, family, place, pose, gran } = await planned();
    await db.people.update(gran.id, { photo: 'data:image/jpeg;base64,AAAA' });
    const h = await build(shootId);
    expect(h).toMatchObject({ format: 'photo-planner-shoot', version: 1, n: 1, from: 'photographer' });
    expect(h.family.id).toBe(family.id);
    expect(h.location?.id).toBe(place.id);
    expect(h.poses.map((p) => p.id)).toEqual([pose.id]);
    expect(h.shoot).not.toHaveProperty('handoff');
    expect(h.people.every((p) => p.photo === undefined)).toBe(true);
    expect(h.people).toHaveLength(5);
  });

  it('leaves out built-in poses and unused extras', async () => {
    const { shootId, family } = await planned();
    await db.poses.put({ ...(await db.poses.toCollection().first())!, id: 'starter-1', builtIn: true });
    const first = (await get(shootId)).shots[1]!;
    await updateShot(shootId, first.id, { poseId: 'starter-1' });
    const unused = await addExtra(family.id, { name: 'Cat', kind: 'pet' });
    await db.shoots.update(shootId, { attendingIds: (await get(shootId)).attendingIds.filter((id) => id !== unused.id) });
    const h = await build(shootId);
    expect(h.poses.map((p) => p.id)).not.toContain('starter-1');
    expect(h.extras.map((e) => e.name)).toEqual(['Biscuit']);
  });

  it('keeps only add-shot events of the undo log', async () => {
    const { shootId } = await planned();
    await startShoot(shootId);
    const s = await get(shootId);
    await markShotOnDay(shootId, s.shots[0]!.id, 'done');
    const h = await build(shootId);
    expect(h.shoot.events).toEqual([]);
  });
});

describe('pack and unpack', () => {
  it('round-trips through a link, compressed and plain', async () => {
    const { shootId } = await planned();
    const h = await build(shootId);
    for (const compress of [true, false]) {
      const data = await encodeHandoff(h, compress);
      expect(data[0]).toBe(compress ? 'z' : 'j');
      const parsed = await decodeHandoff(data);
      expect(parsed).toMatchObject({ ok: true });
      expect(parsed.ok && parsed.handoff).toEqual(h);
    }
  });

  it('carries who is early and late', async () => {
    const { shootId } = await planned();
    const h = await build(shootId);
    const withPriorities: ShootHandoff = { ...h, shoot: { ...h.shoot, priorities: { [h.people[0]!.id]: 'early', [h.people[1]!.id]: 'late' } } };
    const parsed = await decodeHandoff(await encodeHandoff(withPriorities));
    expect(parsed.ok && parsed.handoff.shoot.priorities).toEqual(withPriorities.shoot.priorities);
    const bad = { ...withPriorities, shoot: { ...withPriorities.shoot, priorities: { x: 'whenever' } } };
    expect((await decodeHandoff(await encodeHandoff(bad as unknown as ShootHandoff))).ok).toBe(false);
  });

  it('survives any title and notes (property)', async () => {
    const { shootId } = await planned();
    const h = await build(shootId);
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.string(), fc.boolean(), async (title, notes, compress) => {
        const copy: ShootHandoff = { ...h, shoot: { ...h.shoot, title, shots: h.shoot.shots.map((s, i) => (i === 0 ? { ...s, notes } : s)) } };
        const parsed = await decodeHandoff(await encodeHandoff(copy, compress));
        expect(parsed.ok && parsed.handoff).toEqual(JSON.parse(JSON.stringify(copy)));
      }),
      { numRuns: 25 },
    );
  });

  it('finds the data in pasted text and builds file names and links', async () => {
    const { shootId } = await planned();
    const h = await build(shootId);
    const data = await encodeHandoff(h);
    const link = handoffLink(data, { origin: 'https://x.test', pathname: '/photo-planner/' });
    expect(link).toBe(`https://x.test/photo-planner/#/receive/${data}`);
    expect(dataFromText(`Here you go ${link} thanks`.replace(' thanks', ''))).toBe(data);
    expect(dataFromText(data)).toBe(data);
    expect(dataFromText('hello')).toBeNull();
    expect(handoffFileName(h)).toBe('photo-planner-the-testers-shoot-2026-12-05.json');
  });

  it('refuses damaged, foreign, backup and newer files', async () => {
    const { shootId } = await planned();
    const h = await build(shootId);
    expect(await decodeHandoff('zzzz')).toMatchObject({ ok: false });
    expect(await decodeHandoff('x123')).toMatchObject({ ok: false });
    expect(parseHandoff('not json')).toMatchObject({ ok: false });
    expect(parseHandoff('{"format":"next5-game"}')).toMatchObject({ ok: false });
    expect(parseHandoff('{"format":"photo-planner-backup"}')).toMatchObject({ ok: false, message: expect.stringContaining('backup') });
    expect(parseHandoff(JSON.stringify({ ...h, version: 99 }))).toMatchObject({ ok: false, message: expect.stringContaining('newer') });
  });

  it('validates every record before anything is saved (B4)', async () => {
    const { shootId } = await planned();
    const h = await build(shootId);
    const bad = (change: (copy: ShootHandoff) => unknown) => parseHandoff(JSON.stringify(change(structuredClone(h))));
    expect(bad((c) => c)).toMatchObject({ ok: true });
    expect(bad((c) => ({ ...c, n: 0 }))).toMatchObject({ ok: false });
    expect(bad((c) => ({ ...c, from: 'boss' }))).toMatchObject({ ok: false });
    expect(bad((c) => ({ ...c, shoot: { ...c.shoot, shots: 'many' } }))).toMatchObject({ ok: false });
    expect(bad((c) => ({ ...c, people: [{ id: 'p' }] }))).toMatchObject({ ok: false });
    expect(bad((c) => ({ ...c, people: c.people.map((p, i) => (i ? p : { ...p, familyId: 'other' })) }))).toMatchObject({ ok: false });
    expect(bad((c) => ({ ...c, poses: [{ ...c.poses[0], builtIn: true }] }))).toMatchObject({ ok: false });
    expect(bad((c) => ({ ...c, family: { ...c.family, id: 'other' } }))).toMatchObject({ ok: false });
    expect(bad((c) => ({ ...c, partnerships: null }))).toMatchObject({ ok: false });
    expect(bad((c) => ({ ...c, location: { ...c.location, id: 'zzz' } }))).toMatchObject({ ok: false });
  });
});

describe('decideReceive (SH4)', () => {
  const at = (shoot: Shoot, handoff: Handoff | undefined, extra: Partial<Shoot> = {}): Shoot => ({ ...shoot, ...extra, ...(handoff ? { handoff } : {}) });
  const incoming = (h: ShootHandoff, n: number, from: ShootHandoff['from'], shoot: Partial<Shoot> = {}): ShootHandoff => ({ ...h, n, from, shoot: { ...h.shoot, ...shoot } });

  it('adds a shoot this phone does not have', async () => {
    const { shootId } = await planned();
    expect(decideReceive(undefined, await build(shootId))).toEqual({ kind: 'add' });
  });

  it('uses the hand-off number, never the clocks', async () => {
    const { shootId } = await planned();
    const h = await build(shootId);
    const local = at(await get(shootId), { n: 2, role: 'photographer', away: true, sentAt: 1 });
    // The newer copy has an older clock, but the higher number: it wins.
    const newer = incoming(h, 3, 'assistant', { updatedAt: 1 });
    expect(decideReceive(local, newer)).toEqual({ kind: 'replace' });
    // An older number loses even with a later clock.
    expect(decideReceive(local, incoming(h, 1, 'assistant', { updatedAt: Date.now() + 1e9 }))).toEqual({ kind: 'older' });
  });

  it('ignores this phone’s own send and the same copy twice', async () => {
    const { shootId } = await planned();
    const h = await build(shootId);
    const local = at(await get(shootId), { n: 1, role: 'photographer', away: true });
    expect(decideReceive(local, incoming(h, 1, 'photographer'))).toEqual({ kind: 'older' });
    const received = at(await get(shootId), { n: 1, role: 'assistant', away: false }, { updatedAt: h.shoot.updatedAt });
    expect(decideReceive(received, incoming(h, 1, 'photographer'))).toEqual({ kind: 'older' });
  });

  it('refuses a copy with fewer done shots unless told to replace anyway', async () => {
    const { shootId } = await planned();
    const h = await build(shootId);
    const withDone = (await get(shootId)).shots.map((s, i) => (i < 2 ? { ...s, status: 'done' as const } : s));
    const local = at(await get(shootId), { n: 1, role: 'assistant', away: false }, { shots: withDone });
    expect(decideReceive(local, incoming(h, 2, 'photographer'))).toEqual({ kind: 'would-lose', localDone: 2, incomingDone: 0 });
  });

  it('asks which to keep when both phones changed since the last share', async () => {
    const { shootId } = await planned();
    const h = await build(shootId);
    // Photographer took back control (n 2, nobody away) while the assistant sends n 2 too.
    const local = at(await get(shootId), { n: 2, role: 'photographer', away: false }, { updatedAt: 500 });
    expect(decideReceive(local, incoming(h, 2, 'assistant', { updatedAt: 600 }))).toEqual({ kind: 'tie' });
  });

  it('counts only done shots', async () => {
    const { shootId } = await planned();
    const s = await get(shootId);
    expect(doneCount(s)).toBe(0);
    expect(doneCount({ shots: s.shots.map((x, i) => ({ ...x, status: i ? 'skipped' : 'done' })) })).toBe(1);
  });
});

describe('receiveShoot and the round trip between two phones', () => {
  it('merges the family without deleting anything else, and keeps photos already here', async () => {
    const { shootId, gran } = await planned();
    await db.people.update(gran.id, { photo: 'data:image/jpeg;base64,AAAA' });
    const { handoff } = await toOtherPhone(shootId);
    await clearDb();
    const other = await addExtra('someone-else', { name: 'Stranger', kind: 'guest' });
    await db.people.put({ ...(handoff.people.find((p) => p.id === gran.id)!), photo: 'data:image/jpeg;base64,BBBB', updatedAt: 1 });
    await receiveShoot(handoff);
    expect(await db.extras.get(other.id)).toBeTruthy();
    expect((await db.people.get(gran.id))?.photo).toBe('data:image/jpeg;base64,BBBB');
    expect(await db.people.count()).toBe(5);
    expect(await db.families.count()).toBe(1);
    expect(await db.locations.count()).toBe(1);
    expect(await db.poses.count()).toBe(1);
    expect(await get(shootId)).toMatchObject({ handoff: { n: 1, role: 'assistant', away: false } });
  });

  it('a planned shoot shared to the other phone can’t be started here until control is taken back (SH5)', async () => {
    const { shootId } = await planned();
    const b = await build(shootId);
    await markSent(shootId, b.n);
    await startShoot(shootId);
    expect((await get(shootId)).status).toBe('planned');
    await takeBack(shootId);
    await startShoot(shootId);
    expect((await get(shootId)).status).toBe('live');
  });

  it('goes there and back: the assistant marks shots done and the photographer accepts', async () => {
    const { shootId } = await planned();
    await startShoot(shootId);
    const { handoff, mine } = await toOtherPhone(shootId);
    // Assistant's phone.
    expect(decideReceive(undefined, handoff)).toEqual({ kind: 'add' });
    await receiveShoot(handoff);
    const first = (await get(shootId)).currentShotId!;
    await markShotOnDay(shootId, first, 'done');
    const back = await build(shootId);
    expect(back).toMatchObject({ n: 2, from: 'assistant' });
    expect(doneCount(back.shoot)).toBe(1);
    await markSent(shootId, back.n);
    // Photographer's phone: put the original back, then receive the newer copy.
    await clearDb();
    await receiveShoot(handoff);
    await db.shoots.put(mine);
    expect(sharedAway(mine)).toBe(true);
    expect(decideReceive(mine, back)).toEqual({ kind: 'replace' });
    await receiveShoot(back);
    const final = await get(shootId);
    expect(doneCount(final)).toBe(1);
    expect(final.handoff).toEqual({ n: 2, role: 'photographer', away: false });
    expect(lockedAway(final)).toBe(false);
  });
});

describe('sharing locks a live shoot (SH5)', () => {
  it('locks Done, Undo and presence on a live shoot until Take back control', async () => {
    const { shootId, ivy } = await planned();
    await startShoot(shootId);
    const s0 = await get(shootId);
    await markShotOnDay(shootId, s0.shots[0]!.id, 'done');
    await markSent(shootId, 1);
    const shared = await get(shootId);
    expect(sharedAway(shared) && lockedAway(shared)).toBe(true);
    expect(changedSinceSent(shared)).toBe(false);
    await markShotOnDay(shootId, s0.shots[1]!.id, 'done');
    await setShootPresence(shootId, ivy.id, 'left');
    await undoLastOnDay(shootId);
    await finishShoot(shootId);
    const still = await get(shootId);
    expect(still.shots.filter((s) => s.status === 'done')).toHaveLength(1);
    expect(still.presence[ivy.id]).toBe('here');
    expect(still.status).toBe('live');
    await takeBack(shootId);
    const back = await get(shootId);
    expect(back.handoff).toMatchObject({ n: 2, away: false });
    await markShotOnDay(shootId, s0.shots[1]!.id, 'done');
    expect(doneCount(await get(shootId))).toBe(2);
  });

  it('lets a planned shoot be edited and shared again, and flags the change', async () => {
    const { shootId } = await planned();
    await markSent(shootId, 1, 1000);
    expect(sharedAway(await get(shootId))).toBe(true);
    expect(lockedAway(await get(shootId))).toBe(false);
    await db.shoots.update(shootId, { title: 'Renamed', updatedAt: 2000 });
    expect(changedSinceSent(await get(shootId))).toBe(true);
    expect(await build(shootId)).toMatchObject({ n: 2 });
  });

  it('locks nothing when a finished shoot is shared', async () => {
    const { shootId } = await planned();
    await startShoot(shootId);
    await finishShoot(shootId);
    await markSent(shootId, 1);
    const s = await get(shootId);
    expect(s.handoff).toMatchObject({ n: 1, away: false });
    expect(sharedAway(s)).toBe(false);
  });
});
