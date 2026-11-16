import { expect, test, type Page } from '@playwright/test';

const SHOTS = '/tmp/claude-0/-home-user-photo-planner/0014207a-dff2-575e-8c17-c08f9bec28bc/scratchpad';

async function openSheet(page: Page) {
  await page.goto('./#/families');
  await page.getByRole('button', { name: 'Load demo family' }).click();
  await expect(page.getByRole('heading', { name: /Pike–Vega family/ })).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await page.getByRole('link', { name: /Shoots/ }).click();
  await page.getByRole('button', { name: '+ New shoot' }).click();
  await page.getByRole('dialog', { name: 'New shoot' }).getByRole('button', { name: 'Create shoot' }).click();
  await expect(page.locator('li.shot').first()).toBeVisible();
  await page.getByRole('button', { name: 'Early or late people' }).click();
  const sheet = page.getByRole('dialog', { name: 'Who goes first or last' });
  await expect(sheet).toBeVisible();
  return sheet;
}

for (const [w, h] of [
  [375, 667],
  [402, 874],
] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`Early/Late rows are compact, one line, no sideways scroll (${w}x${h}, ${scheme})`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      const sheet = await openSheet(page);
      await expect(sheet.getByRole('checkbox')).toHaveCount(0);
      await expect(sheet.getByRole('button', { name: 'Reset all to Normal' })).toHaveCount(0);
      await sheet.getByRole('radiogroup', { name: 'Margaret Pike goes' }).getByRole('radio', { name: 'Early' }).click();
      await sheet.getByRole('radiogroup', { name: 'Dana Pike goes' }).getByRole('radio', { name: 'Late' }).click();
      await expect(sheet.getByRole('button', { name: 'Reset all to Normal' })).toBeVisible();

      const rows = sheet.locator('li.prio-row');
      expect(await rows.count()).toBeGreaterThan(5);
      const geo = await rows.evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          const n = el.querySelector('.prio-name')!.getBoundingClientRect();
          const c = el.querySelector('.segmented')!.getBoundingClientRect();
          return { h: r.height, sameLine: Math.abs(n.top + n.height / 2 - (c.top + c.height / 2)) < 4, ctlH: c.height, ctlW: c.width, right: c.right };
        }),
      );
      for (const g of geo) {
        expect(g.h).toBeLessThanOrEqual(60);
        expect(g.sameLine).toBe(true);
        expect(g.ctlH).toBeLessThanOrEqual(38);
        expect(g.ctlW).toBeLessThanOrEqual(204);
        expect(g.right).toBeLessThanOrEqual(w);
      }
      const scroll = await page.evaluate(() => {
        const bad = [document.documentElement, document.body, ...document.querySelectorAll('[role=dialog], [role=dialog] *')].filter((e) => e.scrollWidth > e.clientWidth + 1);
        return bad.map((e) => e.className || e.tagName);
      });
      expect(scroll).toEqual([]);
      await page.screenshot({ path: `${SHOTS}/priorities-${w}-${scheme}.png` });
    });
  }
}

test('a long name is cut with an ellipsis and nothing overflows at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const sheet = await openSheet(page);
  await sheet.locator('.prio-name').first().evaluate((el) => {
    el.textContent = 'Alexandria Montgomery-Featherstonehaugh the Third of Pike';
  });
  const box = await sheet.locator('.prio-name').first().evaluate((el) => ({ over: el.scrollWidth > el.clientWidth, h: el.getBoundingClientRect().height, ell: getComputedStyle(el).textOverflow }));
  expect(box.over).toBe(true);
  expect(box.ell).toBe('ellipsis');
  expect(box.h).toBeLessThan(30);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
