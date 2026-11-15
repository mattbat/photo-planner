import type { AppSettings, Extra, Partnership, Person, Shoot, Shot, TemplateId, TimeEstimates } from '../data/types';
import {
  buildFamily,
  describeRelationship,
  everyoneShotKeys,
  generateShots,
  orderShots,
  previewCounts,
  validateFamily,
  type EngineExtra,
  type EnginePerson,
  type FamilyProblem,
  type OrderResult,
  type PreviewCount,
  type Shot as EngineShot,
} from '../engine';
import { formatClock } from '../sun';
import { poseIdsOf } from './shotPoses';
import { orderedPeople, toTreePeople } from './familyView';

/**
 * The bridge between what is stored (people, partnerships, extras, a shoot
 * with its shots) and the shot engine's own plain types. Pure: the repo calls
 * `planShoot` whenever something that changes the shot list is saved.
 */

/** The engine's view of a family. Ordered the same way as the tree, so the same family always gives the same shots. */
export function toEnginePeople(people: Person[], partnerships: Partnership[], thisYear?: number): EnginePerson[] {
  const ordered = orderedPeople(people);
  const byId = new Map(ordered.map((p) => [p.id, p]));
  return toTreePeople(ordered, partnerships, thisYear).map((t) => {
    const p = byId.get(t.id)!;
    return {
      id: t.id,
      name: p.name,
      ...(p.nickname?.trim() ? { nickname: p.nickname.trim() } : {}),
      ...(t.sex ? { sex: t.sex } : {}),
      grown: t.grown,
      parentIds: t.parentIds,
      partnerIds: t.partnerIds,
      ...(t.separatedPartnerIds ? { separatedPartnerIds: t.separatedPartnerIds } : {}),
    };
  });
}

/**
 * Pets and guests as the engine wants them. An extra joins the shots of the
 * templates whose setting lists it (`extraIds`); one no template mentions
 * joins the full group.
 */
export function toEngineExtras(extras: Extra[], templates: { id: TemplateId; extraIds?: string[] }[]): EngineExtra[] {
  return extras.map((e) => {
    const chosen = templates.filter((t) => t.extraIds?.includes(e.id)).map((t) => t.id);
    return { id: e.id, name: e.name, kind: e.kind, joinTemplates: chosen.length ? chosen : ['fullGroup'] };
  });
}

/** Problems with the family's relationships, in plain language (F7). */
export function checkFamily(people: Person[], partnerships: Partnership[]): FamilyProblem[] {
  return validateFamily(toEnginePeople(people, partnerships));
}

const sigOf = (ids: string[]) => [...ids].sort().join(',');

/** A stored shot as the engine's shot. */
export function toEngineShot(shot: Shot, extraIds: ReadonlySet<string>): EngineShot {
  return {
    key: shot.id,
    name: shot.name,
    peopleIds: shot.personIds.filter((id) => !extraIds.has(id)),
    extraIds: shot.personIds.filter((id) => extraIds.has(id)),
    templateIds: shot.reasons,
    groupLabel: shot.source === 'custom' ? 'Custom' : '',
    ...(shot.source === 'custom' ? { custom: true } : {}),
  };
}

/** An engine shot as stored, carrying over what the photographer set on the previous copy (E6). */
function toStoredShot(shot: EngineShot, previous: Shot | undefined): Shot {
  const source: Shot['source'] = shot.custom ? 'custom' : ((shot.key.slice(0, shot.key.indexOf(':')) as TemplateId) || 'custom');
  return {
    id: shot.key,
    name: shot.name,
    nameEdited: previous?.nameEdited ?? false,
    personIds: [...shot.peopleIds, ...shot.extraIds],
    source,
    reasons: shot.templateIds,
    mustHave: previous?.mustHave ?? false,
    notes: previous?.notes ?? '',
    ...(previous && poseIdsOf(previous).length ? { poseIds: poseIdsOf(previous) } : {}),
    status: previous?.status ?? 'todo',
    ...(previous?.doneAt !== undefined ? { doneAt: previous.doneAt } : {}),
  };
}

