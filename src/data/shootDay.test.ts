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
  setShootPresence,
  startShoot,
  undoLastOnDay,
  updateSettings,
  updateShot,
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
    await updateShot(shoot.id, s.order[0]!, { poseId: 'pose-x' });
    expect((await get()).shots.find((x) => x.id === s.order[0])!.poseId).toBe('pose-x');
    await updateShot(shoot.id, s.order[0]!, { poseId: '' });
    expect((await get()).shots.find((x) => x.id === s.order[0])!.poseId).toBeUndefined();
  });

  it('ignores a shoot that is not there', async () => {
    await startShoot('nope');
    await finishShoot('nope');
    expect(await db.shoots.get('nope')).toBeUndefined();
  });
});
