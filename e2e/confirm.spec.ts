import { expect, test, type Locator, type Page } from '@playwright/test';

// Set CONFIRM_SHOTS to a folder to also save screenshots of the sheets.
const SHOTS = process.env.CONFIRM_SHOTS;

/** The label's box must sit in the middle of its button (±2px), and fit inside it. */
async function expectCentered(button: Locator) {
  const { box, label } = await button.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    return { box: { x: b.x, y: b.y, width: b.width, height: b.height }, label: { x: r.x, y: r.y, width: r.width, height: r.height } };
  });
  expect(Math.abs(label.x + label.width / 2 - (box.x + box.width / 2))).toBeLessThanOrEqual(2);
  expect(Math.abs(label.y + label.height / 2 - (box.y + box.height / 2))).toBeLessThanOrEqual(2);
  expect(label.width).toBeLessThanOrEqual(box.width);
}

async function expectCleanConfirm(page: Page, name: string | RegExp, confirmLabel: string) {
  const dialog = page.getByRole('alertdialog', { name });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(400); // the sheet slides up first
  const main = dialog.getByRole('button', { name: confirmLabel });
  const cancel = dialog.getByRole('button', { name: 'Cancel' });
  const a = (await main.boundingBox())!;
  const b = (await cancel.boundingBox())!;
  expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(1);
  expect(a.height).toBeGreaterThanOrEqual(48);
  expect(b.y).toBeGreaterThan(a.y + a.height); // stacked, destructive on top
  await expectCentered(main);
  await expectCentered(cancel);
  const d = (await dialog.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(d.x).toBeGreaterThanOrEqual(0);
  expect(d.x + d.width).toBeLessThanOrEqual(viewport.width);
  for (const box of [a, b]) {
    expect(box.x).toBeGreaterThanOrEqual(d.x);
    expect(box.x + box.width).toBeLessThanOrEqual(d.x + d.width);
  }
  // Title and body are left-aligned.
  expect(await dialog.locator('.confirm-title').evaluate((el) => getComputedStyle(el).textAlign)).toMatch(/^(left|start)$/);
  expect(await dialog.locator('.confirm-body').evaluate((el) => getComputedStyle(el).textAlign)).toMatch(/^(left|start)$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const size of [
  { width: 402, height: 874 },
  { width: 375, height: 667 },
]) {
  test(`confirm sheets are tidy at ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('./#/families');
    await page.getByRole('button', { name: 'Load demo family' }).click();
    await expect(page.getByRole('heading', { name: /Pike–Vega family/ })).toBeVisible();

    // Delete person.
    await page.getByRole('button', { name: /Dana/ }).first().click();
    const person = page.getByRole('dialog').first();
    await expect(person).toBeVisible();
    await page.waitForTimeout(400);
    await person.getByRole('button', { name: /^Delete / }).click();
    const personTitle = /^Delete .+\?$/;
    await expect(page.getByRole('alertdialog', { name: personTitle })).toBeVisible();
    await page.waitForTimeout(400);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/confirm-person-${size.width}.png` });
    await expectCleanConfirm(page, personTitle, 'Delete');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await page.goto('./#/shoots');

    // Delete shoot, from the options sheet.
    await page.getByRole('button', { name: '+ New shoot' }).click();
    await page.getByRole('dialog', { name: 'New shoot' }).getByRole('button', { name: 'Create shoot' }).click();
    await page.getByRole('button', { name: 'Shoot options' }).click();
    const options = page.getByRole('dialog', { name: 'Shoot options' });
    await page.waitForTimeout(400);
    for (const name of ['Share shot list as text', 'Duplicate shoot', 'Delete shoot']) {
      await expectCentered(options.getByRole('button', { name }));
    }
    const heights = await Promise.all(
      ['Share shot list as text', 'Duplicate shoot', 'Delete shoot'].map(async (n) => (await options.getByRole('button', { name: n }).boundingBox())!.height),
    );
    expect(new Set(heights.map(Math.round)).size).toBe(1);
    await expect(options.getByText('Not set')).toBeVisible();
    await options.getByLabel('Start time').fill('09:30');
    await options.getByRole('button', { name: 'Clear start time' }).click();
    await expect(options.getByText('Not set')).toBeVisible();

    await options.getByRole('button', { name: 'Delete shoot' }).click();
    await expectCleanConfirm(page, 'Delete shoot?', 'Delete shoot');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/confirm-shoot-${size.width}.png` });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/confirm-shoot-options-${size.width}.png` });
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(options).toBeVisible();
  });
}

test('confirm sheets in dark mode (screenshots)', async ({ page }) => {
  test.skip(!SHOTS, 'screenshots only');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./#/families');
  await page.getByRole('button', { name: 'Load demo family' }).click();
  await page.getByRole('button', { name: /Dana/ }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('dialog').first().getByRole('button', { name: /^Delete / }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/confirm-person-dark.png` });
  await page.keyboard.press('Escape');
  await page.goto('./#/shoots');
  await page.getByRole('button', { name: '+ New shoot' }).click();
  await page.getByRole('dialog', { name: 'New shoot' }).getByRole('button', { name: 'Create shoot' }).click();
  await page.getByRole('button', { name: 'Shoot options' }).click();
  await page.getByRole('dialog', { name: 'Shoot options' }).getByRole('button', { name: 'Delete shoot' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/confirm-shoot-dark.png` });
});
