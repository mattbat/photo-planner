import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEMO_ATTENDING, DEMO_EXTRAS, DEMO_PEOPLE } from './demoFamily';
import { generateShots, previewCounts } from './generate';
import { DEFAULT_TEMPLATE_IDS, TEMPLATES, TEMPLATE_BY_ID, TEMPLATE_IDS } from './templates';
import type { EnginePerson, GenerateInput, Shot, ShotEdits, TemplateId } from './types';

const input = (over: Partial<GenerateInput> = {}): GenerateInput => ({
  people: DEMO_PEOPLE, extras: DEMO_EXTRAS, attendingIds: DEMO_ATTENDING, templateIds: TEMPLATE_IDS, ...over,
});
const only = (tid: TemplateId, over: Partial<GenerateInput> = {}) => generateShots(input({ templateIds: [tid], ...over }));
const sets = (shots: Shot[]) => shots.map((s) => [...s.peopleIds].sort().join(',')).sort();
const L = (...xs: string[]) => xs.sort().join(',');

describe('template metadata', () => {
  it('has every template once, with the Q12 defaults on', () => {
    expect(new Set(TEMPLATE_IDS).size).toBe(TEMPLATES.length);
    expect(DEFAULT_TEMPLATE_IDS.sort()).toEqual([
      'cousins', 'couples', 'fullGroup', 'grandparentsGrandkids', 'grownChildrenAll', 'households', 'parentsEachGrownHousehold', 'siblings', 'soloKids',
    ].sort());
    expect(TEMPLATE_BY_ID.grandparentGrandkid.defaultOn).toBe(false);
    expect(TEMPLATE_BY_ID.parentChild.defaultOn).toBe(false);
  });
});

