import { expect, test } from '@playwright/test';

test('demo family → shoot → start → Done ×2 → Undo → someone leaves → Waiting → finish → summary', async ({ page }) => {
  await page.goto('./#/families');
  await page.getByRole('button', { name: 'Load demo family' }).click();
  await expect(page.getByRole('heading', { name: /Pike–Vega family/ })).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await page.getByRole('link', { name: /Shoots/ }).click();
  await page.getByRole('button', { name: '+ New shoot' }).click();
  await page.getByRole('dialog', { name: 'New shoot' }).getByRole('button', { name: 'Create shoot' }).click();
  await page.getByRole('button', { name: 'Suggested order' }).click();

  await page.getByRole('button', { name: 'Start shoot' }).click();
  await expect(page).toHaveURL(/\/live$/);
  const card = page.getByRole('region', { name: 'Current shot' });
  const name = () => card.getByRole('heading', { level: 2 }).textContent();
  const first = await name();
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('0 of');

  const done = page.getByRole('button', { name: 'Done ✓' });
  await done.click();
  await expect.poll(name).not.toBe(first);
  const second = await name();
  await done.click();
  await expect.poll(name).not.toBe(second);
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('2 of');

  await page.getByRole('button', { name: /^Undo Done/ }).click();
  await expect.poll(name).toBe(second);
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('1 of');

  // Done is in thumb reach and nothing scrolls sideways.
  const box = (await done.boundingBox())!;
  expect(box.y + box.height).toBeGreaterThan(874 - 220);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole('button', { name: /^Who’s here/ }).click();
  const who = page.getByRole('dialog', { name: 'Who’s here' });
  await who.getByRole('radiogroup', { name: /^Ben Pike is/ }).getByRole('radio', { name: 'Left' }).click();
  await who.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('radio', { name: /^List/ }).click();
  await expect(page.getByText(/^Waiting \(/)).toBeVisible();
  await expect(page.getByText('waiting for: Ben').first()).toBeVisible();

  // The state is all stored: a reload resumes where it was.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('1 of');

  await page.getByRole('button', { name: 'Shoot day menu' }).click();
  await page.getByRole('dialog', { name: 'Shoot day' }).getByRole('button', { name: 'Finish shoot' }).click();
  const summary = page.getByRole('region', { name: 'Summary' });
  await expect(summary).toContainText('1 of');
  await expect(page.getByRole('button', { name: 'Share summary as text' })).toBeVisible();
  await page.getByRole('button', { name: 'Reopen shoot' }).click();
  await expect(page.getByRole('button', { name: 'Done ✓' })).toBeVisible();
});

test('after a shoot is finished, Back always gets home (no loop)', async ({ page }) => {
  await page.goto('./#/families');
  await page.getByRole('button', { name: 'Load demo family' }).click();
  await expect(page.getByRole('heading', { name: /Pike–Vega family/ })).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await page.getByRole('link', { name: /Shoots/ }).click();
  await page.getByRole('button', { name: '+ New shoot' }).click();
  await page.getByRole('dialog', { name: 'New shoot' }).getByRole('button', { name: 'Create shoot' }).click();
  await page.getByRole('button', { name: 'Start shoot' }).click();
  await expect(page).toHaveURL(/\/live$/);
  // A reload mid-shoot must not lose the way back.
  await page.reload();
  await page.getByRole('button', { name: 'Shoot day menu' }).click();
  await page.getByRole('dialog', { name: 'Shoot day' }).getByRole('button', { name: 'Finish shoot' }).click();
  await expect(page.getByRole('region', { name: 'Summary' })).toBeVisible();

  const back = page.getByRole('link', { name: 'Back' });
  // Summary → shoot → Shoots.
  await back.click();
  await expect(page.getByRole('button', { name: 'See the summary' }).or(page.getByRole('link', { name: 'See the summary' }))).toBeVisible();
  await back.click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page).toHaveURL(/#\/$/);

  // Again by way of See the summary, twice round.
  for (let i = 0; i < 2; i++) {
    await page.locator('a.list-item').first().click();
    await page.getByRole('link', { name: 'See the summary' }).click();
    await expect(page.getByRole('region', { name: 'Summary' })).toBeVisible();
    await back.click();
    await back.click();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  }
});
