import { beforeEach, describe, expect, it } from 'vitest';
import { clearDb, seedFamily } from '../test/helpers';
import { db } from './db';
import {
  addCustomShot,
  addPerson,
  applySuggestedOrder,
  createDemoFamily,
  createShoot,
  deletePerson,
  duplicateShoot,
  regenerateShoot,
  removeShot,
  renameShot,
  restoreShot,
  setAttending,
  setOrderOptions,
  setShotOrder,
  setSoloScope,
  setTemplateEnabled,
  today,
  updateExtra,
  updateShoot,
  updateShot,
  updateSettings,
} from './repo';

beforeEach(clearDb);

const load = async (id: string) => (await db.shoots.get(id))!;

describe('a new shoot builds its shot list (E1)', () => {
  it('generates shots from the templates that are on, in a list order that matches', async () => {
    const { family, ivy } = await seedFamily();
    const shoot = await createShoot(family, { attendingIds: [] , date: '2026-12-05' });
    expect(shoot.shots).toEqual([]);
    const full = await createShoot(family);
    expect(full.shots.length).toBeGreaterThan(0);
    expect(full.order).toEqual(full.shots.map((s) => s.id));
    expect(full.shots.some((s) => s.name === 'Everyone')).toBe(true);
    expect(full.shots.find((s) => s.source === 'soloKids')!.personIds).toEqual([ivy.id]);
    expect(full.date).toBe(today());
  });

  it('works for the demo family with its random ids, the same way each time', async () => {
    const family = await createDemoFamily();
    const a = await createShoot(family);
    const b = await createShoot(family);
    expect(a.shots.map((s) => s.name)).toEqual(b.shots.map((s) => s.name));
    expect(a.shots.length).toBeGreaterThan(10);
  });
});

describe('editing a shoot rebuilds the list in one step', () => {
  it('switches templates on and off (E2, E5)', async () => {
    const { family } = await seedFamily();
    const { id } = await createShoot(family);
    const before = (await load(id)).shots.length;
    await setTemplateEnabled(id, 'parentChild', true);
    const on = await load(id);
    expect(on.templates.find((t) => t.id === 'parentChild')!.enabled).toBe(true);
    expect(on.shots.length).toBeGreaterThan(before);
    await setTemplateEnabled(id, 'parentChild', false);
    expect((await load(id)).shots.length).toBe(before);
  });

  it('switches the solo portraits scope between everyone, kids, adults and off', async () => {
    const { family } = await seedFamily();
    const { id } = await createShoot(family);
    const solos = async () => (await load(id)).shots.filter((s) => s.personIds.length === 1 && s.source.startsWith('solo')).length;
    expect(await solos()).toBe(1);
    await setSoloScope(id, 'everyone');
    expect(await solos()).toBe(5);
    await setSoloScope(id, 'adults');
    expect(await solos()).toBe(4);
    await setSoloScope(id, 'off');
    expect(await solos()).toBe(0);
    expect((await load(id)).templates.filter((t) => t.id.startsWith('solo') && t.enabled)).toEqual([]);
  });

  it('follows who is attending (E3)', async () => {
    const { family, ivy, max, nia } = await seedFamily();
    const { id } = await createShoot(family);
    await setAttending(id, ivy.id, false);
    const without = await load(id);
    expect(without.attendingIds).not.toContain(ivy.id);
    expect(without.shots.some((s) => s.personIds.includes(ivy.id))).toBe(false);
    await setAttending(id, ivy.id, true);
    expect((await load(id)).shots.some((s) => s.personIds.includes(ivy.id))).toBe(true);
    await setAttending(id, max.id, false);
    await setAttending(id, nia.id, false);
    expect((await load(id)).shots.every((s) => !s.personIds.includes(max.id))).toBe(true);
  });

  it('adds custom shots and keeps them (E4)', async () => {
    const { family, ivy, max, dog } = await seedFamily();
    const { id } = await createShoot(family);
    const shotId = await addCustomShot(id, { name: '  Ivy with the dog ', personIds: [ivy.id, dog.id] });
    const shoot = await load(id);
    expect(shoot.shots.find((s) => s.id === shotId)).toMatchObject({ name: 'Ivy with the dog', source: 'custom', personIds: [ivy.id, dog.id], status: 'todo' });
    expect(shoot.order.at(-1)).toBe(shotId);
    const blank = await addCustomShot(id, { name: ' ', personIds: [max.id] });
    expect((await load(id)).shots.find((s) => s.id === blank)!.name).toBe('Custom shot');
    await regenerateShoot(id);
    expect((await load(id)).shots.filter((s) => s.source === 'custom')).toHaveLength(2);
    await removeShot(id, shotId);
    const after = await load(id);
    expect(after.shots.find((s) => s.id === shotId)).toBeUndefined();
    expect(after.removedKeys).toEqual([]);
  });

  it('renames, flags must-haves and keeps notes through regenerating (E6)', async () => {
    const { family } = await seedFamily();
    const { id, shots } = await createShoot(family);
    const target = shots.find((s) => s.source === 'couples')!;
    await renameShot(id, target.id, '  The couple ');
    await updateShot(id, target.id, { mustHave: true, notes: 'Hold hands' });
    await setTemplateEnabled(id, 'parentChild', true);
    expect((await load(id)).shots.find((s) => s.id === target.id)).toMatchObject({ name: 'The couple', nameEdited: true, mustHave: true, notes: 'Hold hands' });
    await renameShot(id, target.id, '');
    const reset = (await load(id)).shots.find((s) => s.id === target.id)!;
    expect(reset.nameEdited).toBe(false);
    expect(reset.name).toBe(target.name);
  });

  it('removes a generated shot for good, lists it, and restores it (E6)', async () => {
    const { family } = await seedFamily();
    const { id, shots } = await createShoot(family);
    const target = shots.find((s) => s.source === 'couples')!;
    await removeShot(id, target.id);
    await regenerateShoot(id);
    await setTemplateEnabled(id, 'parentChild', true);
    let shoot = await load(id);
    expect(shoot.shots.find((s) => s.id === target.id)).toBeUndefined();
    expect(shoot.removedKeys).toEqual([target.id]);
    expect(shoot.order).not.toContain(target.id);
    await restoreShot(id, target.id);
    shoot = await load(id);
    expect(shoot.shots.find((s) => s.id === target.id)).toBeDefined();
    expect(shoot.removedKeys).toEqual([]);
    await removeShot(id, 'nothing');
    await removeShot('missing-shoot', 'x');
  });

  it('rebuilds when the family changes (a new person, a deleted person, an extra)', async () => {
    const { family, ivy, dog } = await seedFamily();
    const { id } = await createShoot(family);
    const kid = await addPerson(family.id, { name: 'Zed', parentIds: ivy.parentIds, ageGroup: 'child' });
    await setAttending(id, kid.id, true);
    expect((await load(id)).shots.some((s) => s.personIds.includes(kid.id))).toBe(true);
    await updateExtra(dog.id, { name: 'Biscuit II' });
    await regenerateShoot(id);
    await deletePerson(kid.id);
    await regenerateShoot(id);
    expect((await load(id)).shots.some((s) => s.personIds.includes(kid.id))).toBe(false);
    await regenerateShoot('missing');
  });

  it('only writes when something changed', async () => {
    const { family } = await seedFamily();
    const { id } = await createShoot(family);
    const before = await load(id);
    await regenerateShoot(id);
    expect(await load(id)).toEqual(before);
  });

  it('keeps simple edits atomic: two quick edits both land', async () => {
    const { family } = await seedFamily();
    const { id, shots } = await createShoot(family);
    const [a, b] = [shots[0]!, shots[1]!];
    await Promise.all([updateShot(id, a.id, { mustHave: true }), updateShot(id, b.id, { notes: 'x' }), updateShoot(id, { startTime: '10:00' })]);
    const shoot = await load(id);
    expect(shoot.shots.find((s) => s.id === a.id)!.mustHave).toBe(true);
    expect(shoot.shots.find((s) => s.id === b.id)!.notes).toBe('x');
    expect(shoot.startTime).toBe('10:00');
  });
});