describe('every template on the demo family', () => {
  it('fullGroup includes extras that join it', () => {
    const r = only('fullGroup');
    expect(r.shots).toHaveLength(1);
    expect(r.shots[0]!.peopleIds).toHaveLength(18);
    expect(r.shots[0]!.extraIds).toEqual(['biscuit', 'pat']);
    expect(r.shots[0]!.name).toBe('Everyone');
    expect(r.shots[0]!.groupLabel).toBe('Everyone');
  });
  it('fullGroupNoPartners drops people who married in', () => {
    const [s] = only('fullGroupNoPartners').shots;
    expect(s!.peopleIds).toHaveLength(16);
    expect(s!.peopleIds).not.toContain('theo');
    expect(s!.peopleIds).not.toContain('carlos');
    expect(s!.extraIds).toEqual([]);
  });
  it('generations', () => {
    const r = only('generations');
    expect(sets(r.shots)).toEqual([
      L('ruth', 'frank', 'lena', 'omar'),
      L('mike', 'sarah', 'dan', 'jen', 'maya'),
      L('emma', 'noah', 'lily', 'ava', 'ben', 'mia'),
    ].sort());
    expect(r.shots.map((s) => s.name)).toEqual(['Grandparents', "Grandparents' children", 'All the grandkids']);
  });
  it('generationsWithPartners adds in-laws; great-grandkid alone is not a shot', () => {
    const r = only('generationsWithPartners');
    expect(sets(r.shots)).toContain(L('mike', 'sarah', 'dan', 'jen', 'maya', 'carlos'));
    expect(sets(r.shots)).toContain(L('emma', 'theo', 'noah', 'lily', 'ava', 'ben', 'mia'));
    expect(r.shots).toHaveLength(3);
  });
  it('grandparentsChildren per top couple and for all', () => {
    expect(sets(only('grandparentsChildren').shots)).toEqual([
      L('ruth', 'frank', 'mike', 'sarah', 'dan'),
      L('lena', 'omar', 'jen', 'maya'),
      L('ruth', 'frank', 'lena', 'omar', 'mike', 'sarah', 'dan', 'jen', 'maya'),
    ].sort());
  });
  it('grandparentsGrandkids / +great', () => {
    const gk = only('grandparentsGrandkids');
    expect(gk.shots.map((s) => s.name)).toEqual(['Ruth & Frank + all their grandkids', 'Lena & Omar + all their grandkids', 'All grandparents + all grandkids']);
    expect(sets(gk.shots)).toContain(L('lena', 'omar', 'emma', 'noah', 'lily', 'mia'));
    const great = only('grandparentsGrandkidsGreat');
    expect(sets(great.shots)).toContain(L('ruth', 'frank', 'emma', 'noah', 'ava', 'ben', 'zoe'));
    expect(great.shots).toHaveLength(3);
  });
  it('siblings', () => {
    expect(sets(only('siblings').shots)).toEqual([
      L('mike', 'sarah', 'dan'), L('jen', 'maya'), L('emma', 'noah', 'lily'), L('ava', 'ben'),
    ].sort());
  });
  it('sonsDaughters', () => {
    const r = only('sonsDaughters');
    expect(sets(r.shots)).toEqual([L('mike', 'dan'), L('jen', 'maya'), L('emma', 'lily')].sort());
    expect(r.shots.map((s) => s.name).sort()).toEqual(["Lena & Omar's daughters", "Mike & Jen's daughters", "Ruth & Frank's sons"]);
  });
  it('grandsonsGranddaughters', () => {
    expect(sets(only('grandsonsGranddaughters').shots)).toEqual([
      L('noah', 'ben'), L('emma', 'ava'), L('emma', 'lily', 'mia'), L('ava', 'emma', 'lily', 'mia'),
    ].sort());
  });
  it('cousins span branches', () => {
    expect(sets(only('cousins').shots)).toEqual([L('ava', 'ben', 'emma', 'noah'), L('emma', 'lily', 'mia', 'noah'), L('ava', 'ben', 'emma', 'lily', 'mia', 'noah')].sort());
  });
  it('branches share an id and merge the two ways into one family', () => {
    const r = only('branches');
    expect(r.shots.map((s) => s.name).sort()).toEqual(["Maya's family", "Mike & Jen's family", "Sarah's family"]);
    expect(r.shots.find((s) => s.name.startsWith('Mike'))!.branchId).toBe('branch:mike');
    expect(r.shots.find((s) => s.name.startsWith('Mike'))!.peopleIds).toHaveLength(7);
  });
  it('grandparentsBranches', () => {
    const r = only('grandparentsBranches');
    expect(r.shots.map((s) => s.name)).toContain("Ruth & Frank + Lena & Omar + Mike & Jen's family");
    expect(r.shots.map((s) => s.name)).toContain("Ruth & Frank + Sarah's family");
    expect(sets(r.shots)).toContain(L('ruth', 'frank', 'sarah', 'ava', 'ben'));
  });
  it('households: grown kids are their own households; dog joins its owners', () => {
    const r = only('households');
    expect(sets(r.shots)).toEqual([
      L('ruth', 'frank'), L('lena', 'omar'), L('mike', 'jen', 'noah', 'lily'), L('sarah', 'ava', 'ben'),
      L('maya', 'mia'), L('carlos', 'mia'), L('emma', 'theo', 'zoe'),
    ].sort());
    expect(r.shots.find((s) => s.peopleIds.includes('noah'))!.extraIds).toEqual(['biscuit']);
    expect(r.shots.find((s) => s.peopleIds.includes('ava'))!.extraIds).toEqual([]);
  });
  it('couples (separated pair is not a couple)', () => {
    const r = only('couples');
    expect(sets(r.shots)).toEqual([L('ruth', 'frank'), L('lena', 'omar'), L('mike', 'jen'), L('emma', 'theo')].sort());
    expect(r.shots.map((s) => s.name)).toEqual(['Ruth & Frank', 'Lena & Omar', 'Mike & Jen', 'Emma & Theo']);
  });
  it('parentChildren', () => {
    const r = only('parentChildren');
    expect(sets(r.shots)).toContain(L('mike', 'emma', 'noah'));
    expect(sets(r.shots)).toContain(L('jen', 'emma', 'noah', 'lily'));
    expect(r.shots.find((s) => s.peopleIds.includes('theo'))!.name).toBe('Theo & Zoe');
    expect(r.shots.find((s) => s.peopleIds.includes('lily'))!.name).toBe('Jen & the kids');
  });
  it('childKids', () => {
    const r = only('childKids');
    expect(sets(r.shots)).toContain(L('emma', 'noah'));
    expect(sets(r.shots)).toContain(L('emma', 'noah', 'lily'));
    expect(r.shots.map((s) => s.name)).toContain("Mike's kids");
  });
  it('grandparentGrandkid', () => {
    const r = only('grandparentGrandkid');
    expect(r.shots).toHaveLength(18);
    expect(sets(r.shots)).toContain(L('ruth', 'zoe') === '' ? '' : L('mike', 'zoe'));
  });
  it('parentChild', () => {
    const r = only('parentChild');
    expect(r.shots).toHaveLength(21);
    expect(r.shots[0]!.name).toBe('Ruth & Mike');
  });
  it('grandmaGranddaughters', () => {
    const r = only('grandmaGranddaughters');
    expect(r.shots.map((s) => s.name)).toEqual(['Ruth with the granddaughters', 'Frank with the grandsons', 'Lena with the granddaughters']);
    const noSex = DEMO_PEOPLE.map((p) => ({ ...p, sex: undefined }));
    expect(only('grandmaGranddaughters', { people: noSex }).shots).toEqual([]);
  });
  it('solo portraits: everyone / kids / adults', () => {
    expect(only('soloEveryone').shots).toHaveLength(18);
    expect(sets(only('soloKids').shots)).toEqual(['ava', 'ben', 'lily', 'mia', 'noah', 'zoe']);
    expect(only('soloAdults').shots).toHaveLength(12);
    expect(only('soloKids').shots[0]!.name).toBe('Noah solo');
  });
  it('grown children templates', () => {
    expect(sets(only('grownChildrenAll').shots)).toEqual([L('ruth', 'frank', 'mike', 'sarah', 'dan'), L('lena', 'omar', 'jen', 'maya')].sort());
    expect(only('parentsEachGrownChild').shots).toHaveLength(6);
    expect(sets(only('parentsEachGrownChild').shots)).toContain(L('ruth', 'frank', 'dan'));
    const hh = only('parentsEachGrownHousehold');
    expect(hh.shots.map((s) => s.name)).toContain('Mike & Jen + Emma & Theo + Zoe');
    expect(sets(hh.shots)).toContain(L('ruth', 'frank', 'mike', 'jen', 'noah', 'lily'));
    expect(sets(hh.shots)).not.toContain(L('ruth', 'frank', 'dan')); // Dan has no household of his own
    const alone = only('grownHouseholdAlone');
    expect(sets(alone.shots)).toEqual([L('mike', 'jen', 'noah', 'lily'), L('sarah', 'ava', 'ben'), L('maya', 'mia'), L('emma', 'theo', 'zoe')].sort());
  });
});

