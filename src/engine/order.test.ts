import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEMO_ATTENDING, DEMO_EXTRAS, DEMO_PEOPLE } from './demoFamily';
import { generateShots } from './generate';
import { DEFAULT_MINUTES_BY_SIZE, everyoneShotKeys, minutesForSize, orderShots, type OrderOptions, type OrderResult } from './order';
import { TEMPLATE_IDS } from './templates';
import type { EnginePerson, Shot } from './types';

const shot = (key: string, ...ids: string[]): Shot => ({ key, name: key, peopleIds: ids, extraIds: [], templateIds: [], groupLabel: 'x' });
const demoShots = generateShots({ people: DEMO_PEOPLE, extras: DEMO_EXTRAS, attendingIds: DEMO_ATTENDING, templateIds: TEMPLATE_IDS }).shots;
const byKey = (shots: Shot[]) => new Map(shots.map((s) => [s.key, s]));

function checkConsistent(shots: Shot[], r: OrderResult) {
  const m = byKey(shots);
  const all = (k: string) => new Set([...m.get(k)!.peopleIds, ...m.get(k)!.extraIds]);
  expect(r.steps.map((s) => s.key)).toEqual(r.order);
  r.order.forEach((k, i) => {
    const cur = all(k);
    const prev = i ? all(r.order[i - 1]!) : new Set<string>();
    expect(new Set(r.steps[i]!.callIn)).toEqual(new Set([...cur].filter((x) => !prev.has(x))));
    expect(new Set(r.steps[i]!.canLeave)).toEqual(new Set([...prev].filter((x) => !cur.has(x))));
    for (const d of r.steps[i]!.doneForDay) {
      expect(r.steps[i]!.canLeave).toContain(d);
      for (let j = i; j < r.order.length; j++) expect(all(r.order[j]!).has(d)).toBe(false);
    }
  });
}

