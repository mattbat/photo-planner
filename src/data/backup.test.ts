import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDb, seedFamily } from '../test/helpers';
import {
  BACKUP_FORMAT,
  backUp,
  backedUpRecently,
  backupFileName,
  backupReminderDue,
  createBackup,
  formatBackupDate,
  lastBackupAt,
  markBackedUp,
  parseBackup,
  REMIND_AFTER_DAYS,
  restoreBackup,
  slug,
  snoozeReminder,
  summarize,
} from './backup';
import { db } from './db';
import { addPose, addPosePhoto, createFamily, createShoot, updateFamily, updateSettings } from './repo';
import type { Pose } from './types';

beforeEach(async () => {
  await clearDb();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as { canShare?: unknown }).canShare;
  delete (navigator as { share?: unknown }).share;
});

async function counts() {
  const entries = await Promise.all(db.tables.map(async (t) => [t.name, await t.count()] as const));
  return Object.fromEntries(entries);
}

const pose = (name: string): Omit<Pose, 'id' | 'createdAt' | 'updatedAt'> => ({
  name,
  category: 'siblings',
  minSize: 2,
  maxSize: 4,
  description: '',
  directions: [],
  tips: [],
  mistakes: [],
  tags: [],
  difficulty: 'easy',
  favorite: false,
  builtIn: false,
});

/** A phone with one family, a shoot, a pose with a photo, and saved settings. */
async function fullPhone() {
  const seeded = await seedFamily();
  const shoot = await createShoot(seeded.family);
  const p = await addPose(pose('Huddle'));
  await addPosePhoto({ poseId: p.id, dataUrl: 'data:image/jpeg;base64,AAAA', width: 10, height: 10 });
  await updateSettings({ timeEstimates: { small: 1, medium: 2, large: 3, setup: 4 } });
  return { ...seeded, shoot, pose: p };
}

describe('createBackup and parseBackup (B1, B4)', () => {
  it('round-trips an empty phone', async () => {
    const backup = await createBackup();
    expect(backup).toMatchObject({ format: BACKUP_FORMAT, version: 1, families: [], shoots: [], settings: [] });
    expect(parseBackup(JSON.stringify(backup))).toEqual({ ok: true, backup });
  });

  it('round-trips every family, shoot, pose, photo and setting', async () => {
    await fullPhone();
    const backup = await createBackup();
    expect(summarize(backup)).toEqual({ familyNames: ['The Testers'], people: 5 - 0, shoots: 1, poses: 1, photos: 1 });
    expect(backup.settings).toHaveLength(1);
    expect(parseBackup(JSON.stringify(backup))).toEqual({ ok: true, backup });
  });

  it('can leave pose photos out (B1)', async () => {
    await fullPhone();
    const backup = await createBackup({ withPhotos: false });
    expect(backup.posePhotos).toEqual([]);
    expect(backup.poses).toHaveLength(1);
  });

  it('backs up a single family with only its own people and shoots (B2)', async () => {
    const a = await fullPhone();
    const b = await createFamily('The Samples');
    await createShoot(b);
    const backup = await createBackup({ familyId: b.id });
    expect(summarize(backup)).toMatchObject({ familyNames: ['The Samples'], people: 0, shoots: 1 });
    expect(backup.settings).toEqual([]);
    expect(backupFileName(backup, b.name)).toMatch(/^photo-planner-the-samples-\d{4}-\d{2}-\d{2}\.json$/);
    expect(backupFileName(backup)).toMatch(/^photo-planner-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(backupFileName(backup, '!!!')).toMatch(/^photo-planner-family-/);
    expect((await createBackup({ familyId: a.family.id })).people).toHaveLength(5);
    expect(slug('  The Carters!  ')).toBe('the-carters');
  });

  it('explains files that are not Photo Planner backups', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, message: expect.stringMatching(/can't be read/) });
    expect(parseBackup('{"hello":1}')).toEqual({ ok: false, message: "This file isn't a Photo Planner backup." });
    expect(parseBackup('[1]')).toEqual({ ok: false, message: "This file isn't a Photo Planner backup." });
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99 }))).toEqual({
      ok: false,
      message: expect.stringMatching(/newer version/),
    });
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, families: [{}] }))).toEqual({
      ok: false,
      message: expect.stringMatching(/damaged/),
    });
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, people: 'nope' }))).toEqual({
      ok: false,
      message: expect.stringMatching(/damaged/),
    });
  });

  it('accepts a backup with missing lists and no date, as from an older layout', () => {
    const parsed = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1 }));
    expect(parsed.ok && parsed.backup).toMatchObject({ exportedAt: '', families: [], posePhotos: [] });
  });

  it('round-trips any family name (property)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 40 }), async (name) => {
        await clearDb();
        await createFamily(name);
        const backup = await createBackup();
        const parsed = parseBackup(JSON.stringify(backup));
        expect(parsed.ok && parsed.backup.families.map((f) => f.name)).toEqual(backup.families.map((f) => f.name));
      }),
      { numRuns: 25 },
    );
  });
});

