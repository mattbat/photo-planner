import { buildFamily } from './family';
import type { EnginePerson, Shot } from './types';

export interface OrderOptions {
  kidsFirst?: boolean;
  releaseOlderEarly?: boolean;
  bigGroupFirst?: boolean;
  mustHavesEarly?: boolean;
  /**
   * The "everyone" shots open the shoot, largest first: the full-group
   * templates (with or without pets and guests) and any shot with all the
   * people. A shot with someone marked Late is not one of them (it waits for
   * that person, see `priorities`). Everything after is ordered as usual.
   */
  everyoneFirst?: boolean;
  /**
   * Keep each household together. After the fixed prefix, the early people,
   * the everyone shots and (with `releaseOlderEarly`) the shots with the
   * oldest generation, the shots that mix households (cousins, siblings,
   * all the grandkids) come first, then one contiguous block per household
   * (a grown child, partner and not-grown kids): biggest shot first, solos
   * last. Late people's shots go to the end as usual. Blocks are ordered for
   * the fewest changes, ties by branch order. Kids-first and must-haves stay
   * tie-breakers inside a tier or block and never split a block.
   */
  groupHouseholds?: boolean;
  mustHaveKeys?: Iterable<string>;
  /**
   * People to finish first ("early", e.g. an older guest) or push to the end
   * ("late", e.g. someone called away briefly). Anyone else is normal.
   *
   * Guarantee (after the `fixedPrefix`): shots are grouped in tiers that
   * never interleave. With `everyoneFirst`, the everyone shots without a late
   * person come first of all. Then: a shot with an early person and no late
   * one, then every other shot (no priority person, or both kinds), then a
   * shot with a late person and no early one. So when no shot mixes an early and a
   * late person, every shot with an early person comes before every shot
   * without one, and every shot with a late person comes after every shot
   * without one. Inside a tier the usual objective applies (fewest changes
   * first), plus early people are done for the day as soon as possible.
   */
  priorities?: Record<string, 'early' | 'late'>;
  /**
   * The person behind the camera (P6). Inside each tier, and each household
   * block, the shots they are in are kept together as one run, placed first,
   * so the camera changes hands once per block. The "everyone" shots keep
   * their largest-first order, and the fixed prefix never moves.
   */
  cameraPersonId?: string;
  /** Keys already done or ordered by hand: kept first, in this order. */
  fixedPrefix?: string[];
  /** Keys like "1-2", "3-6", "7+". */
  minutesBySize?: Record<string, number>;
  /** One-off allowance before the first shot. */
  setupMinutes?: number;
}

export interface OrderStep { key: string; callIn: string[]; canLeave: string[]; doneForDay: string[] }
export interface OrderResult {
  order: string[];
  steps: OrderStep[];
  minutes: { key: string; start: number; duration: number }[];
  totalMinutes: number;
  /** Total people stepping in or out between consecutive shots (the first call-in is not counted). */
  changes: number;
  /** People in the last shot (done once it is taken). */
  doneAfterLast: string[];
}

export const DEFAULT_MINUTES_BY_SIZE: Record<string, number> = { '1-2': 2, '3-6': 3, '7+': 5 };
export const DEFAULT_SETUP_MINUTES = 5;

export function minutesForSize(size: number, table: Record<string, number> = DEFAULT_MINUTES_BY_SIZE): number {
  let best = 0;
  for (const [k, v] of Object.entries(table)) {
    const m = /^(\d+)(?:-(\d+)|\+)?$/.exec(k);
    if (!m) continue;
    const lo = Number(m[1]);
    const hi = m[2] ? Number(m[2]) : m[0].endsWith('+') ? Infinity : lo;
    if (size >= lo && size <= hi) return v;
    best = v;
  }
  return best;
}

function pop(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return Math.imul(x, 0x01010101) >>> 24;
}

/** Keys of the "everyone" shots: full-group templates, or a shot with every person in the shoot (2 or more people). */
export function everyoneShotKeys(shots: Shot[]): Set<string> {
  const all = new Set(shots.flatMap((s) => s.peopleIds));
  const out = new Set<string>();
  for (const s of shots) {
    const template = s.templateIds.includes('fullGroup') || s.templateIds.includes('fullGroupNoPartners');
    if (template || (all.size >= 2 && s.peopleIds.length >= all.size)) out.add(s.key);
  }
  return out;
}