describe('order (O1, O2, O4)', () => {
  it('sets the order by hand and marks it so', async () => {
    const { family } = await seedFamily();
    const { id, order } = await createShoot(family);
    await setShotOrder(id, [...order].reverse());
    const shoot = await load(id);
    expect(shoot.order).toEqual([...order].reverse());
    expect(shoot.manualOrder).toBe(true);
  });

  it('applies the suggested order, optionally keeping shots already taken in front', async () => {
    const family = await createDemoFamily();
    const { id, order } = await createShoot(family);
    await setShotOrder(id, [...order].reverse());
    await applySuggestedOrder(id);
    let shoot = await load(id);
    expect(shoot.manualOrder).toBe(false);
    expect([...shoot.order].sort()).toEqual([...order].sort());
    expect(shoot.order).not.toEqual([...order].reverse());
    const first = shoot.order.at(-1)!;
    await updateShot(id, first, { status: 'done' });
    await applySuggestedOrder(id, true);
    shoot = await load(id);
    expect(shoot.order[0]).toBe(first);
    await applySuggestedOrder('missing');
  });

  it('saves order options and uses the time estimates from Settings', async () => {
    const { family } = await seedFamily();
    const { id } = await createShoot(family);
    await setOrderOptions(id, { kidsFirst: false, mustHavesEarly: true });
    expect((await load(id)).orderOptions).toEqual({ kidsFirst: false, releaseOlderEarly: true, bigGroupFirst: true, mustHavesEarly: true, everyoneFirst: true });
    await updateSettings({ timeEstimates: { small: 1, medium: 1, large: 1, setup: 0 } });
    await applySuggestedOrder(id);
  });
});

describe('duplicate shoot (P4)', () => {
  it('copies people, templates and edits as a fresh planned shoot', async () => {
    const { family } = await seedFamily();
    const { id, shots } = await createShoot(family, { title: 'Spring', startTime: '10:00' });
    await updateShot(id, shots[0]!.id, { mustHave: true, notes: 'n', status: 'done' });
    await updateShoot(id, { status: 'done', startedAt: 5, finishedAt: 9, currentShotId: shots[0]!.id, presence: { x: 'here' } });
    const copy = (await duplicateShoot(id, { date: '2027-01-02', title: 'Winter' }))!;
    expect(copy.id).not.toBe(id);
    const saved = await load(copy.id);
    expect(saved).toMatchObject({ title: 'Winter', date: '2027-01-02', status: 'planned', startTime: '10:00', presence: {}, events: [] });
    expect(saved.startedAt).toBeUndefined();
    expect(saved.finishedAt).toBeUndefined();
    expect(saved.currentShotId).toBeUndefined();
    expect(saved.shots.find((s) => s.id === shots[0]!.id)).toMatchObject({ mustHave: true, notes: 'n', status: 'todo' });
    expect(saved.attendingIds).toEqual((await load(id)).attendingIds);
    const plain = (await duplicateShoot(id))!;
    expect(plain.title).toBe('Spring');
    expect(plain.date).toBe(today());
    expect(await duplicateShoot('missing')).toBeUndefined();
  });
});