describe('orderShots', () => {
  it('is a permutation with consistent call-in / can-leave', () => {
    const r = orderShots(demoShots, DEMO_PEOPLE);
    expect([...r.order].sort()).toEqual(demoShots.map((s) => s.key).sort());
    checkConsistent(demoShots, r);
  });
  it('starts big and peels off, with fewer changes than input order', () => {
    const r = orderShots(demoShots, DEMO_PEOPLE);
    const base = orderShots(demoShots, DEMO_PEOPLE, { fixedPrefix: demoShots.map((s) => s.key) });
    expect(base.order).toEqual(demoShots.map((s) => s.key));
    expect(r.changes).toBeLessThan(base.changes * 0.6);
    const size = (k: string) => byKey(demoShots).get(k)!.peopleIds.length;
    expect(size(r.order[0]!)).toBeGreaterThan(size(r.order[r.order.length - 1]!));
  });
  it('is deterministic', () => {
    expect(orderShots(demoShots, DEMO_PEOPLE, { kidsFirst: true })).toEqual(orderShots(demoShots, DEMO_PEOPLE, { kidsFirst: true }));
  });
  it('handles zero and one shots', () => {
    const e = orderShots([], DEMO_PEOPLE);
    expect(e).toMatchObject({ order: [], steps: [], minutes: [], totalMinutes: 0, changes: 0, doneAfterLast: [] });
    const one = orderShots([shot('a', 'ruth', 'frank')], DEMO_PEOPLE);
    expect(one.order).toEqual(['a']);
    expect(one.steps[0]).toEqual({ key: 'a', callIn: ['ruth', 'frank'], canLeave: [], doneForDay: [] });
    expect(one.doneAfterLast).toEqual(['ruth', 'frank']);
  });
  it('marks people done for the day', () => {
    const shots = [shot('all', 'a', 'b', 'c'), shot('ab', 'a', 'b'), shot('b', 'b')];
    const people: EnginePerson[] = ['a', 'b', 'c'].map((id) => ({ id, name: id, grown: true, parentIds: [], partnerIds: [] }));
    const r = orderShots(shots, people, { fixedPrefix: ['all', 'ab', 'b'] });
    expect(r.steps[1]).toMatchObject({ callIn: [], canLeave: ['c'], doneForDay: ['c'] });
    expect(r.steps[2]).toMatchObject({ canLeave: ['a'], doneForDay: ['a'] });
    expect(r.changes).toBe(1 + 1);
  });
  it('keeps the fixed prefix and orders the rest', () => {
    const prefix = [demoShots[40]!.key, demoShots[3]!.key, 'does-not-exist', demoShots[40]!.key];
    const r = orderShots(demoShots, DEMO_PEOPLE, { fixedPrefix: prefix });
    expect(r.order.slice(0, 2)).toEqual([demoShots[40]!.key, demoShots[3]!.key]);
    expect([...r.order].sort()).toEqual(demoShots.map((s) => s.key).sort());
    const all = orderShots(demoShots, DEMO_PEOPLE, { fixedPrefix: demoShots.map((s) => s.key).reverse() });
    expect(all.order).toEqual(demoShots.map((s) => s.key).reverse());
  });
  it('bigGroupFirst starts with the largest shot', () => {
    const r = orderShots(demoShots, DEMO_PEOPLE, { bigGroupFirst: true });
    expect(r.order[0]!.startsWith('fullGroup')).toBe(true);
    const r2 = orderShots(demoShots, DEMO_PEOPLE, { bigGroupFirst: true, fixedPrefix: ['soloKids:ava'] });
    expect(r2.order[0]).toBe('soloKids:ava');
  });
  it('kidsFirst moves shots with kids earlier on average', () => {
    const kids = new Set(DEMO_PEOPLE.filter((p) => !p.grown && !p.partnerIds.length).map((p) => p.id));
    const hasKid = (k: string) => byKey(demoShots).get(k)!.peopleIds.some((i) => kids.has(i));
    const avg = (r: OrderResult) => { const ks = r.order.map((k, i) => (hasKid(k) ? i : -1)).filter((i) => i >= 0); return ks.reduce((a, b) => a + b, 0) / ks.length; };
    expect(avg(orderShots(demoShots, DEMO_PEOPLE, { kidsFirst: true }))).toBeLessThan(avg(orderShots(demoShots, DEMO_PEOPLE)));
  });
  it('releaseOlderEarly releases the grandparents sooner', () => {
    const older = new Set(['ruth', 'frank', 'lena', 'omar']);
    const lastOlder = (r: OrderResult) => {
      const m = byKey(demoShots);
      let sum = 0;
      for (const o of older) sum += Math.max(...r.order.map((k, i) => (m.get(k)!.peopleIds.includes(o) ? i : -1)));
      return sum;
    };
    expect(lastOlder(orderShots(demoShots, DEMO_PEOPLE, { releaseOlderEarly: true }))).toBeLessThan(lastOlder(orderShots(demoShots, DEMO_PEOPLE)));
  });
  it('mustHavesEarly pulls must-have shots forward', () => {
    const must = [demoShots[90]!.key, demoShots[100]!.key];
    const pos = (r: OrderResult) => must.map((k) => r.order.indexOf(k)).reduce((a, b) => a + b, 0);
    expect(pos(orderShots(demoShots, DEMO_PEOPLE, { mustHavesEarly: true, mustHaveKeys: must }))).toBeLessThan(pos(orderShots(demoShots, DEMO_PEOPLE)));
    expect(orderShots(demoShots, DEMO_PEOPLE, { mustHavesEarly: true }).order).toHaveLength(demoShots.length);
  });
  it('estimates time by group size, with set-up once', () => {
    expect(minutesForSize(1)).toBe(2);
    expect(minutesForSize(2)).toBe(2);
    expect(minutesForSize(3)).toBe(3);
    expect(minutesForSize(6)).toBe(3);
    expect(minutesForSize(7)).toBe(5);
    expect(minutesForSize(30)).toBe(5);
    expect(minutesForSize(0, { '1-2': 2 })).toBe(2);
    expect(minutesForSize(4, { junk: 9, '3': 7 })).toBe(7);
    expect(DEFAULT_MINUTES_BY_SIZE['7+']).toBe(5);
    const shots = [shot('a', 'x'), shot('b', 'x', 'y', 'z'), shot('c', ...'abcdefgh'.split(''))];
    const r = orderShots(shots, [], { fixedPrefix: ['a', 'b', 'c'] });
    expect(r.minutes).toEqual([{ key: 'a', start: 5, duration: 2 }, { key: 'b', start: 7, duration: 3 }, { key: 'c', start: 10, duration: 5 }]);
    expect(r.totalMinutes).toBe(15);
    const custom = orderShots(shots, [], { fixedPrefix: ['a', 'b', 'c'], setupMinutes: 0, minutesBySize: { '1-2': 1, '3-6': 1, '7+': 10 } });
    expect(custom.totalMinutes).toBe(12);
  });
  it('includes extras (the dog) in call-in', () => {
    const r = orderShots(demoShots, DEMO_PEOPLE, { fixedPrefix: [demoShots[0]!.key] });
    expect(r.steps[0]!.callIn).toContain('biscuit');
  });
  it('orders big sets (more than 32 people) too', () => {
    const people: EnginePerson[] = Array.from({ length: 70 }, (_, i) => ({ id: `q${i}`, name: `Q${i}`, grown: true, parentIds: [], partnerIds: [] }));
    const shots = Array.from({ length: 40 }, (_, i) => shot(`s${i}`, `q${i}`, `q${(i * 7) % 70}`, `q${(i * 13 + 5) % 70}`));
    const r = orderShots(shots, people, { releaseOlderEarly: true, kidsFirst: true });
    expect([...r.order].sort()).toEqual(shots.map((s) => s.key).sort());
    checkConsistent(shots, r);
  });
});

