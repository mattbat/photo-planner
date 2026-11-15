import { poseIdsOf } from '../domain/shotPoses';
import { slug } from './backup';
import { db } from './db';
import type { Extra, Family, Handoff, Location, Partnership, Person, Pose, Shoot } from './types';
import { isValidExtra, isValidFamily, isValidLocation, isValidPartnership, isValidPerson, isValidPose, isValidShoot } from './validate';

/**
 * Handing a shoot between the photographer's and the assistant's phones
 * (REQUIREMENTS.md §9, option B; next5's SH1–SH6). The shoot travels as a
 * link (Messages, WhatsApp, email) or a file (AirDrop, Files). There's no
 * server: in a link the shoot is packed after the #, which browsers never
 * send to the web server.
 */

export const HANDOFF_FORMAT = 'photo-planner-shoot';
/** Version of the hand-off layout (not the app). */
export const HANDOFF_VERSION = 1;

export type Role = Handoff['role'];

export interface ShootHandoff {
  format: typeof HANDOFF_FORMAT;
  version: number;
  sentAt: string;
  /** The hand-off number this send gives the shoot. */
  n: number;
  /** Who sent it. */
  from: Role;
  /** The shoot without this phone's hand-off state, forecast and undo log. */
  shoot: Shoot;
  family: Family;
  people: Person[];
  partnerships: Partnership[];
  /** Only the guests and pets the shoot uses. */
  extras: Extra[];
  location?: Location;
  /**
   * The user's own poses attached to shots. Built-in poses are referenced by
   * id, and pose photos never travel, to keep links small.
   */
  poses: Pose[];
}

/** The records a shoot needs, read from this phone. */
export interface ShootParts {
  family: Family;
  people: Person[];
  partnerships: Partnership[];
  extras: Extra[];
  location?: Location | undefined;
  poses: Pose[];
}

/** This phone's role for a shoot; one nobody has handed over is the photographer's. */
export const roleOf = (shoot: Shoot): Role => shoot.handoff?.role ?? 'photographer';

/** Shots that are done: what a stale copy must not wipe out (SH4). */
export const doneCount = (shoot: Pick<Shoot, 'shots'>): number => shoot.shots.filter((s) => s.status === 'done').length;

/** True while the other phone runs this shoot: shared, not finished, and not taken back (SH5). */
export const sharedAway = (shoot: Shoot): boolean => !!shoot.handoff?.away && shoot.status !== 'done';

/** A live shoot that is on the other phone: no Done, Undo or who's-here changes here until Take back control (SH5). */
export const lockedAway = (shoot: Shoot): boolean => shoot.status === 'live' && sharedAway(shoot);

/** "Planned", "In progress (3 of 12 done)" or "Finished (9 of 12 done)". */
export function shootProgress(shoot: Pick<Shoot, 'status' | 'shots'>): string {
  const done = shoot.shots.filter((s) => s.status === 'done').length;
  if (shoot.status === 'planned') return `Planned · ${shoot.shots.length} shots`;
  return `${shoot.status === 'live' ? 'In progress' : 'Finished'} · ${done} of ${shoot.shots.length} done`;
}

/** True when the shoot was edited after it was last sent. */
export const changedSinceSent = (shoot: Shoot): boolean =>
  !!shoot.handoff?.away && shoot.handoff.sentAt !== undefined && shoot.updatedAt > shoot.handoff.sentAt;

/** What goes with the shoot, picked from the family's records: used extras, used custom poses, no photos. */
export function pickParts(shoot: Shoot, all: ShootParts): ShootParts {
  const used = new Set<string>(shoot.attendingIds);
  for (const shot of shoot.shots) shot.personIds.forEach((id) => used.add(id));
  for (const template of shoot.templates) template.extraIds?.forEach((id) => used.add(id));
  const poseIds = new Set(shoot.shots.flatMap(poseIdsOf));
  const bare = <T extends { photo?: string }>(record: T): T => {
    const { photo, ...rest } = record;
    void photo;
    return rest as T;
  };
  return {
    family: all.family,
    people: all.people.map(bare),
    partnerships: all.partnerships,
    extras: all.extras.filter((e) => used.has(e.id) && (e.shootId === undefined || e.shootId === shoot.id)).map(bare),
    ...(all.location ? { location: all.location } : {}),
    poses: all.poses.filter((p) => !p.builtIn && poseIds.has(p.id)),
  };
}

