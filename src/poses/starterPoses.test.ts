import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { starterPoses } from './starterPoses';
import { POSE_CATEGORIES, POSE_TAGS } from '../data/types';

const publicDir = path.resolve(__dirname, '../../public');

describe('starter pose data', () => {
  it('has about 60 poses', () => {
    expect(starterPoses.length).toBeGreaterThanOrEqual(55);
  });

  it('has unique kebab-case ids', () => {
    const ids = starterPoses.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('has at least 5 poses per category', () => {
    for (const c of POSE_CATEGORIES) {
      expect(starterPoses.filter((p) => p.category === c).length, c).toBeGreaterThanOrEqual(5);
    }
  });

  it.each(starterPoses.map((p) => [p.id, p] as const))('%s has valid fields', (_id, p) => {
    expect(p.name.trim().length).toBeGreaterThan(2);
    expect(POSE_CATEGORIES).toContain(p.category);
    expect(Number.isInteger(p.minSize) && p.minSize >= 1).toBe(true);
    expect(p.maxSize).toBeGreaterThanOrEqual(p.minSize);
    expect(p.maxSize).toBeLessThanOrEqual(99);
    const sentences = p.description.split(/[.!?]+(?:\s|$)/).filter(Boolean);
    expect(sentences.length).toBeGreaterThanOrEqual(1);
    expect(sentences.length).toBeLessThanOrEqual(2);
    expect(p.directions.length).toBeGreaterThanOrEqual(3);
    expect(p.directions.length).toBeLessThanOrEqual(6);
    expect(p.tips.length + p.mistakes.length).toBeGreaterThanOrEqual(2);
    expect(p.tips.length + p.mistakes.length).toBeLessThanOrEqual(4);
    expect(p.mistakes.length).toBeGreaterThanOrEqual(1);
    expect(p.tips.length).toBeGreaterThanOrEqual(1);
    for (const t of [...p.directions, ...p.tips, ...p.mistakes]) expect(t.trim().length).toBeGreaterThan(5);
    expect(p.tags.length).toBeGreaterThan(0);
    for (const t of p.tags) expect(POSE_TAGS).toContain(t);
    expect(['easy', 'medium', 'hard']).toContain(p.difficulty);
    expect(p.builtIn).toBe(true);
    expect(p.favorite).toBe(false);
    expect(p.imageCredit?.source).toBe('Photo Planner');
  });

  it('has an existing, small, well-formed SVG image for every pose', () => {
    for (const p of starterPoses) {
      const file = path.join(publicDir, p.image ?? '');
      expect(fs.existsSync(file), p.image ?? '').toBe(true);
      const svg = fs.readFileSync(file, 'utf8');
      expect(svg.length, p.image ?? '').toBeLessThanOrEqual(8 * 1024);
      expect(svg).toContain('viewBox="0 0 320 240"');
      expect(svg.trimStart().startsWith('<svg')).toBe(true);
    }
  });

  it('has no orphan images', () => {
    const used = new Set(starterPoses.map((p) => p.image ?? ''));
    for (const f of fs.readdirSync(path.join(publicDir, 'poses'))) expect(used.has('poses/' + f), f).toBe(true);
  });
});