export type PlanShoot = Pick<Shoot, 'attendingIds' | 'templates' | 'shots' | 'order' | 'removedKeys'>;

export interface PlanInput {
  people: Person[];
  partnerships: Partnership[];
  extras: Extra[];
  shoot: PlanShoot;
  familyName?: string;
  thisYear?: number;
}

export interface ShotPlan {
  /** Generated and custom shots, in the order they are listed. */
  shots: Shot[];
  /** Shot ids in shooting order: the previous order kept, new shots last. */
  order: string[];
  /** Shots the templates would make but that can't be made with who is attending (E3). */
  flagged: { key: string; reason: string }[];
  /** Shots the photographer removed that the templates would still make (E6). */
  removed: { key: string; name: string }[];
}

const enabledTemplates = (shoot: PlanShoot): TemplateId[] => shoot.templates.filter((t) => t.enabled).map((t) => t.id);

function engineInput(input: PlanInput, withEdits: boolean) {
  const { people, partnerships, extras, shoot } = input;
  const extraSet = new Set(extras.map((e) => e.id));
  const custom = shoot.shots.filter((s) => s.source === 'custom').map((s) => toEngineShot(s, extraSet));
  const renamed = Object.fromEntries(shoot.shots.filter((s) => s.nameEdited && s.source !== 'custom').map((s) => [s.id, s.name]));
  return {
    people: toEnginePeople(people, partnerships, input.thisYear),
    extras: toEngineExtras(extras, shoot.templates),
    attendingIds: shoot.attendingIds,
    templateIds: enabledTemplates(shoot),
    // Family names like "The Pike–Vega family" read badly as "… cousins", so shots just say "Cousins".
    edits: { removed: withEdits ? shoot.removedKeys : [], renamed: withEdits ? renamed : {}, custom },
  };
}

/**
 * Works out the shot list for a shoot from the family, who is attending and
 * the templates that are on, then puts back the photographer's edits: names,
 * must-haves, notes, removed shots and custom shots (E6). Deterministic: the
 * same input always gives the same list.
 */
export function planShoot(input: PlanInput): ShotPlan {
  const { shoot } = input;
  const result = generateShots(engineInput(input, true));

  const bySig = new Map<string, Shot>();
  for (const s of shoot.shots) bySig.set(sigOf(s.personIds), s);
  const byId = new Map(shoot.shots.map((s) => [s.id, s]));
  const idMap = new Map<string, string>();
  const shots = result.shots.map((es) => {
    const stored = toStoredShot(es, undefined);
    const previous = byId.get(es.key) ?? bySig.get(sigOf(stored.personIds));
    if (previous) idMap.set(previous.id, es.key);
    return toStoredShot(es, previous);
  });

  const known = new Set(shots.map((s) => s.id));
  const order: string[] = [];
  for (const id of shoot.order) {
    const next = idMap.get(id) ?? (known.has(id) ? id : undefined);
    if (next && !order.includes(next)) order.push(next);
  }
  for (const s of shots) if (!order.includes(s.id)) order.push(s.id);

  let removed: ShotPlan['removed'] = [];
  if (shoot.removedKeys.length) {
    const all = generateShots(engineInput(input, false));
    const names = new Map(all.shots.map((s) => [s.key, s.name]));
    removed = shoot.removedKeys.filter((k) => names.has(k) && !known.has(k)).map((key) => ({ key, name: names.get(key)! }));
  }
  return { shots, order, flagged: result.flagged, removed };
}

/** E5: how many shots each template would make on its own, and how many it would add to the list as it is. */
export function previewShoot(input: PlanInput): Record<TemplateId, PreviewCount> {
  return previewCounts(engineInput(input, true));
}

// Order (§6.2) -----------------------------------------------------------

export function minutesBySize(estimates: TimeEstimates): Record<string, number> {
  return { '1-2': estimates.small, '3-6': estimates.medium, '7+': estimates.large };
}

