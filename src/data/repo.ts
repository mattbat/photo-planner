import { ALL_TABLES, db } from './db';
import { defaultSettings } from './defaults';
import type {
  AppSettings,
  Extra,
  Family,
  Location,
  Partnership,
  Person,
  Pose,
  PosePhoto,
  Shoot,
} from './types';

/**
 * The only module that writes storage (CLAUDE.md). Screens call these
 * functions, so the storage backend can be swapped or mirrored later. Reads
 * for display go through `useLiveQuery` in components and hooks.
 *
 * Quick edits use the `update*` functions (partial update), not a whole-record
 * save, so fast taps can't overwrite each other.
 */

/**
 * A random v4 UUID. `crypto.randomUUID` only exists on https pages, so fall
 * back to `getRandomValues` (available everywhere) for local http testing.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function stamp<T extends object>(fields: T): T & { id: string; createdAt: number; updatedAt: number } {
  const now = Date.now();
  return { id: newId(), createdAt: now, updatedAt: now, ...fields };
}

/** Today as yyyy-mm-dd in the phone's time zone. */
export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type Changes<T> = Partial<Omit<T, 'id' | 'createdAt'>>;

// Families

export async function createFamily(name: string): Promise<Family> {
  const family: Family = stamp({ name: name.trim(), archived: false });
  await db.families.add(family);
  return family;
}

export async function updateFamily(id: string, changes: Changes<Family>): Promise<void> {
  await db.families.update(id, { ...changes, updatedAt: Date.now() });
}

/** Archives a family (F1): it leaves the list but keeps its people and shoots. */
export async function setFamilyArchived(id: string, archived: boolean): Promise<void> {
  await updateFamily(id, { archived });
}

/** Deletes a family with its people, partnerships, extras and shoots. */
export async function deleteFamily(id: string): Promise<void> {
  await db.transaction('rw', [db.families, db.people, db.partnerships, db.extras, db.shoots], async () => {
    await db.people.where('familyId').equals(id).delete();
    await db.partnerships.where('familyId').equals(id).delete();
    await db.extras.where('familyId').equals(id).delete();
    await db.shoots.where('familyId').equals(id).delete();
    await db.families.delete(id);
  });
}

// People and relationships

export async function addPerson(
  familyId: string,
  fields: Pick<Person, 'name'> & Changes<Omit<Person, 'familyId' | 'name'>>,
): Promise<Person> {
  const person: Person = stamp({ parentIds: [], ...fields, familyId, name: fields.name.trim() });
  await db.people.add(person);
  return person;
}

export async function updatePerson(id: string, changes: Changes<Omit<Person, 'familyId'>>): Promise<void> {
  await db.people.update(id, { ...changes, updatedAt: Date.now() });
}

/**
 * Deletes a person and everything that pointed at them: partnerships, their
 * children's parent links, and their place in shoots (attendance and shots).
 */
export async function deletePerson(id: string): Promise<void> {
  await db.transaction('rw', [db.people, db.partnerships, db.shoots], async () => {
    const now = Date.now();
    await db.partnerships.where('personIds').equals(id).delete();
    await db.people
      .where('parentIds')
      .equals(id)
      .modify((child: Person) => {
        child.parentIds = child.parentIds.filter((p) => p !== id);
        child.updatedAt = now;
      });
    await db.shoots.toCollection().modify((shoot: Shoot) => {
      if (!shoot.attendingIds.includes(id) && !shoot.shots.some((s) => s.personIds.includes(id))) return;
      shoot.attendingIds = shoot.attendingIds.filter((p) => p !== id);
      shoot.shots = shoot.shots.map((s) => ({ ...s, personIds: s.personIds.filter((p) => p !== id) }));
      delete shoot.presence[id];
      shoot.updatedAt = now;
    });
    await db.people.delete(id);
  });
}

export async function addPartnership(
  familyId: string,
  personIds: [string, string],
  status: Partnership['status'] = 'together',
): Promise<Partnership> {
  const partnership: Partnership = stamp({ familyId, personIds, status });
  await db.partnerships.add(partnership);
  return partnership;
}

export async function updatePartnership(id: string, changes: Pick<Partial<Partnership>, 'status'>): Promise<void> {
  await db.partnerships.update(id, { ...changes, updatedAt: Date.now() });
}

export async function deletePartnership(id: string): Promise<void> {
  await db.partnerships.delete(id);
}

// Extra people (guests and pets)

export async function addExtra(
  familyId: string,
  fields: Pick<Extra, 'name' | 'kind'> & Partial<Pick<Extra, 'shootId' | 'emoji' | 'photo' | 'notes'>>,
): Promise<Extra> {
  const extra: Extra = stamp({ ...fields, familyId, name: fields.name.trim() });
  await db.extras.add(extra);
  return extra;
}

export async function updateExtra(id: string, changes: Changes<Omit<Extra, 'familyId'>>): Promise<void> {
  await db.extras.update(id, { ...changes, updatedAt: Date.now() });
}

