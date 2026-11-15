import { TEMPLATE_IDS } from '../engine/templates';
import { POSE_CATEGORIES, POSE_TAGS } from './types';

/**
 * Shape checks for records that arrive from outside this phone: a backup file
 * (B1, B2) or, later, a shared shoot (§9). Anyone can send a file or a link,
 * so a damaged or made-up one must be turned away before it's saved, rather
 * than crash a screen or freeze the app later (B4).
 *
 * Fields are checked when present; required fields are listed in `required`.
 */

type Check = (value: unknown) => boolean;

// Generous limits: the biggest shoot is about 20 people and 80 shots (§17a).
const MAX_PEOPLE = 500;
const MAX_SHOTS = 1000;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString: Check = (value) => typeof value === 'string';
const isBoolean: Check = (value) => typeof value === 'boolean';
const isNumber: Check = (value) => typeof value === 'number' && Number.isFinite(value);
const isCount =
  (max = Number.MAX_SAFE_INTEGER): Check =>
  (value) =>
    Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;
const oneOf =
  (...options: readonly unknown[]): Check =>
  (value) =>
    options.includes(value);
const listOf =
  (item: Check, max = Number.MAX_SAFE_INTEGER): Check =>
  (value) =>
    Array.isArray(value) && value.length <= max && value.every(item);
const recordOf =
  (item: Check): Check =>
  (value) =>
    isObject(value) && Object.values(value).every((v) => v === undefined || item(v));

/**
 * An object with a string `key` (default "id") and the stamps every record
 * has, whose `required` fields are present and `optional` fields, when
 * present, pass their checks.
 */
const record =
  (required: Record<string, Check>, optional: Record<string, Check> = {}, key = 'id'): Check =>
  (value) =>
    isObject(value) &&
    typeof value[key] === 'string' &&
    isNumber(value.updatedAt) &&
    Object.entries(required).every(([name, check]) => check(value[name])) &&
    Object.entries(optional).every(([name, check]) => value[name] === undefined || check(value[name]));

const exact =
  (fields: Record<string, Check>): Check =>
  (value) =>
    isObject(value) && Object.entries(fields).every(([name, check]) => check(value[name]));

const stamps = { createdAt: isNumber };

export const isValidFamily = record({ ...stamps, name: isString, archived: isBoolean }, { notes: isString });

export const isValidPerson = record(
  { ...stamps, familyId: isString, name: isString, parentIds: listOf(isString, MAX_PEOPLE) },
  {
    nickname: isString,
    sex: oneOf('female', 'male'),
    ageGroup: oneOf('child', 'adult'),
    birthYear: isCount(3000),
    grown: isBoolean,
    usuallyAbsent: isBoolean,
    notes: isString,
    photo: isString,
  },
);

export const isValidPartnership = record({
  ...stamps,
  familyId: isString,
  personIds: (v) => Array.isArray(v) && v.length === 2 && v.every(isString),
  status: oneOf('together', 'separated'),
});

export const isValidExtra = record(
  { ...stamps, familyId: isString, name: isString, kind: oneOf('guest', 'pet') },
  { shootId: isString, emoji: isString, photo: isString, notes: isString },
);

const isTemplateSetting = exact({ id: oneOf(...TEMPLATE_IDS), enabled: isBoolean });
const isOrderOptions = exact({
  kidsFirst: isBoolean,
  releaseOlderEarly: isBoolean,
  bigGroupFirst: isBoolean,
  mustHavesEarly: isBoolean,
});
const isShot: Check = (value) =>
  exact({
    id: isString,
    name: isString,
    nameEdited: isBoolean,
    personIds: listOf(isString, MAX_PEOPLE),
    source: (v) => v === 'custom' || oneOf(...TEMPLATE_IDS)(v),
    reasons: listOf(oneOf(...TEMPLATE_IDS)),
    mustHave: isBoolean,
    notes: isString,
    status: oneOf('todo', 'done', 'skipped', 'retake'),
  })(value);
const isEvent = exact({
  at: isNumber,
  type: oneOf('done', 'skip', 'retake', 'reset', 'arrive', 'leave', 'expect', 'add-shot'),
});

export const isValidShoot = record(
  {
    ...stamps,
    familyId: isString,
    date: isString,
    status: oneOf('planned', 'live', 'done'),
    attendingIds: listOf(isString, MAX_PEOPLE),
    templates: listOf(isTemplateSetting, TEMPLATE_IDS.length),
    shots: listOf(isShot, MAX_SHOTS),
    order: listOf(isString, MAX_SHOTS),
    manualOrder: isBoolean,
    orderOptions: isOrderOptions,
    removedKeys: listOf(isString, MAX_SHOTS * 4),
    presence: recordOf(oneOf('expected', 'here', 'left')),
    events: listOf(isEvent, MAX_SHOTS * 20),
  },
  {
    title: isString,
    startTime: isString,
    locationId: isString,
    currentShotId: isString,
    startedAt: isNumber,
    finishedAt: isNumber,
    handoff: exact({ n: isNumber, role: oneOf('photographer', 'assistant'), away: isBoolean }),
  },
);

export const isValidLocation = record(
  {
    ...stamps,
    name: isString,
    latitude: (v) => isNumber(v) && Math.abs(v as number) <= 90,
    longitude: (v) => isNumber(v) && Math.abs(v as number) <= 180,
    source: oneOf('gps', 'search', 'coordinates', 'pin'),
  },
  { address: isString, timeZone: isString },
);

export const isValidPose = record(
  {
    ...stamps,
    name: isString,
    category: oneOf(...POSE_CATEGORIES),
    minSize: isCount(500),
    maxSize: isCount(500),
    description: isString,
    directions: listOf(isString, 100),
    tips: listOf(isString, 100),
    mistakes: listOf(isString, 100),
    tags: listOf(oneOf(...POSE_TAGS), POSE_TAGS.length),
    difficulty: oneOf('easy', 'medium', 'hard'),
    favorite: isBoolean,
    builtIn: isBoolean,
  },
  { image: isString, imageCredit: isObject },
);

export const isValidPosePhoto = record({
  ...stamps,
  poseId: isString,
  dataUrl: (v) => isString(v) && (v as string).startsWith('data:image/'),
  width: isCount(20_000),
  height: isCount(20_000),
});

const isTemplateSettings = listOf(isTemplateSetting, TEMPLATE_IDS.length);
export const isValidSettings = record(
  {
    value: exact({
      defaultTemplates: isTemplateSettings,
      defaultOrderOptions: isOrderOptions,
      timeEstimates: exact({ small: isNumber, medium: isNumber, large: isNumber, setup: isNumber }),
    }),
  },
  {},
  'key',
);
