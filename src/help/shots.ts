/**
 * Screenshots used by the in-app help and the first-run intro (H-1, H-3).
 * Made by `npm run screenshots` (scripts/screens/capture.spec.ts) from the
 * demo family, in both themes, as public/help/<name>-<theme>.webp.
 */
export const SHOTS = {
  families: 'The Families screen with the demo family listed',
  tree: 'The family tree of the demo family, with generations in rows',
  'tree-list': 'The same family as a list, grouped by generation',
  shoots: 'The Shoots screen with an upcoming shoot',
  shoot: 'A shoot: who is coming, the light, and the templates',
  templates: 'The templates, grouped, each with how many shots it makes',
  'shot-list': 'The shot list in order, with must-haves starred and call-in lines',
  light: 'The Light section: location, golden hour times and suggested start',
  live: 'Shoot day: the current shot, who to call in, and the big Done button',
  'live-list': 'Shoot day, list view: every shot with done, skipped and waiting marks',
  summary: 'The shoot summary after finishing: shots done, skipped and retaken',
  poses: 'The pose library with category and group size filters',
  settings: 'Settings: appearance, back up, restore and updates',
} as const;

export type ShotName = keyof typeof SHOTS;

/** Every screenshot is a full iPhone 17 screen, in CSS pixels. */
export const SHOT_SIZE = { width: 402, height: 874 } as const;

export function shotUrl(name: ShotName, theme: 'dark' | 'light'): string {
  return `${import.meta.env.BASE_URL}help/${name}-${theme}.webp`;
}
