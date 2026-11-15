import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildFamily } from './family';
import { generateShots } from './generate';
import { everyoneShotKeys, orderShots } from './order';
import { DEFAULT_TEMPLATE_IDS, TEMPLATE_IDS } from './templates';
import type { EnginePerson, Shot, TemplateId } from './types';

const person = (id: string, parentIds: string[], partnerIds: string[], grown: boolean): EnginePerson => ({ id, name: id, grown, parentIds, partnerIds });

/** Geep & Birdie; Matt & Carly with Myles, Graham; Robyn & James with Rose, Mabel. */
const FAMILY: EnginePerson[] = [
  person('geep', [], ['birdie'], true), person('birdie', [], ['geep'], true),
  person('matt', ['geep', 'birdie'], ['carly'], true), person('carly', [], ['matt'], true),
  person('robyn', ['geep', 'birdie'], ['james'], true), person('james', [], ['robyn'], true),
  person('myles', ['matt', 'carly'], [], false), person('graham', ['matt', 'carly'], [], false),
  person('rose', ['robyn', 'james'], [], false), person('mabel', ['robyn', 'james'], [], false),
];
const gen = (people: EnginePerson[], templateIds: TemplateId[] = TEMPLATE_IDS) =>
  generateShots({ people, extras: [], attendingIds: people.map((p) => p.id), templateIds }).shots;
const ON = { kidsFirst: true, releaseOlderEarly: true, bigGroupFirst: true, everyoneFirst: true, groupHouseholds: true };
const isRun = (xs: number[]) => xs.length === 0 || xs[xs.length - 1]! - xs[0]! === xs.length - 1;

describe('groupHouseholds: the example family', () => {
  const shots = gen(FAMILY, DEFAULT_TEMPLATE_IDS);
  const r = orderShots(shots, FAMILY, ON);
  const byKey = new Map(shots.map((s) => [s.key, s]));
  const ppl = (k: string) => byKey.get(k)!.peopleIds;
  const within = (k: string, ids: string[]) => ppl(k).every((id) => ids.includes(id));
  const MC = ['matt', 'carly', 'myles', 'graham'], RJ = ['robyn', 'james', 'rose', 'mabel'];
  const every = everyoneShotKeys(shots);
  const idx = (pred: (k: string) => boolean) => r.order.map((k, i) => (pred(k) ? i : -1)).filter((i) => i >= 0);

  it('orders everyone, grandparent shots, cross-household shots, then one contiguous block per household', () => {
    const g1 = idx((k) => !every.has(k) && ppl(k).some((id) => id === 'geep' || id === 'birdie'));
    const mc = idx((k) => within(k, MC));
    const rj = idx((k) => within(k, RJ));
    const cross = idx((k) => !every.has(k) && !g1.includes(r.order.indexOf(k)) && !within(k, MC) && !within(k, RJ));
    expect(idx((k) => every.has(k))).toEqual([0]);
    // Grandparents, + each household (2), + all grandkids, + all grown children
    expect(g1).toEqual([1, 2, 3, 4, 5]);
    expect(cross.length).toBeGreaterThan(0);
    expect(mc).toHaveLength(5); // Matt & Carly + kids, Matt & Carly, Myles & Graham, Myles, Graham
    expect(rj).toHaveLength(5); // Robyn & James + kids, Robyn & James, Rose & Mabel, Rose, Mabel
    expect(isRun(mc)).toBe(true);
    expect(isRun(rj)).toBe(true);
    expect(Math.max(...g1)).toBeLessThan(Math.min(...cross));
    expect(Math.max(...cross)).toBeLessThan(Math.min(mc[0]!, rj[0]!));
    expect(mc[mc.length - 1]! < rj[0]! || rj[rj.length - 1]! < mc[0]!).toBe(true);
    expect(g1.length + cross.length + mc.length + rj.length + 1).toBe(shots.length);
    // biggest first inside a block, solos last
    for (const block of [mc, rj]) {
      const sizes = block.map((i) => ppl(r.order[i]!).length);
      expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    }
    expect(ppl(r.order[mc[0]!]!)).toHaveLength(4);
  });
  it('is unchanged when switched off', () => {
    const off = orderShots(shots, FAMILY, { ...ON, groupHouseholds: false });
    expect(off).toEqual(orderShots(shots, FAMILY, { kidsFirst: true, releaseOlderEarly: true, bigGroupFirst: true, everyoneFirst: true }));
    expect(off.order).not.toEqual(r.order);
  });
  it('a Late person leaves the block and goes to the end; an Early person comes first', () => {
    const late = orderShots(shots, FAMILY, { ...ON, priorities: { myles: 'late' } });
    const withMyles = late.order.map((k, i) => (ppl(k).includes('myles') ? i : -1)).filter((i) => i >= 0);
    expect(withMyles[0]).toBeGreaterThan(late.order.length - withMyles.length - 1);
    expect(isRun(withMyles)).toBe(true);
    const early = orderShots(shots, FAMILY, { ...ON, priorities: { rose: 'early' } });
    const rose = early.order.map((k, i) => (ppl(k).includes('rose') && !every.has(k) ? i : -1)).filter((i) => i >= 0);
    const firstWithout = early.order.findIndex((k) => !ppl(k).includes('rose') && !every.has(k));
    expect(Math.max(...rose)).toBeLessThan(firstWithout);
  });
});

