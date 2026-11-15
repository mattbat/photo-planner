import { describe, expect, it } from 'vitest';
import { demoFamily, simpleFamily } from './fixtures';
import { initialView } from './initialView';
import { CARD_W, layoutTree } from './layout';

const BOX = { w: 402, h: 420 };

describe('initialView', () => {
  it('centres a small tree and fits it whole', () => {
    const l = layoutTree(simpleFamily);
    const v = initialView(l, BOX.w, BOX.h, 0.6);
    expect(v.k).toBeGreaterThanOrEqual(0.6);
    expect(v.tx).toBeCloseTo((BOX.w - l.width * v.k) / 2);
    expect(v.tx).toBeGreaterThanOrEqual(0);
    expect(v.ty).toBeLessThanOrEqual(24);
  });

  it('on a wide family starts at the minimum zoom, centred on the top couples, from the top', () => {
    const l = layoutTree(demoFamily);
    expect(l.width * 0.6).toBeGreaterThan(BOX.w);
    const v = initialView(l, BOX.w, BOX.h, 0.6);
    expect(v.k).toBe(0.6);
    const top = l.nodes.filter((n) => n.generation === 1);
    const leftEnd = Math.min(...top.map((n) => n.x));
    // The left end of the top row is on screen, not cut off.
    expect(v.tx + leftEnd * v.k).toBeGreaterThanOrEqual(0);
    // Never scrolled past the left edge of the content or leaving a gap there.
    expect(v.tx).toBeLessThanOrEqual(8);
    expect(v.tx).toBeGreaterThanOrEqual(BOX.w - l.width * v.k - 8);
    // Top card starts near the top of the box, with no empty strip above.
    const topY = Math.min(...top.map((n) => n.y));
    expect(v.ty + topY * v.k).toBeCloseTo(8);
  });

  it('centres the top row when it fits the box', () => {
    const l = { width: 1200, height: 300, nodes: [{ x: 500, y: 20, generation: 1 }, { x: 650, y: 20, generation: 1 }, { x: 0, y: 150, generation: 2 }] };
    const v = initialView(l, 400, 300, 0.6);
    const cx = (500 + 650 + CARD_W) / 2;
    expect(v.tx + cx * v.k).toBeCloseTo(200);
  });

  it('the Fit button fits and centres the whole tree', () => {
    const l = layoutTree(demoFamily);
    const v = initialView(l, BOX.w, BOX.h, 0);
    expect(v.k).toBeCloseTo(Math.min(BOX.w / l.width, BOX.h / l.height));
    expect(v.tx).toBeCloseTo((BOX.w - l.width * v.k) / 2);
    expect(l.width * v.k).toBeLessThanOrEqual(BOX.w + 0.001);
  });

  it('falls back to every card when there is no top row', () => {
    const l = { width: 3000, height: 100, nodes: [{ x: 1500, y: 20, generation: 2 }] };
    const v = initialView(l, 400, 300, 0.6);
    expect(v.tx).toBeGreaterThanOrEqual(400 - 3000 * 0.6 - 8);
    expect(v.tx).toBeLessThanOrEqual(8);
  });
});