describe('ordering properties', () => {
  const shotsArb = fc.array(fc.uniqueArray(fc.integer({ min: 0, max: 11 }), { minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 30 });
  const optsArb = fc.record({
    kidsFirst: fc.boolean(), releaseOlderEarly: fc.boolean(), bigGroupFirst: fc.boolean(), mustHavesEarly: fc.boolean(),
  });
  const people: EnginePerson[] = Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, name: `Q${i}`, grown: i % 3 === 0, parentIds: i % 4 === 1 ? ['q0'] : [], partnerIds: [] }));
  it('is a permutation, keeps the prefix, and call-in/can-leave match consecutive sets', () => {
    fc.assert(
      fc.property(shotsArb, optsArb, fc.nat(10), (sets, o, pre) => {
        const shots = sets.map((ids, i) => shot(`s${i}`, ...ids.map((x) => `q${x}`)));
        const prefix = shots.slice(0, Math.min(pre, shots.length)).map((s) => s.key).reverse();
        const opts: OrderOptions = { ...o, mustHaveKeys: [shots[shots.length - 1]!.key], fixedPrefix: prefix };
        const r = orderShots(shots, people, opts);
        expect([...r.order].sort()).toEqual(shots.map((s) => s.key).sort());
        expect(r.order.slice(0, prefix.length)).toEqual(prefix);
        checkConsistent(shots, r);
        expect(r.changes).toBe(r.steps.slice(1).reduce((a, s) => a + s.callIn.length + s.canLeave.length, 0));
      }),
      { numRuns: 120 },
    );
  });
  it('never does worse than input order when no preference options are on', () => {
    fc.assert(
      fc.property(shotsArb, (sets) => {
        const shots = sets.map((ids, i) => shot(`s${i}`, ...ids.map((x) => `q${x}`)));
        const r = orderShots(shots, people);
        const base = orderShots(shots, people, { fixedPrefix: shots.map((s) => s.key) });
        expect(r.changes).toBeLessThanOrEqual(base.changes);
      }),
      { numRuns: 120 },
    );
  });
});

