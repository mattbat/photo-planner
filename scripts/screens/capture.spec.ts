import { mkdirSync } from 'node:fs';
import { test } from '@playwright/test';

/**
 * Takes the screenshots for the help guide (§13): `npm run screenshots`.
 * Saves public/help/<screen>-<theme>.png, or into SHOTS_OUT=<folder> to look
 * at a change first. Uses made-up data only (B5). Today it captures the empty
 * shell; M8 extends it to walk the demo family through each screen.
 */
const OUT = process.env.SHOTS_OUT ?? 'public/help';
mkdirSync(OUT, { recursive: true });

const SCREENS = [
  ['shoots', '#/'],
  ['families', '#/families'],
  ['poses', '#/poses'],
  ['settings', '#/settings'],
] as const;

for (const theme of ['dark', 'light'] as const) {
  test(`screenshots (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(() => localStorage.setItem('photo-planner.installHintDismissed', '1'));
    for (const [name, hash] of SCREENS) {
      await page.goto(`./${hash}`);
      await page.waitForTimeout(350);
      await page.screenshot({ path: `${OUT}/${name}-${theme}.png`, animations: 'disabled' });
    }
  });
}
