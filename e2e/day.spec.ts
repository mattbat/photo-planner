import { expect, test, type Page } from '@playwright/test';

/** Loads the demo family and plans a shoot for it; returns the family and shoot hashes. */
async function demoShoot(page: Page, title = 'Autumn') {
  await page.goto('./#/families');
  await page.getByRole('button', { name: 'Load demo family' }).click();
  await expect(page.getByRole('heading', { name: /Pike–Vega family/ })).toBeVisible();
  const family = new URL(page.url()).hash;
  await page.getByRole('link', { name: 'Back' }).click();
  await page.getByRole('link', { name: /Shoots/ }).click();
  await page.getByRole('button', { name: '+ New shoot' }).click();
  const sheet = page.getByRole('dialog', { name: 'New shoot' });
  await sheet.getByLabel(/Title/).fill(title);
  await sheet.getByRole('button', { name: 'Create shoot' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  return { family, shoot: new URL(page.url()).hash };
}

const progress = (page: Page) => page.getByRole('region', { name: 'Progress' });

test('a whole shoot day: light by coordinates, 5 Done, someone leaves, waiting shots, they come back, undo, finish, share', async ({ page }) => {
  // The time-zone lookup is the only network call a typed place makes; answer it locally.
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ json: { timezone: 'America/Chicago' } }));
  await demoShoot(page);

  await page.getByRole('button', { name: 'Set location' }).click();
  const loc = page.getByRole('dialog', { name: 'Shoot location' });
  await loc.getByLabel(/Name for a new place/).fill('Willow Bend');
  await loc.getByLabel('Latitude').fill('41.88');
  await loc.getByLabel('Longitude').fill('-87.63');
  await loc.getByRole('button', { name: 'Use these coordinates' }).click();
  await expect(page.getByTestId('timeline')).toBeVisible();
  await page.getByRole('button', { name: 'Use this start time' }).click();
  await expect(page.getByRole('button', { name: 'Start time is set' })).toBeVisible();

  await page.getByRole('button', { name: 'Start shoot' }).click();
  await expect(page).toHaveURL(/\/live$/);
  const card = page.getByRole('region', { name: 'Current shot' });
  const name = () => card.getByRole('heading', { level: 2 }).textContent();
  const done = page.getByRole('button', { name: 'Done ✓' });

  const seen: (string | null)[] = [];
  for (let i = 1; i <= 5; i++) {
    seen.push(await name());
    await done.click();
    await expect(progress(page)).toContainText(`${i} of`);
  }
  expect(new Set(seen).size).toBe(5);

  // Ben leaves: shots with him now wait, and the rest carry on.
  await page.getByRole('button', { name: /^Who’s here/ }).click();
  const who = page.getByRole('dialog', { name: 'Who’s here' });
  await who.getByRole('radiogroup', { name: /^Ben Pike is/ }).getByRole('radio', { name: 'Left' }).click();
  await who.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('radio', { name: /^List/ }).click();
  await expect(page.getByText(/^Waiting \(/)).toBeVisible();
  await expect(page.getByText('waiting for: Ben').first()).toBeVisible();
  const waiting = await page.getByText('waiting for: Ben').count();
  expect(waiting).toBeGreaterThan(0);

  // He arrives again: nothing is waiting for him any more.
  await page.getByRole('button', { name: /^Who’s here/ }).click();
  await who.getByRole('radiogroup', { name: /^Ben Pike is/ }).getByRole('radio', { name: 'Here' }).click();
  await who.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('waiting for: Ben')).toHaveCount(0);

  // Undo takes back the last tap (his arrival), and again, the shot before it stays done.
  await page.getByRole('button', { name: /^Undo / }).click();
  await expect(page.getByText('waiting for: Ben').first()).toBeVisible();
  await page.getByRole('button', { name: /^Undo / }).click();
  await expect(progress(page)).toContainText('5 of');

  await page.getByRole('button', { name: 'Shoot day menu' }).click();
  await page.getByRole('dialog', { name: 'Shoot day' }).getByRole('button', { name: 'Finish shoot' }).click();
  await expect(page.getByRole('region', { name: 'Summary' })).toContainText('5 of');
  await page.getByRole('button', { name: 'Share summary as text' }).click();
  await expect(page.getByRole('status')).toContainText(/Shoot summary (shared|copied)|Couldn’t share or copy|Sharing cancelled/);
});

test('every screen fits a small phone: nothing scrolls sideways at 375×667', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const { family, shoot } = await demoShoot(page, 'Narrow');
  await page.getByRole('button', { name: 'Suggested order' }).click();

  const noSideways = async (label: string) => {
    // Let the screen settle (images, fonts, live queries) before measuring.
    await page.waitForLoadState('networkidle');
    const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth, body: document.body.scrollWidth }));
    expect(m.scroll, `${label}: scrollWidth ${m.scroll} > ${m.inner}`).toBeLessThanOrEqual(m.inner);
    expect(m.body, `${label}: body ${m.body} > ${m.inner}`).toBeLessThanOrEqual(m.inner);
  };

  await page.goto('./#/poses');
  await expect(page.getByRole('heading', { name: 'Poses' })).toBeVisible();
  await page.locator('.pl-card, .pl-suggest-card, a[href^="#/poses/"]').first().click();
  await expect(page).toHaveURL(/#\/poses\/.+/);
  const pose = new URL(page.url()).hash;

  const routes = ['#/', shoot, `${shoot}/live`, '#/families', family, '#/poses', pose, '#/settings', '#/diagnostics', '#/help', '#/help/start', '#/welcome'];
  for (const hash of routes) {
    await page.goto(`./${hash}`);
    await page.waitForFunction((h) => window.location.hash === h, hash);
    await noSideways(hash);
  }

  // The shoot day while it is running, in both views.
  await page.goto(`./${shoot}`);
  await page.getByRole('button', { name: 'Start shoot' }).click();
  await expect(page.getByRole('button', { name: 'Done ✓' })).toBeVisible();
  await noSideways('live');
  await page.getByRole('radio', { name: /^List/ }).click();
  await noSideways('live list');
  await page.getByRole('button', { name: /^Who’s here/ }).click();
  await noSideways('who is here');
});

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' });
  test('the shoot day’s Done button is readable: contrast at least 4.5:1', async ({ page }) => {
    await demoShoot(page);
    await page.getByRole('button', { name: 'Start shoot' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const done = page.getByRole('button', { name: 'Done ✓' });
    await expect(done).toBeVisible();
    const ratio = await done.evaluate((el) => {
      const parse = (css: string) => {
        const m = css.match(/rgba?\(([^)]+)\)/) ?? css.match(/color\(srgb ([^)]+)\)/);
        if (!m) throw new Error(`cannot read colour: ${css}`);
        const parts = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
        const scale = css.startsWith('color(') ? 255 : 1;
        return parts.slice(0, 3).map((v) => v * scale);
      };
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
      };
      const style = getComputedStyle(el);
      const a = lum(parse(style.color));
      const b = lum(parse(style.backgroundColor));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
