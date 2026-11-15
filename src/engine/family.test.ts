import { describe, expect, it } from 'vitest';
import { DEMO_PEOPLE } from './demoFamily';
import { buildFamily, describeRelationship, validateFamily } from './family';
import type { EnginePerson } from './types';

const fam = buildFamily(DEMO_PEOPLE);
const d = (a: string, b: string) => fam.describe(a, b);
const neutral: EnginePerson[] = DEMO_PEOPLE.map((p) => ({ ...p, sex: undefined }));
const nfam = buildFamily(neutral);

describe('structure', () => {
  it('finds two root couples', () => {
    expect(fam.rootUnits).toEqual([['ruth', 'frank'], ['lena', 'omar']]);
  });
  it('numbers generations; partners take their descendant partner generation', () => {
    const g = (id: string) => fam.gen(id);
    expect([g('ruth'), g('lena'), g('mike'), g('jen'), g('carlos'), g('emma'), g('theo'), g('zoe')]).toEqual([1, 1, 2, 2, 2, 3, 3, 4]);
    expect(fam.maxGen).toBe(4);
    expect(fam.isMarriedIn('theo')).toBe(true);
    expect(fam.isMarriedIn('jen')).toBe(false);
  });
  it('builds households', () => {
    const hh = Object.fromEntries(fam.households.map((h) => [h.id, h.memberIds.slice().sort().join(',')]));
    expect(hh['mike+jen']).toBe('jen,lily,mike,noah');
    expect(hh['sarah']).toBe('ava,ben,sarah');
    expect(hh['carlos']).toBe('carlos,mia');
    expect(hh['maya']).toBe('maya,mia');
    expect(hh['dan']).toBe('dan');
    expect(hh['emma+theo']).toBe('emma,theo,zoe');
    expect(fam.households.some((h) => h.adultIds.includes('noah'))).toBe(false);
  });
  it('merges the shared branch and keeps a stable id', () => {
    const mike = fam.branches.find((b) => b.id === 'branch:mike')!;
    expect(mike.headIds).toEqual(['mike', 'jen']);
    expect(mike.rootUnitIdx).toEqual([0, 1]);
    expect(mike.memberIds.sort()).toEqual(['emma', 'jen', 'lily', 'mike', 'noah', 'theo', 'zoe']);
    expect(fam.branches.map((b) => b.id)).toEqual(['branch:mike', 'branch:sarah', 'branch:dan', 'branch:maya']);
  });
  it('treats separated partners as co-parents, not a couple', () => {
    expect(fam.partners('maya')).toEqual([]);
    expect(fam.exes('maya')).toEqual(['carlos']);
    expect(fam.isGrown('carlos')).toBe(true);
    expect(fam.siblingSets.map((s) => s.ids.join(','))).toContain('emma,noah,lily');
  });
  it('anyone with a partner or child is grown', () => {
    const f = buildFamily([{ id: 'a', name: 'A', grown: false, parentIds: [], partnerIds: [] }, { id: 'b', name: 'B', grown: false, parentIds: ['a'], partnerIds: [] }]);
    expect(f.isGrown('a')).toBe(true);
    expect(f.isGrown('b')).toBe(false);
    expect(f.nm('zzz')).toBe('zzz');
  });
  it('survives cycles', () => {
    const f = buildFamily([
      { id: 'a', name: 'A', grown: true, parentIds: ['b'], partnerIds: [] },
      { id: 'b', name: 'B', grown: true, parentIds: ['a', 'b'], partnerIds: [] },
    ]);
    expect(f.gen('a')).toBeGreaterThan(0);
    expect(f.describe('a', 'b')).toContain('A');
  });
});

