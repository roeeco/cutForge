// BUGFIX_PLAN B4: a design the editor cannot draw shows a recovery card (Undo,
// Reload the last good version) instead of a blank app, and is never autosaved.
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const panels = (page: Page) => S(page, () => Object.keys((window as any).__cutforge.store.getState().design.panels).length);
/** Replace the design with a copy whose first board has no frame: drawing it throws. */
const breakDesign = (page: Page) =>
  S(page, () => {
    const st = (window as any).__cutforge.store;
    const d = structuredClone(st.getState().design);
    d.panels[d.order[0]].frame = null;
    st.setState({ design: d });
  });

test('a design that cannot be drawn shows the recovery card, and is never saved', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('start-go').click();
  const dismiss = page.getByTestId('hints-dismiss');
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
  await S(page, () => {
    const { store, ops } = (window as any).__cutforge;
    store.getState().apply((d: any) => void ops.addRootPanel(d, 0, 0, 120, 80));
  });
  await expect(page.getByTestId('save-state')).toHaveClass(/\bsaved\b/);
  expect(await panels(page)).toBe(1);

  // Undo: back one step, the editor draws again
  await breakDesign(page);
  await expect(page.getByTestId('crash')).toBeVisible();
  await expect(page.getByTestId('crash-undo')).toBeEnabled();
  await page.getByTestId('crash-undo').click();
  await expect(page.getByTestId('crash')).toHaveCount(0);
  expect(await panels(page)).toBe(0);
  await S(page, () => (window as any).__cutforge.store.getState().redo());
  expect(await panels(page)).toBe(1);

  // Reload the last good version
  await breakDesign(page);
  await expect(page.getByTestId('crash')).toBeVisible();
  await page.waitForTimeout(900); // longer than the autosave delay: the broken design must not be saved
  await page.getByTestId('crash-reload').click();
  await expect(page.getByTestId('crash')).toHaveCount(0);
  expect(await panels(page)).toBe(1);

  // break it again and reload the page: the saved design is the good one
  await breakDesign(page);
  await expect(page.getByTestId('crash')).toBeVisible();
  await page.waitForTimeout(900);
  await page.reload();
  await expect(page.locator('.app')).toBeVisible();
  await expect(page.getByTestId('crash')).toHaveCount(0);
  expect(await panels(page)).toBe(1);
});
