import type { TreePerson } from './types';

export const CARD_W = 120;
export const CARD_H = 60;
export const PARTNER_GAP = 28;
export const SIBLING_GAP = 28;
export const ROOT_GAP = 64;
export const ROW_GAP = 76;
export const PADDING = 24;
export const HOUSEHOLD_PAD = 8;
export const BRANCH_COLORS = 8;

export interface LayoutOptions {
  cardW?: number;
  cardH?: number;
  partnerGap?: number;
  siblingGap?: number;
  rootGap?: number;
  rowGap?: number;
  padding?: number;
}

export interface LayoutNode {
  id: string;
  /** top-left of the card */
  x: number;
  y: number;
  /** 1-based: G1 is the top row */
  generation: number;
  /** id of the child-of-a-root-couple heading this person's branch (undefined for root couples) */
  branchId?: string;
  /** 0..7; root-couple people use 0 (and have no branchId) */
  colorIndex: number;
}
export interface LayoutCouple {
  aId: string;
  bId: string;
  x1: number;
  x2: number;
  y: number;
  separated: boolean;
}
export interface Point { x: number; y: number }
export interface LayoutChildLink {
  /** a couple key (see coupleKey) or a single parent's person id */
  fromCoupleOrPersonId: string;
  childId: string;
  path: Point[];
}
export interface LayoutHousehold {
  ids: string[];
  rect: { x: number; y: number; w: number; h: number };
}
export interface TreeLayout {
  nodes: LayoutNode[];
  couples: LayoutCouple[];
  childLinks: LayoutChildLink[];
  households: LayoutHousehold[];
  width: number;
  height: number;
}

export function coupleKey(a: string, b: string): string {
  return a < b ? `${a}+${b}` : `${b}+${a}`;
}

type Contour = Map<number, [number, number]>;
interface Sub { contour: Contour; kidOff: number[] }

function mergeContour(acc: Contour, c: Contour, shift: number) {
  for (const [g, [l, r]] of c) {
    const cur = acc.get(g);
    if (!cur) acc.set(g, [l + shift, r + shift]);
    else { cur[0] = Math.min(cur[0], l + shift); cur[1] = Math.max(cur[1], r + shift); }
  }
}
function shiftContour(c: Contour, d: number) {
  for (const v of c.values()) { v[0] += d; v[1] += d; }
}
function offsetFor(acc: Contour, c: Contour, gap: number): number {
  let off = -Infinity;
  for (const [g, [l]] of c) {
    const a = acc.get(g);
    if (a) off = Math.max(off, a[1] + gap - l);
  }
  return off === -Infinity ? 0 : off;
}