describe('single top couple naming', () => {
  const people: EnginePerson[] = DEMO_PEOPLE.filter((p) => !['lena', 'omar', 'maya', 'carlos', 'mia'].includes(p.id)).map((p) =>
    p.id === 'jen' ? { ...p, parentIds: [] } : p);
  const r = (tid: TemplateId) => generateShots({ people, extras: [], attendingIds: people.map((p) => p.id), templateIds: [tid], familyName: 'Carter' });
  it('says Grandparents', () => {
    expect(r('grandparentsGrandkids').shots[0]!.name).toBe('Grandparents + all grandkids');
    expect(r('grandparentsBranches').shots.map((s) => s.name)).toContain("Grandparents + Mike's family");
    expect(r('couples').shots[0]!.name).toBe('Grandparents');
    expect(r('cousins').shots.map((s) => s.name)).toContain('Carter cousins');
    expect(r('sonsDaughters').shots[0]!.name).toBe('All the sons');
    expect(r('grandsonsGranddaughters').shots.map((s) => s.name)).toContain('All the grandsons');
    expect(r('grownChildrenAll').shots[0]!.name).toBe('Grandparents + all grown children');
    expect(r('fullGroup').shots[0]!.peopleIds).toHaveLength(13);
  });
  it('cousins without a family name; second cousins', () => {
    const rows = generateShots({ people, extras: [], attendingIds: people.map((p) => p.id), templateIds: ['cousins'] });
    expect(rows.shots[0]!.name).toBe('Cousins');
    const deep: EnginePerson[] = [
      ...people,
      { id: 'k1', name: 'K1', grown: true, parentIds: ['noah'], partnerIds: [] },
      { id: 'k2', name: 'K2', grown: true, parentIds: ['ava'], partnerIds: [] },
    ];
    const names = generateShots({ people: deep, extras: [], attendingIds: deep.map((p) => p.id), templateIds: ['cousins'] }).shots.map((s) => s.name);
    expect(names).toContain('Second cousins');
  });
});

