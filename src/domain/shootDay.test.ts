import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Shot } from '../data/types';
import {
  addShot,
  currentShot,
  dayLists,
  makeCurrent,
  markShot,
  moveShotsUp,
  pickNext,
  progress,
  setPresence,
  shotCounter,
  summarize,
  summaryText,
  transition,
  undo,
  undoLabel,
  waitingFor,
  type DayState,
} from './shootDay';

const shot = (id: string, personIds: string[], extra: Partial<Shot> = {}): Shot => ({
  id,
  name: `Shot ${id}`,
  nameEdited: false,
  personIds,
  source: 'fullGroup',
  reasons: [],
  mustHave: false,
  notes: '',
  status: 'todo',
  ...extra,
});

const base = (): DayState => ({
  shots: [shot('a', ['gran', 'dan', 'ivy']), shot('b', ['gran', 'dan']), shot('c', ['dan', 'ivy']), shot('d', ['ivy'])],
  order: ['a', 'b', 'c', 'd'],
  presence: {},
  events: [],
});

describe('current shot and next', () => {
  it('starts at the first to-do shot in order', () => {
    expect(currentShot(base())?.id).toBe('a');
  });

  it('skips waiting shots and returns to them when the person arrives', () => {
    let s = setPresence(base(), 'gran', 'expected', 1);
    expect(waitingFor(s, s.shots[0]!)).toEqual(['gran']);
    expect(currentShot(s)?.id).toBe('c');
    expect(dayLists(s).waiting.map((w) => w.shot.id)).toEqual(['a', 'b']);
    s = setPresence(s, 'gran', 'here', 2);
    expect(currentShot(s)?.id).toBe('a');
    expect(dayLists(s).waiting).toEqual([]);
  });

  it('keeps a shot picked with "Do this now", even when it is waiting', () => {
    const s = makeCurrent(setPresence(base(), 'ivy', 'left', 1), 'a', 2);
    expect(currentShot(s)?.id).toBe('a');
  });

  it('Done advances to the next to-do shot, wrapping round, then to retakes', () => {
    let s = markShot(base(), 'a', 'done', 10);
    expect(s.currentShotId).toBe('b');
    s = markShot(s, 'b', 'retake', 11);
    expect(currentShot(s)?.id).toBe('c');
    s = markShot(markShot(s, 'c', 'done', 12), 'd', 'skip', 13);
    expect(currentShot(s)?.id).toBe('b'); // only the retake is left
    expect(pickNext(markShot(s, 'b', 'done', 14))).toBeUndefined();
  });

  it('marking another shot done does not move the current one', () => {
    const s = markShot(base(), 'c', 'done', 5);
    expect(currentShot(s)?.id).toBe('a');
  });

  it('putting a shot back to to-do makes it current and clears doneAt', () => {
    const s = markShot(markShot(base(), 'a', 'skip', 5), 'a', 'reset', 6);
    expect(s.shots[0]).toMatchObject({ status: 'todo' });
    expect(s.shots[0]!.doneAt).toBeUndefined();
    expect(s.currentShotId).toBe('a');
  });

  it('makeCurrent on a done shot puts it back first', () => {
    const s = makeCurrent(markShot(base(), 'a', 'done', 5), 'a', 6);
    expect(s.shots[0]!.status).toBe('todo');
    expect(s.currentShotId).toBe('a');
  });

  it('ignores unknown shots', () => {
    const s = base();
    expect(markShot(s, 'nope', 'done', 1)).toBe(s);
    expect(makeCurrent(s, 'nope', 1)).toBe(s);
  });
});

describe('call in / can leave', () => {
  it('works out who steps in and out for the next shot, and who is done for the day', () => {
    const t = transition(base(), base().shots[0]);
    expect(t.next?.id).toBe('b');
    expect(t.callIn).toEqual([]);
    expect(t.canLeave).toEqual(['ivy']);
    expect(t.doneForDay).toEqual([]); // ivy is in c and d
    const last = transition(markShot(markShot(base(), 'a', 'done', 1), 'b', 'done', 2), base().shots[2]);
    expect(last.next?.id).toBe('d');
    expect(last.canLeave).toEqual(['dan']);
    expect(last.doneForDay).toEqual(['dan']);
  });

  it('with no next shot, everyone in the current one is done once it is', () => {
    const s = markShot(markShot(markShot(base(), 'a', 'done', 1), 'b', 'done', 2), 'c', 'done', 3);
    const t = transition(s, s.shots[3]);
    expect(t.next).toBeUndefined();
    expect(t.doneForDay).toEqual(['ivy']);
    expect(transition(s, undefined).canLeave).toEqual([]);
  });
});

