// Milestone 116 (D5b): board grades from the material drawer's *More boards…* (Workshop only).
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;

test('Workshop: More boards… → Greyboard 2 mm; the pill names it and the box keeps its inside size', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mat-card-0.5').click();
  await page.getByTestId('start-go').click();
  const tray = await S<string>(page, () => {
    const cf = (window as any).__cutforge;
    let id = '';
    cf.store.getState().apply((d: any) => {
      const b = cf.ops.addRootPanel(d, -40, 30, 80, 60);
      id = cf.ops.addTray(d, b, 30);
      cf.ops.autoConnect(d);
      d.sizeAs = 'inside';
    });
    return id;
  });
  const inside = () => S<number>(page, (id: string) => {
    const d = (window as any).__cutforge.store.getState().design;
    const base = d.panels[d.trays[id].baseId];
    return base.w - 2 * d.material.thickness;
  }, tray);
  const before = await inside();
  await page.getByTestId('material-pill').click();
  await page.getByTestId('drawer-more').click();
  await expect(page.getByTestId('drawer-grades')).toBeVisible();
  await page.getByTestId('drawer-grade-grey-2').click();
  await expect(page.getByTestId('material-pill')).toContainText('Greyboard 2 mm');
  expect(await S<string>(page, () => (window as any).__cutforge.store.getState().design.material.id)).toBe('grey-2');
  expect(await inside()).toBeCloseTo(before, 3);
});

test('Quick build has no More boards…', async ({ page }) => {
  await page.goto('/');
  await S(page, () => (window as any).__cutforge.store.getState().setPrefs({ mode: 'quick' }));
  await page.getByTestId('mat-card-0.5').click();
  await page.getByTestId('start-go').click();
  await page.getByTestId('material-pill').click();
  await expect(page.getByTestId('drawer-more')).toHaveCount(0);
});