/** The shoot as it would be sent now: the next hand-off number, from this phone's role. */
export function makeHandoff(shoot: Shoot, all: ShootParts, now = new Date()): ShootHandoff {
  const { handoff, forecast, events, ...rest } = shoot;
  void forecast;
  // Undo stays on the phone that made the change, except what the summary needs (shots added on the day).
  const kept = events.filter((e) => e.type === 'add-shot');
  const parts = pickParts(shoot, all);
  return {
    format: HANDOFF_FORMAT,
    version: HANDOFF_VERSION,
    sentAt: now.toISOString(),
    n: (handoff?.n ?? 0) + 1,
    from: roleOf(shoot),
    shoot: { ...rest, events: kept },
    family: parts.family,
    people: parts.people,
    partnerships: parts.partnerships,
    extras: parts.extras,
    ...(parts.location ? { location: parts.location } : {}),
    poses: parts.poses,
  };
}

/** Reads a shoot and its family from this phone, ready for `makeHandoff`. */
export async function buildHandoff(shootId: string, now = new Date()): Promise<ShootHandoff | undefined> {
  const shoot = await db.shoots.get(shootId);
  if (!shoot) return undefined;
  const family = await db.families.get(shoot.familyId);
  if (!family) return undefined;
  const poseIds = shoot.shots.flatMap(poseIdsOf);
  return makeHandoff(
    shoot,
    {
      family,
      people: await db.people.where('familyId').equals(family.id).toArray(),
      partnerships: await db.partnerships.where('familyId').equals(family.id).toArray(),
      extras: await db.extras.where('familyId').equals(family.id).toArray(),
      location: shoot.locationId ? await db.locations.get(shoot.locationId) : undefined,
      poses: (await db.poses.bulkGet(poseIds)).filter((p): p is Pose => !!p),
    },
    now,
  );
}

export type ParseHandoffResult = { ok: true; handoff: ShootHandoff } | { ok: false; message: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] | null => (Array.isArray(value) ? value : null);

const DAMAGED = 'This shoot is damaged and can’t be opened. Ask for it to be sent again.';

/** Checks a received shoot before anything is changed (B4): every record must be well formed and belong to the family. */
export function parseHandoff(text: string): ParseHandoffResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: 'This isn’t a Photo Planner shoot (it can’t be read).' };
  }
  if (isObject(data) && data.format === 'photo-planner-backup') {
    return { ok: false, message: 'This is a backup file, not a shoot. Restore it from Settings.' };
  }
  if (!isObject(data) || data.format !== HANDOFF_FORMAT) return { ok: false, message: 'This isn’t a Photo Planner shoot.' };
  if (typeof data.version !== 'number' || data.version > HANDOFF_VERSION) {
    return { ok: false, message: 'This shoot was sent from a newer version of Photo Planner. Update the app, then try again.' };
  }
  const { shoot, family, n, from } = data;
  const people = list(data.people);
  const partnerships = list(data.partnerships);
  const extras = list(data.extras);
  const poses = list(data.poses);
  const location = data.location;
  const valid =
    typeof n === 'number' &&
    Number.isInteger(n) &&
    n >= 1 &&
    (from === 'photographer' || from === 'assistant') &&
    isValidShoot(shoot) &&
    isValidFamily(family) &&
    !!people &&
    people.every(isValidPerson) &&
    !!partnerships &&
    partnerships.every(isValidPartnership) &&
    !!extras &&
    extras.every(isValidExtra) &&
    !!poses &&
    poses.every(isValidPose) &&
    (location === undefined || isValidLocation(location));
  if (!valid) return { ok: false, message: DAMAGED };
  const s = shoot as Shoot;
  const f = family as Family;
  const belongs =
    s.familyId === f.id &&
    (people as Person[]).every((p) => p.familyId === f.id) &&
    (partnerships as Partnership[]).every((p) => p.familyId === f.id) &&
    (extras as Extra[]).every((e) => e.familyId === f.id) &&
    (location === undefined || (location as Location).id === s.locationId) &&
    (poses as Pose[]).every((p) => !p.builtIn);
  if (!belongs) return { ok: false, message: DAMAGED };
  const copy = structuredClone(s);
  delete copy.handoff;
  return {
    ok: true,
    handoff: {
      format: HANDOFF_FORMAT,
      version: data.version,
      sentAt: typeof data.sentAt === 'string' ? data.sentAt : '',
      n,
      from,
      shoot: copy,
      family: f,
      people: people as Person[],
      partnerships: partnerships as Partnership[],
      extras: extras as Extra[],
      ...(location ? { location: location as Location } : {}),
      poses: poses as Pose[],
    },
  };
}

