// Milestone 14: fold-over reinforcement from the wall's card.
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));

test('fold-over on a corrugated tray wall: lock tabs, a hem, and the net stays one piece', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('mat-corr-1.6').click();
  await page.getByTestId('start-go').click();
  await page.getByTestId('tour-nudge-dismiss').click();
  const walls = await S<string[]>(page, () => {
    const cf = (window as any).__cutforge;
    let ws: string[] = [];
    cf.store.getState().apply((d: any) => {
      const b = cf.ops.addRootPanel(d, -75, 50, 150, 100);
      const t = cf.ops.addTray(d, b, 60);
      ws = d.order.filter((id: string) => id.startsWith(t + '/'));
    });
    return ws;
  });
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), walls[0]);
  await page.getByTestId('fold-add').click();
  let d = await design(page);
  expect(d.panels[walls[0]].foldOvers[0]).toMatchObject({ edge: 'e2', depth: null, lock: 'tabs' });
  await expect(page.getByTestId('fold-lock-tabs')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('fold-lockdepth')).toBeVisible();
  // a partial hem is glued
  await page.getByTestId('fold-depth-hem').click();
  d = await design(page);
  expect(d.panels[walls[0]].foldOvers[0].depth).toBeGreaterThan(0);
  expect(d.panels[walls[0]].foldOvers[0].lock).toBe('glue');
  await page.getByTestId('fold-depth-full').click();
  await page.getByTestId('fold-lock-tabs').click();
  // unfolding shows the liner flat (view only)
  await page.getByTestId('fold-play').click();
  await expect.poll(async () => (await S<any>(page, () => (window as any).__cutforge.store.getState().foldT))).toBe(0);
  await page.getByTestId('fold-play').click();
  // the cut plan: still one folded net
  await page.getByTestId('view-2d').click();
  await expect(page.locator('[data-piece]')).toHaveCount(1);
  // remove it again
  await page.getByTestId('view-3d').click();
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), walls[0]);
  await page.getByTestId('fold-remove').click();
  d = await design(page);
  expect(d.panels[walls[0]].foldOvers).toBeUndefined();
  expect(errors).toEqual([]);
});