export async function deleteExtra(id: string): Promise<void> {
  await db.extras.delete(id);
}

// Shoots

/** Creates a planned shoot with the starting templates and order options from Settings. */
export async function createShoot(
  family: Pick<Family, 'id'>,
  fields: Partial<Pick<Shoot, 'title' | 'date' | 'startTime' | 'locationId'>> = {},
): Promise<Shoot> {
  const settings = await getSettings();
  const people = await db.people.where('familyId').equals(family.id).toArray();
  const extras = await db.extras.where('familyId').equals(family.id).filter((e) => e.shootId === undefined).toArray();
  const shoot: Shoot = stamp({
    familyId: family.id,
    date: today(),
    ...fields,
    status: 'planned' as const,
    // Everyone attends, except people "not usually at shoots" (F5).
    attendingIds: [...people.filter((p) => !p.usuallyAbsent).map((p) => p.id), ...extras.map((e) => e.id)],
    templates: settings.defaultTemplates,
    shots: [],
    order: [],
    manualOrder: false,
    orderOptions: settings.defaultOrderOptions,
    removedKeys: [],
    presence: {},
    events: [],
  });
  await db.shoots.add(shoot);
  return shoot;
}

export async function updateShoot(id: string, changes: Changes<Shoot>): Promise<void> {
  await db.shoots.update(id, { ...changes, updatedAt: Date.now() });
}

export async function deleteShoot(id: string): Promise<void> {
  await db.transaction('rw', [db.shoots, db.extras], async () => {
    await db.extras.where('shootId').equals(id).delete();
    await db.shoots.delete(id);
  });
}

// Locations

export async function addLocation(fields: Omit<Location, 'id' | 'createdAt' | 'updatedAt'>): Promise<Location> {
  const location: Location = stamp({ ...fields, name: fields.name.trim() });
  await db.locations.add(location);
  return location;
}

export async function updateLocation(id: string, changes: Changes<Location>): Promise<void> {
  await db.locations.update(id, { ...changes, updatedAt: Date.now() });
}

export async function deleteLocation(id: string): Promise<void> {
  await db.transaction('rw', [db.locations, db.shoots], async () => {
    await db.shoots
      .filter((s) => s.locationId === id)
      .modify((s: Shoot) => {
        delete s.locationId;
        s.updatedAt = Date.now();
      });
    await db.locations.delete(id);
  });
}

// Poses

export async function addPose(fields: Omit<Pose, 'id' | 'createdAt' | 'updatedAt'>): Promise<Pose> {
  const pose: Pose = stamp({ ...fields, name: fields.name.trim() });
  await db.poses.add(pose);
  return pose;
}

export async function updatePose(id: string, changes: Changes<Pose>): Promise<void> {
  await db.poses.update(id, { ...changes, updatedAt: Date.now() });
}

/** Deletes a pose and its photos, and detaches it from shots that used it. */
export async function deletePose(id: string): Promise<void> {
  await db.transaction('rw', [db.poses, db.posePhotos, db.shoots], async () => {
    await db.posePhotos.where('poseId').equals(id).delete();
    await db.shoots.toCollection().modify((shoot: Shoot) => {
      if (!shoot.shots.some((s) => s.poseId === id)) return;
      shoot.shots = shoot.shots.map((s) => {
        if (s.poseId !== id) return s;
        const rest = { ...s };
        delete rest.poseId;
        return rest;
      });
      shoot.updatedAt = Date.now();
    });
    await db.poses.delete(id);
  });
}

export async function addPosePhoto(fields: Pick<PosePhoto, 'poseId' | 'dataUrl' | 'width' | 'height'>): Promise<PosePhoto> {
  const photo: PosePhoto = stamp(fields);
  await db.posePhotos.add(photo);
  return photo;
}

export async function deletePosePhoto(id: string): Promise<void> {
  await db.posePhotos.delete(id);
}

// Settings

/** The settings, with defaults filled in for anything not saved yet. */
export async function getSettings(): Promise<AppSettings> {
  const row = await db.settings.get('app');
  const defaults = defaultSettings();
  return { ...defaults, ...row?.value };
}

export async function updateSettings(changes: Partial<AppSettings>): Promise<AppSettings> {
  const next = { ...(await getSettings()), ...changes };
  await db.settings.put({ key: 'app', value: next, updatedAt: Date.now() });
  return next;
}

// Erasing

/**
 * Erases every record and everything noted in localStorage (the beta "Erase"
 * button, REL5). Settings go too, so a new shoot starts from the defaults.
 */
export async function eraseEverything(storage: Storage = localStorage): Promise<void> {
  await db.transaction('rw', [...ALL_TABLES], async () => {
    await Promise.all(ALL_TABLES.map((table) => table.clear()));
  });
  try {
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k) => k?.startsWith('photo-planner.'));
    for (const key of keys) storage.removeItem(key!);
  } catch {
    // Storage unavailable: nothing saved there to erase.
  }
}