/** Random family: one top couple, 1-4 grown children (some with a partner), 0-3 kids each. */
const familyArb: fc.Arbitrary<EnginePerson[]> = fc
  .array(fc.record({ partner: fc.boolean(), kids: fc.integer({ min: 0, max: 3 }) }), { minLength: 1, maxLength: 4 })
  .map((units) => {
    const ppl: EnginePerson[] = [person('g1a', [], ['g1b'], true), person('g1b', [], ['g1a'], true)];
    units.forEach((u, i) => {
      const c = `c${i}`, cp = `cp${i}`;
      ppl.push(person(c, ['g1a', 'g1b'], u.partner ? [cp] : [], true));
      if (u.partner) ppl.push(person(cp, [], [c], true));
      for (let k = 0; k < u.kids; k++) ppl.push(person(`k${i}${k}`, u.partner ? [c, cp] : [c], [], false));
    });
    return ppl;
  });

function classify(people: EnginePerson[], shots: Shot[]) {
  const fam = buildFamily(people);
  const every = everyoneShotKeys(shots);
  const old = (s: Shot) => s.peopleIds.some((id) => fam.gen(id) === 1);
  const block = (s: Shot): number =>
    every.has(s.key) || old(s) ? -1 : fam.households.findIndex((h) => s.peopleIds.every((id) => h.memberIds.includes(id)));
  return { every, old, block };
}

describe('groupHouseholds properties (random families)', () => {
  it('blocks are contiguous, grandparent shots come first, it is a permutation and deterministic', () => {
    fc.assert(
      fc.property(familyArb, fc.boolean(), fc.boolean(), fc.boolean(), (people, kids, big, must) => {
        const shots = gen(people);
        const opts = { kidsFirst: kids, bigGroupFirst: big, mustHavesEarly: must, mustHaveKeys: shots.filter((_, i) => i % 5 === 0).map((s) => s.key), releaseOlderEarly: true, everyoneFirst: true, groupHouseholds: true };
        const r = orderShots(shots, people, opts);
        expect([...r.order].sort()).toEqual(shots.map((s) => s.key).sort());
        expect(orderShots(shots, people, opts).order).toEqual(r.order);
        const { every, old, block } = classify(people, shots);
        const m = new Map(shots.map((s) => [s.key, s]));
        const seq = r.order.map((k) => m.get(k)!);
        const blocks = new Map<number, number[]>();
        seq.forEach((s, i) => { const b = block(s); if (b >= 0) blocks.set(b, [...(blocks.get(b) ?? []), i]); });
        for (const at of blocks.values()) expect(isRun(at)).toBe(true);
        const lastOld = Math.max(-1, ...seq.map((s, i) => (!every.has(s.key) && old(s) ? i : -1)));
        const firstOther = seq.findIndex((s) => !every.has(s.key) && !old(s));
        if (firstOther >= 0) expect(lastOld).toBeLessThan(firstOther);
        const firstBlock = seq.findIndex((s) => block(s) >= 0);
        const lastCross = Math.max(-1, ...seq.map((s, i) => (!every.has(s.key) && !old(s) && block(s) < 0 ? i : -1)));
        if (firstBlock >= 0) expect(lastCross).toBeLessThan(firstBlock);
      }),
      { numRuns: 60 },
    );
  });

  it('keeps the fixed prefix', () => {
    fc.assert(
      fc.property(familyArb, fc.nat(6), (people, take) => {
        const shots = gen(people);
        const prefix = [...shots].reverse().slice(0, take).map((s) => s.key);
        const r = orderShots(shots, people, { ...ON, fixedPrefix: prefix });
        expect(r.order.slice(0, prefix.length)).toEqual(prefix);
        expect([...r.order].sort()).toEqual(shots.map((s) => s.key).sort());
      }),
      { numRuns: 40 },
    );
  });

  it('with priorities: Early-only shots stay ahead and Late-only shots stay last', () => {
    fc.assert(
      fc.property(familyArb, fc.array(fc.tuple(fc.nat(30), fc.boolean()), { maxLength: 4 }), (people, picks) => {
        const priorities: Record<string, 'early' | 'late'> = {};
        for (const [i, early] of picks) priorities[people[i % people.length]!.id] = early ? 'early' : 'late';
        const shots = gen(people);
        const r = orderShots(shots, people, { ...ON, priorities });
        expect([...r.order].sort()).toEqual(shots.map((s) => s.key).sort());
        const m = new Map(shots.map((s) => [s.key, s]));
        const every = everyoneShotKeys(shots);
        const rank = (k: string) => {
          const ids = m.get(k)!.peopleIds;
          const e = ids.some((id) => priorities[id] === 'early'), l = ids.some((id) => priorities[id] === 'late');
          return every.has(k) && !l ? 0 : e && !l ? 1 : l && !e ? 3 : 2;
        };
        const ranks = r.order.map(rank);
        for (let i = 1; i < ranks.length; i++) expect(ranks[i]!).toBeGreaterThanOrEqual(ranks[i - 1]!);
      }),
      { numRuns: 60 },
    );
  });
});