describe('presence', () => {
  it('does nothing when nothing changes', () => {
    const s = base();
    expect(setPresence(s, 'gran', 'here', 1).events).toHaveLength(1);
    const at = setPresence(s, 'gran', 'here', 1);
    expect(setPresence(at, 'gran', 'here', 2)).toBe(at);
  });

  it('moves a leaving person\'s shots up next', () => {
    const s = base();
    expect(moveShotsUp(s, 'ivy')).toEqual(['a', 'c', 'd', 'b']);
    // Done shots keep their place; the current shot stays first of what is left.
    expect(moveShotsUp(markShot(s, 'a', 'done', 1), 'ivy')).toEqual(['a', 'b', 'c', 'd']);
    expect(moveShotsUp(makeCurrent(s, 'd', 1), 'gran')).toEqual(['d', 'a', 'b', 'c']);
  });
});

describe('add shot and undo', () => {
  it('adds a shot, makes it current and undo removes it', () => {
    const s = base();
    const added = addShot(s, shot('x', ['ivy'], { source: 'custom' }), 9);
    expect(added.currentShotId).toBe('x');
    expect(added.order).toEqual(['a', 'b', 'c', 'd', 'x']);
    expect(undo(added)).toEqual(s);
  });

  it('undoes Done exactly, including doneAt and the current shot', () => {
    const s = markShot(base(), 'a', 'done', 100);
    expect(undo(s)).toEqual({ ...base(), events: [] });
  });

  it('undoes presence changes', () => {
    const s = setPresence(base(), 'gran', 'left', 1);
    expect(undo(s)).toEqual(base());
  });

  it('keeps a "Do this now" pick when undoing a presence change', () => {
    const picked = makeCurrent(setPresence(base(), 'gran', 'left', 1), 'c', 2);
    expect(undo(picked).currentShotId).toBe('c');
  });

  it('has nothing to undo at the start', () => {
    const s = base();
    expect(undo(s)).toBe(s);
    expect(undoLabel(s, (id) => id)).toBeUndefined();
  });

  it('labels the last event', () => {
    const name = (id: string) => id.toUpperCase();
    expect(undoLabel(markShot(base(), 'a', 'done', 1), name)).toBe('Done: Shot a');
    expect(undoLabel(setPresence(base(), 'dan', 'left', 1), name)).toBe('DAN left');
    expect(undoLabel(setPresence(base(), 'dan', 'expected', 1), name)).toBe('DAN not here yet');
    expect(undoLabel(setPresence(base(), 'dan', 'here', 1), name)).toBe('DAN arrived');
    expect(undoLabel(markShot(base(), 'a', 'skip', 1), name)).toBe('Skip: Shot a');
    expect(undoLabel(markShot(base(), 'a', 'retake', 1), name)).toBe('Retake: Shot a');
    expect(undoLabel(markShot(markShot(base(), 'a', 'skip', 1), 'a', 'reset', 2), name)).toBe('Put back: Shot a');
    expect(undoLabel(addShot(base(), shot('x', []), 1), name)).toBe('Added: Shot x');
  });
});

describe('progress and summary', () => {
  it('counts done, must-haves left and elapsed time', () => {
    let s = base();
    s = { ...s, shots: s.shots.map((x) => (x.id === 'a' || x.id === 'd' ? { ...x, mustHave: true } : x)) };
    s = markShot(markShot(s, 'a', 'done', 1), 'b', 'retake', 2);
    s = setPresence(s, 'dan', 'left', 3);
    const p = progress(s, { now: 20 * 60000, startedAt: 0, plannedMinutes: 60 });
    expect(p).toMatchObject({ total: 4, done: 1, retakes: 1, waiting: 1, todo: 1, skipped: 0, mustHavesLeft: 1, elapsedMinutes: 20, plannedMinutes: 60 });
    expect(progress(s, { now: 5, plannedMinutes: 1 }).elapsedMinutes).toBeUndefined();
  });

  it('summarizes and writes the text to share', () => {
    let s = addShot(base(), shot('x', ['ivy'], { source: 'custom', name: 'Ivy twirl' }), 1);
    s = markShot(markShot(markShot(s, 'a', 'done', 2), 'b', 'skip', 3), 'c', 'retake', 4);
    const sum = summarize(s);
    expect(sum.done.map((x) => x.id)).toEqual(['a']);
    expect(sum.notReached.map((x) => x.id)).toEqual(['d', 'x']);
    const text = summaryText({ title: 'Pike family', date: 'Sat 5 Dec', summary: sum, total: 5, minutes: 42 });
    expect(text).toContain('1 of 5 shots done in about 42 min');
    expect(text).toContain('Retakes still owed (1)\n- Shot c');
    expect(text).toContain('Added on the day (1)\n- Ivy twirl');
    expect(summaryText({ title: 't', date: 'd', summary: summarize({ ...base(), shots: [], order: [] }), total: 0 })).toBe('t, d\n0 of 0 shots done');
  });
});

