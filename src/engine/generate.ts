import { buildFamily, type Family } from './family';
import { SPECIFICITY, TEMPLATES, TEMPLATE_BY_ID, TEMPLATE_IDS } from './templates';
import type { EngineExtra, GenerateInput, GenerateResult, PreviewCount, Shot, ShotEdits, TemplateId } from './types';

interface Cand { tid: TemplateId; ids: string[]; name: string; branchId?: string }
interface Ctx {
  fam: Family;
  input: GenerateInput;
  attending: Set<string>;
  extras: EngineExtra[];
  order: Map<string, number>;
  cache: Map<TemplateId, Cand[]>;
}

const sortAlpha = (ids: string[]) => [...ids].sort();
const sigOf = (ids: string[]) => sortAlpha(ids).join(',');
const keyOf = (tid: string, ids: string[]) => `${tid}:${sigOf(ids)}`;
const sigFromKey = (key: string) => key.slice(key.indexOf(':') + 1);

function listNames(fam: Family, ids: string[]): string {
  const n = ids.map((i) => fam.nm(i));
  return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} & ${n[n.length - 1]}`;
}

function candidates(ctx: Ctx, tid: TemplateId): Cand[] {
  const hit = ctx.cache.get(tid);
  if (hit) return hit;
  const raw = build(ctx, tid);
  const minSize = TEMPLATE_BY_ID[tid].minSize;
  const out: Cand[] = [];
  for (const c of raw) {
    const ids = [...new Set(c.ids)].sort((a, b) => ctx.order.get(a)! - ctx.order.get(b)!);
    if (ids.length >= minSize) out.push({ ...c, ids });
  }
  ctx.cache.set(tid, out);
  return out;
}

function build(ctx: Ctx, tid: TemplateId): Cand[] {
  const { fam } = ctx;
  const P = fam.people;
  const nm = (id: string) => fam.nm(id);
  const join = (ids: string[]) => listNames(fam, ids);
  const single = fam.rootUnits.length === 1;
  const unitName = (adults: string[]) =>
    single && sigOf(adults) === sigOf(fam.rootUnits[0] ?? []) ? 'Grandparents' : join(adults);
  const c = (ids: string[], name: string, branchId?: string): Cand => ({ tid, ids, name, branchId });
  const hhName = (h: { adultIds: string[]; kidIds: string[] }) => {
    if (!h.kidIds.length) return join(h.adultIds);
    const kids = h.kidIds.length === 1 ? nm(h.kidIds[0]!) : 'the kids';
    return h.adultIds.length === 1 ? `${nm(h.adultIds[0]!)} & ${kids}` : `${join(h.adultIds)} + ${kids === 'the kids' ? 'kids' : kids}`;
  };
  // top-couple groups: each root unit, plus all of them together when there are several
  const groups = fam.rootUnits.map((u) => ({ ids: u, label: single ? 'Grandparents' : join(u), union: single }));
  if (!single && fam.rootUnits.length > 1) groups.push({ ids: fam.rootUnits.flat(), label: 'All grandparents', union: true });
  const their = (g: { union: boolean }) => (g.union ? '' : 'their ');
  const famName = ctx.input.familyName;
  const out: Cand[] = [];

  switch (tid) {
    case 'fullGroup': return [c(P.map((p) => p.id), 'Everyone')];
    case 'fullGroupNoPartners': return [c(P.filter((p) => !fam.isMarriedIn(p.id)).map((p) => p.id), 'Everyone, no partners')];
    case 'generations':
    case 'generationsWithPartners': {
      const withP = tid === 'generationsWithPartners';
      const base = ['', 'Grandparents', "Grandparents' children", 'All the grandkids', 'All the great-grandkids'];
      for (let g = 1; g <= fam.maxGen; g++) {
        const ids = P.filter((p) => fam.gen(p.id) === g && (withP || !fam.isMarriedIn(p.id))).map((p) => p.id);
        const b = base[g] ?? `Generation ${g}`;
        out.push(c(ids, withP && g > 1 ? `${b} + partners` : b));
      }
      return out;
    }
    case 'grandparentsChildren':
      return groups.map((g) => c([...g.ids, ...fam.descendants(g.ids, 1)], `${g.label} + all ${their(g)}children`));
    case 'grandparentsGrandkids':
      return groups.map((g) => c([...g.ids, ...fam.descendants(g.ids, 2)], `${g.label} + all ${their(g)}grandkids`));
    case 'grandparentsGrandkidsGreat':
      return groups.filter((g) => fam.descendants(g.ids, 3).length).map((g) =>
        c([...g.ids, ...fam.descendants(g.ids, 2), ...fam.descendants(g.ids, 3)], `${g.label} + all ${their(g)}grandkids and great-grandkids`));
    case 'siblings':
      return fam.siblingSets.map((s) => c(s.ids, s.ids.length <= 4 ? join(s.ids) : `All ${s.ids.length} siblings`));
    case 'siblingPairs':
      for (const s of fam.siblingSets) {
        if (s.ids.length < 3) continue; // a set of two is already the "All siblings" shot
        const here = s.ids.filter((i) => ctx.attending.has(i));
        for (let a = 0; a < here.length; a++) for (let b = a + 1; b < here.length; b++) out.push(c([here[a]!, here[b]!], join([here[a]!, here[b]!])));
      }
      return out;
    case 'sonsDaughters':
      for (const s of fam.siblingSets) {
        const owner = single && sigOf(s.parentIds) === sigOf(fam.rootUnits[0] ?? []) ? 'All the' : `${join(s.parentIds)}'s`;
        for (const [sex, word] of [['male', 'sons'], ['female', 'daughters']] as const)
          out.push(c(s.ids.filter((i) => fam.byId.get(i)!.sex === sex), `${owner} ${word}`));
      }
      return out;
    case 'grandsonsGranddaughters':
      for (const g of groups) for (const [sex, word] of [['male', 'grandsons'], ['female', 'granddaughters']] as const)
        out.push(c(fam.descendants(g.ids, 2).filter((i) => fam.byId.get(i)!.sex === sex), g.union ? `All the ${word}` : `${g.label}'s ${word}`));
      return out;
    case 'cousins':
      for (const g of groups) for (const level of [2, 3]) {
        const ids = fam.descendants(g.ids, level);
        if (!sibGroups(fam, ids)) continue;
        const word = level === 2 ? 'cousins' : 'second cousins';
        out.push(c(ids, g.union ? (level === 2 ? (famName ? `${famName} cousins` : 'Cousins') : 'Second cousins') : `${g.label}'s ${word}`));
      }
      return out;
    case 'branches':
      return fam.branches.map((b) => c(b.memberIds, `${branchLabel(fam, b.headIds)} family`, b.id));
    case 'grandparentsBranches':
      return fam.branches.map((b) => {
        const label = b.rootUnitIdx.map((i) => (single ? 'Grandparents' : join(fam.rootUnits[i] ?? []))).join(' + ');
        return c([...b.rootUnitIdx.flatMap((i) => fam.rootUnits[i] ?? []), ...b.memberIds], `${label} + ${branchLabel(fam, b.headIds)} family`, b.id);
      });
    case 'households': return fam.households.map((h) => c(h.memberIds, hhName(h)));
    case 'couples':
      for (const p of P) for (const q of fam.partners(p.id)) if (ctx.order.get(p.id)! < ctx.order.get(q)!) out.push(c([p.id, q], unitName([p.id, q])));
      return out;
    case 'parentChildren':
      return P.filter((p) => fam.children(p.id).length).map((p) => {
        const kids = fam.children(p.id);
        return c([p.id, ...kids], `${nm(p.id)} & ${kids.length === 1 ? nm(kids[0]!) : 'the kids'}`);
      });
    case 'childKids': {
      const bySet = new Map<string, { parents: string[]; kids: string[] }>();
      for (const p of P) {
        const kids = fam.children(p.id);
        if (!kids.length) continue;
        const k = kids.join(',');
        const e = bySet.get(k) ?? { parents: [], kids };
        e.parents.push(p.id);
        bySet.set(k, e);
      }
      return [...bySet.values()].map((e) => c(e.kids, `${join(e.parents)}'s kids`));
    }
    case 'auntUncleNiblings':
      for (const p of P) {
        if (!ctx.attending.has(p.id)) continue;
        // blood siblings only (never a sibling's partner), each with the kids who are coming
        const fams = [...new Set(fam.siblingSets.filter((s) => s.ids.includes(p.id)).flatMap((s) => s.ids))]
          .filter((sib) => sib !== p.id)
          .map((sib) => ({ sib, kids: fam.children(sib).filter((k) => ctx.attending.has(k)) }))
          .filter((f) => f.kids.length);
        if (!fams.length) continue;
        // with just one sibling's kids coming, "all of them" and "that family's kids" are the same photo
        if (fams.length > 1) out.push(c([p.id, ...fams.flatMap((f) => f.kids)], `${nm(p.id)} + nieces and nephews`));
        for (const f of fams) out.push(c([p.id, ...f.kids], `${nm(p.id)} + ${nm(f.sib)}'s kids`));
      }
      return out;
    case 'grandparentGrandkid':
      for (const p of P) for (const gk of fam.descendants([p.id], 2)) out.push(c([p.id, gk], `${nm(p.id)} & ${nm(gk)}`));
      return out;
    case 'parentChild':
      for (const p of P) for (const k of fam.children(p.id)) out.push(c([p.id, k], `${nm(p.id)} & ${nm(k)}`));
      return out;
    case 'grandmaGranddaughters':
      for (const p of P) {
        if (!p.sex) continue;
        const want = p.sex === 'female' ? 'female' : 'male';
        out.push(c([p.id, ...fam.descendants([p.id], 2).filter((i) => fam.byId.get(i)!.sex === want)],
          `${nm(p.id)} with the ${want === 'female' ? 'granddaughters' : 'grandsons'}`));
      }
      return out;
    case 'soloEveryone': return P.map((p) => c([p.id], `${nm(p.id)} solo`));
    case 'soloKids': return P.filter((p) => !fam.isGrown(p.id)).map((p) => c([p.id], `${nm(p.id)} solo`));
    case 'soloAdults': return P.filter((p) => fam.isGrown(p.id)).map((p) => c([p.id], `${nm(p.id)} solo`));
    case 'grownChildrenAll':
      for (const h of fam.households) {
        const grown = fam.childrenOf(h.adultIds).filter((k) => fam.isGrown(k));
        if (grown.length >= 2) out.push(c([...h.adultIds, ...grown], `${unitName(h.adultIds)} + all grown children`));
      }
      return out;
    case 'parentsEachGrownChild':
      for (const h of fam.households) for (const k of fam.childrenOf(h.adultIds).filter((x) => fam.isGrown(x)))
        out.push(c([...h.adultIds, k], `${unitName(h.adultIds)} + ${nm(k)}`));
      return out;
    case 'parentsEachGrownHousehold':
      for (const h of fam.households) for (const k of fam.childrenOf(h.adultIds).filter((x) => fam.isGrown(x)))
        for (const kh of fam.households.filter((x) => x.adultIds.includes(k) && x.memberIds.length > 1))
          out.push(c([...h.adultIds, ...kh.memberIds], `${unitName(h.adultIds)} + ${hhName(kh)}`));
      return out;
    case 'grownHouseholdAlone':
      return fam.households.filter((h) => h.adultIds.some((a) => fam.parents(a).length)).map((h) => c(h.memberIds, hhName(h)));
  }
}