export interface OrderInput {
  people: Person[];
  partnerships: Partnership[];
  extras: Extra[];
  shots: Shot[];
  order: string[];
  options: AppSettings['defaultOrderOptions'];
  estimates: TimeEstimates;
  /** People to shoot early or late (O7). */
  priorities?: Record<string, 'early' | 'late'> | undefined;
  thisYear?: number;
}

/** Shots in the given order. Ids that don't match a shot are skipped; shots missing from `order` go last. */
export function inOrder(shots: Shot[], order: string[]): Shot[] {
  const byId = new Map(shots.map((s) => [s.id, s]));
  const listed = order.map((id) => byId.get(id)).filter((s): s is Shot => !!s);
  const seen = new Set(listed.map((s) => s.id));
  return [...listed, ...shots.filter((s) => !seen.has(s.id))];
}

function runOrder(input: OrderInput, fixedPrefix: string[], useOptions: boolean): OrderResult {
  const extraSet = new Set(input.extras.map((e) => e.id));
  const ordered = inOrder(input.shots, input.order);
  const o = input.options;
  return orderShots(
    ordered.map((s) => toEngineShot(s, extraSet)),
    toEnginePeople(input.people, input.partnerships, input.thisYear),
    {
      ...(useOptions ? { kidsFirst: o.kidsFirst, releaseOlderEarly: o.releaseOlderEarly, bigGroupFirst: o.bigGroupFirst, mustHavesEarly: o.mustHavesEarly, everyoneFirst: o.everyoneFirst !== false, groupHouseholds: o.groupHouseholds !== false } : {}),
      mustHaveKeys: ordered.filter((s) => s.mustHave).map((s) => s.id),
      ...(input.priorities ? { priorities: input.priorities } : {}),
      fixedPrefix,
      minutesBySize: minutesBySize(input.estimates),
      setupMinutes: input.estimates.setup,
    },
  );
}

/** O1, O2: the suggested order. Shots already done stay first, in their order, so "re-order the rest" (O4) keeps them. */
export function suggestOrder(input: OrderInput, keepDone = false): string[] {
  const ordered = inOrder(input.shots, input.order);
  const prefix = keepDone ? ordered.filter((s) => s.status !== 'todo').map((s) => s.id) : [];
  return runOrder(input, prefix, true).order;
}

/**
 * Shoot day (O8): re-order only the shots still to do. Done, skipped and
 * retake shots keep their places; the shot being photographed stays first of
 * the rest; the other to-do shots are re-ordered (with the priorities) into
 * the slots the to-do shots had.
 */
export function suggestDayOrder(input: OrderInput, currentShotId?: string): string[] {
  const ordered = inOrder(input.shots, input.order);
  const closed = ordered.filter((s) => s.status !== 'todo').map((s) => s.id);
  const current = ordered.find((s) => s.id === currentShotId && s.status === 'todo');
  const result = runOrder(input, [...closed, ...(current ? [current.id] : [])], true).order;
  const todo = new Set(ordered.filter((s) => s.status === 'todo').map((s) => s.id));
  const queue = result.filter((id) => todo.has(id));
  return ordered.map((s) => (todo.has(s.id) ? queue.shift()! : s.id));
}

/**
 * People marked Late who are in an "everyone" shot, so that shot waits for
 * them instead of opening the shoot (O9). Empty when everyone-first is off.
 */
export function everyoneWaitsFor(shots: Shot[], priorities: Record<string, 'early' | 'late'> | undefined, options: { everyoneFirst?: boolean | undefined }): string[] {
  if (options.everyoneFirst === false || !priorities) return [];
  const extra = new Set<string>();
  const eng = shots.filter((s) => s.status === 'todo').map((s) => toEngineShot(s, extra));
  const everyone = everyoneShotKeys(eng);
  const late = new Set<string>();
  for (const s of eng) if (everyone.has(s.key)) for (const id of s.peopleIds) if (priorities[id] === 'late') late.add(id);
  return [...late];
}

