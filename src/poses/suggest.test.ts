import { describe, expect, it } from 'vitest';
import { starterPoses } from './starterPoses';
import { filterPoses, suggestPoses, type SuggestInput } from './suggest';

const base: SuggestInput = { peopleCount: 4, hasKids: true, hasBaby: false, generations: 2, isCouple: false, hasSeniors: false };

describe('suggestPoses', () => {
  it('only returns poses that fit the head-count', () => {
    for (const n of [1, 2, 3, 5, 8, 12]) {
      const r = suggestPoses(starterPoses, { ...base, peopleCount: n });
      expect(r.length).toBeGreaterThan(0);
      for (const p of r) {
        expect(p.minSize).toBeLessThanOrEqual(n);
        expect(p.maxSize).toBeGreaterThanOrEqual(n);
      }
    }
  });

  it('ranks couple poses first for a couple', () => {
    const r = suggestPoses(starterPoses, { peopleCount: 2, hasKids: false, hasBaby: false, generations: 1, isCouple: true, hasSeniors: false });
    expect(r.slice(0, 5).every((p) => p.category === 'couples')).toBe(true);
  });

  it('ranks parent/child poses first for a parent with a child', () => {
    const r = suggestPoses(starterPoses, { peopleCount: 2, hasKids: true, hasBaby: false, generations: 2, isCouple: false, hasSeniors: false });
    expect(r[0]!.category).toBe('parent-child');
  });

  it('ranks large-group poses first for big groups', () => {
    const r = suggestPoses(starterPoses, { ...base, peopleCount: 12 });
    expect(r[0]!.category).toBe('large-group');
  });

  it('promotes baby poses when there is a baby and demotes them otherwise', () => {
    const withBaby = suggestPoses(starterPoses, { ...base, peopleCount: 2, hasBaby: true });
    const without = suggestPoses(starterPoses, { ...base, peopleCount: 2, hasBaby: false });
    const idx = (list: typeof withBaby, id: string) => list.findIndex((p) => p.id === id);
    expect(idx(withBaby, 'baby-to-cheek')).toBeLessThan(idx(without, 'baby-to-cheek'));
  });

  it('prefers three-generation poses only when there are 3+ generations', () => {
    const three = suggestPoses(starterPoses, { ...base, peopleCount: 3, generations: 3, hasSeniors: true });
    expect(three.slice(0, 6).some((p) => p.category === 'generations')).toBe(true);
    const two = suggestPoses(starterPoses, { ...base, peopleCount: 3, generations: 2 });
    expect(two.slice(0, 3).some((p) => p.category === 'generations')).toBe(false);
  });

  it('avoids kids poses when there are no kids', () => {
    const r = suggestPoses(starterPoses, { peopleCount: 1, hasKids: false, hasBaby: false, generations: 1, isCouple: false, hasSeniors: false });
    expect(r[0]!.category).toBe('individual');
    expect(r.findIndex((p) => p.category === 'kids-babies')).toBeGreaterThan(r.findIndex((p) => p.category === 'individual'));
  });

  it('penalises hard and lying poses for seniors', () => {
    const r = suggestPoses(starterPoses, { ...base, peopleCount: 3, hasSeniors: true, generations: 3 });
    const top = r.slice(0, 5);
    expect(top.every((p) => p.difficulty !== 'hard' && !p.tags.includes('lying-down'))).toBe(true);
  });

  it('is deterministic and does not mutate its input', () => {
    const copy = [...starterPoses];
    const a = suggestPoses(starterPoses, base).map((p) => p.id);
    const b = suggestPoses(starterPoses, base).map((p) => p.id);
    expect(a).toEqual(b);
    expect(starterPoses).toEqual(copy);
  });

  it('returns an empty list for an empty library or impossible size', () => {
    expect(suggestPoses([], base)).toEqual([]);
    expect(suggestPoses(starterPoses, { ...base, peopleCount: 0 })).toEqual([]);
  });
});

describe('filterPoses', () => {
  it('returns everything with no filter', () => {
    expect(filterPoses(starterPoses)).toHaveLength(starterPoses.length);
    expect(filterPoses(starterPoses, {})).toHaveLength(starterPoses.length);
  });

  it('filters by category', () => {
    const r = filterPoses(starterPoses, { category: 'couples' });
    expect(r.length).toBeGreaterThanOrEqual(5);
    expect(r.every((p) => p.category === 'couples')).toBe(true);
  });

  it('filters by group size', () => {
    const r = filterPoses(starterPoses, { size: 10 });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((p) => p.minSize <= 10 && p.maxSize >= 10)).toBe(true);
  });

  it('requires all tags', () => {
    const r = filterPoses(starterPoses, { tags: ['sitting', 'senior-friendly'] });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((p) => p.tags.includes('sitting') && p.tags.includes('senior-friendly'))).toBe(true);
  });

  it('searches text case-insensitively over name and description', () => {
    const r = filterPoses(starterPoses, { query: 'PIGGYBACK' });
    expect(r.map((p) => p.id)).toContain('piggyback');
    const words = filterPoses(starterPoses, { query: 'grandparent reading' });
    expect(words.map((p) => p.id)).toContain('grandparent-reading');
  });

  it('combines filters', () => {
    const r = filterPoses(starterPoses, { category: 'kids-babies', size: 1, tags: ['playful'], query: 'jump high' });
    expect(r.map((p) => p.id)).toEqual(['jumping-for-joy']);
  });

  it('returns empty when nothing matches and ignores blank queries', () => {
    expect(filterPoses(starterPoses, { query: 'zzzz-not-a-pose' })).toEqual([]);
    expect(filterPoses(starterPoses, { query: '   ' })).toHaveLength(starterPoses.length);
  });
});
