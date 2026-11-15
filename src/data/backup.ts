import { migrateShoot } from '../domain/shotPoses';
import { db } from './db';
import { shareFile } from './share';
import type { Extra, Family, Location, Partnership, Person, Pose, PosePhoto, SettingsRow, Shoot } from './types';
import {
  isValidExtra,
  isValidFamily,
  isValidLocation,
  isValidPartnership,
  isValidPerson,
  isValidPose,
  isValidPosePhoto,
  isValidSettings,
  isValidShoot,
} from './validate';

/**
 * Backup and restore (REQUIREMENTS.md B1–B4). A backup is a JSON file with
 * every family, shoot, pose and setting (or one family's), which the user saves
 * through the iOS share sheet and can restore later on any phone.
 *
 * Fields added by later versions of the app are optional in the file, so older
 * backups still load; the layout `BACKUP_VERSION` only changes for breaking
 * changes, and an app refuses a file from a newer layout.
 */

export const BACKUP_FORMAT = 'photo-planner-backup';
/** Version of the backup file layout (not the app). */
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  families: Family[];
  people: Person[];
  partnerships: Partnership[];
  extras: Extra[];
  shoots: Shoot[];
  locations: Location[];
  poses: Pose[];
  /** Photos the user added to poses. Left out for a "without photos" backup (B1). */
  posePhotos: PosePhoto[];
  settings: SettingsRow[];
}

export interface BackupOptions {
  /** Back up only this family (B2). */
  familyId?: string;
  /** Include the user's pose photos (default true, B1). */
  withPhotos?: boolean;
}

/** Collects everything, or one family with its people, extras and shoots. */
export async function createBackup({ familyId, withPhotos = true }: BackupOptions = {}): Promise<Backup> {
  const forFamily = familyId !== undefined;
  const [families, people, partnerships, extras, shoots, locations, poses, posePhotos, settings] = await Promise.all([
    forFamily ? db.families.where('id').equals(familyId).toArray() : db.families.toArray(),
    forFamily ? db.people.where('familyId').equals(familyId).toArray() : db.people.toArray(),
    forFamily ? db.partnerships.where('familyId').equals(familyId).toArray() : db.partnerships.toArray(),
    forFamily ? db.extras.where('familyId').equals(familyId).toArray() : db.extras.toArray(),
    forFamily ? db.shoots.where('familyId').equals(familyId).toArray() : db.shoots.toArray(),
    db.locations.toArray(),
    db.poses.toArray(),
    withPhotos ? db.posePhotos.toArray() : Promise.resolve([] as PosePhoto[]),
    forFamily ? Promise.resolve([] as SettingsRow[]) : db.settings.toArray(),
  ]);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    families,
    people,
    partnerships,
    extras,
    shoots,
    locations,
    poses,
    posePhotos,
    settings,
  };
}

/** Lowercase words joined by dashes, for file names. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** e.g. photo-planner-backup-2026-11-03.json, or photo-planner-carter-2026-11-03.json for one family. */
export function backupFileName(backup: Backup, familyName?: string): string {
  const date = backup.exportedAt.slice(0, 10);
  return familyName ? `photo-planner-${slug(familyName) || 'family'}-${date}.json` : `photo-planner-backup-${date}.json`;
}

export type ParseResult = { ok: true; backup: Backup } | { ok: false; message: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Each list in a backup, with the check its records must pass. */
const LISTS = [
  ['families', isValidFamily],
  ['people', isValidPerson],
  ['partnerships', isValidPartnership],
  ['extras', isValidExtra],
  ['shoots', isValidShoot],
  ['locations', isValidLocation],
  ['poses', isValidPose],
  ['posePhotos', isValidPosePhoto],
  ['settings', isValidSettings],
] as const;

const DAMAGED = 'This backup is damaged and can’t be restored.';

/** Reads a backup file and checks it before anything is changed (B4). */
export function parseBackup(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: "This file isn't a Photo Planner backup (it can't be read)." };
  }
  if (!isObject(data) || data.format !== BACKUP_FORMAT) {
    return { ok: false, message: "This file isn't a Photo Planner backup." };
  }
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
    return { ok: false, message: 'This backup was made by a newer version of Photo Planner. Update the app, then try again.' };
  }
  // Every list is optional, so backups from before a table existed still load.
  const lists: Record<string, unknown[]> = {};
  for (const [name, check] of LISTS) {
    const list = data[name] ?? [];
    if (!Array.isArray(list) || !list.every(check)) return { ok: false, message: DAMAGED };
    lists[name] = list;
  }
  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: data.version,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
      ...lists,
    } as unknown as Backup,
  };
}

export interface BackupSummary {
  familyNames: string[];
  people: number;
  shoots: number;
  poses: number;
  photos: number;
}

export function summarize(backup: Backup): BackupSummary {
  return {
    familyNames: backup.families.map((f) => f.name),
    people: backup.people.length,
    shoots: backup.shoots.length,
    poses: backup.poses.length,
    photos: backup.posePhotos.length,
  };
}

export type RestoreMode = 'replace' | 'merge';

export interface RestoreResult {
  added: number;
  updated: number;
  kept: number;
}

/**
 * Restores a backup (B1).
 * - replace: everything on this phone is replaced by the backup. Settings and
 *   pose photos are kept when the backup has none (a one-family backup or a
 *   "without photos" backup leaves them alone).
 * - merge: records missing here are added; for records in both, the more
 *   recently changed copy wins. Nothing on this phone is deleted.
 */