function branchLabel(fam: Family, heads: string[]) {
  return heads.length === 2 && fam.partners(heads[0]!).includes(heads[1]!) ? `${fam.nm(heads[0]!)} & ${fam.nm(heads[1]!)}'s` : `${fam.nm(heads[0]!)}'s`;
}

/** True if the set spans two or more groups of siblings (people sharing a parent). */
function sibGroups(fam: Family, ids: string[]): boolean {
  const parent = new Map<string, string>(ids.map((i) => [i, i]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  const firstByParent = new Map<string, string>();
  for (const i of ids) for (const p of fam.parents(i)) {
    const f = firstByParent.get(p);
    if (f) parent.set(find(i), find(f)); else firstByParent.set(p, i);
  }
  return new Set(ids.map(find)).size >= 2;
}

function makeCtx(input: GenerateInput): Ctx {
  const fam = buildFamily(input.people);
  const attending = new Set(input.attendingIds);
  return {
    fam, input, attending,
    extras: input.extras.filter((e) => attending.has(e.id)),
    order: new Map(input.people.map((p, i) => [p.id, i])),
    cache: new Map(),
  };
}

interface Group { ids: string[]; extraIds: string[]; cands: Cand[]; key?: string; name?: string; custom?: boolean; branchId?: string }

function extrasFor(ctx: Ctx, tid: TemplateId, ids: string[]): string[] {
  const whole = tid === 'fullGroup' || tid === 'fullGroupNoPartners';
  return ctx.extras
    .filter((e) => e.joinTemplates.includes(tid) && (whole || !e.ownerIds?.length || e.ownerIds.some((o) => ids.includes(o))))
    .map((e) => e.id);
}

function run(ctx: Ctx, tids: TemplateId[], edits?: ShotEdits): GenerateResult {
  const { fam, attending } = ctx;
  const removed = new Set(edits?.removed ?? []);
  const removedSigs = new Set([...removed].map(sigFromKey));
  const sel = new Set(tids);
  const groups = new Map<string, Group>();
  const flagged = new Map<string, string>();

  for (const tmpl of TEMPLATES) {
    if (!sel.has(tmpl.id)) continue;
    for (const cand of candidates(ctx, tmpl.id)) {
      const ids = cand.ids.filter((i) => attending.has(i));
      if (ids.length < tmpl.minSize) {
        const fk = keyOf(cand.tid, cand.ids);
        if (ids.length > 0 && !removed.has(fk) && !removedSigs.has(sigOf(cand.ids)))
          flagged.set(fk, `"${cand.name}" needs at least ${tmpl.minSize} people but only ${ids.length} of ${cand.ids.length} are attending.`);
        continue;
      }
      const extraIds = extrasFor(ctx, cand.tid, ids);
      const gk = `${sigOf(ids)}|${sigOf(extraIds)}`;
      const g = groups.get(gk);
      if (g) g.cands.push({ ...cand, ids }); else groups.set(gk, { ids, extraIds, cands: [{ ...cand, ids }] });
    }
  }

  // customs
  for (const cs of edits?.custom ?? []) {
    if (removed.has(cs.key)) continue;
    const ids = cs.peopleIds.filter((i) => attending.has(i));
    const extraIds = cs.extraIds.filter((i) => attending.has(i));
    if (ids.length + extraIds.length === 0) {
      flagged.set(cs.key, `"${cs.name}" is a custom shot but nobody in it is attending.`);
      continue;
    }
    const gk = `${sigOf(ids)}|${sigOf(extraIds)}`;
    const g = groups.get(gk) ?? { ids, extraIds, cands: [] };
    g.key = cs.key; g.name = cs.name; g.custom = true; g.branchId = cs.branchId;
    groups.set(gk, g);
  }

  const shots: Shot[] = [];
  const renamedBySig = new Map(Object.entries(edits?.renamed ?? {}).map(([k, v]) => [sigFromKey(k), v]));
  const rank = (t: TemplateId) => SPECIFICITY.indexOf(t);
  const containing = (ids: string[]) => {
    const hits = fam.branches.filter((b) => ids.every((i) => b.memberIds.includes(i)));
    return hits.length === 1 ? hits[0]!.id : undefined;
  };
  for (const g of groups.values()) {
    const primary = g.cands.length ? g.cands.reduce((a, b) => (rank(b.tid) < rank(a.tid) ? b : a)) : undefined;
    const key = g.key ?? keyOf(primary!.tid, g.ids);
    if (removed.has(key) || (!g.custom && removedSigs.has(sigOf(g.ids)))) continue;
    const sig = sigOf(g.ids);
    const branchId = g.branchId ?? g.cands.find((x) => x.branchId)?.branchId ?? containing(g.ids);
    const tids2 = TEMPLATE_IDS.filter((t) => g.cands.some((x) => x.tid === t));
    shots.push({
      key,
      name: edits?.renamed[key] ?? renamedBySig.get(sig) ?? g.name ?? primary!.name,
      peopleIds: g.ids,
      extraIds: g.extraIds,
      templateIds: tids2,
      groupLabel: g.custom ? 'Custom' : TEMPLATE_BY_ID[primary!.tid].group,
      ...(branchId ? { branchId } : {}),
      ...(g.custom ? { custom: true } : {}),
    });
  }

  const counts = Object.fromEntries(TEMPLATE_IDS.map((t) => [t, 0])) as Record<TemplateId, number>;
  for (const s of shots) for (const t of s.templateIds) counts[t]++;
  return { shots, flagged: [...flagged].map(([key, reason]) => ({ key, reason })), counts };
}

export function generateShots(input: GenerateInput): GenerateResult {
  return run(makeCtx(input), input.templateIds, input.edits);
}

/** E5: how many shots each template would make, and how many it would add to the current selection. */
export function previewCounts(input: GenerateInput): Record<TemplateId, PreviewCount> {
  const ctx = makeCtx(input);
  const base = new Set(run(ctx, input.templateIds).shots.map((s) => `${sigOf(s.peopleIds)}|${sigOf(s.extraIds)}`));
  const out = {} as Record<TemplateId, PreviewCount>;
  for (const t of TEMPLATE_IDS) {
    const shots = run(ctx, [t]).shots;
    out[t] = { standalone: shots.length, added: shots.filter((s) => !base.has(`${sigOf(s.peopleIds)}|${sigOf(s.extraIds)}`)).length };
  }
  return out;
}
