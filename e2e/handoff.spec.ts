import { expect, test, type Page } from '@playwright/test';

/**
 * Two phones (§9, SH1–SH6): the photographer plans a shoot and texts it to the
 * assistant, who starts it, marks a shot done and shares it back; the
 * photographer accepts the newer copy. Each phone is its own browser context,
 * so they share no data, like two iPhones.
 */

/** The share sheet takes links (Messages); the test reads the last one. */
async function fakeShareSheet(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { sharedLinks: string[] };
    w.sharedLinks = [];
    Object.assign(navigator, {
      canShare: (data: { files?: File[] }) => !data.files,
      share: async (data: { url?: string }) => {
        if (data.url) w.sharedLinks.push(data.url);
      },
    });
  });
}

const lastLink = (page: Page) => page.evaluate(() => (window as unknown as { sharedLinks: string[] }).sharedLinks.at(-1)!);

test('photographer texts a shoot to the assistant, who marks a shot done and shares it back', async ({ page: photographer, browser, baseURL }) => {
  test.setTimeout(90_000);
  await fakeShareSheet(photographer);

  // Photographer: make a shoot and text it.
  await photographer.goto('./#/families');
  await photographer.getByRole('button', { name: 'Load demo family' }).click();
  await expect(photographer.getByRole('heading', { name: /Pike–Vega family/ })).toBeVisible();
  await photographer.getByRole('link', { name: 'Back' }).click();
  await photographer.getByRole('link', { name: /Shoots/ }).click();
  await photographer.getByRole('button', { name: '+ New shoot' }).click();
  await photographer.getByRole('dialog', { name: 'New shoot' }).getByRole('button', { name: 'Create shoot' }).click();
  await photographer.getByRole('button', { name: 'Share shoot' }).click();
  await photographer.getByRole('button', { name: 'Text a link' }).click();
  await expect(photographer.getByRole('status')).toHaveText('Shoot shared.');
  await expect(photographer.getByRole('complementary', { name: 'Shared with the other phone' })).toBeVisible();
  const link = await lastLink(photographer);
  expect(link).toContain('/#/receive/');

  // Assistant: a different phone, with nothing on it, opens the link.
  const context = await browser.newContext({ baseURL, viewport: { width: 402, height: 874 } });
  const assistant = await context.newPage();
  await fakeShareSheet(assistant);
  await assistant.goto(link);
  await expect(assistant.getByRole('heading', { name: 'Shared shoot' })).toBeVisible();
  await expect(assistant.getByRole('heading', { name: /Pike–Vega/ })).toBeVisible();
  await expect(assistant.getByRole('button', { name: 'Copy for the app' })).toBeVisible();
  await assistant.getByRole('button', { name: 'Open here' }).click();
  await assistant.getByRole('button', { name: 'Start shoot' }).click();
  await assistant.getByRole('button', { name: 'Done ✓' }).click();
  await expect(assistant.getByRole('region', { name: 'Progress' })).toContainText('1 of');
  await assistant.getByRole('button', { name: 'Shoot day menu' }).click();
  await assistant.getByRole('dialog', { name: 'Shoot day' }).getByRole('button', { name: 'Share shoot' }).click();
  await assistant.getByRole('button', { name: 'Text a link' }).click();
  await expect(assistant.getByRole('status').filter({ hasText: 'Shoot shared.' })).toBeVisible();
  const back = await lastLink(assistant);
  expect(back).not.toBe(link);

  // Photographer: open the link from Messages; the newer copy is accepted.
  await photographer.goto(back);
  await expect(photographer.getByRole('heading', { name: 'Shared shoot' })).toBeVisible();
  await photographer.getByRole('button', { name: 'Open here' }).click();
  await expect(photographer.getByRole('region', { name: 'Progress' })).toContainText('1 of');
  await expect(photographer.getByRole('complementary', { name: 'Shared with the other phone' })).toHaveCount(0);
  await expect(photographer.getByRole('button', { name: 'Done ✓' })).toBeEnabled();
  await context.close();
});
