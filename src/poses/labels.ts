import type { PoseCategory, PoseDifficulty, PoseTag } from '../data/types';

/** Plain-language names for the pose library (PL1, PL2). */
export const CATEGORY_LABELS: Record<PoseCategory, string> = {
  individual: 'Individual',
  couples: 'Couples',
  'parent-child': 'Parent + child',
  'kids-babies': 'Kids & babies',
  siblings: 'Siblings',
  'small-family': 'Small family (3–6)',
  'large-group': 'Large group (7+)',
  generations: 'Generations',
  candid: 'Candid / movement',
};

export const TAG_LABELS: Record<PoseTag, string> = {
  sitting: 'Sitting',
  standing: 'Standing',
  walking: 'Walking',
  'lying-down': 'Lying down',
  'close-up': 'Close-up',
  'full-length': 'Full-length',
  playful: 'Playful',
  formal: 'Formal',
  'kids-friendly': 'Kid-friendly',
  baby: 'Baby',
  'senior-friendly': 'Senior-friendly',
};

export const DIFFICULTY_LABELS: Record<PoseDifficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Tricky' };

/** The biggest group size meaning "any number of people". */
export const ANY_SIZE = 99;

/** "2 people", "3–6 people", "7+ people", "Any group size". */
export function sizeLabel(min: number, max: number): string {
  if (min <= 1 && max >= ANY_SIZE) return 'Any group size';
  if (max >= ANY_SIZE) return `${min}+ people`;
  if (min === max) return min === 1 ? '1 person' : `${min} people`;
  return `${min}–${max} people`;
}

/** Size after shrinking a photo so its longest side fits `max` pixels (never enlarges). */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
