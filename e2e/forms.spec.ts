import { expect, test, type Locator, type Page } from '@playwright/test';

// iPhone-sized, like the real thing (402 x 874 CSS pixels).
test.use({ viewport: { width: 402, height: 874 } });

async function loadDemo(page: Page) {
  await page.goto('./#/families');
  await page.getByRole('button', { name: 'Load demo family' }).click();
  await expect(page.getByRole('heading', { name: /Pike–Vega family/ })).toBeVisible();
}

/** Height of every visible single-line field in a container. */
async function fieldBoxes(scope: Locator) {
  return scope.locator('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), select').evaluateAll((els) =>
    els
      .map((el) => ({ el, r: el.getBoundingClientRect(), type: (el as HTMLInputElement).type || el.tagName.toLowerCase() }))
      .filter(({ r }) => r.width > 0 && r.height > 0)
      .map(({ r, type }) => ({ type, h: Math.round(r.height * 10) / 10, w: Math.round(r.width * 10) / 10, y: Math.round(r.top * 10) / 10 })),
  );
}

test('the New shoot sheet: every field is the same height, and Date and Time share a row', async ({ page }) => {
  await loadDemo(page);
  await page.getByRole('link', { name: 'Back' }).click();
  await page.getByRole('link', { name: /Shoots/ }).click();
  await page.getByRole('button', { name: '+ New shoot' }).click();
  const sheet = page.getByRole('dialog', { name: 'New shoot' });
  await expect(sheet.getByLabel('Start time (optional)')).toBeVisible();
  await page.waitForTimeout(600); // let the sheet finish sliding in
  await page.screenshot({ path: process.env.FORM_SHOT ?? 'test-results/form.png' });
  const boxes = await fieldBoxes(sheet);
  expect(boxes.length).toBeGreaterThanOrEqual(4); // family, title, date, time
  for (const b of boxes) expect(Math.abs(b.h - boxes[0]!.h), JSON.stringify(b)).toBeLessThanOrEqual(1);
  const date = boxes.find((b) => b.type === 'date')!;
  const time = boxes.find((b) => b.type === 'time')!;
  expect(Math.abs(date.y - time.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(date.w - time.w)).toBeLessThanOrEqual(1);
  // Labels match in size and weight.
  const labels = await sheet.locator('.row.stack > .row-label, .field > span').evaluateAll((els) => els.map((e) => `${getComputedStyle(e).fontSize}/${getComputedStyle(e).fontWeight}`));
  expect(new Set(labels).size).toBe(1);
  // Time text is left aligned like the rest.
  expect(await sheet.getByLabel('Start time (optional)').evaluate((e) => getComputedStyle(e).textAlign)).toBe('left');
});

test('the person sheet: every field is the same height', async ({ page }) => {
  await loadDemo(page);
  await page.getByRole('radio', { name: 'List' }).click();
  await page.getByRole('button', { name: /^Ruth Pike/ }).first().click();
  const sheet = page.getByRole('dialog', { name: /Ruth Pike/ });
  await expect(sheet).toBeVisible();
  const boxes = await fieldBoxes(sheet);
  expect(boxes.length).toBeGreaterThanOrEqual(4);
  for (const b of boxes) expect(Math.abs(b.h - boxes[0]!.h), JSON.stringify(b)).toBeLessThanOrEqual(1);
});

test('top-bar icon buttons are at least 44 x 44, on every screen with one', async ({ page }) => {
  await loadDemo(page);
  for (const hash of ['#/shoots', '#/families', '#/poses', '#/settings', '#/help']) {
    await page.goto(`./${hash}`);
    const bars = page.locator('.topbar a, .topbar button');
    await expect(bars.first()).toBeVisible();
    const sizes = await bars.evaluateAll((els) => els.map((e) => ({ name: e.getAttribute('aria-label') ?? e.textContent, r: e.getBoundingClientRect() })).filter((x) => x.r.width > 0));
    for (const s of sizes) {
      expect(s.r.width, `${hash} ${s.name}`).toBeGreaterThanOrEqual(43.5);
      expect(s.r.height, `${hash} ${s.name}`).toBeGreaterThanOrEqual(43.5);
    }
  }
  // The Settings gear is an SVG, not a glyph.
  await page.goto('./#/shoots');
  await expect(page.getByRole('link', { name: 'Settings' }).locator('svg')).toBeVisible();
});
