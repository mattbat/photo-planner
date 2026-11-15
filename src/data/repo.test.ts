import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearDb, seedFamily } from '../test/helpers';
import { db, PhotoPlannerDb } from './db';
import { DEFAULT_TEMPLATE_IDS } from '../engine/templates';
import { defaultSettings } from './defaults';
import {
  addChild,
  addExtra,
  createDemoFamily,
  ensurePartnership,
  linkChild,
  linkParent,
  linkPartner,
  quickAddFamily,
  addLocation,
  addPartnership,
  addPerson,
  addPose,
  addPosePhoto,
  createFamily,
  createShoot,
  regenerateShoot,
  deleteExtra,
  deleteFamily,
  deleteLocation,
  deletePartnership,
  deletePerson,
  deletePose,
  deletePosePhoto,
  deleteShoot,
  eraseEverything,
  getSettings,
  newId,
  setFamilyArchived,
  today,
  updateExtra,
  updateFamily,
  updateLocation,
  updatePartnership,
  updatePerson,
  updatePose,
  updateSettings,
  updateShoot,
} from './repo';
import { TEMPLATE_IDS } from '../engine/templates';
import type { Pose } from './types';

beforeEach(clearDb);

const newPose = (): Omit<Pose, 'id' | 'createdAt' | 'updatedAt'> => ({
  name: '  Walking together ',
  category: 'couples',
  minSize: 2,
  maxSize: 2,
  description: 'Walk toward the camera.',
  directions: ['Hold hands.'],
  tips: [],
  mistakes: [],
  tags: ['walking'],
  difficulty: 'easy',
  favorite: false,
  builtIn: false,
});

