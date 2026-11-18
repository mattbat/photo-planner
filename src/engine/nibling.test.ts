import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildFamily } from './family';
import { generateShots } from './generate';
import { DEFAULT_TEMPLATE_IDS, TEMPLATE_BY_ID } from './templates';
import type { EnginePerson, TemplateId } from './types';

const person = (id: string, parentIds: string[], partnerIds: string[], grown: boolean): EnginePerson =>
  ({ id, name: id[0]!.toUpperCase() + id.slice(1), grown, parentIds, partnerIds });

/** Walt + June; Rosa (single), Ben + Priya (Leo, Ivy, Sam), Nora + Theo (Finn, Cal). */
const FAMILY: EnginePerson[] = [
  person('walt', [], ['june'], true), person('june', [], ['walt'], true),
  person('rosa', ['walt', 'june'], [], true),
  person('ben', ['walt', 'june'], ['priya'], true), person('priya', [], ['ben'], true),
  person('nora', ['walt', 'june'], ['theo'], true), person('theo', [], ['nora'], true),
  person('leo', ['ben', 'priya'], [], false), person('ivy', ['ben', 'priya'], [], false), person('sam', ['ben', 'priya'], [], false),
  person('finn', ['nora', 'theo'], [], false), person('cal', ['nora', 'theo'], [], false),
];
const ALL = FAMILY.map((p) => p.id);
const run = (tid: TemplateId, attending = ALL) => generateShots({ people: FAMILY, extras: [], attendingIds: attending, templateIds: [tid] });
const L = (...xs: string[]) => [...xs].sort().join(',');
const groups = (tid: TemplateId, attending = ALL) => run(tid, attending).shots.map((s) => L(...s.peopleIds)).sort();

describe('template metadata', () => {
  it('is off by default, in the right groups', () => {
    expect(DEFAULT_TEMPLATE_IDS).not.toContain('siblingPairs');
    expect(DEFAULT_TEMPLATE_IDS).not.toContain('auntUncleNiblings');
    expect(TEMPLATE_BY_ID.siblingPairs.group).toBe('Siblings');
    expect(TEMPLATE_BY_ID.auntUncleNiblings.group).toBe('Pairs');
  });
});

describe('siblingPairs', () => {
  it('makes one shot per pair in a set of three, and skips sets of two', () => {
    const r = run('siblingPairs');
    // Leo, Ivy and Sam are a set of three too; Finn and Cal are only two.
    expect(r.shots.map((s) => s.name)).toEqual(['Rosa & Ben', 'Rosa & Nora', 'Ben & Nora', 'Leo & Ivy', 'Leo & Sam', 'Ivy & Sam']);
    expect(r.shots.every((s) => s.groupLabel === 'Siblings')).toBe(true);
    expect(r.shots.some((s) => s.peopleIds.includes('finn'))).toBe(false);
    expect(r.flagged).toEqual([]);
  });
  it('only pairs the people who are attending, without flags', () => {
    const r = run('siblingPairs', ALL.filter((i) => i !== 'rosa'));
    expect(r.shots.map((s) => s.name)).toEqual(['Ben & Nora', 'Leo & Ivy', 'Leo & Sam', 'Ivy & Sam']);
    expect(r.flagged).toEqual([]);
    expect(run('siblingPairs', ['rosa', 'walt']).shots).toEqual([]);
  });
  it('merges with All siblings when the pair is the whole attending set of that template', () => {
    const r = generateShots({ people: FAMILY, extras: [], attendingIds: ALL.filter((i) => i !== 'rosa'), templateIds: ['siblings', 'siblingPairs'] });
    const pair = r.shots.filter((s) => L(...s.peopleIds) === L('ben', 'nora'));
    expect(pair).toHaveLength(1);
    expect(pair[0]!.templateIds).toEqual(['siblings', 'siblingPairs']);
  });
});

