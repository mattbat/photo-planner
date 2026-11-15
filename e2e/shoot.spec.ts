import { expect, test } from '@playwright/test';

test('demo family → new shoot → toggle a template → see shots → suggested order', async ({ page }) => {
  await page.goto('./#/families');
  await page.getByRole('button', { name: 'Load demo family' }).click();
  await expect(page.getByRole('heading', { name: /Pike–Vega family/ })).toBeVisible();

  await page.getByRole('link', { name: 'Back' }).click();
  await page.getByRole('link', { name: /Shoots/ }).click();
  await page.getByRole('button', { name: '+ New shoot' }).click();
  const sheet = page.getByRole('dialog', { name: 'New shoot' });
  await sheet.getByLabel(/Title/).fill('Autumn portraits');
  await sheet.getByLabel(/Start time/).fill('10:00');
  await sheet.getByRole('button', { name: 'Create shoot' }).click();

  await expect(page.getByRole('heading', { name: 'Autumn portraits' })).toBeVisible();
  const shots = page.locator('li.shot');
  await expect(shots.first()).toBeVisible();
  const before = await shots.count();
  expect(before).toBeGreaterThan(5);
  await expect(shots.first()).toContainText('10:');

  const toggle = page.getByRole('switch', { name: 'Each parent + each child' });
  await expect(toggle.locator('xpath=ancestor::label')).toContainText('+');
  await toggle.locator('xpath=following-sibling::span[contains(@class,"switch")]').click();
  await expect(toggle).toBeChecked();
  await expect.poll(() => shots.count()).toBeGreaterThan(before);

  const names = () => shots.locator('.shot-name').allTextContents();
  const unordered = await names();
  await page.getByRole('button', { name: 'Suggested order' }).click();
  await expect.poll(async () => (await names()).join('|')).not.toBe(unordered.join('|'));
  await expect(page.locator('.step.in').first()).toContainText('Call in');
  await expect(page.locator('.step.out').first()).toContainText('Can leave');
  expect((await names())[0]).toMatch(/Everyone|Full|group/i);

  // Opening a shot shows it on the tree.
  await shots.first().locator('.shot-name').click();
  await expect(page.getByRole('dialog').getByTestId('family-tree')).toBeVisible();
});

test('the family tree opens fitted to the top couples, and branches have their own colours', async ({ page }) => {
  await page.goto('./#/families');
  await page.getByRole('button', { name: 'Load demo family' }).click();
  const tree = page.getByTestId('family-tree');
  await expect(tree).toBeVisible();
  const box = (await tree.boundingBox())!;
  const group = tree.locator('svg > g').first();
  const first = (await group.locator('.card[data-person-id]').first().boundingBox())!;
  // Something is drawn near the top left of the box: no empty top strip, nothing cut off at the left.
  const cards = await group.locator('.card[data-person-id]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  const top = Math.min(...cards.map((c) => c.top));
  expect(top - box.y).toBeLessThan(60);
  expect(first).toBeTruthy();
  const strokes = await group.locator('.card[data-person-id] rect.box').evaluateAll((els) => els.map((e) => getComputedStyle(e).stroke));
  expect(new Set(strokes).size).toBeGreaterThan(3);
});
