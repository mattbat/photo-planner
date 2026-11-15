import { CARD_W } from './layout';

export interface ViewState {
  /** Zoom. */
  k: number;
  /** Where the tree's origin sits in the box, in pixels. */
  tx: number;
  ty: number;
}

interface Measured {
  width: number;
  height: number;
  nodes: { x: number; y: number; generation: number }[];
}

const MARGIN = 8;

/**
 * Where the tree sits when it opens in a box `w` x `h` (V4). With `minK` 0
 * (the Fit button) the whole tree is fitted and centred. Otherwise the zoom
 * is whatever fits the tree, but never below `minK`, so a big family starts
 * readable; when that is wider than the box, the view is centred on the top
 * couple(s) (or at the left end of the top row if that is too wide) and starts at the top, so there is no empty strip above and no
 * content cut off on the left.
 */
export function initialView(layout: Measured, w: number, h: number, minK: number): ViewState {
  const fit = Math.min(w / layout.width, h / layout.height, 1.5);
  const k = Math.max(minK, fit);
  const scaledW = layout.width * k;
  const scaledH = layout.height * k;
  const ty0 = Math.max(0, (h - scaledH) / 2);
  if (scaledW <= w) return { k, tx: (w - scaledW) / 2, ty: minK > 0 ? Math.min(ty0, 24) : ty0 };
  const top = layout.nodes.filter((n) => n.generation === 1);
  const heads = top.length > 0 ? top : layout.nodes;
  const left = Math.min(...heads.map((n) => n.x));
  const right = Math.max(...heads.map((n) => n.x + CARD_W));
  const top0 = Math.min(...heads.map((n) => n.y));
  // Centre the top row if it fits; otherwise start at its left end.
  const want = (right - left) * k <= w - 2 * MARGIN ? w / 2 - ((left + right) / 2) * k : MARGIN - left * k;
  const tx = Math.min(MARGIN, Math.max(w - scaledW - MARGIN, want));
  return { k, tx, ty: MARGIN - top0 * k };
}