export async function restoreBackup(file: Backup, mode: RestoreMode): Promise<RestoreResult> {
  // Older files have one `poseId` on a shot; it becomes `poseIds` (PL5).
  const backup: Backup = { ...file, shoots: file.shoots.map(migrateShoot) };
  const result: RestoreResult = { added: 0, updated: 0, kept: 0 };
  const tables = [db.families, db.people, db.partnerships, db.extras, db.shoots, db.locations, db.poses, db.posePhotos, db.settings];
  await db.transaction('rw', tables, async () => {
    if (mode === 'replace') {
      // Like next5: everything not in the backup is deleted, which is why the
      // Settings screen names the families that would be lost.
      await Promise.all([
        db.families.clear(),
        db.people.clear(),
        db.partnerships.clear(),
        db.extras.clear(),
        db.shoots.clear(),
        db.locations.clear(),
        db.poses.clear(),
        backup.posePhotos.length > 0 ? db.posePhotos.clear() : Promise.resolve(),
        backup.settings.length > 0 ? db.settings.clear() : Promise.resolve(),
      ]);
      await db.families.bulkPut(backup.families);
      await db.people.bulkPut(backup.people);
      await db.partnerships.bulkPut(backup.partnerships);
      await db.extras.bulkPut(backup.extras);
      await db.shoots.bulkPut(backup.shoots);
      await db.locations.bulkPut(backup.locations);
      await db.poses.bulkPut(backup.poses);
      await db.posePhotos.bulkPut(backup.posePhotos);
      await db.settings.bulkPut(backup.settings);
      result.added =
        backup.families.length +
        backup.people.length +
        backup.partnerships.length +
        backup.extras.length +
        backup.shoots.length +
        backup.locations.length +
        backup.poses.length +
        backup.posePhotos.length +
        backup.settings.length;
      return;
    }
    const merge = async <T extends { updatedAt: number }>(
      items: T[],
      get: (item: T) => Promise<T | undefined>,
      put: (item: T) => Promise<unknown>,
    ) => {
      for (const item of items) {
        const existing = await get(item);
        if (!existing) {
          await put(item);
          result.added++;
        } else if ((item.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
          await put(item);
          result.updated++;
        } else {
          result.kept++;
        }
      }
    };
    await merge(backup.families, (r) => db.families.get(r.id), (r) => db.families.put(r));
    await merge(backup.people, (r) => db.people.get(r.id), (r) => db.people.put(r));
    await merge(backup.partnerships, (r) => db.partnerships.get(r.id), (r) => db.partnerships.put(r));
    await merge(backup.extras, (r) => db.extras.get(r.id), (r) => db.extras.put(r));
    await merge(backup.shoots, (r) => db.shoots.get(r.id), (r) => db.shoots.put(r));
    await merge(backup.locations, (r) => db.locations.get(r.id), (r) => db.locations.put(r));
    await merge(backup.poses, (r) => db.poses.get(r.id), (r) => db.poses.put(r));
    await merge(backup.posePhotos, (r) => db.posePhotos.get(r.id), (r) => db.posePhotos.put(r));
    await merge(backup.settings, (r) => db.settings.get(r.key), (r) => db.settings.put(r));
  });
  return result;
}

// Backup reminder (B3). Kept in localStorage: it only matters on this phone,
// and if site data is cleared the reminder rightly shows again.

const LAST_BACKUP_KEY = 'photo-planner.lastBackupAt';
const SNOOZE_KEY = 'photo-planner.backupReminderSnoozedUntil';
const DAY = 24 * 60 * 60 * 1000;
export const REMIND_AFTER_DAYS = 30;
export const SNOOZE_DAYS = 7;

function read(key: string): number | null {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function write(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Private browsing or storage full: the reminder just shows again.
  }
}

export function lastBackupAt(): number | null {
  return read(LAST_BACKUP_KEY);
}

/** "Never", or a date like "Nov 3, 2026". */
export function formatBackupDate(time: number | null): string {
  if (time === null) return 'Never';
  return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** True when a backup was made in the last day, so there's no need to offer another. */
export function backedUpRecently(now = Date.now()): boolean {
  const last = lastBackupAt();
  return last !== null && now - last < DAY;
}

export function markBackedUp(now = Date.now()): void {
  write(LAST_BACKUP_KEY, now);
}

export function snoozeReminder(now = Date.now()): void {
  write(SNOOZE_KEY, now + SNOOZE_DAYS * DAY);
}

/** True when there's data worth protecting and no recent backup (or snooze). */
export function backupReminderDue(hasData: boolean, now = Date.now()): boolean {
  if (!hasData) return false;
  const snoozedUntil = read(SNOOZE_KEY);
  if (snoozedUntil !== null && now < snoozedUntil) return false;
  const last = lastBackupAt();
  return last === null || now - last > REMIND_AFTER_DAYS * DAY;
}

/** Backs up everything, or one family, through the share sheet (B1, B2). */
export async function backUp(options: BackupOptions & { familyName?: string } = {}): Promise<string> {
  const backup = await createBackup(options);
  const outcome = await shareFile(backupFileName(backup, options.familyName), JSON.stringify(backup, null, 1));
  if (outcome === 'canceled') return 'Backup canceled.';
  if (options.familyId === undefined) markBackedUp();
  return outcome === 'shared'
    ? 'Backup ready. Make sure you saved it somewhere safe, like Files or iCloud Drive.'
    : 'Backup file downloaded.';
}
