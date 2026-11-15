import type { Presence, Shoot, ShootEvent, Shot, ShotStatus } from '../data/types';
import { inOrder } from './shotView';

/**
 * Shoot day logic (§8), pure: what the checklist shows and how each tap
 * changes the shoot. Every change returns a new state and records a
 * `ShootEvent` that holds what is needed to undo it exactly (D3, D10).
 *
 * Who is "here": a person with no presence entry, or `here`. `expected`
 * (not arrived yet) and `left` are not here, so shots needing them wait (D5).
 */

export type DayState = Pick<Shoot, 'shots' | 'order' | 'presence' | 'events'> & { currentShotId?: string };

export const isHere = (state: Pick<DayState, 'presence'>, personId: string): boolean => {
  const p = state.presence[personId];
  return p === undefined || p === 'here';
};

/** The people (and extras) a shot needs who aren't here. */
export const waitingFor = (state: Pick<DayState, 'presence'>, shot: Shot): string[] => shot.personIds.filter((id) => !isHere(state, id));

const open = (s: Shot) => s.status === 'todo' || s.status === 'retake';

/**
 * The next shot to photograph after `afterId` (or from the top): the first
 * to-do shot that isn't waiting, going on from `afterId` and wrapping round;
 * when none is left, the same for retakes.
 */
export function pickNext(state: DayState, afterId?: string): Shot | undefined {
  const list = inOrder(state.shots, state.order);
  const at = afterId ? list.findIndex((s) => s.id === afterId) : -1;
  const rotated = [...list.slice(at + 1), ...list.slice(0, at + 1)].filter((s) => s.id !== afterId);
  for (const status of ['todo', 'retake'] as const) {
    const found = rotated.find((s) => s.status === status && waitingFor(state, s).length === 0);
    if (found) return found;
  }
  return undefined;
}

/** The shot being photographed: the one picked, if still open, else the next in order. */
export function currentShot(state: DayState): Shot | undefined {
  const picked = state.currentShotId ? state.shots.find((s) => s.id === state.currentShotId) : undefined;
  return picked && open(picked) ? picked : pickNext(state);
}

export interface DayLists {
  todo: Shot[];
  /** To-do shots that need someone who isn't here, with who (D5). */
  waiting: { shot: Shot; waitingFor: string[] }[];
  retakes: Shot[];
  done: Shot[];
  skipped: Shot[];
}

/** The list sections (D4). Every shot is in exactly one. Done and skipped are newest first. */
export function dayLists(state: DayState): DayLists {
  const lists: DayLists = { todo: [], waiting: [], retakes: [], done: [], skipped: [] };
  for (const shot of inOrder(state.shots, state.order)) {
    if (shot.status === 'done') lists.done.push(shot);
    else if (shot.status === 'skipped') lists.skipped.push(shot);
    else if (shot.status === 'retake') lists.retakes.push(shot);
    else {
      const w = waitingFor(state, shot);
      if (w.length) lists.waiting.push({ shot, waitingFor: w });
      else lists.todo.push(shot);
    }
  }
  const newest = (a: Shot, b: Shot) => (b.doneAt ?? 0) - (a.doneAt ?? 0);
  lists.done.sort(newest);
  lists.skipped.sort(newest);
  return lists;
}

export interface Transition {
  next: Shot | undefined;
  /** In the next shot but not the current one: call them in (green ▲). */
  callIn: string[];
  /** In the current shot but not the next: they can step out (red ▼). */
  canLeave: string[];
  /** Of those, who are in no shot still to do: done for the day. */
  doneForDay: string[];
}

/** What changes between the current shot and the next (O3, D2). */
export function transition(state: DayState, current: Shot | undefined): Transition {
  const next = current ? pickNext(state, current.id) : undefined;
  if (!current || !next) {
    const leaving = current ? current.personIds : [];
    return { next, callIn: [], canLeave: leaving, doneForDay: leaving.filter((id) => !stillNeeded(state, id, current?.id)) };
  }
  const nextIds = new Set(next.personIds);
  const curIds = new Set(current.personIds);
  const canLeave = current.personIds.filter((id) => !nextIds.has(id));
  return {
    next,
    callIn: next.personIds.filter((id) => !curIds.has(id)),
    canLeave,
    doneForDay: canLeave.filter((id) => !stillNeeded(state, id, current.id, next.id)),
  };
}