describe('describeRelationship', () => {
  const cases: [string, string, string][] = [
    ['ruth', 'mike', "Ruth is Mike's mother"],
    ['mike', 'ruth', "Mike is Ruth's son"],
    ['emma', 'ruth', "Emma is Ruth's granddaughter"],
    ['ruth', 'emma', "Ruth is Emma's grandmother"],
    ['zoe', 'ruth', "Zoe is Ruth's great-granddaughter"],
    ['frank', 'zoe', "Frank is Zoe's great-grandfather"],
    ['emma', 'dan', "Emma is Dan's niece"],
    ['noah', 'sarah', "Noah is Sarah's nephew"],
    ['sarah', 'emma', "Sarah is Emma's aunt"],
    ['dan', 'emma', "Dan is Emma's uncle"],
    ['dan', 'zoe', "Dan is Zoe's grand-uncle"],
    ['zoe', 'dan', "Zoe is Dan's grand-niece"],
    ['mike', 'sarah', "Mike is Sarah's brother"],
    ['sarah', 'mike', "Sarah is Mike's sister"],
    ['lily', 'emma', "Lily is Emma's half-sister"],
    ['ava', 'noah', "Ava is Noah's first cousin"],
    ['zoe', 'ava', "Zoe is Ava's first cousin once removed"],
    ['jen', 'mike', "Jen is Mike's wife"],
    ['mike', 'jen', "Mike is Jen's husband"],
    ['carlos', 'maya', "Carlos is Maya's ex-husband"],
    ['maya', 'carlos', "Maya is Carlos's ex-wife"],
    ['carlos', 'mia', "Carlos is Mia's father"],
    ['mike', 'lily', "Mike is Lily's stepfather"],
    ['lily', 'mike', "Lily is Mike's stepdaughter"],
    ['ruth', 'jen', "Ruth is Jen's mother-in-law"],
    ['frank', 'jen', "Frank is Jen's father-in-law"],
    ['jen', 'ruth', "Jen is Ruth's daughter-in-law"],
    ['theo', 'mike', "Theo is Mike's son-in-law"],
    ['mike', 'theo', "Mike is Theo's father-in-law"],
    ['sarah', 'jen', "Sarah is Jen's sister-in-law"],
    ['dan', 'jen', "Dan is Jen's brother-in-law"],
    ['maya', 'mike', "Maya is Mike's sister-in-law"],
    ['jen', 'dan', "Jen is Dan's sister-in-law"],
    ['carlos', 'mike', 'Carlos is related to Mike by marriage'],
  ];
  it.each(cases)('%s -> %s', (a, b, expected) => expect(d(a, b)).toBe(expected));

  it('uses neutral words when sex is unknown', () => {
    const nd = (a: string, b: string) => nfam.describe(a, b);
    expect(nd('ruth', 'mike')).toBe("Ruth is Mike's parent");
    expect(nd('ruth', 'emma')).toBe("Ruth is Emma's grandparent");
    expect(nd('emma', 'dan')).toBe("Emma is Dan's niece/nephew");
    expect(nd('dan', 'emma')).toBe("Dan is Emma's aunt/uncle");
    expect(nd('dan', 'zoe')).toBe("Dan is Zoe's grand-aunt/uncle");
    expect(nd('mike', 'sarah')).toBe("Mike is Sarah's sibling");
    expect(nd('mike', 'jen')).toBe("Mike is Jen's partner");
    expect(nd('carlos', 'maya')).toBe("Carlos is Maya's ex-partner");
    expect(nd('mike', 'lily')).toBe("Mike is Lily's step-parent");
    expect(nd('lily', 'mike')).toBe("Lily is Mike's step-child");
    expect(nd('ruth', 'jen')).toBe("Ruth is Jen's parent-in-law");
    expect(nd('theo', 'mike')).toBe("Theo is Mike's child-in-law");
    expect(nd('sarah', 'jen')).toBe("Sarah is Jen's sibling-in-law");
    expect(nd('mike', 'emma')).toBe("Mike is Emma's parent");
    expect(nd('emma', 'mike')).toBe("Emma is Mike's child");
    expect(nd('zoe', 'ruth')).toBe("Zoe is Ruth's great-grandchild");
  });

  it('handles deep lines, distant cousins and step-siblings', () => {
    const chain: EnginePerson[] = [];
    for (let i = 0; i < 7; i++) chain.push({ id: `g${i}`, name: `G${i}`, grown: true, parentIds: i ? [`g${i - 1}`] : [], partnerIds: [] });
    // a second line from g0 to make distant cousins
    chain.push({ id: 'x1', name: 'X1', grown: true, parentIds: ['g0'], partnerIds: [] });
    chain.push({ id: 'x2', name: 'X2', grown: true, parentIds: ['x1'], partnerIds: [] });
    chain.push({ id: 'x3', name: 'X3', grown: true, parentIds: ['x2'], partnerIds: [] });
    const f = buildFamily(chain);
    expect(f.describe('g0', 'g4')).toBe("G0 is G4's great-great-grandparent");
    expect(f.describe('g6', 'g1')).toBe("G6 is G1's great-great-great-grandchild");
    expect(f.describe('x3', 'g3')).toBe("X3 is G3's second cousin");
    expect(f.describe('x3', 'g6')).toBe("X3 is G6's second cousin 3 times removed");
    const f2 = buildFamily([
      { id: 'p', name: 'P', grown: true, parentIds: [], partnerIds: ['q'] },
      { id: 'q', name: 'Q', grown: true, parentIds: [], partnerIds: ['p'] },
      { id: 'a', name: 'A', grown: true, parentIds: ['p'], partnerIds: [] },
      { id: 'b', name: 'B', grown: true, parentIds: ['q'], partnerIds: [] },
      { id: 'lone', name: 'Lone', grown: true, parentIds: [], partnerIds: [] },
    ]);
    expect(f2.describe('a', 'b')).toBe("A is B's step-sibling");
    expect(f2.describe('a', 'lone')).toBe("A and Lone aren't connected in the family tree");
    expect(f2.describe('a', 'a')).toBe('A is the same person');
    expect(f2.describe('a', 'nobody')).toBe('Unknown person');
  });

  it('is available as a standalone function', () => {
    expect(describeRelationship(DEMO_PEOPLE, 'emma', 'dan')).toBe("Emma is Dan's niece");
    expect(describeRelationship(fam, 'emma', 'dan')).toBe("Emma is Dan's niece");
  });

  it('describes a long-removed cousin with the right wording', () => {
    const rows: EnginePerson[] = [{ id: 'r', name: 'R', grown: true, parentIds: [], partnerIds: [] }];
    let prev = 'r';
    for (let i = 0; i < 5; i++) { rows.push({ id: `l${i}`, name: `L${i}`, grown: true, parentIds: [prev], partnerIds: [] }); prev = `l${i}`; }
    rows.push({ id: 'o1', name: 'O1', grown: true, parentIds: ['r'], partnerIds: [] });
    rows.push({ id: 'o2', name: 'O2', grown: true, parentIds: ['o1'], partnerIds: [] });
    const f = buildFamily(rows);
    expect(f.describe('l4', 'o2')).toBe("L4 is O2's first cousin 3 times removed");
  });
});