describe('auntUncleNiblings', () => {
  it('makes the all-niblings shot and one per sibling with kids', () => {
    expect(groups('auntUncleNiblings')).toEqual([
      L('rosa', 'leo', 'ivy', 'sam', 'finn', 'cal'),
      L('rosa', 'leo', 'ivy', 'sam'),
      L('rosa', 'finn', 'cal'),
      L('ben', 'finn', 'cal'),
      L('nora', 'leo', 'ivy', 'sam'),
    ].sort());
  });
  it('names the shots and files them under Pairs', () => {
    const r = run('auntUncleNiblings');
    expect(r.shots.map((s) => s.name).sort()).toEqual([
      "Ben + Nora's kids", "Nora + Ben's kids", "Rosa + Ben's kids", "Rosa + Nora's kids", 'Rosa + nieces and nephews',
    ].sort());
    expect(r.shots.every((s) => s.groupLabel === 'Pairs')).toBe(true);
  });
  it('never makes a partner who married in the aunt or uncle', () => {
    for (const s of run('auntUncleNiblings').shots) {
      expect(s.peopleIds).not.toContain('priya');
      expect(s.peopleIds).not.toContain('theo');
    }
  });
  it('merges to one shot when the aunt or uncle has only one sibling with kids', () => {
    const r = run('auntUncleNiblings', ALL.filter((i) => !['finn', 'cal'].includes(i)));
    expect(r.shots.filter((s) => s.peopleIds.includes('rosa')).map((s) => L(...s.peopleIds))).toEqual([L('rosa', 'leo', 'ivy', 'sam')]);
    expect(r.shots.find((s) => s.peopleIds.includes('rosa'))!.name).toBe("Rosa + Ben's kids");
  });
  it('skips shots where nobody besides the aunt or uncle attends, and absent aunts', () => {
    const r = run('auntUncleNiblings', ['rosa', 'ben', 'nora', 'leo']);
    expect(r.shots.map((s) => L(...s.peopleIds)).sort()).toEqual([L('rosa', 'leo'), L('nora', 'leo')].sort());
    expect(r.flagged).toEqual([]);
    expect(run('auntUncleNiblings', ALL.filter((i) => i !== 'rosa')).shots.some((s) => s.peopleIds.includes('rosa'))).toBe(false);
  });
});

describe('property tests on random families', () => {
  const arb = fc.record({
    n: fc.integer({ min: 2, max: 20 }),
    seeds: fc.array(fc.tuple(fc.nat(99), fc.nat(99), fc.integer({ min: 0, max: 2 })), { minLength: 20, maxLength: 20 }),
    marry: fc.array(fc.tuple(fc.nat(19), fc.nat(19)), { maxLength: 6 }),
    attend: fc.array(fc.boolean(), { minLength: 20, maxLength: 20 }),
  }).map(({ n, seeds, marry, attend }) => {
    const people: EnginePerson[] = Array.from({ length: n }, (_, i) => {
      const [a, b, k] = seeds[i]!;
      const parentIds: string[] = [];
      if (i > 0 && k >= 1) parentIds.push(`p${a % i}`);
      if (i > 1 && k >= 2 && b % i !== a % i) parentIds.push(`p${b % i}`);
      return { id: `p${i}`, name: `P${i}`, grown: false, parentIds, partnerIds: [] };
    });
    for (const [x, y] of marry) {
      const px = people[x % n]!, py = people[y % n]!;
      if (px === py || px.parentIds.includes(py.id) || py.parentIds.includes(px.id) || px.partnerIds.includes(py.id)) continue;
      px.partnerIds.push(py.id);
      py.partnerIds.push(px.id);
    }
    return { people, attending: people.filter((_, i) => attend[i]).map((p) => p.id) };
  });

  it('every siblingPairs shot is two attending siblings from a set of 3 or more', () => {
    fc.assert(fc.property(arb, ({ people, attending }) => {
      const fam = buildFamily(people);
      const r = generateShots({ people, extras: [], attendingIds: attending, templateIds: ['siblingPairs'] });
      for (const s of r.shots) {
        expect(s.peopleIds).toHaveLength(2);
        const [a, b] = s.peopleIds as [string, string];
        expect(attending).toContain(a);
        expect(attending).toContain(b);
        expect(fam.siblingSets.some((x) => x.ids.length >= 3 && x.ids.includes(a) && x.ids.includes(b))).toBe(true);
      }
      expect(r.flagged).toEqual([]);
    }), { numRuns: 150 });
  });

  it("every auntUncleNiblings shot is one attending aunt or uncle plus only their siblings' kids, never a partner who married in", () => {
    fc.assert(fc.property(arb, ({ people, attending }) => {
      const fam = buildFamily(people);
      const r = generateShots({ people, extras: [], attendingIds: attending, templateIds: ['auntUncleNiblings'] });
      for (const s of r.shots) {
        expect(s.peopleIds.length).toBeGreaterThanOrEqual(2);
        for (const id of s.peopleIds) {
          expect(attending).toContain(id);
          expect(fam.parents(id).length).toBeGreaterThan(0); // married-in partners have no parents in the tree
        }
        const nibling = (o: string, a: string) => {
          const sibs = new Set(fam.siblingSets.filter((x) => x.ids.includes(a)).flatMap((x) => x.ids).filter((x) => x !== a));
          return fam.parents(o).some((p) => sibs.has(p));
        };
        const aunts = s.peopleIds.filter((a) => s.peopleIds.filter((o) => o !== a).every((o) => nibling(o, a)));
        expect(aunts.length).toBeGreaterThanOrEqual(1);
      }
      expect(r.flagged).toEqual([]);
    }), { numRuns: 150 });
  });
});