describe('newId', () => {
  it('makes v4 UUIDs even where crypto.randomUUID is missing (plain http)', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const ids = new Set(Array.from({ length: 100 }, newId));
      expect(ids.size).toBe(100);
      for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });

  it('uses crypto.randomUUID when available', () => {
    expect(newId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('families and people', () => {
  it('creates, renames, archives and deletes a family with everything in it', async () => {
    const { family } = await seedFamily();
    expect(await db.families.get(family.id)).toMatchObject({ name: 'The Testers', archived: false });
    await updateFamily(family.id, { name: 'The Examples' });
    await setFamilyArchived(family.id, true);
    expect(await db.families.get(family.id)).toMatchObject({ name: 'The Examples', archived: true });
    expect(await db.people.count()).toBe(5);
    await createShoot(family);

    const other = await createFamily('  Other ');
    expect(other.name).toBe('Other');
    await deleteFamily(family.id);
    expect(await db.families.toArray()).toEqual([other]);
    expect(await db.people.count()).toBe(0);
    expect(await db.partnerships.count()).toBe(0);
    expect(await db.extras.count()).toBe(0);
    expect(await db.shoots.count()).toBe(0);
  });

  it('stores children by parent ids and finds them through the index', async () => {
    const { max, ivy } = await seedFamily();
    expect(await db.people.where('parentIds').equals(max.id).toArray()).toEqual([ivy]);
    await updatePerson(ivy.id, { nickname: 'Ive', usuallyAbsent: true });
    expect(await db.people.get(ivy.id)).toMatchObject({ nickname: 'Ive', usuallyAbsent: true, parentIds: ivy.parentIds });
  });

  it('deleting a person removes their partnerships, parent links, and place in shoots', async () => {
    const { family, max, nia, ivy } = await seedFamily();
    const shoot = await createShoot(family);
    await updateShoot(shoot.id, {
      shots: [
        {
          id: 's1',
          name: 'Max and Ivy',
          nameEdited: false,
          personIds: [max.id, ivy.id],
          source: 'custom',
          reasons: [],
          mustHave: false,
          notes: '',
          status: 'todo',
        },
      ],
      presence: { [max.id]: 'here' },
    });
    await deletePerson(max.id);
    expect(await db.people.get(max.id)).toBeUndefined();
    expect(await db.partnerships.where('personIds').equals(max.id).count()).toBe(0);
    expect((await db.people.get(ivy.id))?.parentIds).toEqual([nia.id]);
    const saved = (await db.shoots.get(shoot.id))!;
    expect(saved.attendingIds).not.toContain(max.id);
    expect(saved.shots[0]!.personIds).toEqual([ivy.id]);
    expect(saved.presence).toEqual({});
  });

  it('leaves shoots alone when the person was not in them', async () => {
    const { family, ivy } = await seedFamily();
    const stranger = await addPerson(family.id, { name: 'Stranger' });
    const shoot = await createShoot(family);
    await updateShoot(shoot.id, { attendingIds: [ivy.id] });
    await regenerateShoot(shoot.id);
    const before = (await db.shoots.get(shoot.id))!;
    await deletePerson(stranger.id);
    expect(await db.shoots.get(shoot.id)).toEqual(before);
  });

  it('keeps partnerships as records with a status', async () => {
    const { family, gran, grandad } = await seedFamily();
    const couple = (await db.partnerships.where('personIds').equals(gran.id).first())!;
    expect(couple.personIds).toEqual([gran.id, grandad.id]);
    await updatePartnership(couple.id, { status: 'separated' });
    expect((await db.partnerships.get(couple.id))?.status).toBe('separated');
    await deletePartnership(couple.id);
    expect(await db.partnerships.get(couple.id)).toBeUndefined();
    const again = await addPartnership(family.id, [gran.id, grandad.id], 'separated');
    expect(again.status).toBe('separated');
  });

  it('adds, edits and deletes extra people', async () => {
    const { family, dog } = await seedFamily();
    await updateExtra(dog.id, { notes: 'Wears a bandana' });
    expect(await db.extras.get(dog.id)).toMatchObject({ name: 'Biscuit', kind: 'pet', notes: 'Wears a bandana' });
    const guest = await addExtra(family.id, { name: ' Friend ', kind: 'guest' });
    expect(guest.name).toBe('Friend');
    await deleteExtra(dog.id);
    expect(await db.extras.count()).toBe(1);
  });
});

describe('shoots', () => {
  it('starts from the Settings defaults, with everyone attending except people not usually at shoots (F5)', async () => {
    const { family, ivy, dog } = await seedFamily();
    await updatePerson(ivy.id, { usuallyAbsent: true });
    const shoot = await createShoot(family, { title: 'Spring' });
    expect(shoot).toMatchObject({ status: 'planned', title: 'Spring', date: today(), manualOrder: false });
    expect(shoot.shots.length).toBeGreaterThan(0);
    expect(shoot.order).toEqual(shoot.shots.map((s) => s.id));
    expect(shoot.attendingIds).toHaveLength(5);
    expect(shoot.attendingIds).not.toContain(ivy.id);
    expect(shoot.attendingIds).toContain(dog.id);
    expect(shoot.templates.filter((t) => t.enabled).map((t) => t.id).sort()).toEqual([...DEFAULT_TEMPLATE_IDS].sort());
    expect(await db.shoots.get(shoot.id)).toEqual(shoot);
  });

  it('does not bring one shoot’s extras into another', async () => {
    const { family } = await seedFamily();
    const one = await createShoot(family);
    await addExtra(family.id, { name: 'Cousin Pat', kind: 'guest', shootId: one.id });
    const two = await createShoot(family);
    expect(two.attendingIds).toHaveLength(6);
    await deleteShoot(one.id);
    expect(await db.extras.filter((e) => e.shootId === one.id).count()).toBe(0);
    expect(await db.shoots.get(one.id)).toBeUndefined();
  });

  it('updates a shoot without touching its other fields', async () => {
    const { family } = await seedFamily();
    const shoot = await createShoot(family, { date: '2026-12-05' });
    await updateShoot(shoot.id, { startTime: '16:30', status: 'live' });
    expect(await db.shoots.get(shoot.id)).toMatchObject({ date: '2026-12-05', startTime: '16:30', status: 'live' });
  });
});

describe('locations', () => {
  it('adds, edits and deletes, and detaches the location from shoots', async () => {
    const { family } = await seedFamily();
    const place = await addLocation({ name: ' Riverside Park ', latitude: 41.88, longitude: -87.63, source: 'pin' });
    expect(place.name).toBe('Riverside Park');
    await updateLocation(place.id, { timeZone: 'America/Chicago' });
    const shoot = await createShoot(family, { locationId: place.id });
    const elsewhere = await createShoot(family, { locationId: 'other' });
    await deleteLocation(place.id);
    expect(await db.locations.count()).toBe(0);
    expect((await db.shoots.get(shoot.id))?.locationId).toBeUndefined();
    expect((await db.shoots.get(elsewhere.id))?.locationId).toBe('other');
  });
});

describe('poses', () => {
  it('adds, edits and deletes a pose with its photos, and detaches it from shots', async () => {
    const { family } = await seedFamily();
    const pose = await addPose(newPose());
    expect(pose.name).toBe('Walking together');
    await updatePose(pose.id, { favorite: true });
    const photo = await addPosePhoto({ poseId: pose.id, dataUrl: 'data:image/jpeg;base64,AAAA', width: 800, height: 600 });
    expect(await db.posePhotos.where('poseId').equals(pose.id).count()).toBe(1);

    const shoot = await createShoot(family);
    const shot = (poseId?: string) => ({
      id: poseId ? 'with' : 'without',
      name: 'x',
      nameEdited: false,
      personIds: [],
      source: 'custom' as const,
      reasons: [],
      mustHave: false,
      notes: '',
      status: 'todo' as const,
      ...(poseId ? { poseId } : {}),
    });
    await updateShoot(shoot.id, { shots: [shot(pose.id), shot()] });
    await deletePose(pose.id);
    expect(await db.poses.count()).toBe(0);
    expect(await db.posePhotos.count()).toBe(0);
    const shots = (await db.shoots.get(shoot.id))!.shots;
    expect(shots.map((s) => s.poseId)).toEqual([undefined, undefined]);

    const other = await addPose(newPose());
    const kept = await addPosePhoto({ poseId: other.id, dataUrl: 'data:image/jpeg;base64,BBBB', width: 1, height: 1 });
    await deletePosePhoto(kept.id);
    expect(await db.posePhotos.get(photo.id)).toBeUndefined();
    expect(await db.posePhotos.count()).toBe(0);
  });
});

describe('settings', () => {
  it('starts from the defaults and saves changes', async () => {
    const defaults = defaultSettings();
    expect(await getSettings()).toEqual(defaults);
    expect(defaults.defaultTemplates.map((t) => t.id)).toEqual([...TEMPLATE_IDS]);
    expect(defaults.defaultTemplates.filter((t) => t.enabled).map((t) => t.id)).toContain('soloKids');
    const next = await updateSettings({ timeEstimates: { small: 1, medium: 2, large: 4, setup: 0 } });
    expect(next.timeEstimates.large).toBe(4);
    expect(await getSettings()).toEqual(next);
    expect((await getSettings()).defaultOrderOptions).toEqual(defaults.defaultOrderOptions);
  });
});

describe('eraseEverything', () => {
  it('clears every table and only this app’s localStorage keys', async () => {
    await seedFamily();
    await updateSettings({});
    localStorage.setItem('photo-planner.theme', 'dark');
    localStorage.setItem('other.key', 'keep');
    await eraseEverything();
    for (const table of db.tables) expect(await table.count()).toBe(0);
    expect(localStorage.getItem('photo-planner.theme')).toBeNull();
    expect(localStorage.getItem('other.key')).toBe('keep');
  });

  it('copes with unavailable storage', async () => {
    const broken = {
      get length(): number {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    await expect(eraseEverything(broken)).resolves.toBeUndefined();
  });
});

describe('schema (T4)', () => {
  it('opens at version 2 with every table the spec needs', () => {
    expect(db.verno).toBe(2);
    expect(db.tables.map((t) => t.name).sort()).toEqual(
      ['extras', 'families', 'locations', 'partnerships', 'people', 'poses', 'posePhotos', 'settings', 'shoots'].sort(),
    );
  });

  it('version 2 turns a shot\u2019s single poseId into poseIds, leaving other shots alone', async () => {
    const name = `migration-poses-${newId()}`;
    // The version-1 layout, as an app from before this change stored it.
    const old = new Dexie(name);
    old.version(1).stores({
      families: 'id, name',
      people: 'id, familyId, *parentIds',
      partnerships: 'id, familyId, *personIds',
      extras: 'id, familyId, shootId',
      shoots: 'id, familyId, date, status',
      poses: 'id, category, name',
      posePhotos: 'id, poseId',
      locations: 'id, name',
      settings: 'key',
    });
    const shot = (id: string, extra: object) => ({ id, name: id, nameEdited: false, personIds: [], source: 'custom', reasons: [], mustHave: false, notes: '', status: 'todo', ...extra });
    await old.table('shoots').add({ id: 's1', familyId: 'f', date: '2026-12-05', status: 'planned', updatedAt: 1, createdAt: 1, shots: [shot('a', { poseId: 'p1' }), shot('b', {}), shot('c', { poseId: 'p2' })] });
    old.close();
    const upgraded = new PhotoPlannerDb(name);
    const shoot = (await upgraded.shoots.get('s1'))!;
    expect(shoot.shots.map((s) => s.poseIds)).toEqual([['p1'], undefined, ['p2']]);
    expect(shoot.shots.some((s) => 'poseId' in s)).toBe(false);
    upgraded.close();
    await Dexie.delete(name);
  });

  it('keeps data when an older database of the same name is opened again', async () => {
    const name = `migration-test-${newId()}`;
    const first = new PhotoPlannerDb(name);
    await first.families.add({ id: 'f1', name: 'The Testers', archived: false, createdAt: 1, updatedAt: 1 });
    first.close();
    const again = new PhotoPlannerDb(name);
    expect(await again.families.get('f1')).toMatchObject({ name: 'The Testers' });
    again.close();
    await Dexie.delete(name);
  });
});

describe('children, partnerships and bulk creation (M1)', () => {
  it('addChild makes a kid under at most two parents', async () => {
    const { family, max, nia } = await seedFamily();
    const kid = await addChild(family.id, '  Zed ', [max.id, nia.id, 'third']);
    expect(await db.people.get(kid.id)).toMatchObject({ name: 'Zed', parentIds: [max.id, nia.id], grown: false, ageGroup: 'child' });
  });

  it('ensurePartnership reuses an existing pair and updates its status', async () => {
    const { family, max, nia } = await seedFamily();
    const again = await ensurePartnership(family.id, [nia.id, max.id], 'separated');
    expect(again.status).toBe('separated');
    expect(await db.partnerships.where('familyId').equals(family.id).count()).toBe(2);
    expect((await ensurePartnership(family.id, [max.id, nia.id], 'separated')).id).toBe(again.id);
    const other = await addPerson(family.id, { name: 'Pat' });
    await ensurePartnership(family.id, [max.id, other.id]);
    expect(await db.partnerships.where('familyId').equals(family.id).count()).toBe(3);
  });

  it('quickAddFamily creates the whole family in one go and skips blanks', async () => {
    const family = await quickAddFamily({
      familyName: ' The Rivers ',
      grandparents: ['Ann Rivers', ' ', 'Bo Rivers'],
      children: [
        { name: 'Cy', partner: 'Di', kids: ['Eli', ' ', 'Fay'] },
        { name: 'Gus', grown: false },
        { name: 'Hal' },
        { name: '  ' },
      ],
    });
    expect(family.name).toBe('The Rivers');
    const people = await db.people.where('familyId').equals(family.id).toArray();
    const id = (name: string) => people.find((p) => p.name === name)!.id;
    expect(people.map((p) => p.name).sort()).toEqual(['Ann Rivers', 'Bo Rivers', 'Cy', 'Di', 'Eli', 'Fay', 'Gus', 'Hal']);
    expect(people.find((p) => p.name === 'Cy')!.parentIds).toEqual([id('Ann Rivers'), id('Bo Rivers')]);
    expect(people.find((p) => p.name === 'Eli')).toMatchObject({ parentIds: [id('Cy'), id('Di')], grown: false });
    expect(people.find((p) => p.name === 'Gus')!.grown).toBe(false);
    expect(people.find((p) => p.name === 'Hal')!.grown).toBe(true);
    expect(await db.partnerships.where('familyId').equals(family.id).count()).toBe(2);
  });

  it('quickAddFamily works with one grandparent, no children and no name', async () => {
    const family = await quickAddFamily({ familyName: '', grandparents: ['Solo'], children: [] });
    expect(family.name).toBe('New family');
    expect(await db.people.where('familyId').equals(family.id).count()).toBe(1);
    expect(await db.partnerships.count()).toBe(0);
  });

  describe('linking people already in the family (F9)', () => {
    it('linkParent and linkChild link existing people, and linking twice changes nothing', async () => {
      const { family, ivy, max, nia, gran } = await seedFamily();
      const lone = await addPerson(family.id, { name: 'Lone Kid' });
      expect(await linkParent(lone.id, nia.id)).toEqual({ ok: true });
      expect((await db.people.get(lone.id))!.parentIds).toEqual([nia.id]);
      expect(await linkChild(max.id, lone.id, nia.id)).toEqual({ ok: true });
      expect((await db.people.get(lone.id))!.parentIds).toEqual([nia.id, max.id]);
      const stamp = (await db.people.get(lone.id))!.updatedAt;
      expect(await linkChild(max.id, lone.id, nia.id)).toEqual({ ok: true });
      expect((await db.people.get(lone.id))!.updatedAt).toBe(stamp);
      // Ivy already has two parents.
      const refused = await linkParent(ivy.id, gran.id);
      expect(refused).toMatchObject({ ok: false });
      expect((await db.people.get(ivy.id))!.parentIds).toEqual([max.id, nia.id]);
    });

    it('refuses loops and impossible links, in plain words, and writes nothing', async () => {
      const { gran, max, ivy } = await seedFamily();
      const loop = await linkParent(gran.id, ivy.id);
      expect(loop).toMatchObject({ ok: false });
      expect((loop as { message: string }).message).toMatch(/own ancestor|Gran/);
      expect((await db.people.get(gran.id))!.parentIds).toEqual([]);
      expect(await linkParent(max.id, max.id)).toMatchObject({ ok: false });
      expect(await linkParent('nope', max.id)).toMatchObject({ ok: false, message: expect.stringMatching(/isn’t in this family/) });
      const other = await createFamily('Elsewhere');
      const stranger = await addPerson(other.id, { name: 'Stranger' });
      expect(await linkChild(max.id, stranger.id)).toMatchObject({ ok: false });
    });

    it('linkPartner links two existing people once, and refuses a parent and child', async () => {
      const { family, max, gran, ivy } = await seedFamily();
      const sam = await addPerson(family.id, { name: 'Sam' });
      const before = await db.partnerships.count();
      expect(await linkPartner(max.id, sam.id)).toEqual({ ok: true });
      expect(await db.partnerships.count()).toBe(before + 1);
      expect(await linkPartner(sam.id, max.id)).toEqual({ ok: true });
      expect(await db.partnerships.count()).toBe(before + 1);
      expect(await linkPartner(gran.id, max.id)).toMatchObject({ ok: false });
      expect(await linkPartner(ivy.id, ivy.id)).toMatchObject({ ok: false });
      expect(await linkPartner(ivy.id, 'nope')).toMatchObject({ ok: false });
    });

    it('quickAddFamily into an existing family can use people already there', async () => {
      const { family } = await seedFamily();
      const sky = await addPerson(family.id, { name: 'Sky' });
      const bud = await addPerson(family.id, { name: 'Bud' });
      const wee = await addPerson(family.id, { name: 'Wee' });
      const result = await quickAddFamily({
        familyName: '',
        familyId: family.id,
        grandparents: [],
        grandparentIds: [sky.id],
        children: [{ name: 'Bud', existingId: bud.id, partner: 'New Pal', kids: ['Tot'], kidIds: [wee.id] }],
      });
      expect(result.id).toBe(family.id);
      expect(await db.families.count()).toBe(1);
      const people = await db.people.where('familyId').equals(family.id).toArray();
      const by = (name: string) => people.find((p) => p.name === name)!;
      expect(by('Bud').parentIds).toEqual([sky.id]);
      expect(by('Tot').parentIds).toEqual([bud.id, by('New Pal').id]);
      expect(by('Wee').parentIds).toEqual([bud.id, by('New Pal').id]);
      expect(people.filter((p) => p.name === 'Bud')).toHaveLength(1);
    });

    it('quickAddFamily into a family picks an existing partner, links nothing twice, and refuses a loop', async () => {
      const { family, gran, grandad, max, nia } = await seedFamily();
      const before = await db.partnerships.count();
      await quickAddFamily({ familyName: '', familyId: family.id, grandparents: [], grandparentIds: [gran.id, grandad.id], children: [{ name: '', existingId: max.id, partnerId: nia.id }] });
      expect(await db.partnerships.count()).toBe(before);
      expect((await db.people.get(max.id))!.parentIds).toEqual([gran.id, grandad.id]);
      // Max under his own child Ivy would be a loop.
      const ivy = (await db.people.toArray()).find((p) => p.name === 'Ivy Tester')!;
      await expect(
        quickAddFamily({ familyName: '', familyId: family.id, grandparents: [], grandparentIds: [ivy.id], children: [{ name: '', existingId: gran.id }] }),
      ).rejects.toThrow();
      expect((await db.people.get(gran.id))!.parentIds).toEqual([]);
      await expect(quickAddFamily({ familyName: '', familyId: 'nope', grandparents: ['A'], children: [] })).rejects.toThrow(/isn’t on this phone/);
      await expect(
        quickAddFamily({ familyName: '', familyId: family.id, grandparents: [], grandparentIds: ['nope'], children: [] }),
      ).rejects.toThrow(/isn’t in this family/);
    });
  });

  it('createDemoFamily adds the made-up family with couples, separations and a pet', async () => {
    const family = await createDemoFamily();
    const people = await db.people.where('familyId').equals(family.id).toArray();
    const partnerships = await db.partnerships.where('familyId').equals(family.id).toArray();
    expect(people.length).toBeGreaterThanOrEqual(20);
    expect(partnerships.some((p) => p.status === 'separated')).toBe(true);
    expect(new Set(partnerships.map((p) => p.personIds.join())).size).toBe(partnerships.length);
    const ids = new Set(people.map((p) => p.id));
    expect(people.every((p) => p.parentIds.every((x) => ids.has(x)))).toBe(true);
    expect((await db.extras.where('familyId').equals(family.id).toArray()).map((e) => e.kind)).toEqual(['pet']);
  });
});
