/**
 * Data model (REQUIREMENTS.md §4–§12). Plain serialisable objects only: they
 * are stored in IndexedDB, written to backup files and, later, handed to the
 * assistant's phone. No classes, functions, Dates or Blobs.
 *
 * This file imports nothing, so the pure modules (src/engine, src/tree,
 * src/sun, src/domain) may import types from it.
 *
 * Design decisions
 * ----------------
 * - **Relationships.** The user enters two kinds only (§4): *child of* and
 *   *partner of*. *Child of* is stored on the child as `Person.parentIds`
 *   (one direction only, so there is nothing to keep in step; a child with one
 *   id is a step-child or has a single parent, F4). *Partner of* carries a
 *   status (together or separated, V1), so it is a record of its own in the
 *   `partnerships` table rather than a pair of ids on each Person. Everything
 *   else (generations, siblings, households, branches, cousins, in-laws) is
 *   derived by the pure modules from `people` + `partnerships`.
 * - **A shoot owns its shot list.** `Shoot.shots` holds the shots and
 *   `Shoot.order` the shooting order (shot ids), so a shoot is one record and
 *   every tap on shoot day is a single atomic update (D10). People and extras
 *   are referenced by id; a person's `id` never changes.
 * - **Photos are data URLs** (resized on the phone first, T8). Keeping them as
 *   strings, not Blobs, means backups and hand-offs are plain JSON.
 * - Every stored record has `createdAt` / `updatedAt` (epoch ms). Backup
 *   merge keeps the more recently changed copy of a record.
 * - **Dates** are `yyyy-mm-dd` strings and **times** `HH:mm` strings in the
 *   location's local time, so they never shift with the phone's time zone.
 */