describe('E1-E3: sizes, merging, attendance', () => {
  it('merges duplicate sets, naming by the more specific template and listing both', () => {
    const r = generateShots(input({ templateIds: ['households', 'couples'] }));
    const s = r.shots.find((x) => x.key === 'couples:frank,ruth')!;
    expect(s.templateIds).toEqual(['households', 'couples']);
    expect(s.name).toBe('Ruth & Frank');
    expect(r.counts.households).toBe(7);
    expect(r.counts.couples).toBe(4);
    expect(r.counts.fullGroup).toBe(0);
  });
  it('a merged shot has one key and appears once', () => {
    const r = generateShots(input());
    expect(new Set(r.shots.map((s) => s.key)).size).toBe(r.shots.length);
    const sigs = r.shots.map((s) => [...s.peopleIds].sort().join() + '|' + [...s.extraIds].sort().join());
    expect(new Set(sigs).size).toBe(r.shots.length);
  });
  it('shots only use attending people and absent people drop out', () => {
    const attendingIds = DEMO_ATTENDING.filter((x) => !['zoe', 'theo'].includes(x));
    const r = generateShots(input({ attendingIds }));
    for (const s of r.shots) for (const id of s.peopleIds) expect(attendingIds).toContain(id);
    expect(r.shots.find((s) => s.key.startsWith('fullGroup'))!.peopleIds).toHaveLength(16);
    expect(r.shots.some((s) => s.key === 'couples:emma,theo')).toBe(false);
  });
  it('flags shots that became meaningless instead of silently dropping them', () => {
    const attendingIds = DEMO_ATTENDING.filter((x) => x !== 'mike');
    const r = generateShots(input({ templateIds: ['sonsDaughters', 'soloEveryone'], attendingIds }));
    expect(r.flagged).toHaveLength(1);
    expect(r.flagged[0]!.key).toBe('sonsDaughters:dan,mike');
    expect(r.flagged[0]!.reason).toMatch(/only 1 of 2/);
    expect(r.shots.some((s) => s.key.includes('mike'))).toBe(false); // absent solo is simply gone, not flagged
  });
  it('shots that are never possible are not produced or flagged', () => {
    const r = generateShots(input({ templateIds: ['sonsDaughters'], people: DEMO_PEOPLE.map((p) => ({ ...p, sex: undefined })) }));
    expect(r.shots).toEqual([]);
    expect(r.flagged).toEqual([]);
  });
  it('extras only join shots whose template they list, and owners must be present', () => {
    const r = generateShots(input({ templateIds: ['households', 'fullGroup'], attendingIds: DEMO_ATTENDING.filter((x) => !['mike', 'jen'].includes(x)) }));
    expect(r.shots.filter((s) => s.extraIds.includes('biscuit')).map((s) => s.templateIds[0])).toEqual(['fullGroup']);
    const r2 = generateShots(input({ templateIds: ['couples'] }));
    expect(r2.shots.every((s) => s.extraIds.length === 0)).toBe(true);
    const r3 = generateShots(input({ templateIds: ['fullGroup'], attendingIds: DEMO_ATTENDING.filter((x) => x !== 'pat') }));
    expect(r3.shots[0]!.extraIds).toEqual(['biscuit']);
  });
  it('sets branch ids on shots that sit inside one branch', () => {
    const r = generateShots(input({ templateIds: ['couples', 'siblings'] }));
    expect(r.shots.find((s) => s.key === 'couples:jen,mike')!.branchId).toBe('branch:mike');
    expect(r.shots.find((s) => s.key === 'couples:frank,ruth')!.branchId).toBeUndefined();
  });
});

describe('E5 preview counts', () => {
  it('reports standalone and added counts', () => {
    const p = previewCounts(input({ templateIds: ['households'] }));
    expect(p.grandparentGrandkid.standalone).toBe(18);
    expect(p.households).toEqual({ standalone: 7, added: 0 });
    expect(p.couples.standalone).toBe(4);
    expect(p.couples.added).toBe(2); // Ruth & Frank and Lena & Omar already exist as households; Mike & Jen and Emma & Theo (without kids) are new
  });
});