describe('property: random shoot days', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const people = ['p1', 'p2', 'p3', 'p4'];
  const op = fc.oneof(
    fc.record({ k: fc.constant('mark' as const), shot: fc.constantFrom(...ids), how: fc.constantFrom('done', 'skip', 'retake', 'reset') as fc.Arbitrary<'done' | 'skip' | 'retake' | 'reset'> }),
    fc.record({ k: fc.constant('presence' as const), who: fc.constantFrom(...people), to: fc.constantFrom('here', 'left', 'expected') as fc.Arbitrary<'here' | 'left' | 'expected'> }),
    fc.record({ k: fc.constant('add' as const), who: fc.subarray(people, { minLength: 1 }) }),
    fc.record({ k: fc.constant('now' as const), shot: fc.constantFrom(...ids) }),
    fc.record({ k: fc.constant('undo' as const) }),
  );
  const start = (): DayState => ({
    shots: ids.map((id, i) => shot(id, people.slice(i % 3, (i % 3) + 2))),
    order: ids,
    presence: {},
    events: [],
  });

  it('undo exactly reverses a tap; no shot is lost or duplicated; counts add up', () => {
    fc.assert(
      fc.property(fc.array(op, { maxLength: 40 }), (ops) => {
        let s = start();
        let n = 0;
        for (const o of ops) {
          n++;
          const before = s;
          let after: DayState;
          if (o.k === 'mark') after = markShot(s, o.shot, o.how, n);
          else if (o.k === 'presence') after = setPresence(s, o.who, o.to, n);
          else if (o.k === 'add') after = addShot(s, shot(`custom:${n}`, o.who, { source: 'custom' }), n);
          else if (o.k === 'now') after = makeCurrent(s, o.shot, n);
          else after = undo(s);
          if (after.events.length === before.events.length + 1) {
            // The tap, then Undo, gives back exactly the state before it.
            const back = undo(after);
            expect(back.shots).toEqual(before.shots);
            expect(back.order).toEqual(before.order);
            expect(back.presence).toEqual(before.presence);
            expect(back.events).toEqual(before.events);
            expect(currentShot(back)?.id).toBe(currentShot(before)?.id);
          }
          s = after;

          const all = s.shots.map((x) => x.id);
          expect(new Set(all).size).toBe(all.length);
          expect([...s.order].sort()).toEqual([...all].sort());
          const l = dayLists(s);
          const listed = [...l.todo, ...l.waiting.map((w) => w.shot), ...l.retakes, ...l.done, ...l.skipped].map((x) => x.id);
          expect(listed.sort()).toEqual([...all].sort());
          const p = progress(s, { now: 0, plannedMinutes: 0 });
          expect(p.done + p.skipped + p.retakes + p.todo + p.waiting).toBe(p.total);
          const cur = currentShot(s);
          if (cur) expect(['todo', 'retake']).toContain(cur.status);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('undoing everything returns to the start', () => {
    fc.assert(
      fc.property(fc.array(op, { maxLength: 30 }), (ops) => {
        let s = start();
        let n = 0;
        for (const o of ops) {
          n++;
          if (o.k === 'mark') s = markShot(s, o.shot, o.how, n);
          else if (o.k === 'presence') s = setPresence(s, o.who, o.to, n);
          else if (o.k === 'add') s = addShot(s, shot(`custom:${n}`, o.who, { source: 'custom' }), n);
        }
        while (s.events.length) s = undo(s);
        expect(s.shots).toEqual(start().shots);
        expect(s.order).toEqual(start().order);
        expect(s.presence).toEqual({});
      }),
    );
  });

  it('moving a person\'s shots up keeps the same shots', () => {
    fc.assert(
      fc.property(fc.array(op, { maxLength: 20 }), fc.constantFrom(...people), (ops, who) => {
        let s = start();
        ops.forEach((o, n) => {
          if (o.k === 'mark') s = markShot(s, o.shot, o.how, n);
        });
        const order = moveShotsUp(s, who);
        expect([...order].sort()).toEqual([...s.order].sort());
      }),
    );
  });
});

describe('shot counter (Shot N of T, X left)', () => {
  // The old header showed the shot's place in the stored list, so it jumped around.
  const oldNumber = (s: DayState) => s.shots.indexOf(currentShot(s)!) + 1;

  it('reproduces the bug: the list position is not progress', () => {
    let s = base();
    s = makeCurrent(s, 'd', 1);
    expect(oldNumber(s)).toBe(4); // "Shot 4 of 4" before anything was done
    expect(shotCounter(s)).toEqual({ number: 1, total: 4, left: 4 });
    s = markShot(s, 'd', 'done', 2);
    expect(oldNumber(s)).toBe(1); // went backwards after Done
    expect(shotCounter(s)).toEqual({ number: 2, total: 4, left: 3 });
  });

  it('counts 1, 2, 3 to the end and Undo restores each step', () => {
    let s = base();
    const seen: number[] = [];
    const states: DayState[] = [];
    while (currentShot(s)) {
      states.push(s);
      seen.push(shotCounter(s).number);
      s = markShot(s, currentShot(s)!.id, seen.length % 2 ? 'done' : 'skip', seen.length);
    }
    expect(seen).toEqual([1, 2, 3, 4]);
    expect(shotCounter(s)).toEqual({ number: 4, total: 4, left: 0 });
    while (s.events.length) {
      s = undo(s);
      expect(shotCounter(s)).toEqual(shotCounter(states[s.events.length]!));
    }
  });

  it('stays right with waiting shots, retakes, added shots and jumping', () => {
    let s = setPresence(base(), 'gran', 'expected', 1);
    expect(shotCounter(s)).toEqual({ number: 1, total: 4, left: 4 });
    s = markShot(s, 'c', 'done', 2);
    expect(shotCounter(s)).toEqual({ number: 2, total: 4, left: 3 });
    s = markShot(s, 'd', 'retake', 3);
    expect(shotCounter(s)).toEqual({ number: 2, total: 4, left: 3 });
    s = addShot(s, shot('x', ['dan']), 4);
    expect(shotCounter(s)).toEqual({ number: 2, total: 5, left: 4 });
    s = makeCurrent(s, 'b', 5);
    expect(shotCounter(s)).toEqual({ number: 2, total: 5, left: 4 });
    expect(shotCounter({ shots: [] })).toEqual({ number: 1, total: 0, left: 0 });
  });

  it('property: N stays within 1..T, never drops on Done or Skip, left is what is not done or skipped', () => {
    const action = fc.oneof(
      fc.record({ k: fc.constant('mark' as const), i: fc.nat(5), how: fc.constantFrom('done', 'skip', 'retake', 'reset') }),
      fc.record({ k: fc.constant('now' as const), i: fc.nat(5) }),
      fc.record({ k: fc.constant('presence' as const), who: fc.constantFrom('gran', 'dan', 'ivy'), to: fc.constantFrom('here', 'expected', 'left') }),
      fc.record({ k: fc.constant('add' as const) }),
      fc.record({ k: fc.constant('undo' as const) }),
    );
    fc.assert(
      fc.property(fc.array(action, { maxLength: 40 }), (actions) => {
        let s = base();
        let added = 0;
        actions.forEach((a, t) => {
          const before = shotCounter(s);
          const id = s.shots[a.k === 'mark' || a.k === 'now' ? a.i % s.shots.length : 0]!.id;
          if (a.k === 'mark') {
            const finishing = a.how === 'done' || a.how === 'skip';
            const wasFinished = s.shots.find((x) => x.id === id)!.status === 'done' || s.shots.find((x) => x.id === id)!.status === 'skipped';
            s = markShot(s, id, a.how, t + 1);
            if (finishing && !wasFinished) expect(shotCounter(s).number).toBeGreaterThanOrEqual(before.number);
          } else if (a.k === 'now') s = makeCurrent(s, id, t + 1);
          else if (a.k === 'presence') s = setPresence(s, a.who, a.to, t + 1);
          else if (a.k === 'add') s = addShot(s, shot(`n${added++}`, ['dan']), t + 1);
          else {
            const e = s.events.length;
            s = undo(s);
            if (e) expect(s.events.length).toBe(e - 1);
          }
          const c = shotCounter(s);
          expect(c.total).toBe(s.shots.length);
          expect(c.number).toBeGreaterThanOrEqual(1);
          expect(c.number).toBeLessThanOrEqual(c.total);
          expect(c.left).toBe(s.shots.filter((x) => x.status !== 'done' && x.status !== 'skipped').length);
        });
      }),
    );
  });
});
