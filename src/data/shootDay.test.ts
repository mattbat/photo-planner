import { beforeEach, describe, expect, it } from 'vitest';
import { clearDb, seedFamily } from '../test/helpers';
import { db } from './db';
import {
  addCustomShot,
  createShoot,
  doShotNow,
  finishShoot,
  markShotOnDay,
  moveShotsUpNext,
  reopenShoot,
  setPriorities,
  setShootPresence,
  startShoot,
  togglePose,
  addPose,
  clearPoses,
  deletePose,
  movePose,
  undoLastOnDay,
  updateSettings,
} from './repo';

beforeEach(clearDb);

async function live() {
  const seeded = await seedFamily();
  const shoot = await createShoot(seeded.family, { date: '2026-12-05' });
  await startShoot(shoot.id);
  const get = async () => (await db.shoots.get(shoot.id))!;
  return { ...seeded, shoot, get };
}

describe('shoot day repo functions (§8)', () => {
  it('starts live with the clock, everyone here, and the first shot current', async () => {
    const { get, dog, gran } = await live();
    const s = await get();
    expect(s.status).toBe('live');
    expect(s.startedAt).toBeGreaterThan(0);
    expect(s.presence[gran.id]).toBe('here');
    expect(s.presence[dog.id]).toBe('here');
    expect(s.currentShotId).toBe(s.order[0]);
    expect(s.events).toEqual([]);
  });

  it('with "Treat everyone as here" off, people start expected but pets are always here', async () => {
    await updateSettings({ treatEveryoneAsHere: false });
    const { get, dog, gran } = await live();
    const s = await get();
    expect(s.presence[gran.id]).toBe('expected');
    expect(s.presence[dog.id]).toBe('here');
  });

  it('marks, undoes and puts back shots, keeping the log', async () => {
    const { shoot, get } = await live();
    const first = (await get()).order[0]!;
    await markShotOnDay(shoot.id, first, 'done');
    let s = await get();
    expect(s.shots.find((x) => x.id === first)).toMatchObject({ status: 'done' });
    expect(s.currentShotId).toBe(s.order[1]);
    expect(s.events).toHaveLength(1);
    await undoLastOnDay(shoot.id);
    s = await get();
    expect(s.shots.find((x) => x.id === first)!.status).toBe('todo');
    expect(s.shots.find((x) => x.id === first)!.doneAt).toBeUndefined();
    expect(s.currentShotId).toBe(first);
    await undoLastOnDay(shoot.id); // nothing to undo: no change
    await doShotNow(shoot.id, s.order[2]!);
    expect((await get()).currentShotId).toBe(s.order[2]);
  });

  it('tracks presence, moves shots up next, and undoes', async () => {
    const { shoot, get, ivy } = await live();
    await setShootPresence(shoot.id, ivy.id, 'left');
    expect((await get()).presence[ivy.id]).toBe('left');
    await moveShotsUpNext(shoot.id, ivy.id);
    expect((await get()).manualOrder).toBe(true);
    await undoLastOnDay(shoot.id);
    expect((await get()).presence[ivy.id]).toBe('here');
  });

  it('logs a shot added on a live shoot so Undo can remove it, but not when planning', async () => {
    const { shoot, get, ivy } = await live();
    const id = await addCustomShot(shoot.id, { name: 'Ivy alone', personIds: [ivy.id] });
    let s = await get();
    expect(s.currentShotId).toBe(id);
    expect(s.events.at(-1)).toMatchObject({ type: 'add-shot', shotId: id });
    await undoLastOnDay(shoot.id);
    s = await get();
    expect(s.shots.some((x) => x.id === id)).toBe(false);
    const other = await createShoot((await db.families.toArray())[0]!, { date: '2026-12-06' });
    await addCustomShot(other.id, { name: 'Pre-planned', personIds: [ivy.id] });
    expect((await db.shoots.get(other.id))!.events).toEqual([]);
  });

  it('finishes and reopens, and a pose can be attached and cleared', async () => {
    const { shoot, get } = await live();
    await finishShoot(shoot.id);
    expect(await get()).toMatchObject({ status: 'done', finishedAt: expect.any(Number) });
    await reopenShoot(shoot.id);
    const s = await get();
    expect(s.status).toBe('live');
    expect(s.finishedAt).toBeUndefined();
    await togglePose(shoot.id, s.order[0]!, 'pose-x');
    expect((await get()).shots.find((x) => x.id === s.order[0])!.poseIds).toEqual(['pose-x']);
    await togglePose(shoot.id, s.order[0]!, 'pose-x');
    expect((await get()).shots.find((x) => x.id === s.order[0])!.poseIds).toBeUndefined();
  });

  it('ignores a shoot that is not there', async () => {
    await startShoot('nope');
    await finishShoot('nope');
    expect(await db.shoots.get('nope')).toBeUndefined();
  });
});