/** Fields every stored record has. */
export interface Stamped {
  id: string;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Families and people (§4, §5)
// ---------------------------------------------------------------------------

/** A client: one connected family tree, reused across shoots. */
export interface Family extends Stamped {
  name: string;
  /** Archived families leave the list but keep everything (F1). */
  archived: boolean;
  notes?: string;
}

export type Sex = 'female' | 'male';

/** Used for kid-friendly ordering and pose suggestions (§4). */
export type AgeGroup = 'child' | 'adult';

export interface Person extends Stamped {
  familyId: string;
  name: string;
  nickname?: string;
  /** Only used for "sons / daughters / grandsons…" shots. */
  sex?: Sex;
  ageGroup?: AgeGroup;
  /** An alternative to `ageGroup`; when both are set, `ageGroup` wins. */
  birthYear?: number;
  /**
   * Marks a child as grown (their own household). Anyone with a partner or
   * children of their own counts as grown regardless (§4).
   */
  grown?: boolean;
  /** Parent ids ("child of"). Empty for the top couple and for partners who married in. */
  parentIds: string[];
  /** "Not usually at shoots": unchecked by default on a new shoot (F5). */
  usuallyAbsent?: boolean;
  notes?: string;
  /** A small resized photo as a data URL, for the tree card (V3). */
  photo?: string;
}

export type PartnershipStatus = 'together' | 'separated';

/** "Partner of": married or together, drawn solid; separated, drawn dashed (V1). */
export interface Partnership extends Stamped {
  familyId: string;
  /** The two people, in no particular order. */
  personIds: [string, string];
  status: PartnershipStatus;
}

export type ExtraKind = 'guest' | 'pet';

/** A guest or pet: not part of the tree, so left out of generated shots (§4, F8). */
export interface Extra extends Stamped {
  familyId: string;
  /** Set when the extra belongs to one shoot only; otherwise to the whole family. */
  shootId?: string;
  name: string;
  kind: ExtraKind;
  emoji?: string;
  photo?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Shot templates and shots (§6)
// ---------------------------------------------------------------------------

/**
 * Every template of §6.1 that generates shots. The shot engine (src/engine)
 * owns the list (TEMPLATE_IDS there); this is the same type, re-exported.
 * Custom shots have no template.
 */
export type { TemplateId } from '../engine/types';
import type { TemplateId } from '../engine/types';

/** Where a shot came from: a template, or the photographer ("custom"). */
export type ShotSource = TemplateId | 'custom';

/** One template switched on or off for a shoot (or for new shoots, in Settings). */
export interface TemplateSetting {
  id: TemplateId;
  enabled: boolean;
  /**
   * Solo portraits are three templates (everyone, kids, adults); the shoot
   * screen's scope picker switches on one of them.
   */
  /** Extras (pets, guests) added to every shot this template makes (§6.1). */
  extraIds?: string[];
}

/** A shot's progress on shoot day (§4). "Blocked" is worked out from who is here, not stored. */
export type ShotStatus = 'todo' | 'done' | 'skipped' | 'retake';

export interface Shot {
  /** The engine's shot key (primary template + sorted people), stable across regenerations so edits stick (E6). */
  id: string;
  name: string;
  /** The user renamed it, so regenerating keeps the name (E6). */
  nameEdited: boolean;
  /** People and extras in the shot, as ids. */
  personIds: string[];
  /** The most specific template that made it, or "custom" (E2). */
  source: ShotSource;
  /** Every template that produced the same set of people (E2). */
  reasons: TemplateId[];
  mustHave: boolean;
  notes: string;
  /** The pose attached to it (§11), if any. */
  poseId?: string;
  status: ShotStatus;
  /** Spare: flagged shots are not stored, they are worked out from who is attending (E3). */
  flag?: string;
  /** Epoch ms of the last Done / Skip / Retake, for the summary (D9). */
  doneAt?: number;
}

export interface OrderOptions {
  /** Kids first (O2). */
  kidsFirst: boolean;
  /** Release older people early (O2). */
  releaseOlderEarly: boolean;
  /** Big group first (O2). */
  bigGroupFirst: boolean;
  /** Must-haves early (O2). */
  mustHavesEarly: boolean;
}

/** Who to finish first or push to the end on a shoot (O7); anyone not listed is normal. */
export type Priority = 'early' | 'late';

/** Where a person is on shoot day (D5, V8). */
export type Presence = 'expected' | 'here' | 'left';

export type ShootStatus = 'planned' | 'live' | 'done';

/**
 * One undoable thing that happened on shoot day (D3, D10). Undo pops the last
 * one and restores what it records.
 */
export interface ShootEvent {
  at: number;
  /** `expect` puts someone back to "not here yet"; `reset` puts a shot back to to-do. */
  type: 'done' | 'skip' | 'retake' | 'reset' | 'arrive' | 'leave' | 'expect' | 'add-shot';
  shotId?: string;
  personId?: string;
  /** The shot's status before, so Undo exactly reverses it. */
  previous?: ShotStatus;
  /** The shot's `doneAt` before (null for none). */
  previousDoneAt?: number | null;
  /** The shot being photographed before (null for none). */
  previousCurrentShotId?: string | null;
  /** The person's presence before (null for no entry). */
  previousPresence?: Presence | null;
}

/** Who is running the checklist when it is shared with the assistant (§9, M6). */
export interface Handoff {
  /** Increases with every hand-over, so the newer copy wins. */
  n: number;
  /** Which phone's copy this is. */
  role: 'photographer' | 'assistant';
  /** True while the other phone has the checklist. */
  away: boolean;
  /** Epoch ms of this phone's last send; an edit after it means "changed since you shared it". */
  sentAt?: number;
}

export interface Shoot extends Stamped {
  familyId: string;
  /** Optional title, e.g. "Spring portraits". Otherwise shown as the family and date. */
  title?: string;
  /** yyyy-mm-dd. */
  date: string;
  /** Planned start, HH:mm in the location's local time. */
  startTime?: string;
  locationId?: string;
  status: ShootStatus;
  /** People and extras attending (E3). Everyone is checked by default, except `usuallyAbsent` (F5). */
  attendingIds: string[];
  /** Templates on for this shoot, in the order of the templates list. */
  templates: TemplateSetting[];
  /** The shot list, in generated order. */
  shots: Shot[];
  /** Shot ids in shooting order (O1, O4). */
  order: string[];
  /** The photographer dragged shots, so the suggestion must not override it (O4). */
  manualOrder: boolean;
  orderOptions: OrderOptions;
  /**
   * Keys (`Shot.id`) of generated shots the photographer removed, so
   * regenerating does not bring them back (E6).
   */
  removedKeys: string[];
  /** People to shoot early or late (O7), by person id. Optional: no index, so no Dexie version. */
  priorities?: Record<string, Priority>;
  // Shoot day (§8)
  presence: Record<string, Presence>;
  /** The shot being photographed now (D1); resumes after the phone locks (D8). */
  currentShotId?: string;
  events: ShootEvent[];
  startedAt?: number;
  finishedAt?: number;
  /** Set once the shoot has been shared with the assistant (§9). */
  handoff?: Handoff;
  /** The last weather forecast fetched for this shoot's date and place, kept for offline viewing (L7). */
  forecast?: ShootForecast;
}

/** One hour of forecast, in the location's local time (L7). */
export interface ForecastHour {
  /** HH:mm. */
  time: string;
  cloudPercent: number | null;
  rainPercent: number | null;
  windKmh: number | null;
  tempC: number | null;
}

/** A cached Open-Meteo forecast for one date at one place (L7). */
export interface ShootForecast {
  /** Epoch ms when it was fetched. */
  fetchedAt: number;
  /** yyyy-mm-dd the hours are for. */
  date: string;
  latitude: number;
  longitude: number;
  hours: ForecastHour[];
}

// ---------------------------------------------------------------------------
// Light and location (§10)
// ---------------------------------------------------------------------------

export type LocationSource = 'gps' | 'search' | 'coordinates' | 'pin';

export interface Location extends Stamped {
  name: string;
  address?: string;
  /** Degrees; north and east positive. */
  latitude: number;
  longitude: number;
  /** IANA name such as "America/Chicago", for showing times in the place's own time (L2). */
  timeZone?: string;
  source: LocationSource;
}

// ---------------------------------------------------------------------------
// Poses (§11)
// ---------------------------------------------------------------------------

export const POSE_CATEGORIES = [
  'individual',
  'couples',
  'parent-child',
  'kids-babies',
  'siblings',
  'small-family',
  'large-group',
  'generations',
  'candid',
] as const;
export type PoseCategory = (typeof POSE_CATEGORIES)[number];

export const POSE_TAGS = [
  'sitting',
  'standing',
  'walking',
  'lying-down',
  'close-up',
  'full-length',
  'playful',
  'formal',
  // Who it suits, used to suggest poses for a shot (PL5).
  'kids-friendly',
  'baby',
  'senior-friendly',
] as const;
export type PoseTag = (typeof POSE_TAGS)[number];

export type PoseDifficulty = 'easy' | 'medium' | 'hard';

/** Where a pose's example image came from and under what licence (PL3). */
export interface ImageCredit {
  source: string;
  licence: string;
  credit?: string;
  url?: string;
}

export interface Pose extends Stamped {
  name: string;
  category: PoseCategory;
  /** Group sizes it suits (PL2). */
  minSize: number;
  maxSize: number;
  description: string;
  /** How to direct it, one sentence you can say to people per step (PL2). */
  directions: string[];
  tips: string[];
  mistakes: string[];
  tags: PoseTag[];
  difficulty: PoseDifficulty;
  favorite: boolean;
  /** True for the starter library shipped with the app; false for the user's own (PL3, PL4). */
  builtIn: boolean;
  /** Path of the starter illustration under the app's base URL (e.g. `poses/v-shape.svg`), for built-in poses. */
  image?: string;
  imageCredit?: ImageCredit;
}

/** A photo the user added to a pose (PL4), resized first (T8). */
export interface PosePhoto extends Stamped {
  poseId: string;
  /** A JPEG or WebP data URL, longest side about 1600 px. */
  dataUrl: string;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Minutes per shot by group size, plus a set-up allowance (O5). */
export interface TimeEstimates {
  /** 1–2 people. */
  small: number;
  /** 3–6 people. */
  medium: number;
  /** 7 or more people. */
  large: number;
  /** Extra minutes once, for setting up. */
  setup: number;
}

export interface AppSettings {
  /** Templates ticked for a new shoot (Q12). */
  defaultTemplates: TemplateSetting[];
  defaultOrderOptions: OrderOptions;
  timeEstimates: TimeEstimates;
  /** Start shoots with everyone marked here, so nobody has to be ticked off (D5). Default on. */
  treatEveryoneAsHere?: boolean;
}

/** The `settings` table is a small key-value store; today it holds one row, `app`. */
export interface SettingsRow {
  key: 'app';
  value: AppSettings;
  updatedAt: number;
}
