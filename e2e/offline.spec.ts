import { expect, test } from '@playwright/test';

test('launches and keeps data with no internet after the first visit (T3)', async ({ page, context }) => {
  await page.goto('./#/settings');
  // Put a family on the phone by restoring a tiny backup, then check it survives offline.
  await page.getByLabel('Backup file').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'photo-planner-backup',
        version: 1,
        families: [{ id: 'f1', name: 'The Testers', archived: false, createdAt: 1, updatedAt: 1 }],
      }),
    ),
  });
  await page.getByRole('button', { name: 'Merge into this phone' }).click();
  await expect(page.getByRole('status')).toContainText('Merged');

  // Wait until the service worker has cached the app and controls the page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  await context.setOffline(true);
  await page.goto('./#/families');
  await expect(page.getByRole('heading', { name: 'Families' })).toBeVisible();
  await expect(page.getByText('The Testers')).toBeVisible();
  await context.setOffline(false);
});

test('a whole shoot runs with no connection, and online-only buttons say so', async ({ page, context }) => {
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ json: { timezone: 'America/Chicago' } }));
  await page.goto('./#/families');
  await page.getByRole('button', { name: 'Load demo family' }).click();
  await expect(page.getByRole('heading', { name: /Pike–Vega family/ })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  await context.setOffline(true);
  await page.goto('./#/');
  await page.getByRole('button', { name: '+ New shoot' }).click();
  const sheet = page.getByRole('dialog', { name: 'New shoot' });
  await sheet.getByLabel(/Title/).fill('Offline day');
  await sheet.getByRole('button', { name: 'Create shoot' }).click();
  await expect(page.getByRole('heading', { name: 'Offline day' })).toBeVisible();

  // Place by typed coordinates works with no signal; searching and the forecast say they need a connection.
  await page.getByRole('button', { name: 'Set location' }).click();
  const loc = page.getByRole('dialog', { name: 'Shoot location' });
  await expect(loc.getByText(/Needs a connection/).first()).toBeVisible();
  await loc.getByLabel('Search for a place or address').fill('Anywhere');
  await loc.getByRole('button', { name: 'Search' }).click();
  await expect(loc.getByRole('alert')).toContainText('Needs a connection');
  await loc.getByLabel(/Name for a new place/).fill('Willow Bend');
  await loc.getByLabel('Latitude').fill('41.88');
  await loc.getByLabel('Longitude').fill('-87.63');
  await loc.getByRole('button', { name: 'Use these coordinates' }).click();
  await expect(page.getByTestId('timeline')).toBeVisible();
  await page.getByText(/^More: sun direction/).click();
  await page.getByRole('button', { name: 'Get forecast' }).click();
  await expect(page.getByText('Needs a connection.')).toBeVisible();

  await page.getByRole('button', { name: 'Start shoot' }).click();
  const done = page.getByRole('button', { name: 'Done ✓' });
  await done.click();
  await done.click();
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('2 of');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('2 of');
  await context.setOffline(false);
});