describe('early and late people (O7, O8)', () => {
  const idsWith = (s: { shots: { id: string; personIds: string[] }[]; order: string[] }, person: string) => {
    const by = new Map(s.shots.map((x) => [x.id, x]));
    return s.order.map((id) => by.get(id)!.personIds.includes(person));
  };

  it('before the shoot, Early people\u2019s shots come first and Normal puts it back', async () => {
    const { shoot, gran, get } = await live().then(async (l) => {
      // a planned shoot instead: use the live one's family but a fresh planned shoot
      const planned = await createShoot(l.family, { date: '2026-12-06' });
      return { ...l, shoot: planned, get: async () => (await db.shoots.get(planned.id))! };
    });
    const before = (await get()).order;
    const res = await setPriorities(shoot.id, [gran.id], 'early');
    const s = await get();
    expect(s.priorities).toEqual({ [gran.id]: 'early' });
    const flags = idsWith(s, gran.id);
    expect(flags.indexOf(false)).toBeGreaterThan(0);
    expect(flags.slice(flags.indexOf(false)).every((f) => !f)).toBe(true);
    expect(res.reordered).toBe(s.order.join() !== before.join());
    await setPriorities(shoot.id, [gran.id], 'normal');
    expect((await get()).priorities).toBeUndefined();
  });

  it('a hand-ordered planned shoot keeps its order; the priority is only saved', async () => {
    const { family, ivy } = await seedFamily();
    const shoot = await createShoot(family, { date: '2026-12-06' });
    await db.shoots.update(shoot.id, { manualOrder: true });
    const order = (await db.shoots.get(shoot.id))!.order;
    expect(await setPriorities(shoot.id, [ivy.id], 'late')).toEqual({ reordered: false });
    const s = (await db.shoots.get(shoot.id))!;
    expect(s.order).toEqual(order);
    expect(s.priorities).toEqual({ [ivy.id]: 'late' });
  });

  it('on shoot day only the shots still to do move, and the current shot stays', async () => {
    const { shoot, get, ivy } = await live();
    const first = await get();
    await markShotOnDay(shoot.id, first.currentShotId!, 'done');
    await markShotOnDay(shoot.id, (await get()).currentShotId!, 'skip');
    const mid = await get();
    const closedAt = mid.order.map((id, i) => [id, i] as const).filter(([id]) => mid.shots.find((x) => x.id === id)!.status !== 'todo');
    await setPriorities(shoot.id, [ivy.id], 'late');
    const after = await get();
    expect(after.currentShotId).toBe(mid.currentShotId);
    for (const [id, i] of closedAt) expect(after.order[i]).toBe(id);
    expect([...after.order].sort()).toEqual([...mid.order].sort());
    const todo = after.order.filter((id) => after.shots.find((x) => x.id === id)!.status === 'todo');
    expect(todo[0]).toBe(mid.currentShotId);
    const rest = todo.slice(1).map((id) => after.shots.find((x) => x.id === id)!.personIds.includes(ivy.id));
    const firstLate = rest.indexOf(true);
    expect(firstLate < 0 || rest.slice(firstLate).every((f) => f)).toBe(true);
  });

  it('is ignored for missing shoots and shoots run on the other phone, and removed with the person', async () => {
    expect(await setPriorities('nope', ['x'], 'early')).toEqual({ reordered: false });
    const { shoot, ivy, get } = await live();
    await setPriorities(shoot.id, [ivy.id], 'early');
    await db.shoots.update(shoot.id, { handoff: { n: 1, role: 'photographer', away: true } });
    expect(await setPriorities(shoot.id, [ivy.id], 'late')).toEqual({ reordered: false });
    expect((await get()).priorities).toEqual({ [ivy.id]: 'early' });
    await db.shoots.update(shoot.id, { handoff: { n: 2, role: 'photographer', away: false } });
    const { deletePerson } = await import('./repo');
    await deletePerson(ivy.id);
    expect((await get()).priorities ?? {}).toEqual({});
  });
});

describe('several poses on a shot (PL5)', () => {
  it('toggles, reorders, clears, and detaches a deleted pose from every shot', async () => {
    const { shoot, get } = await live();
    const [a, b] = (await get()).order;
    for (const p of ['p1', 'p2', 'p3']) await togglePose(shoot.id, a!, p);
    const poseIds = async (id: string) => (await get()).shots.find((s) => s.id === id)!.poseIds;
    expect(await poseIds(a!)).toEqual(['p1', 'p2', 'p3']);
    await movePose(shoot.id, a!, 'p3', -1);
    expect(await poseIds(a!)).toEqual(['p1', 'p3', 'p2']);
    await movePose(shoot.id, a!, 'p1', -1); // already first: nothing changes
    await movePose(shoot.id, a!, 'p2', 1); // already last
    await movePose(shoot.id, a!, 'nope', 1);
    expect(await poseIds(a!)).toEqual(['p1', 'p3', 'p2']);
    await togglePose(shoot.id, a!, 'p1');
    expect(await poseIds(a!)).toEqual(['p3', 'p2']);
    await clearPoses(shoot.id, a!);
    expect(await poseIds(a!)).toBeUndefined();
    // deletePose takes one pose off several shots and keeps the rest.
    const own = await addPose({ name: 'Mine', category: 'couples', minSize: 2, maxSize: 2, description: '', directions: [], tips: [], mistakes: [], tags: [], difficulty: 'easy', favorite: false, builtIn: false });
    await togglePose(shoot.id, a!, own.id);
    await togglePose(shoot.id, a!, 'p9');
    await togglePose(shoot.id, b!, own.id);
    await deletePose(own.id);
    expect(await poseIds(a!)).toEqual(['p9']);
    expect(await poseIds(b!)).toBeUndefined();
  });
});
