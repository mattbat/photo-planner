import { expect, test } from '@playwright/test';

test('opens Poses, filters Couples, opens a pose and favourites it', async ({ page }) => {
  await page.goto('./#/poses');
  await expect(page.getByRole('heading', { name: 'Poses' })).toBeVisible();
  const grid = page.getByRole('list', { name: 'Poses' });
  await expect(grid.getByRole('listitem').first()).toBeVisible();
  const all = await grid.getByRole('listitem').count();
  expect(all).toBeGreaterThan(50);

  await page.getByRole('button', { name: 'Couples', exact: true }).click();
  const couples = await grid.getByRole('listitem').count();
  expect(couples).toBeGreaterThan(4);
  expect(couples).toBeLessThan(all);

  await grid.getByRole('link').first().click();
  await expect(page.getByRole('heading', { name: 'How to direct it' })).toBeVisible();
  await expect(page.getByRole('img', { name: /^Illustration of / })).toBeVisible();
  await page.getByRole('button', { name: 'Add to favourites' }).click();
  await expect(page.getByRole('button', { name: 'Remove from favourites' })).toBeVisible();

  // The favourite survives going back and shows in the grid.
  await page.getByRole('link', { name: 'Back' }).click();
  await page.getByRole('button', { name: '★ Favourites' }).click();
  await expect(grid.getByRole('listitem')).toHaveCount(1);
});
