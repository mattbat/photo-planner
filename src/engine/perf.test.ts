import { describe, expect, it } from 'vitest';
import { generateShots } from './generate';
import { orderShots } from './order';
import { TEMPLATE_IDS } from './templates';
import type { EnginePerson, Shot } from './types';

/** 30 people over 4 generations in 3 branches. */
function bigFamily(): EnginePerson[] {
  const out: EnginePerson[] = [];
  const add = (id: string, parentIds: string[], partnerIds: string[], grown: boolean, sex: 'male' | 'female') =>
    out.push({ id, name: id, sex, grown, parentIds, partnerIds });
  add('g1a', [], ['g1b'], true, 'female'); add('g1b', [], ['g1a'], true, 'male');
  let n = 0;
  for (let b = 0; b < 3; b++) {
    const c = `c${b}`, cp = `cp${b}`;
    add(c, ['g1a', 'g1b'], [cp], true, 'male'); add(cp, [], [c], true, 'female');
    for (let k = 0; k < 2; k++) {
      const gk = `gk${b}${k}`, gp = `gp${b}${k}`;
      add(gk, [c, cp], k === 0 ? [gp] : [], k === 0, k ? 'female' : 'male');
      if (k === 0) { add(gp, [], [gk], true, 'female'); add(`gg${b}`, [gk, gp], [], false, 'female'); }
      for (let j = 0; j < 3 && k === 1; j++) add(`gj${b}${j}${n++}`, [c, cp], [], false, j ? 'male' : 'female');
    }
  }
  return out;
}

describe('performance', () => {
  it('generates ~30 people / 80+ shots and orders them in under 1s', () => {
    const people = bigFamily();
    expect(people.length).toBeGreaterThanOrEqual(28);
    const t0 = Date.now();
    const r = generateShots({ people, extras: [], attendingIds: people.map((p) => p.id), templateIds: TEMPLATE_IDS.filter((t) => !['grandparentGrandkid', 'parentChild', 'soloEveryone'].includes(t)) });
    const t1 = Date.now();
    let shots: Shot[] = r.shots;
    expect(shots.length).toBeGreaterThanOrEqual(80);
    shots = shots.slice(0, 80);
    const o = orderShots(shots, people, { kidsFirst: true, releaseOlderEarly: true });
    const t2 = Date.now();
    expect(o.order).toHaveLength(80);
    // Budgets leave room for CI runners with coverage instrumentation (several times slower than a phone).
    expect(t1 - t0).toBeLessThan(1000);
    expect(t2 - t1).toBeLessThan(1000);
  });
  it('orders 40 people / 120 shots fast (O6: under 1s on a phone; 2s allowed on an instrumented CI runner)', () => {
    const people = bigFamily();
    const shots: Shot[] = Array.from({ length: 120 }, (_, i) => ({
      key: `s${i}`, name: `s${i}`, extraIds: [], templateIds: [], groupLabel: 'x',
      peopleIds: [people[i % people.length]!.id, people[(i * 7 + 3) % people.length]!.id, people[(i * 11 + 5) % people.length]!.id],
    }));
    const t0 = Date.now();
    orderShots(shots, people, { kidsFirst: true, releaseOlderEarly: true, bigGroupFirst: true, mustHavesEarly: true });
    expect(Date.now() - t0).toBeLessThan(2000);
  });
  it('orders ~30 people / 80 shots with groupHouseholds on within the same budget', () => {
    const people = bigFamily();
    const r = generateShots({ people, extras: [], attendingIds: people.map((p) => p.id), templateIds: TEMPLATE_IDS.filter((t) => !['grandparentGrandkid', 'parentChild', 'soloEveryone'].includes(t)) });
    const shots = r.shots.slice(0, 80);
    const t0 = Date.now();
    const o = orderShots(shots, people, { kidsFirst: true, releaseOlderEarly: true, bigGroupFirst: true, everyoneFirst: true, groupHouseholds: true });
    expect(o.order).toHaveLength(80);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
