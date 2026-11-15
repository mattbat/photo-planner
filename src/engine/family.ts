import type { EnginePerson } from './types';

export interface Household { id: string; adultIds: string[]; kidIds: string[]; memberIds: string[] }
export interface Branch { id: string; headIds: string[]; memberIds: string[]; rootUnitIdx: number[] }

export interface Family {
  people: EnginePerson[];
  byId: Map<string, EnginePerson>;
  /** nickname || first name */
  nm(id: string): string;
  parents(id: string): string[];
  children(id: string): string[];
  /** Current partners (not separated). */
  partners(id: string): string[];
  exes(id: string): string[];
  isGrown(id: string): boolean;
  gen(id: string): number;
  /** Has no parents in the tree and sits below the top generation (an in-law). */
  isMarriedIn(id: string): boolean;
  maxGen: number;
  /** Top couples / single roots (generation 1, no parents). Only units that have children. */
  rootUnits: string[][];
  households: Household[];
  /** Groups of siblings (all children of one household's adults), 2+ only. */
  siblingSets: { parentIds: string[]; ids: string[] }[];
  branches: Branch[];
  /** Descendants of a set of people, `level` generations down (1 = children), in people order. */
  descendants(ids: string[], level: number): string[];
  /** Children of any of these people, in people order. */
  childrenOf(ids: string[]): string[];
  describe(aId: string, bId: string): string;
}

export interface FamilyProblem { code: string; message: string; personIds: string[] }

type Kind =
  | { k: 'ancestor'; n: number } | { k: 'descendant'; n: number }
  | { k: 'sibling'; half: boolean }
  | { k: 'auntuncle'; m: number } | { k: 'nibling'; m: number }
  | { k: 'cousin'; degree: number; removed: number };

const pick = (sex: 'male' | 'female' | undefined, neutral: string, male: string, female: string) =>
  sex === 'male' ? male : sex === 'female' ? female : neutral;
const greats = (n: number) => 'great-'.repeat(Math.max(0, n));
const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];

function kindWord(kind: Kind, sex: 'male' | 'female' | undefined): string {
  switch (kind.k) {
    case 'ancestor':
      return kind.n === 1 ? pick(sex, 'parent', 'father', 'mother')
        : greats(kind.n - 2) + pick(sex, 'grandparent', 'grandfather', 'grandmother');
    case 'descendant':
      return kind.n === 1 ? pick(sex, 'child', 'son', 'daughter')
        : greats(kind.n - 2) + pick(sex, 'grandchild', 'grandson', 'granddaughter');
    case 'sibling':
      return (kind.half ? 'half-' : '') + pick(sex, 'sibling', 'brother', 'sister');
    case 'auntuncle':
      return greats(kind.m - 2) + (kind.m >= 2 ? 'grand-' : '') + pick(sex, 'aunt/uncle', 'uncle', 'aunt');
    case 'nibling':
      return greats(kind.m - 2) + (kind.m >= 2 ? 'grand-' : '') + pick(sex, 'niece/nephew', 'nephew', 'niece');
    case 'cousin': {
      const ord = ORD[kind.degree - 1] ?? `${kind.degree}th`;
      const rem = kind.removed === 0 ? '' : kind.removed === 1 ? ' once removed' : kind.removed === 2 ? ' twice removed' : ` ${kind.removed} times removed`;
      return `${ord} cousin${rem}`;
    }
  }
}