describe('E6 edits survive regeneration', () => {
  const base = input({ templateIds: DEFAULT_TEMPLATE_IDS });
  const first = generateShots(base);
  const removedKey = first.shots.find((s) => s.name === 'Ruth & Frank')!.key;
  const edits: ShotEdits = {
    removed: [removedKey],
    renamed: { 'couples:jen,mike': 'The Mikes' },
    custom: [{ key: 'custom:sarah+pat', name: 'Sarah + her friend', peopleIds: ['sarah'], extraIds: ['pat'], templateIds: [], groupLabel: 'Custom', custom: true }],
  };
  it('applies removal, rename, custom', () => {
    const r = generateShots({ ...base, edits });
    expect(r.shots.some((s) => s.key === removedKey)).toBe(false);
    expect(r.shots.find((s) => s.key === 'couples:jen,mike')!.name).toBe('The Mikes');
    const c = r.shots.find((s) => s.key === 'custom:sarah+pat')!;
    expect(c).toMatchObject({ custom: true, groupLabel: 'Custom', peopleIds: ['sarah'], extraIds: ['pat'] });
    expect(r.shots.length).toBe(first.shots.length); // one removed, one added
  });
  it('keeps edits after a baby is added and another template change', () => {
    const baby: EnginePerson = { id: 'baby', name: 'Baby Brandt', grown: false, parentIds: ['emma', 'theo'], partnerIds: [], sex: 'male' };
    const r = generateShots({ ...base, people: [...DEMO_PEOPLE, baby], attendingIds: [...DEMO_ATTENDING, 'baby'], edits });
    expect(r.shots.some((s) => s.key === removedKey)).toBe(false);
    expect(r.shots.find((s) => s.key === 'couples:jen,mike')!.name).toBe('The Mikes');
    expect(r.shots.some((s) => s.custom)).toBe(true);
    expect(r.shots.find((s) => s.key.startsWith('households') && s.peopleIds.includes('baby'))!.peopleIds).toContain('zoe');
  });
  it('removed stays removed even when another template now merges into it', () => {
    const r = generateShots({ ...base, templateIds: ['households', 'couples'], edits: { removed: [removedKey], renamed: {}, custom: [] } });
    expect(r.shots.some((s) => s.peopleIds.join() === 'ruth,frank')).toBe(false);
    expect(r.flagged).toEqual([]);
  });
  it('renames survive when the shot is now named by a different template', () => {
    const r = generateShots({ ...base, templateIds: ['households'], edits: { removed: [], renamed: { 'couples:frank,ruth': 'The grandparents' }, custom: [] } });
    expect(r.shots.find((s) => s.peopleIds.join() === 'ruth,frank')!.name).toBe('The grandparents');
  });
  it('a custom shot equal to a generated one wins the name; absent people are dropped; empty ones are flagged', () => {
    const r = generateShots({
      ...base, attendingIds: DEMO_ATTENDING.filter((x) => x !== 'noah'),
      edits: { removed: [], renamed: {}, custom: [
        { key: 'custom:c1', name: 'Mom and Dad', peopleIds: ['ruth', 'frank'], extraIds: [], templateIds: [], groupLabel: 'Custom', custom: true },
        { key: 'custom:c2', name: 'Noah alone', peopleIds: ['noah'], extraIds: [], templateIds: [], groupLabel: 'Custom', custom: true },
        { key: 'custom:c3', name: 'Mike and Noah', peopleIds: ['mike', 'noah'], extraIds: [], templateIds: [], groupLabel: 'Custom', custom: true, branchId: 'branch:mike' },
        { key: 'custom:c4', name: 'Sarah and Ava', peopleIds: ['sarah', 'ava'], extraIds: [], templateIds: [], groupLabel: 'Custom', custom: true },
      ] },
    });
    const c1 = r.shots.find((s) => s.key === 'custom:c1')!;
    expect(c1).toMatchObject({ name: 'Mom and Dad', custom: true });
    expect(c1.templateIds).toContain('couples');
    expect(r.shots.some((s) => s.key === 'couples:frank,ruth')).toBe(false);
    expect(r.flagged.map((f) => f.key)).toContain('custom:c2');
    expect(r.shots.find((s) => s.key === 'custom:c3')!.peopleIds).toEqual(['mike']);
    expect(r.shots.find((s) => s.key === 'custom:c3')!.branchId).toBe('branch:mike');
  });
  it('removing a custom shot drops it', () => {
    const r = generateShots({ ...base, edits: { ...edits, removed: ['custom:sarah+pat'] } });
    expect(r.shots.some((s) => s.custom)).toBe(false);
  });
});

