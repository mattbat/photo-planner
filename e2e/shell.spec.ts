import { expect, test } from '@playwright/test';

test('opens on Shoots and moves between the three tabs', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Shoots' })).toBeVisible();
  await expect(page.getByText('No shoots yet')).toBeVisible();

  const tabs = page.getByRole('navigation', { name: 'Main' });
  await tabs.getByRole('link', { name: 'Families' }).click();
  await expect(page.getByRole('heading', { name: 'Families' })).toBeVisible();
  await expect(page.getByText('No families yet')).toBeVisible();
  await tabs.getByRole('link', { name: 'Poses' }).click();
  await expect(page.getByRole('heading', { name: 'Poses' })).toBeVisible();
  await tabs.getByRole('link', { name: 'Shoots' }).click();
  await expect(page.getByText('No shoots yet')).toBeVisible();

  // The tab bar sits inside the screen, clear of the page edge.
  const box = await tabs.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
});

test('Settings: appearance follows the phone, can be forced, and the page never scrolls sideways', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('radio', { name: 'Match phone' })).toBeChecked();

  await page.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('radio', { name: 'Match phone' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await expect(page.getByRole('button', { name: 'Back up everything' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check for updates' })).toBeVisible();
  await expect(page.getByText(/Photo Planner version/)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole('link', { name: 'Diagnostics' }).click();
  await expect(page.getByRole('heading', { name: 'Diagnostics' })).toBeVisible();
});

test('a backup file can be restored, and its family then shows', async ({ page }) => {
  await page.goto('./#/settings');
  const backup = {
    format: 'photo-planner-backup',
    version: 1,
    exportedAt: '2026-11-15T10:00:00.000Z',
    families: [{ id: 'f1', name: 'The Testers', archived: false, createdAt: 1, updatedAt: 1 }],
    people: [{ id: 'p1', familyId: 'f1', name: 'Gran Tester', parentIds: [], createdAt: 1, updatedAt: 1 }],
  };
  await page.getByLabel('Backup file').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.getByRole('button', { name: 'Merge into this phone' }).click();
  await expect(page.getByRole('status')).toContainText('Merged');
  await page.goto('./#/families');
  await expect(page.getByText('The Testers')).toBeVisible();
  await expect(page.getByText('1 person')).toBeVisible();
});