describe('orderShots priorities (early and late people)', () => {
  const people = DEMO_PEOPLE;
  const keys = demoShots.map((s) => s.key);
  const has = (k: string, ids: string[]) => {
    const s = byKey(demoShots).get(k)!;
    return [...s.peopleIds, ...s.extraIds].some((id) => ids.includes(id));
  };
  // The oldest person in the demo and a grandchild-age person.
  const everyone = [...new Set(demoShots.flatMap((s) => s.peopleIds))];
  const someEarly = [everyone[0]!, everyone[3]!];
  const someLate = [everyone[5]!];

  it('puts every shot with an early person before every shot without one', () => {
    const r = orderShots(demoShots, people, { priorities: { [someEarly[0]!]: 'early' } });
    const flags = r.order.map((k) => has(k, [someEarly[0]!]));
    expect(flags.indexOf(false)).toBeGreaterThan(0);
    expect(flags.slice(flags.indexOf(false)).every((f) => !f)).toBe(true);
    expect([...r.order].sort()).toEqual([...keys].sort());
  });

  it('puts every shot with a late person after every shot without one', () => {
    const r = orderShots(demoShots, people, { priorities: { [someLate[0]!]: 'late' } });
    const flags = r.order.map((k) => has(k, someLate));
    const firstLate = flags.indexOf(true);
    expect(firstLate).toBeGreaterThan(0);
    expect(flags.slice(firstLate).every((f) => f)).toBe(true);
  });

  it('keeps the fixed prefix, then early shots, in the same order every time', () => {
    const prefix = keys.slice(10, 13);
    const o = { fixedPrefix: prefix, priorities: { [someEarly[1]!]: 'early' as const } };
    const a = orderShots(demoShots, people, o);
    expect(a.order.slice(0, 3)).toEqual(prefix);
    expect(orderShots(demoShots, people, o).order).toEqual(a.order);
    const rest = a.order.slice(3);
    const flags = rest.map((k) => has(k, [someEarly[1]!]));
    expect(flags.slice(flags.indexOf(false)).every((f) => !f)).toBe(true);
  });

  it('finishes an early person sooner than without the priority', () => {
    const lastAt = (order: string[], id: string) => Math.max(...order.map((k, i) => (has(k, [id]) ? i : -1)));
    const id = someEarly[0]!;
    const plain = orderShots(demoShots, people, {});
    const early = orderShots(demoShots, people, { priorities: { [id]: 'early' } });
    expect(lastAt(early.order, id)).toBeLessThanOrEqual(lastAt(plain.order, id));
    expect(early.steps.some((s) => s.doneForDay.includes(id))).toBe(true);
  });

  it('does nothing for people not in any shot, and for an empty map', () => {
    expect(orderShots(demoShots, people, { priorities: { nobody: 'early' } }).order).toEqual(orderShots(demoShots, people).order);
    expect(orderShots(demoShots, people, { priorities: {} }).order).toEqual(orderShots(demoShots, people).order);
  });

  it('with an early and a late person, early-only shots lead, late-only shots trail, mixed ones sit between', () => {
    const [e, l] = [someEarly[0]!, someLate[0]!];
    const r = orderShots(demoShots, people, { priorities: { [e]: 'early', [l]: 'late' } });
    const tier = (k: string) => (has(k, [e]) && !has(k, [l]) ? 0 : has(k, [l]) && !has(k, [e]) ? 2 : 1);
    const tiers = r.order.map(tier);
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
  });

  it('property: a permutation, prefix kept, tiers in order, on random small shoots', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const shotsArb = fc
      .uniqueArray(fc.subarray(ids, { minLength: 1 }), { minLength: 2, maxLength: 12, selector: (x) => x.join() })
      .map((lists) => lists.map((l, i) => shot(`s${i}`, ...l)));
    const prioArb = fc.dictionary(fc.constantFrom(...ids), fc.constantFrom('early' as const, 'late' as const));
    fc.assert(
      fc.property(shotsArb, prioArb, fc.nat(3), fc.boolean(), (shots, priorities, p, kids) => {
        const fixedPrefix = shots.slice(0, Math.min(p, shots.length - 1)).map((s) => s.key).reverse();
        const r = orderShots(shots, [], { priorities, fixedPrefix, kidsFirst: kids, releaseOlderEarly: kids });
        expect([...r.order].sort()).toEqual(shots.map((s) => s.key).sort());
        expect(r.order.slice(0, fixedPrefix.length)).toEqual(fixedPrefix);
        const m = byKey(shots);
        const kind = (k: string) => {
          const ps = m.get(k)!.peopleIds;
          const e = ps.some((id) => priorities[id] === 'early');
          const l = ps.some((id) => priorities[id] === 'late');
          return e && !l ? 0 : l && !e ? 2 : 1;
        };
        const tiers = r.order.slice(fixedPrefix.length).map(kind);
        expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
        // So, with no shot mixing early and late people: early shots precede all non-early, late shots follow all non-late.
        const mixed = r.order.some((k) => m.get(k)!.peopleIds.some((id) => priorities[id] === 'early') && m.get(k)!.peopleIds.some((id) => priorities[id] === 'late'));
        if (!mixed) {
          const rest = r.order.slice(fixedPrefix.length);
          const isE = rest.map((k) => m.get(k)!.peopleIds.some((id) => priorities[id] === 'early'));
          expect(isE.slice(isE.indexOf(false) < 0 ? isE.length : isE.indexOf(false)).every((f) => !f)).toBe(true);
          const isL = rest.map((k) => m.get(k)!.peopleIds.some((id) => priorities[id] === 'late'));
          const firstL = isL.indexOf(true);
          expect(firstL < 0 || isL.slice(firstL).every((f) => f)).toBe(true);
        }
        // Deterministic.
        expect(orderShots(shots, [], { priorities, fixedPrefix, kidsFirst: kids, releaseOlderEarly: kids }).order).toEqual(r.order);
      }),
    );
  });
});

