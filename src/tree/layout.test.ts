import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { layoutTree, coupleKey, CARD_W, CARD_H, type TreeLayout } from './layout';
import { fixtures, demoFamily } from './fixtures';
import type { TreePerson } from './types';

function overlaps(l: TreeLayout): [string, string][] {
  const bad: [string, string][] = [];
  for (let i = 0; i < l.nodes.length; i++) for (let j = i + 1; j < l.nodes.length; j++) {
    const a = l.nodes[i]!, b = l.nodes[j]!;
    if (a.x < b.x + CARD_W && b.x < a.x + CARD_W && a.y < b.y + CARD_H && b.y < a.y + CARD_H) bad.push([a.id, b.id]);
  }
  return bad;
}
const byId = (l: TreeLayout) => new Map(l.nodes.map((n) => [n.id, n]));

describe('layoutTree fixtures', () => {
  for (const [name, fam] of Object.entries(fixtures)) {
    it(`${name}: no overlaps, all placed once, inside canvas`, () => {
      const l = layoutTree(fam);
      expect(l.nodes).toHaveLength(fam.length);
      expect(new Set(l.nodes.map((n) => n.id)).size).toBe(fam.length);
      expect(overlaps(l)).toEqual([]);
      for (const n of l.nodes) {
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.x + CARD_W).toBeLessThanOrEqual(l.width);
        expect(n.y + CARD_H).toBeLessThanOrEqual(l.height);
      }
    });
    it(`${name}: children below parents, partners same row, deterministic`, () => {
      const l = layoutTree(fam), m = byId(l);
      for (const p of fam) for (const pid of p.parentIds) expect(m.get(p.id)!.y).toBeGreaterThan(m.get(pid)!.y);
      for (const c of l.couples) expect(m.get(c.aId)!.y).toBe(m.get(c.bId)!.y);
      expect(layoutTree(fam)).toEqual(l);
      expect(layoutTree([...fam])).toEqual(l);
    });
  }

  it('partners are adjacent in simple couples', () => {
    const l = layoutTree(demoFamily), m = byId(l);
    for (const [a, b] of [['harold', 'margaret'], ['ruth', 'tom'], ['noah', 'priya'], ['carla', 'omar']] as [string, string][]) {
      expect(Math.abs(m.get(a)!.x - m.get(b)!.x)).toBeLessThan(CARD_W + 40);
    }
    const c = l.couples.find((c) => c.aId === 'ruth' || c.bId === 'ruth')!;
    expect(c.x2).toBeGreaterThan(c.x1);
  });

  it('generation rows and branch colors', () => {
    const l = layoutTree(demoFamily), m = byId(l);
    expect(m.get('harold')!.generation).toBe(1);
    expect(m.get('luis')!.generation).toBe(1);
    expect(m.get('tom')!.generation).toBe(2);
    expect(m.get('omar')!.generation).toBe(2);
    expect(m.get('priya')!.generation).toBe(3);
    expect(m.get('noah')!.generation).toBe(3);
    expect(m.get('zoe')!.generation).toBe(4);
    const ys = new Map<number, number>();
    for (const n of l.nodes) { expect(ys.get(n.generation) ?? n.y).toBe(n.y); ys.set(n.generation, n.y); }
    expect(m.get('ruth')!.branchId).toBe('ruth');
    expect(m.get('tom')!.branchId).toBe('ruth');
    expect(m.get('zoe')!.branchId).toBe('ruth');
    expect(m.get('noah')!.colorIndex).toBe(m.get('ruth')!.colorIndex);
    expect(m.get('ben')!.colorIndex).not.toBe(m.get('ruth')!.colorIndex);
    expect(m.get('harold')!.branchId).toBeUndefined();
    expect(l.nodes.every((n) => n.colorIndex >= 0 && n.colorIndex < 8)).toBe(true);
  });

  it('married couple sits between both sets of grandparents', () => {
    const m = byId(layoutTree(demoFamily));
    const x = (id: string) => m.get(id)!.x;
    const lo = Math.min(x('harold'), x('luis')), hi = Math.max(x('harold'), x('luis'));
    expect(x('ruth')).toBeGreaterThanOrEqual(lo);
    expect(x('tom')).toBeLessThanOrEqual(hi + 400);
  });

  it('step-child links only to own parent; couples get couple keys', () => {
    const l = layoutTree(demoFamily);
    const max = l.childLinks.filter((c) => c.childId === 'max');
    expect(max).toHaveLength(1);
    expect(max[0]!.fromCoupleOrPersonId).toBe('tom');
    const mia = l.childLinks.find((c) => c.childId === 'mia')!;
    expect(mia.fromCoupleOrPersonId).toBe(coupleKey('tom', 'ruth'));
    const leo = l.childLinks.find((c) => c.childId === 'leo')!;
    expect(leo.fromCoupleOrPersonId).toBe('dana');
    for (const link of l.childLinks) expect(link.path.length).toBeGreaterThanOrEqual(2);
  });

  it('separated couples flagged, households found', () => {
    const l = layoutTree(demoFamily);
    expect(l.couples.find((c) => [c.aId, c.bId].includes('carl'))!.separated).toBe(true);
    expect(l.couples.find((c) => [c.aId, c.bId].includes('ruth'))!.separated).toBe(false);
    const hh = l.households.find((h) => h.ids.includes('ruth'))!;
    expect(hh.ids).toEqual(expect.arrayContaining(['ruth', 'tom', 'mia', 'eve', 'max']));
    expect(hh.ids).not.toContain('noah');
  });

  it('remarriage: ex left, new partner right, kids grouped', () => {
    const l = layoutTree(fixtures.remarriedFamily!), m = byId(l);
    expect(m.get('sam')!.x).toBeLessThan(m.get('pat')!.x);
    expect(m.get('pat')!.x).toBeLessThan(m.get('lee')!.x);
    expect(m.get('k1')!.x).toBeLessThan(m.get('k2')!.x);
  });

  it('handles empty, duplicates, unknown ids, cycles, 3-cycle partners', () => {
    expect(layoutTree([]).nodes).toEqual([]);
    const weird: TreePerson[] = [
      { id: 'a', name: 'A', grown: true, parentIds: ['b', 'zz', 'a'], partnerIds: ['c', 'nope'] },
      { id: 'b', name: 'B', grown: true, parentIds: ['a'], partnerIds: [] },
      { id: 'a', name: 'dup', grown: true, parentIds: [], partnerIds: [] },
      { id: 'c', name: 'C', grown: true, parentIds: [], partnerIds: ['d'] },
      { id: 'd', name: 'D', grown: true, parentIds: [], partnerIds: ['a'] },
      { id: 'e', name: 'E', grown: true, parentIds: [], partnerIds: ['a', 'c', 'd'] },
      { id: 'f', name: 'F', grown: false, parentIds: ['a', 'b', 'c'], partnerIds: [] },
    ];
    const l = layoutTree(weird);
    expect(l.nodes).toHaveLength(6);
    expect(overlaps(l)).toEqual([]);
  });

  it('couples with a person between them draw below the cards', () => {
    const l = layoutTree([
      { id: 'a', name: 'A', grown: true, parentIds: [], partnerIds: ['b', 'c'] },
      { id: 'b', name: 'B', grown: true, parentIds: [], partnerIds: ['a', 'c'] },
      { id: 'c', name: 'C', grown: true, parentIds: [], partnerIds: ['a', 'b'] },
      { id: 'k', name: 'K', grown: false, parentIds: ['a', 'c'], partnerIds: [] },
    ]);
    expect(l.couples).toHaveLength(3);
    expect(l.couples.some((c) => c.y > l.nodes[0]!.y + CARD_H)).toBe(true);
    expect(overlaps(l)).toEqual([]);
  });

  it('two-root families where the later root is in a different order and cousins marry', () => {
    const fam: TreePerson[] = [
      { id: 'g1', name: 'G1', grown: true, parentIds: [], partnerIds: ['g2'] },
      { id: 'g2', name: 'G2', grown: true, parentIds: [], partnerIds: ['g1'] },
      { id: 'h1', name: 'H1', grown: true, parentIds: [], partnerIds: ['h2'] },
      { id: 'h2', name: 'H2', grown: true, parentIds: [], partnerIds: ['h1'] },
      { id: 'x', name: 'X', grown: true, parentIds: ['h1', 'h2'], partnerIds: ['y'] },
      { id: 'y', name: 'Y', grown: true, parentIds: ['g1', 'g2'], partnerIds: ['x'] },
      { id: 'y2', name: 'Y2', grown: true, parentIds: ['g1', 'g2'], partnerIds: ['x2'] },
      { id: 'x2', name: 'X2', grown: true, parentIds: ['h1', 'h2'], partnerIds: ['y2'] },
      { id: 'q', name: 'Q', grown: false, parentIds: ['x', 'y'], partnerIds: [] },
      { id: 'q2', name: 'Q2', grown: false, parentIds: ['x2', 'y2'], partnerIds: [] },
    ];
    const l = layoutTree(fam);
    expect(overlaps(l)).toEqual([]);
    expect(l.nodes).toHaveLength(10);
  });

  it('30 people lay out in < 50ms', () => {
    const fam: TreePerson[] = [
      { id: 'r1', name: 'R1', grown: true, parentIds: [], partnerIds: ['r2'] },
      { id: 'r2', name: 'R2', grown: true, parentIds: [], partnerIds: ['r1'] },
    ];
    for (let i = 0; i < 4; i++) {
      fam.push({ id: `c${i}`, name: `C${i}`, grown: true, parentIds: ['r1', 'r2'], partnerIds: [`s${i}`] });
      fam.push({ id: `s${i}`, name: `S${i}`, grown: true, parentIds: [], partnerIds: [`c${i}`] });
      for (let k = 0; k < 3; k++) fam.push({ id: `k${i}${k}`, name: 'K', grown: false, parentIds: [`c${i}`, `s${i}`], partnerIds: [] });
    }
    fam.push(...Array.from({ length: 12 }, (_, i) => ({ id: `z${i}`, name: 'Z', grown: false, parentIds: [`c${i % 4}`], partnerIds: [] as string[] })));
    layoutTree(fam);
    const t = performance.now();
    layoutTree(fam);
    expect(performance.now() - t).toBeLessThan(50);
  });
});