describe('restoreBackup with the old single pose (PL5)', () => {
  it('turns an old file\u2019s poseId into poseIds on restore, in both modes', async () => {
    await fullPhone();
    const backup = await createBackup();
    const oldShot = { ...backup.shoots[0]!.shots[0]!, poseId: 'starter-1' };
    const old = { ...backup, shoots: [{ ...backup.shoots[0]!, shots: [oldShot, ...backup.shoots[0]!.shots.slice(1)] }] };
    const parsed = parseBackup(JSON.stringify(old));
    expect(parsed.ok).toBe(true);
    for (const mode of ['replace', 'merge'] as const) {
      await clearDb();
      await restoreBackup(old as unknown as typeof backup, mode);
      const shot = (await db.shoots.toArray())[0]!.shots[0]!;
      expect(shot.poseIds).toEqual(['starter-1']);
      expect('poseId' in shot).toBe(false);
    }
  });
});

describe('restoreBackup (B1)', () => {
  it('replace: the phone ends up exactly like the backup', async () => {
    await fullPhone();
    const backup = await createBackup();
    const before = await counts();
    await createFamily('Added later');
    await restoreBackup(backup, 'replace');
    expect(await counts()).toEqual(before);
    expect((await db.families.toArray()).map((f) => f.name)).toEqual(['The Testers']);
  });

  it('replace: restores onto an empty phone', async () => {
    await fullPhone();
    const backup = await createBackup();
    const before = await counts();
    await clearDb();
    const result = await restoreBackup(backup, 'replace');
    expect(await counts()).toEqual(before);
    expect(result.added).toBe(Object.values(before).reduce((a, b) => a + b, 0));
  });

  it('replace: keeps pose photos and settings that the backup does not carry', async () => {
    await fullPhone();
    const without = await createBackup({ withPhotos: false });
    const full = await createBackup({ familyId: 'x' });
    expect(full.settings).toEqual([]);
    await restoreBackup(without, 'replace');
    expect(await db.posePhotos.count()).toBe(1);
    expect(await db.settings.count()).toBe(1);
  });

  it('merge: adds what is missing and keeps the more recently changed copy', async () => {
    const { family } = await fullPhone();
    const backup = await createBackup();
    // This phone changed the family after the backup, and a different family exists only here.
    await new Promise((r) => setTimeout(r, 5));
    await updateFamily(family.id, { name: 'Renamed here' });
    await createFamily('Only here');
    // The backup also holds a record that was deleted here, and an edit that is newer than here.
    const newer = { ...backup, families: backup.families.map((f) => ({ ...f, name: 'Newer in backup', updatedAt: Date.now() + 10_000 })) };
    await db.people.clear();
    const result = await restoreBackup(backup, 'merge');
    expect(result.added).toBeGreaterThan(0);
    expect(result.kept).toBeGreaterThan(0);
    expect(await db.people.count()).toBe(5);
    expect((await db.families.get(family.id))?.name).toBe('Renamed here');
    expect(await db.families.count()).toBe(2);

    const second = await restoreBackup(newer, 'merge');
    expect(second.updated).toBe(1);
    expect((await db.families.get(family.id))?.name).toBe('Newer in backup');
    expect(await db.families.count()).toBe(2);
  });
});

describe('backup reminder (B3)', () => {
  it('is due only when there is data and no recent backup or snooze', () => {
    const now = Date.UTC(2026, 10, 15);
    expect(backupReminderDue(false, now)).toBe(false);
    expect(backupReminderDue(true, now)).toBe(true);
    markBackedUp(now - 5 * 86_400_000);
    expect(backupReminderDue(true, now)).toBe(false);
    expect(backupReminderDue(true, now + (REMIND_AFTER_DAYS + 1) * 86_400_000)).toBe(true);
    snoozeReminder(now + (REMIND_AFTER_DAYS + 1) * 86_400_000);
    expect(backupReminderDue(true, now + (REMIND_AFTER_DAYS + 2) * 86_400_000)).toBe(false);
  });

  it('knows about a backup made today, and formats the date', () => {
    expect(backedUpRecently()).toBe(false);
    expect(formatBackupDate(null)).toBe('Never');
    markBackedUp();
    expect(backedUpRecently()).toBe(true);
    expect(formatBackupDate(lastBackupAt())).toMatch(/\d{4}/);
  });

  it('survives blocked storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(lastBackupAt()).toBeNull();
    expect(() => markBackedUp()).not.toThrow();
    expect(() => snoozeReminder()).not.toThrow();
  });
});

describe('backUp', () => {
  it('shares the file and notes the backup time, but only for a full backup', async () => {
    const share = vi.fn(async () => {});
    Object.assign(navigator, { canShare: () => true, share });
    await createFamily('The Testers');
    expect(await backUp()).toMatch(/Backup ready/);
    expect(lastBackupAt()).not.toBeNull();
    const first = lastBackupAt();
    await new Promise((r) => setTimeout(r, 5));
    const { id } = (await db.families.toArray())[0]!;
    await backUp({ familyId: id, familyName: 'The Testers' });
    expect(lastBackupAt()).toBe(first);
    expect(share).toHaveBeenCalledTimes(2);
  });

  it('says when the share sheet was closed, and when the file was downloaded instead', async () => {
    Object.assign(navigator, {
      canShare: () => true,
      share: async () => {
        throw new DOMException('canceled', 'AbortError');
      },
    });
    expect(await backUp()).toBe('Backup canceled.');
    expect(lastBackupAt()).toBeNull();

    delete (navigator as { canShare?: unknown }).canShare;
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await backUp()).toBe('Backup file downloaded.');
    expect(lastBackupAt()).not.toBeNull();
  });
});
