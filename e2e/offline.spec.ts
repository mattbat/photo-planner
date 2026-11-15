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