describe('E7 determinism', () => {
  it('gives the same list twice, and the order does not depend on object identity', () => {
    const a = generateShots(input());
    const b = generateShots(JSON.parse(JSON.stringify(input())));
    expect(b).toEqual(a);
  });
  it('lists shots in template order', () => {
    const r = generateShots(input({ templateIds: ['soloKids', 'fullGroup', 'couples'] }));
    expect(r.shots[0]!.key.startsWith('fullGroup')).toBe(true);
    expect(r.shots[r.shots.length - 1]!.key.startsWith('soloKids')).toBe(true);
  });
});

/* ---- property tests ---- */
const familyArb = fc.integer({ min: 2, max: 14 }).chain((n) =>
  fc.tuple(
    fc.array(fc.tuple(fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 2 })), { minLength: n, maxLength: n }),
    fc.array(fc.tuple(fc.integer({ min: 0, max: n - 1 }), fc.integer({ min: 0, max: n - 1 })), { maxLength: 4 }),
    fc.array(fc.constantFrom('male', 'female', undefined), { minLength: n, maxLength: n }),
    fc.array(fc.boolean(), { minLength: n, maxLength: n }),
  ).map(([parents, pairs, sexes, grownArr]) => {
    const people: EnginePerson[] = parents.map(([a, b, k], i) => {
      const parentIds: string[] = [];
      if (i > 0 && k >= 1) parentIds.push(`p${a % i}`);
      if (i > 1 && k === 2 && b % i !== a % i) parentIds.push(`p${b % i}`);
      return { id: `p${i}`, name: `Person${i}`, sex: sexes[i], grown: grownArr[i] ?? false, parentIds, partnerIds: [] };
    });
    for (const [x, y] of pairs) {
      if (x === y) continue;
      const px = people[x], py = people[y];
      if (px!.parentIds.includes(py!.id) || py!.parentIds.includes(px!.id)) continue;
      if (!px!.partnerIds.includes(py!.id)) { px!.partnerIds.push(py!.id); py!.partnerIds.push(px!.id); }
    }
    return people;
  }));

describe('properties', () => {
  it('every shot only has attending people; no duplicate sets; sizes respected; keys unique', () => {
    fc.assert(
      fc.property(familyArb, fc.array(fc.boolean(), { minLength: 14, maxLength: 14 }), fc.subarray(TEMPLATE_IDS), (people, att, tids) => {
        const attendingIds = people.filter((_, i) => att[i]).map((p) => p.id);
        const r = generateShots({ people, extras: [], attendingIds, templateIds: tids });
        const sigs = new Set<string>();
        const keys = new Set<string>();
        for (const s of r.shots) {
          for (const id of s.peopleIds) expect(attendingIds).toContain(id);
          const sig = [...s.peopleIds].sort().join();
          expect(sigs.has(sig)).toBe(false);
          sigs.add(sig);
          expect(keys.has(s.key)).toBe(false);
          keys.add(s.key);
          for (const t of s.templateIds) expect(s.peopleIds.length).toBeGreaterThanOrEqual(TEMPLATE_BY_ID[t].minSize);
          expect(s.peopleIds.length).toBeGreaterThan(0);
        }
        // deterministic
        expect(generateShots({ people, extras: [], attendingIds, templateIds: tids })).toEqual(r);
      }),
      { numRuns: 150 },
    );
  });
  it('removed shots never come back; unrelated edits do not change the rest', () => {
    fc.assert(
      fc.property(familyArb, fc.nat(30), (people, pick) => {
        const base: GenerateInput = { people, extras: [], attendingIds: people.map((p) => p.id), templateIds: TEMPLATE_IDS };
        const r = generateShots(base);
        if (!r.shots.length) return;
        const victim = r.shots[pick % r.shots.length];
        const r2 = generateShots({ ...base, edits: { removed: [victim!.key], renamed: {}, custom: [] } });
        expect(r2.shots.map((s) => s.key)).toEqual(r.shots.filter((s) => s !== victim).map((s) => s.key));
      }),
      { numRuns: 80 },
    );
  });
});
