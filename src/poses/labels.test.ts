import { describe, expect, it } from 'vitest';
import { POSE_CATEGORIES, POSE_TAGS } from '../data/types';
import { CATEGORY_LABELS, fitWithin, sizeLabel, TAG_LABELS } from './labels';

describe('labels', () => {
  it('names every category and tag', () => {
    for (const c of POSE_CATEGORIES) expect(CATEGORY_LABELS[c]).toBeTruthy();
    for (const t of POSE_TAGS) expect(TAG_LABELS[t]).toBeTruthy();
  });
  it('words group sizes', () => {
    expect(sizeLabel(1, 1)).toBe('1 person');
    expect(sizeLabel(2, 2)).toBe('2 people');
    expect(sizeLabel(3, 6)).toBe('3–6 people');
    expect(sizeLabel(7, 99)).toBe('7+ people');
    expect(sizeLabel(1, 99)).toBe('Any group size');
  });
  it('shrinks photos to the longest side and never enlarges', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});