// Links. The data is deflate-compressed JSON in base64url, prefixed "z"; where
// the browser can't compress (iOS before 16.4) it's plain JSON, prefixed "j".

const RECEIVE = '#/receive/';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Response(bytes as BufferSource).body!.pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Packs a hand-off into the text that goes after #/receive/ in a link. */
export async function encodeHandoff(handoff: ShootHandoff, compress = typeof CompressionStream === 'function'): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(handoff));
  if (!compress) return `j${toBase64Url(bytes)}`;
  return `z${toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')))}`;
}

/** Unpacks the text after #/receive/ in a link. */
export async function decodeHandoff(data: string): Promise<ParseHandoffResult> {
  const damaged = { ok: false as const, message: 'This link is damaged or cut off. Ask for the shoot to be sent again.' };
  try {
    const bytes = fromBase64Url(data.slice(1));
    if (data.startsWith('j')) return parseHandoff(new TextDecoder().decode(bytes));
    if (data.startsWith('z')) {
      if (typeof DecompressionStream !== 'function') {
        return { ok: false, message: 'This phone’s iOS is too old to open shoot links. Update iOS, or ask for a file instead.' };
      }
      return parseHandoff(new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw'))));
    }
    return damaged;
  } catch {
    return damaged;
  }
}

/** The full link, on whatever site this copy of the app runs from. */
export function handoffLink(data: string, base: Pick<globalThis.Location, 'origin' | 'pathname'> = window.location): string {
  return `${base.origin}${base.pathname}${RECEIVE}${data}`;
}

/** Finds the shoot data in pasted text: a whole link, a message with a link in it, or the data alone. */
export function dataFromText(text: string): string | null {
  const at = text.indexOf(RECEIVE);
  const candidate = (at === -1 ? text.trim() : text.slice(at + RECEIVE.length)).match(/^[zj][A-Za-z0-9_-]+/);
  return candidate ? candidate[0] : null;
}

/** e.g. photo-planner-pike-vega-shoot-2026-12-05.json, so files for several families stay apart. */
export function handoffFileName(handoff: ShootHandoff): string {
  return `photo-planner-${slug(handoff.family.name) || 'family'}-shoot-${handoff.shoot.date}.json`;
}

// Receiving

export type ReceiveDecision =
  /** This phone doesn't have the shoot yet. */
  | { kind: 'add' }
  /** The incoming copy is newer: use it. */
  | { kind: 'replace' }
  /** This phone already has this copy or a newer one. */
  | { kind: 'older' }
  /** This phone has more shots done than the incoming copy (SH4). Replacing needs a second tap. */
  | { kind: 'would-lose'; localDone: number; incomingDone: number }
  /** Both phones changed the shoot since the last hand-off (after Take back control). Ask which to keep. */
  | { kind: 'tie' };

/**
 * What to do with a received shoot (SH4). Hand-off numbers decide, never the
 * phones' clocks, which can disagree.
 */
export function decideReceive(local: Shoot | undefined, incoming: ShootHandoff): ReceiveDecision {
  if (!local) return { kind: 'add' };
  const localN = local.handoff?.n ?? 0;
  const fromOther = incoming.from !== roleOf(local);
  // The same copy opened twice, or an older one, or this phone's own send.
  if (incoming.n < localN || (incoming.n === localN && (local.updatedAt === incoming.shoot.updatedAt || !fromOther))) {
    return { kind: 'older' };
  }
  if (doneCount(local) > doneCount(incoming.shoot)) {
    return { kind: 'would-lose', localDone: doneCount(local), incomingDone: doneCount(incoming.shoot) };
  }
  // A shoot coming back to the phone that sent it, or a newer send.
  if (incoming.n > localN || (local.handoff?.away && fromOther)) return { kind: 'replace' };
  return { kind: 'tie' };
}

/** This phone's hand-off state after keeping a received shoot. */
export function receivedHandoff(incoming: ShootHandoff): Handoff {
  return { n: incoming.n, role: incoming.from === 'photographer' ? 'assistant' : 'photographer', away: false };
}