const stillNeeded = (state: DayState, personId: string, ...except: (string | undefined)[]) =>
  state.shots.some((s) => open(s) && !except.includes(s.id) && s.personIds.includes(personId));

// Changes -----------------------------------------------------------------

const without = <T extends object>(o: T, key: keyof T): T => {
  const rest = { ...o };
  delete rest[key];
  return rest;
};

const withCurrent = (state: DayState, id: string | undefined): DayState => {
  const rest = without(state, 'currentShotId');
  return id === undefined ? rest : { ...rest, currentShotId: id };
};

type Mark = { type: ShootEvent['type']; to: ShotStatus };
const MARKS = { done: { type: 'done', to: 'done' }, skip: { type: 'skip', to: 'skipped' }, retake: { type: 'retake', to: 'retake' }, reset: { type: 'reset', to: 'todo' } } satisfies Record<string, Mark>;

/** Done, Skip, Needs retake or put back to to-do (D3). Moves on when it was the current shot. */
export function markShot(state: DayState, shotId: string, how: keyof typeof MARKS, now: number): DayState {
  const shot = state.shots.find((s) => s.id === shotId);
  if (!shot) return state;
  const { type, to } = MARKS[how];
  const event: ShootEvent = {
    at: now,
    type,
    shotId,
    previous: shot.status,
    previousDoneAt: shot.doneAt ?? null,
    previousCurrentShotId: state.currentShotId ?? null,
  };
  const wasCurrent = currentShot(state)?.id === shotId;
  const shots = state.shots.map((s) => {
    if (s.id !== shotId) return s;
    if (to === 'todo') return without({ ...s, status: to }, 'doneAt');
    return { ...s, status: to, doneAt: now };
  });
  const moved: DayState = { ...state, shots, events: [...state.events, event] };
  if (to === 'todo') return withCurrent(moved, shotId);
  return withCurrent(moved, wasCurrent ? pickNext(moved, shotId)?.id : state.currentShotId);
}

/** "Do this now": makes a shot the current one. */
export function makeCurrent(state: DayState, shotId: string, now: number): DayState {
  const shot = state.shots.find((s) => s.id === shotId);
  if (!shot) return state;
  const base = shot.status === 'skipped' || shot.status === 'done' ? markShot(state, shotId, 'reset', now) : state;
  return withCurrent(base, shotId);
}

/** Marks someone here, not here yet, or left (D5). */
export function setPresence(state: DayState, personId: string, to: Presence, now: number): DayState {
  const before = state.presence[personId];
  if (before === to) return state;
  const type = to === 'here' ? 'arrive' : to === 'left' ? 'leave' : 'expect';
  const event: ShootEvent = { at: now, type, personId, previousPresence: before ?? null };
  return { ...state, presence: { ...state.presence, [personId]: to }, events: [...state.events, event] };
}

/** A shot added on the spot (D6): becomes the current one. */
export function addShot(state: DayState, shot: Shot, now: number): DayState {
  const event: ShootEvent = { at: now, type: 'add-shot', shotId: shot.id, previousCurrentShotId: state.currentShotId ?? null };
  const moved: DayState = {
    ...state,
    shots: [...state.shots, { ...shot, status: 'todo' }],
    order: [...state.order, shot.id],
    events: [...state.events, event],
  };
  return withCurrent(moved, shot.id);
}

/** Reverses the last event exactly (D3). Nothing to undo leaves the state as it is. */
export function undo(state: DayState): DayState {
  const event = state.events[state.events.length - 1];
  if (!event) return state;
  const events = state.events.slice(0, -1);
  const changesCurrent = event.previousCurrentShotId !== undefined;
  const restoredCurrent = changesCurrent ? (event.previousCurrentShotId ?? undefined) : state.currentShotId;
  let next: DayState = { ...state, events };
  switch (event.type) {
    case 'done':
    case 'skip':
    case 'retake':
    case 'reset':
      next = {
        ...next,
        shots: state.shots.map((s) => {
          if (s.id !== event.shotId) return s;
          const back = { ...s, status: event.previous ?? 'todo' };
          return event.previousDoneAt == null ? without(back, 'doneAt') : { ...back, doneAt: event.previousDoneAt };
        }),
      };
      break;
    case 'arrive':
    case 'leave':
    case 'expect': {
      if (!event.personId) break;
      const presence = { ...state.presence };
      if (event.previousPresence == null) delete presence[event.personId];
      else presence[event.personId] = event.previousPresence;
      next = { ...next, presence };
      break;
    }
    case 'add-shot':
      next = {
        ...next,
        shots: state.shots.filter((s) => s.id !== event.shotId),
        order: state.order.filter((id) => id !== event.shotId),
      };
      break;
  }
  return withCurrent(next, restoredCurrent);
}

