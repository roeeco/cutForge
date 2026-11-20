// Milestone 128 (Shapes R9): Guided's diamond, from the gallery to a downloaded file with no
// other screen: its sizes in Build (a slider), Send, the SVG.
import { expect, test } from '@playwright/test';

test.use({
  storageState: {
    cookies: [],
    origins: [{ origin: 'http://localhost:5199', localStorage: [{ name: 'cutforge.viewPrefs', value: JSON.stringify({ mode: 'guided', guidedPreview: true }) }] }],
  },
});

test('Guided: Diamond from the gallery to the file', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('g-start')).toBeVisible();
  await page.getByTestId('g-thing-diamond').click();
  await expect(page.getByTestId('g-topbar')).toBeVisible();
  // the gestures' pictures show only for a box
  if (await page.getByTestId('g-demo-ok').isVisible()) await page.getByTestId('g-demo-ok').click();
  // Build: its own few sizes; ten sides makes it again
  await expect(page.getByTestId('g-solid')).toBeVisible();
  const faces = () => page.evaluate(() => (window as any).__cutforge.store.getState().design.order.length);
  expect(await faces()).toBe(17);
  await page.getByTestId('g-solid-n').fill('10');
  await expect.poll(faces).toBe(21);
  // no workplane, no Make button, no Make card
  for (const id of ['make-fold', 'make-card', 'stage-stepper']) await expect(page.getByTestId(id)).toHaveCount(0);
  // Send: the file
  await page.getByTestId('g-step-send').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('g-download').click();
  const file = await download;
  const chunks: Buffer[] = [];
  for await (const c of (await file.createReadStream())!) chunks.push(c as Buffer);
  expect(Buffer.concat(chunks).toString('utf8')).toContain('<svg');
  expect(errors).toEqual([]);
});