const A_KIDS = 0.2, A_BIG = 0.3, A_MUST = 0.4, G_OLDER = 0.25, G_EARLY = 0.5;

export function orderShots(shots: Shot[], people: EnginePerson[], options: OrderOptions = {}): OrderResult {
  const n = shots.length;
  const fam = buildFamily(people);
  const pid = new Map<string, number>();
  for (const s of shots) for (const id of [...s.peopleIds, ...s.extraIds]) if (!pid.has(id)) pid.set(id, pid.size);
  const W = Math.max(1, Math.ceil(pid.size / 32));
  const M = new Int32Array(n * W);
  const sizes = new Int32Array(n);
  shots.forEach((s, i) => {
    for (const id of [...s.peopleIds, ...s.extraIds]) { const b = pid.get(id)!; M[i * W + (b >> 5)]! |= 1 << (b & 31); }
    sizes[i]! = s.peopleIds.length + s.extraIds.length;
  });
  const olderMask = new Int32Array(W), kidMask = new Int32Array(W);
  for (const [id, b] of pid) {
    if (!fam.byId.has(id)) continue;
    if (fam.gen(id) === 1) olderMask[b >> 5]! |= 1 << (b & 31);
    if (!fam.isGrown(id)) kidMask[b >> 5]! |= 1 << (b & 31);
  }
  // priority people (any id that appears in a shot)
  const earlyMask = new Int32Array(W), lateMask = new Int32Array(W);
  for (const [id, how] of Object.entries(options.priorities ?? {})) {
    const b = pid.get(id);
    if (b === undefined) continue;
    (how === 'early' ? earlyMask : lateMask)[b >> 5]! |= 1 << (b & 31);
  }
  const everyone = options.everyoneFirst ? everyoneShotKeys(shots) : new Set<string>();
  // 0 everyone, 1 early only, 2 neither or both, 3 late only.
  // With groupHouseholds: 0 everyone, 1 early only, 2 oldest generation, 3 cross-household,
  // 4 household blocks (ordered after the main pass), 5 late only.
  const tier = new Uint8Array(n);
  const earlyCount = new Int32Array(n);
  let tiered = false;
  for (let i = 0; i < n; i++) {
    let e = 0, l = 0;
    for (let k = 0; k < W; k++) { e += pop(M[i * W + k]! & earlyMask[k]!); l += pop(M[i * W + k]! & lateMask[k]!); }
    earlyCount[i]! = e;
    tier[i]! = everyone.has(shots[i]!.key) && l === 0 ? 0 : e > 0 && l === 0 ? 1 : l > 0 && e === 0 ? 3 : 2;
    if (tier[i]! !== 2) tiered = true;
  }
  const LATE_TIER = options.groupHouseholds ? 5 : 3;
  const blockOf = new Int32Array(n).fill(-1);
  const blockHouseholds: number[] = []; // block id -> index in fam.households
  if (options.groupHouseholds) {
    tiered = true;
    const hhIdx = new Map<string, number[]>();
    fam.households.forEach((h, hi) => { for (const m of h.memberIds) (hhIdx.get(m) ?? hhIdx.set(m, []).get(m)!).push(hi); });
    const blockIds = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      if (tier[i]! === 3) { tier[i]! = LATE_TIER; continue; }
      if (tier[i]! !== 2) continue;
      let older = 0;
      for (let k = 0; k < W; k++) older += pop(M[i * W + k]! & olderMask[k]!);
      if (options.releaseOlderEarly && older > 0) continue; // stays tier 2
      const ppl = shots[i]!.peopleIds;
      let hh = -1;
      if (ppl.length) {
        const cands = hhIdx.get(ppl[0]!) ?? [];
        hh = cands.find((hi) => ppl.every((id) => fam.households[hi]!.memberIds.includes(id))) ?? -1;
      }
      if (hh < 0) { tier[i]! = 3; continue; }
      tier[i]! = 4;
      if (!blockIds.has(hh)) { blockIds.set(hh, blockHouseholds.length); blockHouseholds.push(hh); }
      blockOf[i]! = blockIds.get(hh)!;
    }
  }
  const hasEarly = earlyMask.some((m) => m !== 0);
  const must = new Set(options.mustHaveKeys ?? []);
  const maxSize = Math.max(1, ...sizes);
  const wPos = new Float64Array(n); // per-shot "earlier is better" weight
  for (let i = 0; i < n; i++) {
    let hasKid = false;
    for (let k = 0; k < W; k++) if (M[i * W + k]! & kidMask[k]!) hasKid = true;
    if (options.kidsFirst && hasKid) wPos[i]! += A_KIDS;
    if (options.bigGroupFirst) wPos[i]! += (A_BIG * sizes[i]!) / maxSize;
    if (options.mustHavesEarly && must.has(shots[i]!.key)) wPos[i]! += A_MUST;
  }
  const olderCount = new Int32Array(n);
  for (let i = 0; i < n; i++) for (let k = 0; k < W; k++) olderCount[i]! += pop(M[i * W + k]! & olderMask[k]!);

  const ham = (i: number, j: number) => {
    let d = 0;
    for (let k = 0; k < W; k++) d += pop(M[i * W + k]! ^ M[j * W + k]!);
    return d;
  };
  const seen = new Int32Array(W);
  const objective = (ord: Int32Array) => {
    let c = 0;
    for (let i = 0; i < n; i++) {
      if (i) c += ham(ord[i - 1]!, ord[i]!);
      c += wPos[ord[i]!]! * i;
    }
    if (options.releaseOlderEarly || hasEarly) {
      seen.fill(0);
      for (let i = n - 1; i >= 0; i--) {
        const s = ord[i]!;
        let fresh = 0, freshEarly = 0;
        for (let k = 0; k < W; k++) {
          fresh += pop(M[s * W + k]! & olderMask[k]! & ~seen[k]!);
          freshEarly += pop(M[s * W + k]! & earlyMask[k]! & ~seen[k]!);
          seen[k]! |= M[s * W + k]!;
        }
        if (options.releaseOlderEarly) c += G_OLDER * fresh * i;
        c += G_EARLY * freshEarly * i;
      }
    }
    return c;
  };

  // fixed prefix
  const keyIdx = new Map<string, number>();
  shots.forEach((s, i) => { if (!keyIdx.has(s.key)) keyIdx.set(s.key, i); });
  const prefix: number[] = [];
  const used = new Uint8Array(n);
  for (const k of options.fixedPrefix ?? []) {
    const i = keyIdx.get(k);
    if (i !== undefined && !used[i]!) { used[i]! = 1; prefix.push(i); }
  }
  const P = prefix.length;
  const free: number[] = [];
  for (let i = 0; i < n; i++) if (!used[i]!) free.push(i);

  let best = new Int32Array(n);
  if (free.length) {
    let starts: number[];
    const bySize = [...free].sort((a, b) => sizes[b]! - sizes[a]! || a - b);
    const lowTier = tiered ? Math.min(...free.map((i) => tier[i]!)) : 0;
    const allowed = tiered ? bySize.filter((i) => tier[i]! === lowTier) : bySize;
    if (options.bigGroupFirst && !P) starts = [allowed[0]!];
    else if (lowTier === 0 && tiered) starts = [allowed[0]!]; // everyone shots: largest first, no choice
    else if (free.length <= 60) starts = tiered ? free.filter((i) => tier[i]! === lowTier) : free;
    else starts = [...allowed.slice(0, 15), ...allowed.slice(-15)];
    let bestCost: number;
    // the plain input order is always a candidate, so we never come out worse than it
    const tierSorted = tiered ? [...free].sort((a, b) => tier[a]! - tier[b]! || (tier[a]! === 0 ? sizes[b]! - sizes[a]! : 0) || a - b) : free;
    const identity = Int32Array.from([...prefix, ...tierSorted]);
    best = identity;
    bestCost = objective(identity);
    for (const s of starts) {
      const ord = new Int32Array(n);
      const taken = Uint8Array.from(used);
      prefix.forEach((v, i) => { ord[i]! = v; });
      let cur = s, pos = P;
      ord[pos++]! = cur; taken[cur]! = 1;
      while (pos < n) {
        let bj = -1, bc = Infinity, minTier = LATE_TIER;
        if (tiered) for (const j of free) if (!taken[j]! && tier[j]! < minTier) minTier = tier[j]!;
        for (const j of free) {
          if (taken[j]! || (tiered && tier[j]! !== minTier)) continue;
          // everyone shots go largest first (ties by input order)
          const cst = minTier === 0 ? -sizes[j]! * 1e6 + j : ham(cur, j) + (wPos[j]! + (options.releaseOlderEarly ? G_OLDER * olderCount[j]! : 0) + G_EARLY * earlyCount[j]!) * pos;
          if (cst < bc) { bc = cst; bj = j; }
        }
        ord[pos++]! = bj; taken[bj]! = 1; cur = bj;
      }
      const c = objective(ord);
      if (c < bestCost - 1e-9) { bestCost = c; best = ord; }
    }
    // 2-opt on the free tail (the start stays put under bigGroupFirst)
    const lo = P + (options.bigGroupFirst && !P ? 1 : 0);
    const weighted = options.kidsFirst || options.bigGroupFirst || options.mustHavesEarly || options.releaseOlderEarly || hasEarly;
    let budget = 60000; // fixed evaluation budget keeps the result deterministic and fast
    let improved = true;
    for (let pass = 0; improved && pass < 25 && budget > 0; pass++) {
      improved = false;
      for (let i = lo; i < n - 1; i++) {
        if (tiered && tier[best[i]!]! === 0) continue; // everyone shots keep their order
        for (let j = i + 1; j < n; j++) {
          if (tiered && tier[best[i]!]! !== tier[best[j]!]!) break; // tiers stay in order: only reverse inside one
          if (weighted) {
            if (--budget < 0) break;
            reverse(best, i, j);
            const c = objective(best);
            if (c < bestCost - 1e-9) { bestCost = c; improved = true; } else reverse(best, i, j);
          } else {
            // pure path length: only the two boundary edges change
            const a = i > 0 ? ham(best[i - 1]!, best[i]!) : 0, b = j < n - 1 ? ham(best[j]!, best[j + 1]!) : 0;
            const a2 = i > 0 ? ham(best[i - 1]!, best[j]!) : 0, b2 = j < n - 1 ? ham(best[i]!, best[j + 1]!) : 0;
            if (a2 + b2 < a + b) { reverse(best, i, j); bestCost += a2 + b2 - a - b; improved = true; }
          }
        }
      }
    }
    if (options.groupHouseholds && blockHouseholds.length) arrangeBlocks(best, P);
    // orientation: prefer peeling off from the bigger end when nothing else decides
    if (!P && !options.bigGroupFirst && !tiered) {
      const rev = Int32Array.from(best).reverse();
      const rc = objective(rev);
      if (rc < bestCost - 1e-9 || (Math.abs(rc - bestCost) <= 1e-9 && sizes[rev[0]!]! > sizes[best[0]!]!)) best = rev;
    }
    if (options.cameraPersonId) groupCamera(best, P, options.cameraPersonId);
  } else prefix.forEach((v, i) => { best[i]! = v; });

  /** Camera person's shots first inside each tier / household block, relative order kept (P6). */
  function groupCamera(ord: Int32Array, from: number, cam: string) {
    let a = from;
    while (a < n) {
      let b = a + 1;
      while (b < n && tier[ord[b]!]! === tier[ord[a]!]! && blockOf[ord[b]!]! === blockOf[ord[a]!]!) b++;
      if (tier[ord[a]!]! !== 0 && b - a > 1) {
        const run = Array.from(ord.subarray(a, b));
        const mine = run.filter((i) => shots[i]!.peopleIds.includes(cam));
        const rest = run.filter((i) => !shots[i]!.peopleIds.includes(cam));
        [...mine, ...rest].forEach((v, k) => { ord[a + k]! = v; });
      }
      a = b;
    }
  }

  /** Rewrites the household-tier run of `ord` as contiguous blocks (see `groupHouseholds`). */
  function arrangeBlocks(ord: Int32Array, from: number) {
    let a = from;
    while (a < n && tier[ord[a]!]! !== 4) a++;
    let b = a;
    while (b < n && tier[ord[b]!]! === 4) b++;
    if (a >= b) return;
    const members: number[][] = blockHouseholds.map(() => []);
    for (let p = a; p < b; p++) members[blockOf[ord[p]!]!]!.push(ord[p]!);
    // blocks follow the order of the branches in the tree, then the households' own order
    const rank = blockHouseholds.map((hi) => {
      const h = fam.households[hi]!;
      const br = fam.branches.findIndex((x) => h.adultIds.some((id) => x.memberIds.includes(id)));
      return (br < 0 ? fam.branches.length : br) * 10000 + hi;
    });
    // inside a block: biggest first, then by must-have / kids weight, then fewest changes, then input order
    const inside = (blk: number[], cur: number): number[] => {
      const left = [...blk].sort((x, y) => x - y);
      const out: number[] = [];
      while (left.length) {
        let bi = 0;
        for (let q = 1; q < left.length; q++) {
          const x = left[q]!, y = left[bi]!;
          const d = sizes[y]! - sizes[x]! || wPos[y]! - wPos[x]! || (cur >= 0 ? ham(cur, x) - ham(cur, y) : 0);
          if (d < 0 || (d === 0 && x < y)) bi = q;
        }
        cur = left.splice(bi, 1)[0]!;
        out.push(cur);
      }
      return out;
    };
    const placed = new Set<number>();
    const result: number[] = [];
    let prev = a > 0 ? ord[a - 1]! : -1;
    while (placed.size < members.length) {
      let bestBlk = -1, bestCost = Infinity;
      for (let blk = 0; blk < members.length; blk++) {
        if (placed.has(blk) || !members[blk]!.length) continue;
        const first = inside(members[blk]!, prev)[0]!;
        const cost = prev >= 0 ? ham(prev, first) : 0;
        if (cost < bestCost || (cost === bestCost && rank[blk]! < rank[bestBlk]!)) { bestCost = cost; bestBlk = blk; }
      }
      if (bestBlk < 0) break;
      placed.add(bestBlk);
      const seq = inside(members[bestBlk]!, prev);
      result.push(...seq);
      prev = seq[seq.length - 1]!;
    }
    result.forEach((v, k) => { ord[a + k]! = v; });
  }

  const order = [...best].map((i) => shots[i]!.key);
  const people2 = (i: number) => [...shots[i]!.peopleIds, ...shots[i]!.extraIds];
  const lastIndex = new Map<string, number>();
  best.forEach((si, pos) => { for (const id of people2(si)) lastIndex.set(id, pos); });
  const steps: OrderStep[] = [];
  let changes = 0;
  for (let pos = 0; pos < n; pos++) {
    const cur = people2(best[pos]!);
    const prev = pos ? new Set(people2(best[pos - 1]!)) : new Set<string>();
    const curSet = new Set(cur);
    const callIn = cur.filter((id) => !prev.has(id));
    const canLeave = [...prev].filter((id) => !curSet.has(id));
    if (pos) changes += callIn.length + canLeave.length;
    steps.push({ key: shots[best[pos]!]!.key, callIn, canLeave, doneForDay: canLeave.filter((id) => lastIndex.get(id)! < pos) });
  }
  const setup = options.setupMinutes ?? DEFAULT_SETUP_MINUTES;
  const minutes: OrderResult['minutes'] = [];
  let t = n ? setup : 0;
  for (let pos = 0; pos < n; pos++) {
    const duration = minutesForSize(sizes[best[pos]!]!, options.minutesBySize);
    minutes.push({ key: shots[best[pos]!]!.key, start: t, duration });
    t += duration;
  }
  return { order, steps, minutes, totalMinutes: t, changes, doneAfterLast: n ? people2(best[n - 1]!) : [] };
}

function reverse(a: Int32Array, i: number, j: number) {
  while (i < j) { const t = a[i]!; a[i]! = a[j]!; a[j]! = t; i++; j--; }
}