/** What Undo would reverse, for its label ("Undo Done"), or undefined. */
export function undoLabel(state: DayState, nameOf: (id: string) => string): string | undefined {
  const e = state.events[state.events.length - 1];
  if (!e) return undefined;
  const shot = e.shotId ? (state.shots.find((s) => s.id === e.shotId)?.name ?? 'shot') : '';
  const who = e.personId ? nameOf(e.personId) : '';
  switch (e.type) {
    case 'done': return `Done: ${shot}`;
    case 'skip': return `Skip: ${shot}`;
    case 'retake': return `Retake: ${shot}`;
    case 'reset': return `Put back: ${shot}`;
    case 'arrive': return `${who} arrived`;
    case 'leave': return `${who} left`;
    case 'expect': return `${who} not here yet`;
    case 'add-shot': return `Added: ${shot}`;
  }
}

/**
 * "Move all of Dan's shots up next" (D5): the remaining shots with this
 * person go right after the current one, in their order; the others follow.
 */
export function moveShotsUp(state: DayState, personId: string): string[] {
  const current = currentShot(state);
  const list = inOrder(state.shots, state.order);
  const rest = list.filter((s) => s.status === 'todo' && s.id !== current?.id);
  const mine = rest.filter((s) => s.personIds.includes(personId));
  const others = rest.filter((s) => !s.personIds.includes(personId));
  const queue = [...(current?.status === 'todo' ? [current] : []), ...mine, ...others].map((s) => s.id);
  const slots = new Set(queue);
  return list.map((s) => (slots.has(s.id) ? queue.shift()! : s.id));
}

// Progress and summary ----------------------------------------------------

export interface Progress {
  total: number;
  done: number;
  skipped: number;
  retakes: number;
  /** To do and able to be photographed now. */
  todo: number;
  waiting: number;
  /** Must-have shots not yet done (to do, waiting or retake). */
  mustHavesLeft: number;
  elapsedMinutes: number | undefined;
  plannedMinutes: number;
}

export function progress(state: DayState, opts: { now: number; startedAt?: number | undefined; plannedMinutes: number }): Progress {
  const lists = dayLists(state);
  const left = [...lists.todo, ...lists.waiting.map((w) => w.shot), ...lists.retakes];
  return {
    total: state.shots.length,
    done: lists.done.length,
    skipped: lists.skipped.length,
    retakes: lists.retakes.length,
    todo: lists.todo.length,
    waiting: lists.waiting.length,
    mustHavesLeft: left.filter((s) => s.mustHave).length,
    elapsedMinutes: opts.startedAt === undefined ? undefined : Math.max(0, Math.round((opts.now - opts.startedAt) / 60000)),
    plannedMinutes: opts.plannedMinutes,
  };
}

export interface Summary {
  done: Shot[];
  skipped: Shot[];
  /** Retakes still owed. */
  retakes: Shot[];
  /** Shots never done or skipped. */
  notReached: Shot[];
  /** Custom shots, added before or during the shoot. */
  added: Shot[];
}

export function summarize(state: DayState): Summary {
  const list = inOrder(state.shots, state.order);
  return {
    done: list.filter((s) => s.status === 'done'),
    skipped: list.filter((s) => s.status === 'skipped'),
    retakes: list.filter((s) => s.status === 'retake'),
    notReached: list.filter((s) => s.status === 'todo'),
    added: list.filter((s) => s.source === 'custom'),
  };
}

export function summaryText(args: { title: string; date: string; summary: Summary; total: number; minutes?: number | undefined }): string {
  const { summary: s } = args;
  const block = (heading: string, shots: Shot[]) => (shots.length ? ['', `${heading} (${shots.length})`, ...shots.map((x) => `- ${x.name}`)] : []);
  return [
    `${args.title}, ${args.date}`,
    `${s.done.length} of ${args.total} shots done${args.minutes !== undefined ? ` in about ${args.minutes} min` : ''}`,
    ...block('Done', s.done),
    ...block('Retakes still owed', s.retakes),
    ...block('Skipped', s.skipped),
    ...block('Not reached', s.notReached),
    ...block('Added on the day', s.added),
  ].join('\n');
}