export function buildFamily(peopleIn: EnginePerson[]): Family {
  const people = peopleIn;
  const byId = new Map(people.map((p) => [p.id, p]));
  const idx = new Map(people.map((p, i) => [p.id, i]));
  const byOrder = (ids: Iterable<string>) => [...new Set(ids)].filter((i) => byId.has(i)).sort((a, b) => idx.get(a)! - idx.get(b)!);

  const parentsM = new Map<string, string[]>();
  const childrenM = new Map<string, string[]>();
  for (const p of people) childrenM.set(p.id, []);
  for (const p of people) {
    const ps = byOrder(p.parentIds.filter((x) => x !== p.id));
    parentsM.set(p.id, ps);
    for (const par of ps) childrenM.get(par)!.push(p.id);
  }
  const partnerSet = new Map<string, Set<string>>();
  const exSet = new Map<string, Set<string>>();
  for (const p of people) { partnerSet.set(p.id, new Set()); exSet.set(p.id, new Set()); }
  for (const p of people) {
    for (const q of p.separatedPartnerIds ?? []) if (byId.has(q) && q !== p.id) { exSet.get(p.id)!.add(q); exSet.get(q)!.add(p.id); }
    for (const q of p.partnerIds) if (byId.has(q) && q !== p.id) { partnerSet.get(p.id)!.add(q); partnerSet.get(q)!.add(p.id); }
  }
  for (const p of people) for (const q of exSet.get(p.id)!) { partnerSet.get(p.id)!.delete(q); partnerSet.get(q)!.delete(p.id); }

  const parents = (id: string) => parentsM.get(id) ?? [];
  const children = (id: string) => childrenM.get(id) ?? [];
  const partners = (id: string) => byOrder(partnerSet.get(id) ?? []);
  const exes = (id: string) => byOrder(exSet.get(id) ?? []);
  const nm = (id: string) => {
    const p = byId.get(id);
    return p ? p.nickname || p.name.split(' ')[0] || p.name : id;
  };
  const isGrown = (id: string) =>
    !!byId.get(id)?.grown || partners(id).length > 0 || exes(id).length > 0 || children(id).length > 0;

  const mates = (id: string) => {
    const co = children(id).flatMap(parents).filter((x) => x !== id);
    return byOrder([...partners(id), ...exes(id), ...co]);
  };
  const genMemo = new Map<string, number>();
  function gen(id: string, visiting = new Set<string>()): number {
    const m = genMemo.get(id);
    if (m !== undefined) return m;
    if (visiting.has(id)) return 1;
    visiting.add(id);
    const ps = parents(id);
    let g = 1;
    if (ps.length) g = 1 + Math.max(...ps.map((p) => gen(p, visiting)));
    else {
      const withParents = mates(id).filter((x) => parents(x).length > 0);
      if (withParents.length) g = Math.max(...withParents.map((x) => gen(x, visiting)));
    }
    visiting.delete(id);
    genMemo.set(id, g);
    return g;
  }
  const isRoot = (id: string) => parents(id).length === 0 && gen(id) === 1;
  const isMarriedIn = (id: string) => parents(id).length === 0 && gen(id) > 1;
  let maxGen = 1;
  for (const p of people) maxGen = Math.max(maxGen, gen(p.id));

  const childrenOf = (ids: string[]) => byOrder(ids.flatMap(children));
  const descendants = (ids: string[], level: number) => {
    let cur = byOrder(ids);
    for (let i = 0; i < level; i++) cur = childrenOf(cur);
    return cur;
  };

  // root units: roots joined by partner links, with children
  const roots = people.filter((p) => isRoot(p.id)).map((p) => p.id);
  const seen = new Set<string>();
  const rootUnits: string[][] = [];
  for (const r of roots) {
    if (seen.has(r)) continue;
    const comp: string[] = [];
    const stack = [r];
    seen.add(r);
    while (stack.length) {
      const x = stack.pop()!;
      comp.push(x);
      for (const q of partners(x)) if (!seen.has(q) && roots.includes(q)) { seen.add(q); stack.push(q); }
    }
    const unit = byOrder(comp);
    if (childrenOf(unit).length) rootUnits.push(unit);
  }

  // households
  const households: Household[] = [];
  const hhSeen = new Set<string>();
  const addHousehold = (adults: string[]) => {
    adults = byOrder(adults);
    const id = adults.join('+');
    if (hhSeen.has(id)) return;
    hhSeen.add(id);
    const kidIds = childrenOf(adults).filter((c) => !isGrown(c));
    households.push({ id, adultIds: adults, kidIds, memberIds: byOrder([...adults, ...kidIds]) });
  };
  for (const p of people) {
    if (!isGrown(p.id)) continue;
    const ps = partners(p.id);
    if (ps.length) for (const q of ps) addHousehold([p.id, q]);
    else addHousehold([p.id]);
  }

  // sibling sets
  const siblingSets: { parentIds: string[]; ids: string[] }[] = [];
  const sibSeen = new Set<string>();
  for (const h of households) {
    const ids = childrenOf(h.adultIds);
    const k = ids.join('+');
    if (ids.length >= 2 && !sibSeen.has(k)) { sibSeen.add(k); siblingSets.push({ parentIds: h.adultIds, ids }); }
  }

  // branches
  const branches: Branch[] = [];
  const closure = (head: string) => {
    const set = new Set<string>([head, ...partners(head)]);
    let frontier = [...set];
    while (frontier.length) {
      const next: string[] = [];
      for (const c of childrenOf(frontier)) {
        if (set.has(c)) continue;
        set.add(c); next.push(c);
        for (const q of partners(c)) if (!set.has(q)) { set.add(q); next.push(q); }
      }
      frontier = next;
    }
    return byOrder(set);
  };
  rootUnits.forEach((unit, ui) => {
    for (const head of childrenOf(unit)) {
      const members = closure(head);
      const k = members.join('+');
      const ex = branches.find((b) => b.memberIds.join('+') === k);
      if (ex) {
        if (!ex.headIds.includes(head)) ex.headIds.push(head);
        if (!ex.rootUnitIdx.includes(ui)) ex.rootUnitIdx.push(ui);
      } else branches.push({ id: `branch:${head}`, headIds: [head], memberIds: members, rootUnitIdx: [ui] });
    }
  });

  // relationships
  const ancestors = (id: string) => {
    const m = new Map<string, number>([[id, 0]]);
    let frontier = [id];
    for (let d = 1; frontier.length; d++) {
      const next: string[] = [];
      for (const x of frontier) for (const p of parents(x)) if (!m.has(p)) { m.set(p, d); next.push(p); }
      frontier = next;
    }
    return m;
  };
  function bloodKind(aId: string, bId: string): Kind | null {
    const upA = ancestors(aId), upB = ancestors(bId);
    const dB = upB.get(aId);
    if (dB !== undefined) return { k: 'ancestor', n: dB };
    const dA = upA.get(bId);
    if (dA !== undefined) return { k: 'descendant', n: dA };
    let best: [number, number] | null = null;
    for (const [anc, a] of upA) {
      const b = upB.get(anc);
      if (b !== undefined && (!best || a + b < best[0] + best[1])) best = [a, b];
    }
    if (!best) return null;
    const [a, b] = best;
    if (a === 1 && b === 1) {
      const pa = parents(aId), pb = parents(bId);
      return { k: 'sibling', half: pa.some((x) => !pb.includes(x)) || pb.some((x) => !pa.includes(x)) };
    }
    if (a === 1) return { k: 'auntuncle', m: b - 1 };
    if (b === 1) return { k: 'nibling', m: a - 1 };
    return { k: 'cousin', degree: Math.min(a, b) - 1, removed: Math.abs(a - b) };
  }

  function relationWord(aId: string, bId: string): string | null {
    const a = byId.get(aId)!;
    const sex = a.sex;
    const blood = bloodKind(aId, bId);
    if (blood) return kindWord(blood, sex);
    if (partners(bId).includes(aId)) return pick(sex, 'partner', 'husband', 'wife');
    if (exes(bId).includes(aId)) return pick(sex, 'ex-partner', 'ex-husband', 'ex-wife');
    if (parents(bId).some((p) => partners(p).includes(aId))) return pick(sex, 'step-parent', 'stepfather', 'stepmother');
    if (parents(aId).some((p) => partners(p).includes(bId))) return pick(sex, 'step-child', 'stepson', 'stepdaughter');
    if (parents(aId).some((p) => parents(bId).some((q) => partners(p).includes(q))))
      return pick(sex, 'step-sibling', 'stepbrother', 'stepsister');
    for (const s of partners(bId)) {
      const k = bloodKind(aId, s);
      if (k?.k === 'ancestor' && k.n === 1) return pick(sex, 'parent-in-law', 'father-in-law', 'mother-in-law');
      if (k?.k === 'sibling') return pick(sex, 'sibling-in-law', 'brother-in-law', 'sister-in-law');
    }
    for (const r of partners(aId)) {
      const k = bloodKind(r, bId);
      if (k?.k === 'descendant' && k.n === 1) return pick(sex, 'child-in-law', 'son-in-law', 'daughter-in-law');
      if (k?.k === 'sibling') return pick(sex, 'sibling-in-law', 'brother-in-law', 'sister-in-law');
    }
    return null;
  }
  function connected(aId: string, bId: string) {
    const seenN = new Set([aId]);
    const stack = [aId];
    while (stack.length) {
      const x = stack.pop()!;
      if (x === bId) return true;
      for (const y of [...parents(x), ...children(x), ...partners(x), ...exes(x)]) if (!seenN.has(y)) { seenN.add(y); stack.push(y); }
    }
    return false;
  }
  function describe(aId: string, bId: string): string {
    if (!byId.has(aId) || !byId.has(bId)) return 'Unknown person';
    if (aId === bId) return `${nm(aId)} is the same person`;
    const w = relationWord(aId, bId);
    if (w) return `${nm(aId)} is ${nm(bId)}'s ${w}`;
    if (connected(aId, bId)) return `${nm(aId)} is related to ${nm(bId)} by marriage`;
    return `${nm(aId)} and ${nm(bId)} aren't connected in the family tree`;
  }

  return {
    people, byId, nm, parents, children, partners, exes, isGrown, gen, isMarriedIn, maxGen,
    rootUnits, households, siblingSets, branches, descendants, childrenOf, describe,
  };
}

