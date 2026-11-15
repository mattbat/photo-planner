import { expect, test } from '@playwright/test';

test('loads the demo family, opens the tree, taps a person and edits the name', async ({ page }) => {
  await page.goto('./#/families');
  await page.getByRole('button', { name: 'Load demo family' }).click();
  await expect(page.getByRole('heading', { name: /Pike–Vega family/ })).toBeVisible();

  const tree = page.getByTestId('family-tree');
  await expect(tree).toBeVisible();
  // The tree pans inside its own box: the page itself never scrolls sideways.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await tree.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);

  await page.getByRole('button', { name: /^Ruth Pike,/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Ruth Pike' });
  await expect(sheet).toBeVisible();
  const name = sheet.getByLabel('Name', { exact: true });
  await name.fill('Ruth Pike-Vega');
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: /^Ruth Pike-Vega,/ })).toBeVisible();

  // Fit and the List view both work.
  await page.getByRole('button', { name: 'Fit whole family on screen' }).click();
  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page.getByText('Generation 4')).toBeVisible();

  // Sharing the tree makes a picture (downloaded where the share sheet isn't available).
  await page.getByRole('radio', { name: 'Tree' }).click();
  const download = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByRole('status')).toBeVisible({ timeout: 15_000 });
  const file = await download;
  if (file) expect(file.suggestedFilename()).toMatch(/tree\.png$/);
});
