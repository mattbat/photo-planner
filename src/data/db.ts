import Dexie, { type EntityTable } from 'dexie';
import type { Extra, Family, Location, Partnership, Person, Pose, PosePhoto, SettingsRow, Shoot } from './types';

/**
 * IndexedDB schema (REQUIREMENTS.md T4). To change it, add a new
 * `version(n)` with an `upgrade()` migration; never edit an existing version.
 *
 * Only fields that are queried are indexed. Booleans can't be indexed.
 */
export class PhotoPlannerDb extends Dexie {
  families!: EntityTable<Family, 'id'>;
  people!: EntityTable<Person, 'id'>;
  partnerships!: EntityTable<Partnership, 'id'>;
  extras!: EntityTable<Extra, 'id'>;
  shoots!: EntityTable<Shoot, 'id'>;
  poses!: EntityTable<Pose, 'id'>;
  posePhotos!: EntityTable<PosePhoto, 'id'>;
  locations!: EntityTable<Location, 'id'>;
  settings!: EntityTable<SettingsRow, 'key'>;

  constructor(name = 'photo-planner') {
    super(name);
    this.version(1).stores({
      families: 'id, name',
      // *parentIds: a multi-entry index, to find a person's children.
      people: 'id, familyId, *parentIds',
      partnerships: 'id, familyId, *personIds',
      extras: 'id, familyId, shootId',
      shoots: 'id, familyId, date, status',
      poses: 'id, category, name',
      posePhotos: 'id, poseId',
      locations: 'id, name',
      settings: 'key',
    });
  }
}

export const db = new PhotoPlannerDb();

/** Every table, for code that treats them all alike (backup, erase). */
export const ALL_TABLES = [
  db.families,
  db.people,
  db.partnerships,
  db.extras,
  db.shoots,
  db.poses,
  db.posePhotos,
  db.locations,
  db.settings,
] as const;

/** Asks the browser not to evict our data under storage pressure (T4). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