export function describeRelationship(familyOrPeople: Family | EnginePerson[], aId: string, bId: string): string {
  const fam = Array.isArray(familyOrPeople) ? buildFamily(familyOrPeople) : familyOrPeople;
  return fam.describe(aId, bId);
}

export function validateFamily(people: EnginePerson[]): FamilyProblem[] {
  const out: FamilyProblem[] = [];
  const byId = new Map(people.map((p) => [p.id, p]));
  const nm = (id: string) => { const p = byId.get(id); return p ? p.nickname || p.name.split(' ')[0] || p.name : id; };
  for (const p of people) {
    for (const q of p.parentIds) {
      if (!byId.has(q)) out.push({ code: 'unknown-parent', message: `${nm(p.id)} lists a parent who is not in the family.`, personIds: [p.id] });
      else if (q === p.id) out.push({ code: 'self-parent', message: `${nm(p.id)} is listed as their own parent.`, personIds: [p.id] });
    }
    for (const q of [...p.partnerIds, ...(p.separatedPartnerIds ?? [])]) {
      if (!byId.has(q)) out.push({ code: 'unknown-partner', message: `${nm(p.id)} has a partner who is not in the family.`, personIds: [p.id] });
      else if (q === p.id) out.push({ code: 'self-partner', message: `${nm(p.id)} is listed as their own partner.`, personIds: [p.id] });
    }
    if (new Set(p.parentIds).size > 2)
      out.push({ code: 'too-many-parents', message: `${nm(p.id)} has more than two parents.`, personIds: [p.id, ...p.parentIds] });
    for (const q of p.partnerIds) {
      const o = byId.get(q);
      if (o && q !== p.id && !o.partnerIds.includes(p.id))
        out.push({ code: 'partner-not-symmetric', message: `${nm(p.id)} is a partner of ${nm(q)}, but ${nm(q)} isn't linked back.`, personIds: [p.id, q] });
    }
    for (const q of p.separatedPartnerIds ?? []) {
      const o = byId.get(q);
      if (o && q !== p.id && !(o.separatedPartnerIds ?? []).includes(p.id))
        out.push({ code: 'partner-not-symmetric', message: `${nm(p.id)} is separated from ${nm(q)}, but ${nm(q)} isn't linked back.`, personIds: [p.id, q] });
    }
    const parents = [...new Set(p.parentIds)].filter((q) => byId.has(q) && q !== p.id);
    if (parents.length === 2) {
      const [x, y] = parents as [string, string];
      const [child, parent] = byId.get(x)!.parentIds.includes(y) ? [x, y] : byId.get(y)!.parentIds.includes(x) ? [y, x] : [];
      if (child && parent)
        out.push({ code: 'parent-of-parent', message: `${nm(p.id)} is listed as a child of both ${nm(child)} and ${nm(child)}'s parent ${nm(parent)}.`, personIds: [p.id, child, parent] });
    }
    for (const q of p.partnerIds) {
      if (q !== p.id && (p.parentIds.includes(q) || byId.get(q)?.parentIds.includes(p.id)))
        out.push({ code: 'parent-partner', message: `${nm(p.id)} and ${nm(q)} are both parent and child and partners.`, personIds: [p.id, q] });
    }
  }
  // cycles: anyone who is their own ancestor
  const parentOf = (id: string) => (byId.get(id)?.parentIds ?? []).filter((x) => byId.has(x));
  for (const p of people) {
    const seen = new Set<string>();
    const stack = parentOf(p.id).filter((x) => x !== p.id);
    let cyc = false;
    while (stack.length) {
      const x = stack.pop()!;
      if (x === p.id) { cyc = true; break; }
      if (seen.has(x)) continue;
      seen.add(x);
      stack.push(...parentOf(x));
    }
    if (cyc) out.push({ code: 'cycle', message: `${nm(p.id)} would be their own ancestor. Check the parent links.`, personIds: [p.id] });
  }
  return out;
}