export function layoutTree(peopleIn: TreePerson[], opts: LayoutOptions = {}): TreeLayout {
  const cardW = opts.cardW ?? CARD_W, cardH = opts.cardH ?? CARD_H;
  const partnerGap = opts.partnerGap ?? PARTNER_GAP, sibGap = opts.siblingGap ?? SIBLING_GAP;
  const rootGap = opts.rootGap ?? ROOT_GAP, rowGap = opts.rowGap ?? ROW_GAP;
  const pad = opts.padding ?? PADDING;

  // ---- normalize input ----
  const idx = new Map<string, number>();
  const people: TreePerson[] = [];
  for (const p of peopleIn) if (!idx.has(p.id)) { idx.set(p.id, people.length); people.push(p); }
  const n = people.length;
  const parents: number[][] = people.map((p, i) => {
    const out: number[] = [];
    for (const id of p.parentIds) {
      const j = idx.get(id);
      if (j !== undefined && j !== i && !out.includes(j)) out.push(j);
    }
    return out.slice(0, 2);
  });
  const partners: Set<number>[] = people.map(() => new Set<number>());
  const sepSet = new Set<string>();
  const pk = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const link = (a: number, b: number) => { if (a !== b) { partners[a]!.add(b); partners[b]!.add(a); } };
  people.forEach((p, i) => {
    for (const id of p.partnerIds) { const j = idx.get(id); if (j !== undefined) link(i, j); }
    for (const id of p.separatedPartnerIds ?? []) {
      const j = idx.get(id);
      if (j !== undefined && j !== i) { link(i, j); sepSet.add(pk(i, j)); }
    }
  });
  parents.forEach((ps) => { if (ps.length === 2) link(ps[0]!, ps[1]!); });
  const children: number[][] = people.map(() => []);
  parents.forEach((ps, i) => ps.forEach((p) => children[p]!.push(i)));

  // ---- generations (child > parents, partners equal) ----
  const gen = new Array<number>(n).fill(0);
  for (let it = 0; it < n + 3; it++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      for (const p of parents[i]!) if (gen[i]! < gen[p]! + 1) { gen[i] = gen[p]! + 1; changed = true; }
      for (const q of partners[i]!) if (gen[i]! < gen[q]!) { gen[i] = gen[q]!; changed = true; }
    }
    if (!changed) break;
  }

  // ---- partner components ----
  const compOf = new Array<number>(n).fill(-1);
  const comps: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (compOf[i]! >= 0) continue;
    const members: number[] = [];
    const stack = [i];
    compOf[i] = comps.length;
    while (stack.length) {
      const x = stack.pop()!;
      members.push(x);
      for (const q of partners[x]!) if (compOf[q]! < 0) { compOf[q] = comps.length; stack.push(q); }
    }
    members.sort((a, b) => a - b);
    comps.push(orderChain(members));
  }
  function orderChain(members: number[]): number[] {
    if (members.length < 2) return members;
    let hub = members[0]!;
    for (const m of members) if (partners[m]!.size > partners[hub]!.size) hub = m;
    const left: number[] = [], right: number[] = [];
    const multi = partners[hub]!.size > 1;
    for (const q of [...partners[hub]!].sort((a, b) => a - b)) {
      (multi && sepSet.has(pk(hub, q)) ? left : right).push(q);
    }
    const placed = new Set<number>([hub, ...left, ...right]);
    for (let guard = 0; placed.size < members.length && guard < members.length; guard++) {
      for (const r of members) {
        if (placed.has(r)) continue;
        const nb = [...partners[r]!].find((q) => placed.has(q));
        if (nb === undefined) continue;
        (left.includes(nb) ? left : right).push(r);
        placed.add(r);
      }
    }
    return [...left.reverse(), hub, ...right];
  }
  const nc = comps.length;
  const compGen = comps.map((m) => Math.max(...m.map((i) => gen[i]!)));

  // ---- hosts: the first parent couple becomes the layout parent ----
  const parentComps: number[][] = comps.map((m, c) => {
    const s = new Set<number>();
    for (const i of m) for (const p of parents[i]!) if (compGen[compOf[p]!]! < compGen[c]!) s.add(compOf[p]!);
    return [...s].sort((a, b) => a - b);
  });
  const hostOf = parentComps.map((ps) => (ps.length ? ps[0]! : -1));
  const rootOf = (c: number): number => { while (hostOf[c]! >= 0) c = hostOf[c]!; return c; };
  const roots: number[] = [];
  for (let c = 0; c < nc; c++) if (hostOf[c]! < 0) roots.push(c);

  // order roots so that roots joined by a marriage are adjacent
  const rootLinks = new Map<number, Set<number>>();
  roots.forEach((r) => rootLinks.set(r, new Set()));
  for (let c = 0; c < nc; c++) {
    if (hostOf[c]! < 0) continue;
    for (const s of parentComps[c]!) {
      const a = rootOf(hostOf[c]!), b = rootOf(s);
      if (a !== b) { rootLinks.get(a)!.add(b); rootLinks.get(b)!.add(a); }
    }
  }
  const rootOrder: number[] = [];
  const seenRoot = new Set<number>();
  const visit = (r: number) => {
    if (seenRoot.has(r)) return;
    seenRoot.add(r); rootOrder.push(r);
    for (const q of [...rootLinks.get(r)!].sort((a, b) => a - b)) visit(q);
  };
  roots.forEach(visit);
  const rootPos = new Map<number, number>();
  rootOrder.forEach((r, i) => rootPos.set(r, i));

  // partner order inside a couple: bloodline / earlier-root parents first
  for (let c = 0; c < nc; c++) {
    const m = comps[c]!;
    if (m.length !== 2) continue;
    const key = (i: number) => {
      if (!parents[i]!.length) return Infinity;
      const pc = parents[i]!.map((p) => compOf[p]!).filter((x) => compGen[x]! < compGen[c]!);
      return pc.length ? rootPos.get(rootOf(pc[0]!)) ?? 0 : Infinity;
    };
    const [a, b] = m as [number, number];
    const ka = key(a), kb = key(b);
    if (kb < ka) comps[c] = [b, a];
  }

  // ---- order children of each host ----
  const effGrown = (i: number) => people[i]!.grown || partners[i]!.size > 0 || children[i]!.length > 0;
  const memberPos = (c: number, i: number) => comps[c]!.indexOf(i);
  const hostedKids: number[][] = comps.map(() => []);
  for (let c = 0; c < nc; c++) if (hostOf[c]! >= 0) hostedKids[hostOf[c]!]!.push(c);
  hostedKids.forEach((kids, h) => {
    const key = (k: number) => {
      const persons = comps[k]!.filter((i) => parents[i]!.some((p) => compOf[p] === h));
      const first = Math.min(...persons);
      const grp = Math.min(...persons.map((i) => Math.min(...parents[i]!.filter((p) => compOf[p] === h).map((p) => memberPos(h, p)))));
      let pref = 0;
      for (const s of parentComps[k]!) if (s !== h) {
        const rs = rootPos.get(rootOf(s))!, rh = rootPos.get(rootOf(h))!;
        if (rs > rh) pref = 1; else if (rs < rh) pref = -1;
      }
      const kid = comps[k]!.length === 1 && !effGrown(comps[k]![0]!);
      return [kid ? 0 : 1, pref, grp, first];
    };
    const keys = new Map(kids.map((k) => [k, key(k)]));
    kids.sort((a, b) => {
      const x = keys.get(a)!, y = keys.get(b)!;
      return x[0]! - y[0]! || x[1]! - y[1]! || x[2]! - y[2]! || x[3]! - y[3]!;
    });
  });

  // ---- tidy-tree placement with per-generation contours ----
  const rowW = (c: number) => comps[c]!.length * cardW + (comps[c]!.length - 1) * partnerGap;
  const subs = new Map<number, Sub>();
  const attachX = (h: number, k: number, kidOff: number): [number, number] => {
    let mn = Infinity, mx = -Infinity;
    for (const i of comps[k]!) {
      if (!parents[i]!.some((p) => compOf[p] === h)) continue;
      const ax = kidOff + memberPos(k, i) * (cardW + partnerGap) + cardW / 2;
      mn = Math.min(mn, ax); mx = Math.max(mx, ax);
    }
    return [mn, mx];
  };
  function place(c: number): Sub {
    const W = rowW(c);
    const kids = hostedKids[c]!;
    const contour: Contour = new Map();
    if (!kids.length) {
      contour.set(compGen[c]!, [0, W]);
      const s = { contour, kidOff: [] };
      subs.set(c, s);
      return s;
    }
    const offs: number[] = [];
    let lo = Infinity, hi = -Infinity;
    // not-grown kids sit directly under the parents (inside the household outline);
    // grown kids (own households) are placed clear of that outline, to the right.
    const nNg = kids.filter((k) => comps[k]!.length === 1 && !effGrown(comps[k]![0]!)).length;
    let rowLeft = 0;
    for (let ki = 0; ki < kids.length; ki++) {
      const k = kids[ki]!;
      const sub = place(k);
      let off = offs.length ? offsetFor(contour, sub.contour, sibGap) : 0;
      if (nNg > 0 && ki === nNg) {
        let mnL = Infinity;
        for (const [l] of sub.contour.values()) mnL = Math.min(mnL, l);
        off = Math.max(off, rowLeft + W + sibGap - mnL);
      }
      offs.push(off);
      mergeContour(contour, sub.contour, off);
      if (nNg === 0 || ki < nNg) {
        const [a, b] = attachX(c, k, off);
        lo = Math.min(lo, a); hi = Math.max(hi, b);
      }
      if (nNg > 0 && ki === nNg - 1) {
        rowLeft = (lo + hi) / 2 - W / 2;
        if (rowLeft < 0) { for (let i = 0; i < offs.length; i++) offs[i] = offs[i]! - rowLeft; shiftContour(contour, -rowLeft); rowLeft = 0; }
      }
    }
    if (nNg === 0) {
      rowLeft = (lo + hi) / 2 - W / 2;
      if (rowLeft < 0) { for (let i = 0; i < offs.length; i++) offs[i] = offs[i]! - rowLeft; shiftContour(contour, -rowLeft); rowLeft = 0; }
    }
    const rel = offs.map((o) => o - rowLeft);
    shiftContour(contour, -rowLeft);
    // household outline spans the parents' row width at the kids' rows too
    for (let ki = 0; ki < nNg; ki++) mergeContour(contour, new Map([[compGen[kids[ki]!]!, [0, W]]]), 0);
    const mine = contour.get(compGen[c]!);
    if (mine) { mine[0] = Math.min(mine[0], 0); mine[1] = Math.max(mine[1], W); } else contour.set(compGen[c]!, [0, W]);
    const s = { contour, kidOff: rel };
    subs.set(c, s);
    return s;
  }
  const rowLeftOf = new Array<number>(nc).fill(0);
  const global: Contour = new Map();
  rootOrder.forEach((r, i) => {
    const sub = place(r);
    const off = i === 0 ? 0 : offsetFor(global, sub.contour, rootGap);
    mergeContour(global, sub.contour, off);
    const assign = (c: number, left: number) => {
      rowLeftOf[c] = left;
      hostedKids[c]!.forEach((k, j) => assign(k, left + subs.get(c)!.kidOff[j]!));
    };
    assign(r, off);
  });

  // ---- coordinates ----
  const px = new Array<number>(n).fill(0);
  const py = new Array<number>(n).fill(0);
  const rowY = (g: number) => pad + HOUSEHOLD_PAD + g * (cardH + rowGap);
  comps.forEach((m, c) => m.forEach((i, j) => {
    px[i] = rowLeftOf[c]! + j * (cardW + partnerGap);
    py[i] = rowY(compGen[c]!);
  }));
  const cx = (i: number) => px[i]! + cardW / 2;

  // ---- branches / colors ----
  const branch = new Array<string | undefined>(n).fill(undefined);
  const color = new Array<number>(n).fill(0);
  const claimed = new Set<number>();
  let nextColor = 0;
  const claim = (c: number, head: number, ci: number) => {
    if (claimed.has(c)) return;
    claimed.add(c);
    for (const i of comps[c]!) { branch[i] = people[head]!.id; color[i] = ci; }
    for (const i of comps[c]!) for (const ch of children[i]!) claim(compOf[ch]!, head, ci);
  };
  const rootSet = new Set(roots);
  for (const r of rootOrder) {
    const heads = new Set<number>();
    for (const i of comps[r]!) for (const ch of children[i]!) heads.add(ch);
    // Left to right on the page (input order only breaks ties), so colors follow the picture, not the ids.
    for (const h of [...heads].sort((a, b) => px[a]! - px[b]! || a - b)) {
      if (rootSet.has(compOf[h]!) || claimed.has(compOf[h]!)) continue;
      claim(compOf[h]!, h, nextColor++ % BRANCH_COLORS);
    }
  }

  const nodes: LayoutNode[] = people.map((p, i) => ({
    id: p.id, x: px[i]!, y: py[i]!, generation: gen[i]! + 1, branchId: branch[i], colorIndex: color[i]!,
  }));

  // ---- couples ----
  const couples: LayoutCouple[] = [];
  const coupleGeom = new Map<string, { mx: number; y: number }>();
  for (let i = 0; i < n; i++) for (const q of [...partners[i]!].sort((a, b) => a - b)) {
    if (q < i) continue;
    const [a, b] = px[i]! <= px[q]! ? [i, q] : [q, i];
    const adjacent = Math.abs(px[b]! - px[a]! - (cardW + partnerGap)) < 1e-6;
    const x1 = adjacent ? px[a]! + cardW : cx(a);
    const x2 = adjacent ? px[b]! : cx(b);
    const y = adjacent ? py[a]! + cardH / 2 : py[a]! + cardH + 10;
    couples.push({ aId: people[a]!.id, bId: people[b]!.id, x1, x2, y, separated: sepSet.has(pk(i, q)) });
    coupleGeom.set(pk(i, q), { mx: (x1 + x2) / 2, y });
  }

  // ---- child links ----
  const childLinks: LayoutChildLink[] = [];
  parents.forEach((ps, ch) => {
    if (!ps.length) return;
    let from: string, sx: number, sy: number;
    if (ps.length === 2) {
      const g = coupleGeom.get(pk(ps[0]!, ps[1]!))!;
      from = coupleKey(people[ps[0]!]!.id, people[ps[1]!]!.id); sx = g.mx; sy = g.y;
    } else {
      from = people[ps[0]!]!.id; sx = cx(ps[0]!); sy = py[ps[0]!]! + cardH;
    }
    const tx = cx(ch), ty = py[ch]!;
    const secondary = hostOf[compOf[ch]!]! >= 0 && !ps.some((p) => compOf[p] === hostOf[compOf[ch]!]);
    const bus = ty - rowGap / 2 + (secondary ? 16 : 0);
    const path: Point[] = Math.abs(sx - tx) < 1e-6
      ? [{ x: sx, y: sy }, { x: tx, y: ty }]
      : [{ x: sx, y: sy }, { x: sx, y: bus }, { x: tx, y: bus }, { x: tx, y: ty }];
    childLinks.push({ fromCoupleOrPersonId: from, childId: people[ch]!.id, path });
  });

  // ---- households (grown children + partner(s) + their not-grown kids) ----
  const households: LayoutHousehold[] = [];
  comps.forEach((m) => {
    if (!m.some((i) => parents[i]!.length && effGrown(i))) return;
    const ids = [...m];
    for (const i of m) for (const ch of children[i]!) if (!effGrown(ch) && !ids.includes(ch)) ids.push(ch);
    if (ids.length < 2) return;
    const x0 = Math.min(...ids.map((i) => px[i]!)) - HOUSEHOLD_PAD;
    const x1 = Math.max(...ids.map((i) => px[i]! + cardW)) + HOUSEHOLD_PAD;
    const y0 = Math.min(...ids.map((i) => py[i]!)) - HOUSEHOLD_PAD;
    const y1 = Math.max(...ids.map((i) => py[i]! + cardH)) + HOUSEHOLD_PAD;
    households.push({ ids: ids.map((i) => people[i]!.id), rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } });
  });

  // ---- normalize / size ----
  let minX = Infinity, maxX = -Infinity, maxY = 0;
  for (const nd of nodes) { minX = Math.min(minX, nd.x); maxX = Math.max(maxX, nd.x + cardW); maxY = Math.max(maxY, nd.y + cardH); }
  if (!n) return { nodes, couples, childLinks, households, width: pad * 2, height: pad * 2 };
  const dx = pad + HOUSEHOLD_PAD - minX;
  for (const nd of nodes) nd.x += dx;
  for (const c of couples) { c.x1 += dx; c.x2 += dx; }
  for (const l of childLinks) for (const p of l.path) p.x += dx;
  for (const h of households) h.rect.x += dx;
  return { nodes, couples, childLinks, households, width: maxX - minX + 2 * (pad + HOUSEHOLD_PAD), height: maxY + pad + HOUSEHOLD_PAD };
}
