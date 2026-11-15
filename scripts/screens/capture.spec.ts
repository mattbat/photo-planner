import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { SHOTS, type ShotName } from '../../src/help/shots';

/**
 * Takes the screenshots for the help guide (H-1, H-3, H-8): `npm run screenshots`.
 * Walks the demo family (made-up people) through a shoot in each theme and
 * saves public/help/<name>-<theme>.webp. Run it again whenever a screen
 * changes, and commit the images.
 */

// SHOTS_OUT=<folder> saves PNGs there instead, to look at a change before
// replacing the committed images. SHOTS_ALL=1 also takes a screenshot of every
// main screen in that folder (the M8 polish pass).
const PREVIEW = process.env.SHOTS_OUT;
const OUT = PREVIEW ?? 'public/help';
mkdirSync(OUT, { recursive: true });

for (const theme of ['dark', 'light'] as const) {
  test(`help screenshots (${theme})`, async ({ page }) => {
    test.setTimeout(180_000);
    const taken = new Set<ShotName>();
    const shot = async (name: ShotName) => {
      // Let sheets finish sliding up.
      await page.waitForTimeout(350);
      const png = await page.screenshot({ animations: 'disabled' });
      if (PREVIEW) await sharp(png).png().toFile(`${OUT}/${name}-${theme}.png`);
      else await sharp(png).webp({ quality: 70 }).toFile(`${OUT}/${name}-${theme}.webp`);
      taken.add(name);
    };
    const scrollTo = async (heading: string) => {
      await page.getByRole('heading', { name: heading, level: 2 }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
    };

    await page.addInitScript((theme) => {
      if (!sessionStorage.getItem('shots.ready')) {
        sessionStorage.setItem('shots.ready', '1');
        localStorage.setItem('photo-planner.theme', theme);
        localStorage.setItem('photo-planner.installHintDismissed', '1');
        localStorage.setItem('photo-planner.introSeen', '1');
        localStorage.setItem('photo-planner.lastBackupAt', String(Date.now()));
      }
    }, theme);
    // The time-zone lookup is the only network call; answer it locally.
    await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ json: { timezone: 'America/Chicago' } }));

    await page.goto('./#/families');
    await page.getByRole('button', { name: 'Load demo family' }).click();
    await expect(page.getByRole('heading', { name: /Pike–Vega family/ })).toBeVisible();
    await page.getByRole('button', { name: 'Fit' }).click();
    await shot('tree');
    await page.getByRole('radio', { name: 'List' }).click();
    await shot('tree-list');
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Families' })).toBeVisible();
    await shot('families');

    await page.getByRole('link', { name: /Shoots/ }).click();
    await page.getByRole('button', { name: '+ New shoot' }).click();
    const sheet = page.getByRole('dialog', { name: 'New shoot' });
    await sheet.getByLabel(/Title/).fill('Golden evening');
    await sheet.getByRole('button', { name: 'Create shoot' }).click();
    await expect(page.getByRole('heading', { name: 'Golden evening' })).toBeVisible();

    await page.getByRole('button', { name: 'Set location' }).click();
    const loc = page.getByRole('dialog', { name: 'Shoot location' });
    await loc.getByLabel(/Name for a new place/).fill('Riverside Park');
    await loc.getByLabel('Latitude').fill('41.88');
    await loc.getByLabel('Longitude').fill('-87.63');
    await loc.getByRole('button', { name: 'Use these coordinates' }).click();
    await expect(page.getByTestId('timeline')).toBeVisible();
    await page.getByRole('button', { name: 'Use this start time' }).click();
    await page.getByRole('button', { name: 'Suggested order' }).click();

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot('shoot');
    await scrollTo('Light');
    await shot('light');
    await scrollTo('Templates');
    await shot('templates');
    await page.getByRole('heading', { name: /^Shot list/, level: 2 }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await shot('shot-list');

    await page.goto('./#/');
    await expect(page.getByRole('heading', { name: 'Shoots' })).toBeVisible();
    await shot('shoots');

    await page.getByRole('link', { name: /Golden evening|Pike–Vega/ }).first().click();
    await page.getByRole('button', { name: 'Start shoot' }).click();
    await expect(page.getByRole('region', { name: 'Current shot' })).toBeVisible();
    await shot('live');
    const done = page.getByRole('button', { name: 'Done ✓' });
    for (let i = 0; i < 4; i++) await done.click();
    await page.getByRole('radio', { name: /^List/ }).click();
    await shot('live-list');
    await page.getByRole('radio', { name: 'Now' }).click();
    await page.getByRole('button', { name: 'Shoot day menu' }).click();
    await page.getByRole('button', { name: 'Finish shoot' }).click();
    await expect(page.getByRole('heading', { name: 'Shoot summary' })).toBeVisible();
    await shot('summary');

    await page.goto('./#/poses');
    await expect(page.getByRole('heading', { name: 'Poses' })).toBeVisible();
    await shot('poses');
    await page.goto('./#/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await shot('settings');

    expect([...taken].sort()).toEqual(Object.keys(SHOTS).sort());
    await polish(page, theme);
  });
}

/** With SHOTS_ALL=<folder>: a screenshot of each main screen, for the visual check. */
async function polish(page: Page, theme: string) {
  const dir = process.env.SHOTS_ALL;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  const size = `${page.viewportSize()!.width}`;
  const screens: [string, string][] = [
    ['shoots', '#/'],
    ['families', '#/families'],
    ['poses', '#/poses'],
    ['settings', '#/settings'],
    ['help', '#/help'],
    ['help-start', '#/help/start'],
    ['help-shot-types', '#/help/shot-types'],
    ['welcome', '#/welcome'],
  ];
  for (const [name, hash] of screens) {
    await page.goto(`./${hash}`);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${dir}/${name}-${theme}-${size}.png`, fullPage: true, animations: 'disabled' });
  }
}
