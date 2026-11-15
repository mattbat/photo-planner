import { expect, test } from '@playwright/test';

test.use({ deviceScaleFactor: 2 });

test('new shoot → type coordinates → timeline and suggested start → use it', async ({ page }) => {
  // The time-zone lookup is the only network call; answer it locally.
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ json: { timezone: 'America/Chicago' } }));

  await page.goto('./#/families');
  await page.getByRole('button', { name: 'Load demo family' }).click();
  await expect(page.getByRole('heading', { name: /Pike–Vega family/ })).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
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
  await expect(page.getByLabel('Light times')).toContainText('Sunset');
  await expect(page.locator('.shoot-sub')).toContainText('Riverside Park · Golden hour');
  await expect(page.getByText(/Start at/)).toBeVisible();

  await page.getByRole('button', { name: 'Use this start time' }).click();
  await expect(page.getByRole('button', { name: 'Start time is set' })).toBeVisible();
  await expect(page.getByTestId('shoot-span')).toBeVisible();
  await expect(page.locator('.shoot-when')).toContainText(/[ap]m/);

  if (process.env.LIGHT_SHOT) {
    await page.getByRole('heading', { name: 'Light', level: 2 }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.LIGHT_SHOT, fullPage: false });
  }
});
