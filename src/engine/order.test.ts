import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEMO_ATTENDING, DEMO_EXTRAS, DEMO_PEOPLE } from './demoFamily';
import { generateShots } from './generate';
import { DEFAULT_MINUTES_BY_SIZE, minutesForSize, orderShots, type OrderOptions, type OrderResult } from './order';
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
