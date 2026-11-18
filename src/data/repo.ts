import { currentShot, addShot, markShot, makeCurrent, moveShotsUp, pickNext, setPresence, undo as undoDay, type DayState } from '../domain/shootDay';
import { newProblems } from '../domain/links';
import { migrateShoot, poseIdsOf } from '../domain/shotPoses';
import { planShoot, suggestDayOrder, suggestOrder, type PlanInput, type SoloScope } from '../domain/shotView';
import { starterPoses } from '../poses/starterPoses';
import { demoFamily } from '../tree/fixtures';
import { ALL_TABLES, db } from './db';
import { defaultSettings, withAllTemplates } from './defaults';
import { lockedAway, receivedHandoff, roleOf, type ShootHandoff } from './handoff';
import type {
  AppSettings,
  Extra,
  Family,
  Location,
  Partnership,
  Person,
  Pose,
  PosePhoto,
  Presence,
  Priority,
  Shoot,
  Shot,
  TemplateId,
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

let lastStamp = 0;

/**
 * New records get a creation time that is strictly later than the previous
 * one, so "oldest first" is the order they were added in (it fixes the order
 * of people in the tree, and so branch colors, whatever their random ids).
 */
function stamp<T extends object>(fields: T): T & { id: string; createdAt: number; updatedAt: number } {
  const now = tick();
  return { id: newId(), createdAt: now, updatedAt: now, ...fields };
}

/**
 * The time for `updatedAt`: never earlier than (or equal to) any stamp this
 * phone has already given out. Creation stamps can run a few ms ahead of the
 * clock, so a plain Date.now() edit right after could look older than the
 * record it changes, and a backup merge would keep the wrong copy.
 */
function tick(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
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
  await db.families.update(id, { ...changes, updatedAt: tick() });
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

/** Adds a child (a kid) under one or two parents. */
export async function addChild(familyId: string, name: string, parentIds: string[]): Promise<Person> {
  return addPerson(familyId, { name, parentIds: parentIds.slice(0, 2), grown: false, ageGroup: 'child' });
}

export async function updatePerson(id: string, changes: Changes<Omit<Person, 'familyId'>>): Promise<void> {
  await db.people.update(id, { ...changes, updatedAt: tick() });
}

/**
 * Deletes a person and everything that pointed at them: partnerships, their
 * children's parent links, and their place in shoots (attendance and shots).
 */
export async function deletePerson(id: string): Promise<void> {
  await db.transaction('rw', [db.people, db.partnerships, db.shoots], async () => {
    const now = tick();
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
      if (shoot.priorities) delete shoot.priorities[id];
      if (shoot.cameraPersonId === id) delete shoot.cameraPersonId;
      if (shoot.backupCameraPersonId === id) delete shoot.backupCameraPersonId;
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
  await db.partnerships.update(id, { ...changes, updatedAt: tick() });
}

export async function deletePartnership(id: string): Promise<void> {
  await db.partnerships.delete(id);
}

/** Adds a partnership unless these two people already have one, in which case it is updated. */
export async function ensurePartnership(
  familyId: string,
  personIds: [string, string],
  status: Partnership['status'] = 'together',
): Promise<Partnership> {
  const [a, b] = personIds;
  const existing = (await db.partnerships.where('personIds').equals(a).toArray()).find(
    (p) => p.personIds.includes(b) && p.familyId === familyId,
  );
  if (existing) {
    if (existing.status !== status) await updatePartnership(existing.id, { status });
    return { ...existing, status };
  }
  return addPartnership(familyId, personIds, status);
}

// Linking people who are already in the family (F9)

export type LinkResult = { ok: true } | { ok: false; message: string };

const refuse = (problems: string[]): LinkResult => ({ ok: false, message: problems[0] ?? 'That link isn’t possible.' });

/** Everyone in a family, read in the caller's transaction. */
async function familyParts(familyId: string) {
  return {
    people: await db.people.where('familyId').equals(familyId).toArray(),
    partnerships: await db.partnerships.where('familyId').equals(familyId).toArray(),
  };
}

/**
 * Makes `parentId` a parent of `childId`, both already in the family. Refused,
 * with the reason in plain words, if it would give someone three parents or
 * make a loop (validateFamily); nothing is written then.
 */
export function linkParent(childId: string, parentId: string): Promise<LinkResult> {
  return linkChild(parentId, childId);
}

/**
 * Makes `childId` a child of `parentId` (and of `withParentId`, when adding a
 * child to a couple), both already in the family.
 */
export async function linkChild(parentId: string, childId: string, withParentId?: string): Promise<LinkResult> {
  return db.transaction('rw', [db.people, db.partnerships], async () => {
    const [parent, child] = await Promise.all([db.people.get(parentId), db.people.get(childId)]);
    if (!parent || !child || parent.familyId !== child.familyId) return { ok: false, message: 'That person isn’t in this family.' } as LinkResult;
    if (parentId === childId) return { ok: false, message: `${parent.name} can’t be their own parent.` } as LinkResult;
    const parentIds = [...new Set([...child.parentIds, parentId, ...(withParentId ? [withParentId] : [])])];
    if (parentIds.length > 2) return { ok: false, message: `${child.name} would have more than two parents.` } as LinkResult;
    if (parentIds.length === child.parentIds.length) return { ok: true } as LinkResult;
    const before = await familyParts(parent.familyId);
    const after = { ...before, people: before.people.map((p) => (p.id === childId ? { ...p, parentIds } : p)) };
    const problems = newProblems(before, after);
    if (problems.length) return refuse(problems);
    await db.people.update(childId, { parentIds, updatedAt: tick() });
    return { ok: true } as LinkResult;
  });
}

/** Makes two people already in the family partners, unless that would break the tree. */
export async function linkPartner(aId: string, bId: string, status: Partnership['status'] = 'together'): Promise<LinkResult> {
  return db.transaction('rw', [db.people, db.partnerships], async () => {
    const [a, b] = await Promise.all([db.people.get(aId), db.people.get(bId)]);
    if (!a || !b || a.familyId !== b.familyId) return { ok: false, message: 'That person isn’t in this family.' } as LinkResult;
    if (aId === bId) return { ok: false, message: `${a.name} can’t be their own partner.` } as LinkResult;
    const before = await familyParts(a.familyId);
    const fake = { id: 'new', familyId: a.familyId, personIds: [aId, bId] as [string, string], status, createdAt: 0, updatedAt: 0 };
    const exists = before.partnerships.some((pt) => pt.personIds.includes(aId) && pt.personIds.includes(bId));
    const problems = exists ? [] : newProblems(before, { ...before, partnerships: [...before.partnerships, fake] });
    if (problems.length) return refuse(problems);
    await ensurePartnership(a.familyId, [aId, bId], status);
    return { ok: true } as LinkResult;
  });
}

/** A person to create in `quickAddFamily` / the demo: names only, the rest optional. */
export interface QuickAddChild {
  /** The name of a new child. Ignored when `existingId` is set. */
  name: string;
  /** An existing person in the family, as the child (F9). */
  existingId?: string;
  /** An existing person as the partner, instead of `partner`. */
  partnerId?: string;
  /** Existing people as kids, as well as the new names in `kids`. */
  kidIds?: string[];
  /** A grown child who is still single and childless (the default is true). */
  grown?: boolean;
  partner?: string;
  kids?: string[];
}

export interface QuickAddInput {
  familyName: string;
  /** Add to this family instead of making a new one (F9). */
  familyId?: string;
  /** One or two names; two are made partners. */
  grandparents: string[];
  /** Existing people as the top couple, in place of or as well as `grandparents` (at most two in all). */
  grandparentIds?: string[];
  children: QuickAddChild[];
}

const clean = (names: string[] | undefined): string[] => (names ?? []).map((n) => n.trim()).filter(Boolean);

/**
 * Creates a whole family in one transaction (F2): the top couple (or single
 * person), their children, each child's partner and kids. Blank names are
 * skipped. Returns the new family.
 */
export async function quickAddFamily(input: QuickAddInput): Promise<Family> {
  const existingFamily = input.familyId ? await db.families.get(input.familyId) : undefined;
  if (input.familyId && !existingFamily) throw new Error('That family isn’t on this phone any more.');
  const family: Family = existingFamily ?? stamp({ name: input.familyName.trim() || 'New family', archived: false });
  const before = existingFamily ? await familyParts(family.id) : { people: [] as Person[], partnerships: [] as Partnership[] };
  const people: Person[] = [];
  const partnerships: Partnership[] = [];
  /** Existing people who gain parents or a partner. */
  const changed = new Map<string, Person>();
  const known = new Map(before.people.map((p) => [p.id, p]));
  const person = (name: string, fields: Partial<Person> = {}): Person => {
    const p: Person = stamp({ familyId: family.id, name, parentIds: [], ...fields });
    people.push(p);
    known.set(p.id, p);
    return p;
  };
  const existing = (id: string): Person => {
    const p = changed.get(id) ?? known.get(id);
    if (!p || p.familyId !== family.id) throw new Error('That person isn’t in this family.');
    return p;
  };
  const withParents = (id: string, parentIds: string[]) => {
    const p = existing(id);
    const next = { ...p, parentIds: [...new Set([...p.parentIds, ...parentIds])], updatedAt: tick() };
    changed.set(id, next);
    known.set(id, next);
    return next;
  };
  const couple = (a: Person, b: Person) => {
    if (a.id === b.id || partnerships.some((x) => x.personIds.includes(a.id) && x.personIds.includes(b.id))) return;
    if (before.partnerships.some((x) => x.personIds.includes(a.id) && x.personIds.includes(b.id))) return;
    partnerships.push(stamp({ familyId: family.id, personIds: [a.id, b.id] as [string, string], status: 'together' as const }));
  };

  const tops = [...new Set(input.grandparentIds ?? [])].map(existing);
  for (const name of clean(input.grandparents)) if (tops.length < 2) tops.push(person(name, { grown: true }));
  if (tops.length === 2) couple(tops[0]!, tops[1]!);
  const topIds = tops.map((t) => t.id);
  for (const child of input.children) {
    const name = child.name.trim();
    if (!child.existingId && !name) continue;
    const partnerName = child.partnerId ? undefined : child.partner?.trim();
    const kids = clean(child.kids);
    const kidIds = child.kidIds ?? [];
    const grown = child.grown ?? true;
    const hasPartner = !!(child.partnerId || partnerName);
    const c = child.existingId
      ? withParents(child.existingId, topIds)
      : person(name, { parentIds: topIds, grown: grown || hasPartner || kids.length > 0 || kidIds.length > 0 });
    const partner = child.partnerId ? existing(child.partnerId) : partnerName ? person(partnerName, { grown: true }) : undefined;
    if (partner) couple(c, partner);
    const kidParents = partner ? [c.id, partner.id] : [c.id];
    for (const kid of kids) person(kid, { parentIds: kidParents, grown: false, ageGroup: 'child' });
    for (const id of kidIds) withParents(id, kidParents);
  }
  if (existingFamily) {
    const after = {
      people: [...before.people.map((p) => changed.get(p.id) ?? p), ...people],
      partnerships: [...before.partnerships, ...partnerships],
    };
    const problems = newProblems(before, after);
    if (problems.length) throw new Error(problems[0]);
  }
  await db.transaction('rw', [db.families, db.people, db.partnerships], async () => {
    if (!existingFamily) await db.families.add(family);
    await db.people.bulkAdd(people);
    for (const p of changed.values()) await db.people.update(p.id, { parentIds: p.parentIds, updatedAt: p.updatedAt });
    await db.partnerships.bulkAdd(partnerships);
  });
  return family;
}

/**
 * Adds the made-up demo family (about 20 people over four generations, with
 * a pet), so a new user can see the tree straight away.
 */
export async function createDemoFamily(): Promise<Family> {
  const family: Family = stamp({ name: 'The Pike–Vega family (demo)', archived: false });
  const ids = new Map(demoFamily.map((t) => [t.id, newId()]));
  const people: Person[] = demoFamily.map((t) => {
    const p: Person = stamp({
      id: ids.get(t.id)!,
      familyId: family.id,
      name: t.name,
      parentIds: t.parentIds.map((id) => ids.get(id)!),
      grown: t.grown,
    });
    if (t.sex) p.sex = t.sex;
    if (!t.grown) p.ageGroup = 'child';
    return p;
  });
  const partnerships: Partnership[] = [];
  const seen = new Set<string>();
  for (const t of demoFamily) {
    const pairs = [
      ...t.partnerIds.map((q) => [q, 'together'] as const),
      ...(t.separatedPartnerIds ?? []).map((q) => [q, 'separated'] as const),
    ];
    for (const [q, status] of pairs) {
      const key = [t.id, q].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      partnerships.push(stamp({ familyId: family.id, personIds: [ids.get(t.id)!, ids.get(q)!] as [string, string], status }));
    }
  }
  const dog: Extra = stamp({ familyId: family.id, name: 'Rex', kind: 'pet' as const, emoji: '🐶' });
  await db.transaction('rw', [db.families, db.people, db.partnerships, db.extras], async () => {
    await db.families.add(family);
    await db.people.bulkAdd(people);
    await db.partnerships.bulkAdd(partnerships);
    await db.extras.add(dog);
  });
  return family;
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
  await db.extras.update(id, { ...changes, updatedAt: tick() });
}

export async function deleteExtra(id: string): Promise<void> {
  await db.extras.delete(id);
}

// Shoots

/** What `createShoot` takes: the optional fields of a new shoot. */
export type NewShoot = Partial<Pick<Shoot, 'title' | 'date' | 'startTime' | 'locationId' | 'attendingIds'>>;

/**
 * Creates a planned shoot with the starting templates and order options from
 * Settings, and builds its shot list (E1). Everyone attends unless the
 * caller says who does, except people "not usually at shoots" (F5).
 */
export async function createShoot(family: Pick<Family, 'id'>, fields: NewShoot = {}): Promise<Shoot> {
  const settings = await getSettings();
  const people = await db.people.where('familyId').equals(family.id).toArray();
  const extras = await db.extras.where('familyId').equals(family.id).filter((e) => e.shootId === undefined).toArray();
  const shoot: Shoot = stamp({
    familyId: family.id,
    date: today(),
    ...fields,
    status: 'planned' as const,
    attendingIds: fields.attendingIds ?? [...people.filter((p) => !p.usuallyAbsent).map((p) => p.id), ...extras.map((e) => e.id)],
    templates: withAllTemplates(settings.defaultTemplates),
    shots: [],
    order: [],
    manualOrder: false,
    orderOptions: settings.defaultOrderOptions,
    removedKeys: [],
    presence: {},
    events: [],
  });
  await db.shoots.add(shoot);
  await regenerateShoot(shoot.id);
  return (await db.shoots.get(shoot.id)) ?? shoot;
}

export async function updateShoot(id: string, changes: Changes<Shoot>): Promise<void> {
  await db.transaction('rw', db.shoots, () => db.shoots.update(id, { ...changes, updatedAt: tick() }));
}

const SHOOT_TABLES = () => [db.shoots, db.people, db.partnerships, db.extras, db.families] as const;

/** Everything the planner needs for one shoot, read in the caller's transaction. */
async function planInput(shoot: Shoot): Promise<PlanInput> {
  const family = await db.families.get(shoot.familyId);
  return {
    people: await db.people.where('familyId').equals(shoot.familyId).toArray(),
    partnerships: await db.partnerships.where('familyId').equals(shoot.familyId).toArray(),
    extras: await db.extras.where('familyId').equals(shoot.familyId).filter((e) => e.shootId === undefined || e.shootId === shoot.id).toArray(),
    shoot,
    ...(family ? { familyName: family.name } : {}),
  };
}

/**
 * Changes a shoot and rebuilds its shot list in one transaction (E6): the
 * edit is applied first, then the shots are generated again with the
 * photographer's edits put back. Nothing is written if nothing changed.
 */
async function editShoot(id: string, edit: (shoot: Shoot) => void, { day = false } = {}): Promise<void> {
  await db.transaction('rw', [...SHOOT_TABLES()], async () => {
    const shoot = await db.shoots.get(id);
    if (!shoot) return;
    // A live shoot that is on the other phone is locked: no Done, Undo or presence changes here (SH5).
    if (day && lockedAway(shoot)) return;
    const before = JSON.stringify(shoot);
    edit(shoot);
    const plan = planShoot(await planInput(shoot));
    shoot.shots = plan.shots;
    shoot.order = plan.order;
    if (JSON.stringify(shoot) !== before) {
      shoot.updatedAt = tick();
      await db.shoots.put(shoot);
    }
  });
}

/** Builds the shot list again from the family as it is now (after people, partnerships or extras changed). */
export function regenerateShoot(id: string): Promise<void> {
  return editShoot(id, () => undefined);
}

export function setTemplateEnabled(id: string, templateId: TemplateId, enabled: boolean): Promise<void> {
  return editShoot(id, (shoot) => {
    shoot.templates = withAllTemplates(shoot.templates).map((t) => (t.id === templateId ? { ...t, enabled } : t));
  });
}

/** The solo-portraits scope picker (§6.1): none, or one of the three solo templates. */
export function setSoloScope(id: string, scope: SoloScope): Promise<void> {
  const on: TemplateId | undefined = scope === 'off' ? undefined : (`solo${scope[0]!.toUpperCase()}${scope.slice(1)}` as TemplateId);
  return editShoot(id, (shoot) => {
    shoot.templates = withAllTemplates(shoot.templates).map((t) => (t.id.startsWith('solo') ? { ...t, enabled: t.id === on } : t));
  });
}

/** Ticks or unticks a person or extra as attending (E3). */
export function setAttending(id: string, personId: string, attending: boolean): Promise<void> {
  return editShoot(id, (shoot) => {
    const rest = shoot.attendingIds.filter((x) => x !== personId);
    shoot.attendingIds = attending ? [...rest, personId] : rest;
  });
}

/** Adds a shot of your own (E4): people and extras by id. On a live shoot it is logged so Undo can take it back (D6). */
export async function addCustomShot(id: string, fields: { name: string; personIds: string[] }): Promise<string> {
  const shotId = `custom:${newId()}`;
  await editShoot(id, (shoot) => {
    const shot: Shot = {
      id: shotId,
      name: fields.name.trim() || 'Custom shot',
      nameEdited: false,
      personIds: fields.personIds,
      source: 'custom',
      reasons: [],
      mustHave: false,
      notes: '',
      status: 'todo',
    };
    if (shoot.status === 'live') return applyDay(shoot, addShot(shoot, shot, Date.now()));
    shoot.shots = [...shoot.shots, shot];
    shoot.order = [...shoot.order, shotId];
  }, { day: true });
  return shotId;
}

// Shoot day (§8). Every tap is one atomic edit, so it is saved at once (D10).

/** Copies a day state back onto the shoot (a missing current shot means none). */
function applyDay(shoot: Shoot, next: DayState): void {
  shoot.shots = next.shots;
  shoot.order = next.order;
  shoot.presence = next.presence;
  shoot.events = next.events;
  if (next.currentShotId === undefined) delete shoot.currentShotId;
  else shoot.currentShotId = next.currentShotId;
}

/**
 * Start shoot (D5): live, with the clock started. Everyone attending starts
 * as here (or, with "Treat everyone as here" off, as expected: shots that
 * need them wait until they arrive). Pets and guests are always here.
 */
export async function startShoot(id: string): Promise<void> {
  const settings = await getSettings();
  const treatAll = settings.treatEveryoneAsHere !== false;
  const before = await db.shoots.get(id);
  // SH5: a shoot shared to the other phone can be edited and shared again, but only that phone starts it.
  if (!before || before.handoff?.away) return;
  const extras = await db.extras.where('familyId').equals(before.familyId).toArray();
  const pets = new Set(extras.map((e) => e.id));
  await editShoot(id, (shoot) => {
    const presence: Shoot['presence'] = {};
    for (const pid of shoot.attendingIds) presence[pid] = treatAll || pets.has(pid) ? 'here' : 'expected';
    shoot.presence = presence;
    shoot.status = 'live';
    shoot.startedAt = Date.now();
    delete shoot.finishedAt;
    shoot.events = [];
    delete shoot.currentShotId;
    const first = pickNext({ ...shoot, presence });
    if (first) shoot.currentShotId = first.id;
  });
}

/** Finish shoot (D9). */
export function finishShoot(id: string): Promise<void> {
  return editShoot(
    id,
    (shoot) => {
      shoot.status = 'done';
      shoot.finishedAt = Date.now();
    },
    { day: true },
  );
}

/** Reopens a finished shoot where it was (D9). */
export function reopenShoot(id: string): Promise<void> {
  return editShoot(id, (shoot) => {
    shoot.status = 'live';
    delete shoot.finishedAt;
  });
}

/** Done, Skip, Needs retake, or back to to-do (D3). */
export function markShotOnDay(id: string, shotId: string, how: 'done' | 'skip' | 'retake' | 'reset'): Promise<void> {
  return editShoot(id, (shoot) => applyDay(shoot, markShot(shoot, shotId, how, Date.now())), { day: true });
}

/** "Do this now" (D4). */
export function doShotNow(id: string, shotId: string): Promise<void> {
  return editShoot(id, (shoot) => applyDay(shoot, makeCurrent(shoot, shotId, Date.now())), { day: true });
}

/** Marks someone here, not here yet or left (D5). */
export function setShootPresence(id: string, personId: string, to: Presence): Promise<void> {
  return editShoot(id, (shoot) => applyDay(shoot, setPresence(shoot, personId, to, Date.now())), { day: true });
}

/** ↶ Undo: reverses the last thing that happened (D3). */
export function undoLastOnDay(id: string): Promise<void> {
  return editShoot(id, (shoot) => applyDay(shoot, undoDay(shoot)), { day: true });
}

/** "Move all of Dan's shots up next" (D5). */
export function moveShotsUpNext(id: string, personId: string): Promise<void> {
  return editShoot(
    id,
    (shoot) => {
      shoot.order = moveShotsUp(shoot, personId);
      shoot.manualOrder = true;
    },
    { day: true },
  );
}

/** Partial edit of one shot: must-have, notes, pose (E6). */
export function updateShot(id: string, shotId: string, changes: Partial<Pick<Shot, 'mustHave' | 'notes' | 'status'>>): Promise<void> {
  return editShoot(id, (shoot) => {
    shoot.shots = shoot.shots.map((s) => (s.id === shotId ? { ...s, ...changes } : s));
  });
}

/** Changes a shot's poses in one atomic edit (PL5): `edit` gets the current list and returns the new one. */
function editPoses(id: string, shotId: string, edit: (poseIds: string[]) => string[]): Promise<void> {
  return editShoot(id, (shoot) => {
    shoot.shots = shoot.shots.map((s) => {
      if (s.id !== shotId) return s;
      const { poseId, poseIds, ...rest } = s;
      const next = [...new Set(edit(poseIds?.length ? poseIds : poseId ? [poseId] : []))];
      return next.length ? { ...rest, poseIds: next } : rest;
    });
  });
}

/** Adds a pose to a shot, or takes it off if it is there (PL5). New poses go last. */
export const togglePose = (id: string, shotId: string, poseId: string) =>
  editPoses(id, shotId, (list) => (list.includes(poseId) ? list.filter((p) => p !== poseId) : [...list, poseId]));

/** Moves a pose one place up or down in a shot's list (PL5). */
export const movePose = (id: string, shotId: string, poseId: string, by: -1 | 1) =>
  editPoses(id, shotId, (list) => {
    const from = list.indexOf(poseId);
    const to = from + by;
    if (from < 0 || to < 0 || to >= list.length) return list;
    const next = [...list];
    [next[from], next[to]] = [next[to]!, next[from]!];
    return next;
  });

/** Takes every pose off a shot (PL5). */
export const clearPoses = (id: string, shotId: string) => editPoses(id, shotId, () => []);

/** Renames a shot; an empty name goes back to the generated one. The name survives regenerating (E6). */
export function renameShot(id: string, shotId: string, name: string): Promise<void> {
  const clean = name.trim();
  return editShoot(id, (shoot) => {
    shoot.shots = shoot.shots.map((s) => (s.id === shotId ? { ...s, name: clean || s.name, nameEdited: clean !== '' } : s));
  });
}

/** Removes a shot. A generated one is remembered as removed so it stays gone; a custom one is deleted (E6). */
export function removeShot(id: string, shotId: string): Promise<void> {
  return editShoot(id, (shoot) => {
    const shot = shoot.shots.find((s) => s.id === shotId);
    if (!shot) return;
    if (shot.source !== 'custom') shoot.removedKeys = [...new Set([...shoot.removedKeys, shotId])];
    shoot.shots = shoot.shots.filter((s) => s.id !== shotId);
    shoot.order = shoot.order.filter((x) => x !== shotId);
  });
}

export function restoreShot(id: string, key: string): Promise<void> {
  return editShoot(id, (shoot) => {
    shoot.removedKeys = shoot.removedKeys.filter((k) => k !== key);
  });
}

/** Sets the shooting order by hand (O4): the suggestion won't override it until asked. */
export function setShotOrder(id: string, order: string[]): Promise<void> {
  return editShoot(id, (shoot) => {
    shoot.order = order;
    shoot.manualOrder = true;
  });
}

export function setOrderOptions(id: string, options: Partial<Shoot['orderOptions']>): Promise<void> {
  return editShoot(id, (shoot) => {
    shoot.orderOptions = { ...shoot.orderOptions, ...options };
  });
}

/**
 * The suggested order (O1, O2). With `rest`, shots already taken keep their
 * place at the front and only the rest are re-ordered (O4).
 */
export async function applySuggestedOrder(id: string, rest = false): Promise<void> {
  const settings = await getSettings();
  await db.transaction('rw', [...SHOOT_TABLES()], async () => {
    const shoot = await db.shoots.get(id);
    if (!shoot) return;
    const input = await planInput(shoot);
    const order = suggestOrder(
      { ...input, shots: shoot.shots, order: shoot.order, options: shoot.orderOptions, estimates: settings.timeEstimates, priorities: shoot.priorities, cameraPersonId: shoot.cameraPersonId },
      rest,
    );
    await db.shoots.update(id, { order, manualOrder: false, updatedAt: tick() });
  });
}

/**
 * Marks people Early, Late or Normal for a shoot (O7). Before the shoot the
 * whole list is re-ordered, unless the photographer ordered it by hand; on
 * shoot day only the shots still to do are (done shots never move, O8).
 * Returns whether the order changed.
 */
export async function setPriorities(id: string, personIds: string[], how: Priority | 'normal'): Promise<{ reordered: boolean }> {
  const settings = await getSettings();
  return db.transaction('rw', [...SHOOT_TABLES()], async () => {
    const shoot = await db.shoots.get(id);
    if (!shoot || lockedAway(shoot)) return { reordered: false };
    const priorities = { ...(shoot.priorities ?? {}) };
    for (const p of personIds) {
      if (how === 'normal') delete priorities[p];
      else priorities[p] = how;
    }
    if (Object.keys(priorities).length) shoot.priorities = priorities;
    else delete shoot.priorities;
    const input = { ...(await planInput(shoot)), shots: shoot.shots, order: shoot.order, options: shoot.orderOptions, estimates: settings.timeEstimates, priorities: shoot.priorities, cameraPersonId: shoot.cameraPersonId };
    let order = shoot.order;
    if (shoot.status === 'live') order = suggestDayOrder(input, currentShot(shoot)?.id);
    else if (shoot.status === 'planned' && !shoot.manualOrder) order = suggestOrder(input);
    const reordered = order.join() !== shoot.order.join();
    await db.shoots.put({ ...shoot, order, updatedAt: tick() });
    return { reordered };
  });
}

/**
 * Sets who is behind the camera and who covers their shots (P6); `null`
 * clears one, a missing field is left alone. The same person can't be both.
 * Re-orders like `setPriorities` (the camera person's shots are kept together).
 * Returns whether the order changed.
 */
export async function setCameraPeople(
  id: string,
  fields: { cameraPersonId?: string | null; backupCameraPersonId?: string | null },
): Promise<{ reordered: boolean }> {
  const settings = await getSettings();
  return db.transaction('rw', [...SHOOT_TABLES()], async () => {
    const shoot = await db.shoots.get(id);
    if (!shoot || lockedAway(shoot)) return { reordered: false };
    for (const key of ['cameraPersonId', 'backupCameraPersonId'] as const) {
      const v = fields[key];
      if (v === undefined) continue;
      if (v === null) delete shoot[key];
      else shoot[key] = v;
    }
    if (shoot.cameraPersonId && shoot.cameraPersonId === shoot.backupCameraPersonId) delete shoot.backupCameraPersonId;
    const input = { ...(await planInput(shoot)), shots: shoot.shots, order: shoot.order, options: shoot.orderOptions, estimates: settings.timeEstimates, priorities: shoot.priorities, cameraPersonId: shoot.cameraPersonId };
    let order = shoot.order;
    if (shoot.status === 'live') order = suggestDayOrder(input, currentShot(shoot)?.id);
    else if (shoot.status === 'planned' && !shoot.manualOrder) order = suggestOrder(input);
    const reordered = order.join() !== shoot.order.join();
    await db.shoots.put({ ...shoot, order, updatedAt: tick() });
    return { reordered };
  });
}

/** Copies a shoot as a new planned one for another date (P4): same people, templates and edits, nothing done yet. */
export async function duplicateShoot(id: string, fields: { date?: string; title?: string } = {}): Promise<Shoot | undefined> {
  const source = await db.shoots.get(id);
  if (!source) return undefined;
  const copy: Shoot = {
    ...source,
    ...stamp({}),
    ...(fields.title !== undefined ? { title: fields.title } : {}),
    date: fields.date ?? today(),
    status: 'planned' as const,
    shots: source.shots.map((s) => {
      const rest = { ...s, status: 'todo' as const };
      delete rest.doneAt;
      return rest;
    }),
    presence: {},
    events: [],
  };
  delete copy.currentShotId;
  delete copy.startedAt;
  delete copy.finishedAt;
  delete copy.handoff;
  await db.shoots.add(copy);
  return copy;
}

export async function deleteShoot(id: string): Promise<void> {
  await db.transaction('rw', [db.shoots, db.extras], async () => {
    await db.extras.where('shootId').equals(id).delete();
    await db.shoots.delete(id);
  });
}

// Handing a shoot to the assistant and back (§9, SH1–SH6)

/**
 * Records that this phone shared the shoot. Until it comes back (or Take back
 * control), the other phone runs it (SH5); a finished shoot is shared only
 * for the records, so this phone keeps it and nothing locks. The shoot's
 * updatedAt is set to the same moment, so any later edit shows as "changed
 * since you shared it".
 */
export async function markSent(shootId: string, n: number, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.shoots, async () => {
    const shoot = await db.shoots.get(shootId);
    if (!shoot) return;
    const away = shoot.status !== 'done';
    await db.shoots.update(shootId, { handoff: { n, role: roleOf(shoot), away, sentAt: now }, updatedAt: now });
  });
}

/** Take back control (SH5): this phone runs the shoot again. Raising the number makes a crossing copy ask first. */
export async function takeBack(shootId: string): Promise<void> {
  await db.transaction('rw', db.shoots, async () => {
    const shoot = await db.shoots.get(shootId);
    if (!shoot?.handoff) return;
    await db.shoots.update(shootId, { handoff: { n: shoot.handoff.n + 1, role: shoot.handoff.role, away: false }, updatedAt: tick() });
  });
}

/**
 * Keeps a received shoot (SH4). The family, people, partnerships, extras,
 * location and poses are upserted by id (the more recently changed copy
 * wins; nothing else is deleted, and photos already here stay); the shoot
 * replaces this phone's copy. Call `decideReceive` first.
 */
export async function receiveShoot(incoming: ShootHandoff): Promise<void> {
  await db.transaction('rw', [db.families, db.people, db.partnerships, db.extras, db.locations, db.poses, db.shoots], async () => {
    const upsert = async <T extends { id: string; updatedAt: number; photo?: string }>(table: unknown, records: T[]) => {
      const t = table as { get(id: string): Promise<T | undefined>; put(r: T): Promise<unknown> };
      for (const record of records) {
        const existing = await t.get(record.id);
        if (existing && record.updatedAt <= existing.updatedAt) continue;
        await t.put(existing?.photo && record.photo === undefined ? { ...record, photo: existing.photo } : record);
      }
    };
    await upsert(db.families, [incoming.family]);
    await upsert(db.people, incoming.people);
    await upsert(db.partnerships, incoming.partnerships);
    await upsert(db.extras, incoming.extras);
    if (incoming.location) await upsert(db.locations, [incoming.location]);
    await upsert(db.poses, incoming.poses);
    const existing = await db.shoots.get(incoming.shoot.id);
    // Keep the sender's updatedAt, so opening the same link twice is recognized. A forecast already here stays.
    await db.shoots.put({
      ...migrateShoot(incoming.shoot),
      ...(existing?.forecast ? { forecast: existing.forecast } : {}),
      handoff: receivedHandoff(incoming),
    });
  });
}

// Locations

export async function addLocation(fields: Omit<Location, 'id' | 'createdAt' | 'updatedAt'>): Promise<Location> {
  const location: Location = stamp({ ...fields, name: fields.name.trim() });
  await db.locations.add(location);
  return location;
}

export async function updateLocation(id: string, changes: Changes<Location>): Promise<void> {
  await db.locations.update(id, { ...changes, updatedAt: tick() });
}

export async function deleteLocation(id: string): Promise<void> {
  await db.transaction('rw', [db.locations, db.shoots], async () => {
    await db.shoots
      .filter((s) => s.locationId === id)
      .modify((s: Shoot) => {
        delete s.locationId;
        s.updatedAt = tick();
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
  await db.poses.update(id, { ...changes, updatedAt: tick() });
}

/** Deletes a pose and its photos, and detaches it from shots that used it. */
export async function deletePose(id: string): Promise<void> {
  await db.transaction('rw', [db.poses, db.posePhotos, db.shoots], async () => {
    await db.posePhotos.where('poseId').equals(id).delete();
    await db.shoots.toCollection().modify((shoot: Shoot) => {
      if (!shoot.shots.some((s) => poseIdsOf(s).includes(id))) return;
      shoot.shots = shoot.shots.map((s) => {
        if (!poseIdsOf(s).includes(id)) return s;
        const { poseId, poseIds, ...rest } = s;
        void poseId;
        const left = (poseIds ?? (poseId ? [poseId] : [])).filter((p) => p !== id);
        return left.length ? { ...rest, poseIds: left } : rest;
      });
      shoot.updatedAt = tick();
    });
    await db.poses.delete(id);
  });
}

/**
 * Puts the starter library (PL3) into the `poses` table. Safe to call any time:
 * it only adds starter poses that are missing (matched by their stable id), so
 * favorites, photos and anything else on an existing row are never touched.
 * Returns how many were added.
 */
export async function seedStarterPoses(): Promise<number> {
  return db.transaction('rw', db.poses, async () => {
    const have = new Set(await db.poses.toCollection().primaryKeys());
    const now = Date.now();
    const missing = starterPoses.filter((p) => !have.has(p.id)).map((p) => ({ ...p, createdAt: now, updatedAt: now }));
    if (missing.length) await db.poses.bulkAdd(missing);
    return missing.length;
  });
}

export async function setPoseFavorite(id: string, favorite: boolean): Promise<void> {
  await db.poses.update(id, { favorite, updatedAt: tick() });
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
  await db.settings.put({ key: 'app', value: next, updatedAt: tick() });
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

