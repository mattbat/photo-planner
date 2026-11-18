import { expect, test } from '@playwright/test';

test('behind the camera: pick the camera person and a backup, shots say who takes them', async ({ page }) => {
  await page.goto('./#/families');
  await page.getByRole('button', { name: 'Load demo family' }).click();
  await expect(page.getByRole('heading', { name: /Pike–Vega family/ })).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await page.getByRole('link', { name: /Shoots/ }).click();
  await page.getByRole('button', { name: '+ New shoot' }).click();
  await page.getByRole('dialog', { name: 'New shoot' }).getByRole('button', { name: 'Create shoot' }).click();
  await expect(page.locator('li.shot').first()).toBeVisible();

  await page.getByRole('button', { name: 'Behind the camera' }).click();
  const sheet = page.getByRole('dialog', { name: 'Behind the camera' });
  await sheet.getByRole('button', { name: /^Usually takes the photos/ }).click();
  await sheet.getByRole('button', { name: 'Dana Pike' }).click();
  await expect(sheet.getByRole('status')).toBeVisible();
  await expect(sheet.getByText('With no one chosen')).toBeVisible();
  await sheet.getByRole('button', { name: /^Takes Dana’s shots/ }).click();
  await sheet.getByRole('button', { name: 'Margaret Pike' }).click();
  await sheet.getByRole('button', { name: 'Done' }).click();

  await expect(page.locator('li.shot .shot-camera', { hasText: 'Margaret takes this' }).first()).toBeVisible();
  await expect(page.locator('li.shot .shot-camera', { hasText: 'Use a timer or tripod' }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