/** The short note after priorities change on shoot day: "Reordered: Grandma's 4 shots are next". */
export function reorderNote(name: string, how: 'early' | 'late' | 'normal', shots: number): string {
  const n = `${shots} shot${shots === 1 ? '' : 's'}`;
  if (how === 'early') return `Reordered: ${name}’s ${n} ${shots === 1 ? 'is' : 'are'} next.`;
  if (how === 'late') return `Reordered: ${name}’s ${n} ${shots === 1 ? 'is' : 'are'} last.`;
  return `Reordered the rest without a priority for ${name}.`;
}

/** The current order as steps (who to call in, who can leave, who is done for the day) with minutes (O3, O5). */
export function analyzeOrder(input: OrderInput): OrderResult {
  return runOrder(input, inOrder(input.shots, input.order).map((s) => s.id), false);
}

/** "9:05 AM" for a start time (HH:mm) plus minutes; the day wraps. */
export function clockAt(startTime: string, minutes: number): string {
  const [h = '0', m = '0'] = startTime.split(':');
  const total = ((((Number(h) || 0) * 60 + (Number(m) || 0) + Math.round(minutes)) % 1440) + 1440) % 1440;
  const hh = Math.floor(total / 60);
  return formatClock(hh, total % 60);
}

/** Plain-text shot list to paste into a message (P5). */
export function shotListText(args: {
  title: string;
  date: string;
  startTime?: string;
  shots: Shot[];
  order: string[];
  nameOf: (id: string) => string;
  minutes?: { key: string; start: number }[];
  /** Names the poses on a shot (PL5). */
  poseName?: (id: string) => string | undefined;
}): string {
  const ordered = inOrder(args.shots, args.order);
  const start = new Map((args.minutes ?? []).map((m) => [m.key, m.start]));
  const lines = [`${args.title}, ${args.date}${args.startTime ? `, from ${clockAt(args.startTime, 0)}` : ''}`, ''];
  ordered.forEach((s, i) => {
    const at = args.startTime && start.has(s.id) ? ` (${clockAt(args.startTime, start.get(s.id)!)})` : '';
    lines.push(`${i + 1}. ${s.mustHave ? '★ ' : ''}${s.name}${at}`);
    lines.push(`   ${s.personIds.map(args.nameOf).join(', ')}`);
    const poses = poseIdsOf(s).flatMap((id) => args.poseName?.(id) ?? []);
    if (poses.length) lines.push(`   ${poses.length === 1 ? 'Pose' : 'Poses'}: ${poses.join(', ')}`);
    if (s.notes.trim()) lines.push(`   Note: ${s.notes.trim()}`);
  });
  return lines.join('\n');
}

/** V6: "Noah is Mia's brother", in plain words, for two people of a family. */
export function describePair(people: Person[], partnerships: Partnership[], aId: string, bId: string): string {
  return describeRelationship(buildFamily(toEnginePeople(people, partnerships)), aId, bId);
}

/** Moves a shot to a place in the order, or one place up or down (the drag handle and its arrow keys). */
export function moveShot(order: string[], id: string, move: { to: number } | { by: -1 | 1 }): string[] {
  const from = order.indexOf(id);
  if (from < 0) return order;
  const to = Math.min(order.length - 1, Math.max(0, 'to' in move ? move.to : from + move.by));
  const next = order.filter((x) => x !== id);
  next.splice(to, 0, id);
  return next;
}

export type SoloScope = 'off' | 'everyone' | 'kids' | 'adults';

const SOLO: Record<string, SoloScope> = { soloEveryone: 'everyone', soloKids: 'kids', soloAdults: 'adults' };

/** Solo portraits are three templates; the scope picker shows whichever is on, or "off". */
export function soloScopeOf(templates: { id: TemplateId; enabled: boolean }[]): SoloScope {
  const on = templates.find((t) => t.enabled && SOLO[t.id]);
  return on ? SOLO[on.id]! : 'off';
}
