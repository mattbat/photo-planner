import { buildFamily } from './family';
import type { EnginePerson, Shot } from './types';

export interface OrderOptions {
  kidsFirst?: boolean;
  releaseOlderEarly?: boolean;
  bigGroupFirst?: boolean;
  mustHavesEarly?: boolean;
  mustHaveKeys?: Iterable<string>;
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

const A_KIDS = 0.2, A_BIG = 0.3, A_MUST = 0.4, G_OLDER = 0.25;

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
    if (options.releaseOlderEarly) {
      seen.fill(0);
      for (let i = n - 1; i >= 0; i--) {
        const s = ord[i]!;
        let fresh = 0;
        for (let k = 0; k < W; k++) {
          fresh += pop(M[s * W + k]! & olderMask[k]! & ~seen[k]!);
          seen[k]! |= M[s * W + k]!;
        }
        c += G_OLDER * fresh * i;
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
    if (options.bigGroupFirst && !P) starts = [bySize[0]!];
    else if (free.length <= 60) starts = free;
    else starts = [...bySize.slice(0, 15), ...bySize.slice(-15)];
    let bestCost: number;
    // the plain input order is always a candidate, so we never come out worse than it
    const identity = Int32Array.from([...prefix, ...free]);
    best = identity;
    bestCost = objective(identity);
    for (const s of starts) {
      const ord = new Int32Array(n);
      const taken = Uint8Array.from(used);
      prefix.forEach((v, i) => { ord[i]! = v; });
      let cur = s, pos = P;
      ord[pos++]! = cur; taken[cur]! = 1;
      while (pos < n) {
        let bj = -1, bc = Infinity;
        for (const j of free) {
          if (taken[j]!) continue;
          const cst = ham(cur, j) + (wPos[j]! + (options.releaseOlderEarly ? G_OLDER * olderCount[j]! : 0)) * pos;
          if (cst < bc) { bc = cst; bj = j; }
        }
        ord[pos++]! = bj; taken[bj]! = 1; cur = bj;
      }
      const c = objective(ord);
      if (c < bestCost - 1e-9) { bestCost = c; best = ord; }
    }
    // 2-opt on the free tail (the start stays put under bigGroupFirst)
    const lo = P + (options.bigGroupFirst && !P ? 1 : 0);
    const weighted = options.kidsFirst || options.bigGroupFirst || options.mustHavesEarly || options.releaseOlderEarly;
    let budget = 60000; // fixed evaluation budget keeps the result deterministic and fast
    let improved = true;
    for (let pass = 0; improved && pass < 25 && budget > 0; pass++) {
      improved = false;
      for (let i = lo; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
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
    // orientation: prefer peeling off from the bigger end when nothing else decides
    if (!P && !options.bigGroupFirst) {
      const rev = Int32Array.from(best).reverse();
      const rc = objective(rev);
      if (rc < bestCost - 1e-9 || (Math.abs(rc - bestCost) <= 1e-9 && sizes[rev[0]!]! > sizes[best[0]!]!)) best = rev;
    }
  } else prefix.forEach((v, i) => { best[i]! = v; });

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
