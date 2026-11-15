import type { Pose, PoseCategory, PoseTag } from '../data/types';

export interface SuggestInput {
  peopleCount: number;
  hasKids: boolean;
  hasBaby: boolean;
  /** number of generations in the group (1 = one generation) */
  generations: number;
  isCouple: boolean;
  hasSeniors: boolean;
}

export interface PoseFilter {
  category?: PoseCategory;
  /** number of people the pose must work for */
  size?: number;
  /** poses must have ALL of these tags */
  tags?: PoseTag[];
  /** free-text search over name, description, tags, category and directions */
  query?: string;
}

const DIFFICULTY_RANK = { easy: 1, medium: 2, hard: 3 } as const;

function fits(p: Pose, n: number): boolean {
  return n >= p.minSize && n <= p.maxSize;
}

/** Score of how well a pose suits the group (higher = better). Poses for the wrong group size are not scored. */
function score(p: Pose, g: SuggestInput): number {
  let s = 10;
  const n = g.peopleCount;
  const has = (t: PoseTag) => p.tags.includes(t);
  const cat = p.category;

  // group-size driven category affinity
  if (n === 1) {
    if (cat === 'individual') s += 12;
    if (cat === 'kids-babies' && g.hasKids) s += 10;
  } else if (n === 2) {
    if (g.isCouple && cat === 'couples') s += 14;
    if (!g.isCouple && g.hasKids && (cat === 'parent-child' || cat === 'siblings')) s += 12;
    if (!g.isCouple && !g.hasKids && cat === 'couples') s += 4;
  } else if (n <= 5) {
    if (cat === 'small-family') s += 12;
    if (g.hasKids && (cat === 'siblings' || cat === 'kids-babies')) s += 4;
    if (g.hasKids && cat === 'parent-child') s += 5;
  } else if (cat === 'large-group') {
    s += 12;
  }

  if (g.generations >= 3 && cat === 'generations') s += 12;
  if (g.generations < 3 && cat === 'generations') s -= 10;
  if (cat === 'candid') s += 2;

  // kids
  if (g.hasKids) {
    if (has('kids-friendly')) s += 3;
  } else {
    if (cat === 'kids-babies') s -= 20;
    if (cat === 'parent-child' || cat === 'siblings') s -= 6;
  }

  // babies
  if (g.hasBaby) {
    if (has('baby')) s += 6;
  } else if (has('baby')) {
    s -= 6;
  }

  // seniors
  if (g.hasSeniors) {
    if (has('senior-friendly')) s += 4;
    if (p.difficulty === 'hard') s -= 4;
    if (has('lying-down')) s -= 4;
  }

  // easier poses first when scores tie
  s -= (DIFFICULTY_RANK[p.difficulty] - 1) * 0.5;
  return s;
}

/** Rank poses for a group (PL5). Poses that do not fit the head-count are left out. */
export function suggestPoses(poses: readonly Pose[], input: SuggestInput): Pose[] {
  const scored = poses
    .filter((p) => fits(p, input.peopleCount))
    .map((p, i) => ({ p, i, s: score(p, input) }));
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  return scored.map((x) => x.p);
}

/** Filter poses by category, group size, tags (all must match) and free text (PL6). */
export function filterPoses(poses: readonly Pose[], f: PoseFilter = {}): Pose[] {
  const q = f.query?.trim().toLowerCase();
  const words = q ? q.split(/\s+/) : [];
  return poses.filter((p) => {
    if (f.category && p.category !== f.category) return false;
    if (f.size !== undefined && !fits(p, f.size)) return false;
    if (f.tags && f.tags.length && !f.tags.every((t) => p.tags.includes(t))) return false;
    if (words.length) {
      const hay = [p.name, p.description, p.category, p.tags.join(' '), p.directions.join(' ')].join(' ').toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}