describe('validateFamily', () => {
  const base = (over: Partial<EnginePerson>[]): EnginePerson[] =>
    over.map((o, i) => ({ id: `p${i}`, name: `P${i}`, grown: true, parentIds: [], partnerIds: [], ...o }));
  const codes = (p: EnginePerson[]) => validateFamily(p).map((x) => x.code).sort();
  it('accepts the demo family', () => expect(validateFamily(DEMO_PEOPLE)).toEqual([]));
  it('finds cycles', () => {
    expect(codes(base([{ parentIds: ['p1'] }, { parentIds: ['p2'] }, { parentIds: ['p0'] }]))).toEqual(['cycle', 'cycle', 'cycle']);
    expect(validateFamily(base([{ parentIds: ['p1'] }, { parentIds: ['p0'] }]))[0]!.message).toMatch(/own ancestor/);
  });
  it('finds a self parent and self partner', () => {
    expect(codes(base([{ parentIds: ['p0'], partnerIds: ['p0'] }]))).toEqual(['self-parent', 'self-partner']);
  });
  it('finds a parent who is also a partner', () => {
    const ps = base([{ partnerIds: ['p1'] }, { parentIds: ['p0'], partnerIds: ['p0'] }]);
    expect(codes(ps)).toContain('parent-partner');
  });
  it('finds more than two parents', () => {
    expect(codes(base([{}, {}, {}, { parentIds: ['p0', 'p1', 'p2'] }]))).toEqual(['too-many-parents']);
  });
  it('finds a child listed under both a person and that person’s own parent', () => {
    const forward = validateFamily(base([{}, { parentIds: ['p0'] }, { parentIds: ['p1', 'p0'] }]));
    expect(forward.map((x) => x.code)).toEqual(['parent-of-parent']);
    expect(forward[0]!.message).toBe("P2 is listed as a child of both P1 and P1's parent P0.");
    expect(codes(base([{}, { parentIds: ['p0'] }, { parentIds: ['p0', 'p1'] }]))).toEqual(['parent-of-parent']);
    expect(codes(base([{}, {}, { parentIds: ['p0', 'p1'] }]))).toEqual([]);
  });
  it('finds non-symmetric partner links', () => {
    expect(codes(base([{ partnerIds: ['p1'] }, {}]))).toEqual(['partner-not-symmetric']);
    expect(codes(base([{ separatedPartnerIds: ['p1'] }, {}]))).toEqual(['partner-not-symmetric']);
  });
  it('finds unknown people', () => {
    expect(codes(base([{ parentIds: ['zz'], partnerIds: ['yy'] }]))).toEqual(['unknown-parent', 'unknown-partner']);
  });
});