// ---- property test ----
function buildFamily(picks: number[]): TreePerson[] {
  const people: TreePerson[] = [];
  const comp = new Map<string, number>();
  let nextComp = 0;
  const add = (p: Partial<TreePerson> & { id: string }, c?: number) => {
    people.push({ name: p.id, grown: true, parentIds: [], partnerIds: [], ...p });
    comp.set(p.id, c ?? nextComp++);
  };
  const partner = (a: TreePerson, b: TreePerson, sep: boolean) => {
    (sep ? (a.separatedPartnerIds ??= []) : a.partnerIds).push(b.id);
    (sep ? (b.separatedPartnerIds ??= []) : b.partnerIds).push(a.id);
  };
  const pick = (arr: TreePerson[], k: number) => arr[k % arr.length]!;
  add({ id: 'p0' }); add({ id: 'p1' }, 0); partner(people[0]!, people[1]!, false);
  for (let i = 0; i < picks.length; i++) {
    const k = picks[i]!, kind = k % 7, r = Math.floor(k / 7), id = `p${people.length}`;
    const free = people.filter((p) => p.partnerIds.length + (p.separatedPartnerIds?.length ?? 0) === 0);
    if (kind === 0 && free.length) { // married-in
      const a = pick(free, r); add({ id }, comp.get(a.id)); partner(a, people[people.length - 1]!, r % 5 === 0);
    } else if (kind === 6) { // new root couple (joined later by a marriage)
      add({ id }); add({ id: id + 'b' }, comp.get(id)); partner(people[people.length - 2]!, people[people.length - 1]!, false);
    } else if (kind === 1 && free.length > 1) { // marriage between two existing people of different branches
      const a = pick(free, r), b = pick(free, r * 7 + 3);
      if (comp.get(a.id) !== comp.get(b.id)) {
        partner(a, b, false);
        const from = comp.get(b.id)!, to = comp.get(a.id)!;
        for (const [pid, c] of comp) if (c === from) comp.set(pid, to);
      } else add({ id, parentIds: [a.id] }, comp.get(a.id));
    } else if (kind === 2) { // single parent
      const a = pick(people, r);
      add({ id, parentIds: [a.id], grown: r % 2 === 0 }, comp.get(a.id));
    } else { // child of a couple
      const a = pick(people, r), ps = a.partnerIds.length ? a.partnerIds : (a.separatedPartnerIds ?? []);
      const b = ps.length ? people.find((p) => p.id === ps[r % ps.length])! : undefined;
      add({ id, parentIds: b ? [a.id, b.id] : [a.id], grown: r % 3 === 0 }, comp.get(a.id));
    }
  }
  return people;
}

describe('property', () => {
  it('random families: no overlaps, everyone placed exactly once', () => {
    fc.assert(
      fc.property(fc.array(fc.nat(10000), { minLength: 0, maxLength: 28 }), (picks) => {
        const fam = buildFamily(picks);
        const l = layoutTree(fam);
        expect(l.nodes.map((n) => n.id).sort()).toEqual(fam.map((p) => p.id).sort());
        expect(overlaps(l)).toEqual([]);
        const m = byId(l);
        for (const p of fam) for (const pid of p.parentIds) expect(m.get(p.id)!.y).toBeGreaterThan(m.get(pid)!.y);
        for (const n of l.nodes) { expect(Number.isFinite(n.x)).toBe(true); expect(n.x).toBeGreaterThanOrEqual(0); }
        expect(layoutTree(fam)).toEqual(l);
      }),
      { numRuns: 300 },
    );
  });
});
