import { expect, test } from '@playwright/test';

// A fresh phone: the first-run intro hasn't been seen.
test.use({ storageState: { cookies: [], origins: [] } });

test('first-time photographer sees the intro, fitting the screen, and starts with the demo family', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Every family photo, planned' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Try the demo family' }).click();
  await expect(page.getByRole('heading', { name: /Pike–Vega/ })).toBeVisible();

  // Not shown again.
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Shoots' })).toBeVisible();
});

test('Settings → Help opens the guide, topics page through and screenshots load', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('photo-planner.introSeen', '1'));
  await page.goto('./#/settings');
  await page.getByRole('link', { name: /Help and guide/ }).click();
  await expect(page.getByRole('heading', { name: 'Help', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: /Shot types/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Shot types', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: /Next/ }).click();
  await expect(page.getByRole('heading', { name: 'Building the shot list', level: 1 })).toBeVisible();

  await page.goto('./#/help/start');
  const img = page.locator('.help-shot img').first();
  await img.scrollIntoViewIfNeeded();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