describe('orderShots everyoneFirst (O9)', () => {
  const everyoneKeys = everyoneShotKeys(demoShots);
  const everyoneBySize = [...everyoneKeys].sort((a, b) => {
    const m = byKey(demoShots);
    return m.get(b)!.peopleIds.length + m.get(b)!.extraIds.length - (m.get(a)!.peopleIds.length + m.get(a)!.extraIds.length);
  });

  it('opens the shoot with the full group, then the no-partners full group, largest first', () => {
    expect(everyoneKeys.size).toBeGreaterThanOrEqual(2);
    const r = orderShots(demoShots, DEMO_PEOPLE, { everyoneFirst: true });
    const first = r.order.slice(0, everyoneKeys.size);
    expect(new Set(first)).toEqual(everyoneKeys);
    expect(demoShots.find((s) => s.key === r.order[0])!.templateIds).toContain('fullGroup');
    const size = (k: string) => byKey(demoShots).get(k)!.peopleIds.length + byKey(demoShots).get(k)!.extraIds.length;
    expect(first.map(size)).toEqual([...first.map(size)].sort((a, b) => b - a));
    expect(r.order.slice(0, 2).map((k) => demoShots.find((s) => s.key === k)!.templateIds)).toEqual(
      expect.arrayContaining([expect.arrayContaining(['fullGroup'])]),
    );
    expect(everyoneBySize.length).toBe(everyoneKeys.size);
  });

  it('is a permutation, and does nothing when off', () => {
    const on = orderShots(demoShots, DEMO_PEOPLE, { everyoneFirst: true });
    expect([...on.order].sort()).toEqual(demoShots.map((s) => s.key).sort());
    expect(orderShots(demoShots, DEMO_PEOPLE, { everyoneFirst: false }).order).toEqual(orderShots(demoShots, DEMO_PEOPLE).order);
  });

  it('keeps the fixed prefix, then the everyone shots', () => {
    const prefix = demoShots.filter((s) => !everyoneKeys.has(s.key)).slice(0, 2).map((s) => s.key);
    const r = orderShots(demoShots, DEMO_PEOPLE, { everyoneFirst: true, fixedPrefix: prefix });
    expect(r.order.slice(0, 2)).toEqual(prefix);
    expect(new Set(r.order.slice(2, 2 + everyoneKeys.size))).toEqual(everyoneKeys);
  });

  it('a full group with a Late person waits; the rest of the everyone shots still go first', () => {
    const people = [...new Set(demoShots.flatMap((s) => s.peopleIds))];
    const late = people[2]!;
    const r = orderShots(demoShots, DEMO_PEOPLE, { everyoneFirst: true, priorities: { [late]: 'late' } });
    const withLate = (k: string) => byKey(demoShots).get(k)!.peopleIds.includes(late);
    const waiting = [...everyoneKeys].filter(withLate);
    expect(waiting.length).toBeGreaterThan(0);
    const firstBlock = r.order.slice(0, everyoneKeys.size - waiting.length);
    expect(firstBlock.every((k) => everyoneKeys.has(k) && !withLate(k))).toBe(true);
    // The waiting ones are after every shot without the late person.
    const lastNormal = Math.max(...r.order.map((k, i) => (withLate(k) ? -1 : i)));
    for (const k of waiting) expect(r.order.indexOf(k)).toBeGreaterThan(lastNormal);
  });

  it('property: with no Late people, every everyone shot comes before every other shot (and it is a permutation)', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const shotsArb = fc
      .uniqueArray(fc.subarray(ids, { minLength: 1 }), { minLength: 2, maxLength: 12, selector: (x) => x.join() })
      .map((lists) => lists.map((l, i) => ({ ...shot(`s${i}`, ...l), templateIds: i === 3 ? (['fullGroup'] as Shot['templateIds']) : [] })));
    fc.assert(
      fc.property(shotsArb, fc.dictionary(fc.constantFrom(...ids), fc.constant('early' as const)), fc.boolean(), (shots, priorities, kids) => {
        const r = orderShots(shots, [], { everyoneFirst: true, priorities, kidsFirst: kids, bigGroupFirst: kids });
        expect([...r.order].sort()).toEqual(shots.map((s) => s.key).sort());
        const every = everyoneShotKeys(shots);
        const flags = r.order.map((k) => every.has(k));
        expect(flags.slice(flags.indexOf(false) < 0 ? flags.length : flags.indexOf(false)).every((f) => !f)).toBe(true);
        expect(orderShots(shots, [], { everyoneFirst: true, priorities, kidsFirst: kids, bigGroupFirst: kids }).order).toEqual(r.order);
      }),
    );
  });
});
