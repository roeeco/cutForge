// Milestones 77-78 (UI_CLEANUP_PLAN.md Parts 4-6): a grow that closes the box chooses what ✓ makes; a quieter card.
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));

async function box(page: Page, mat: string) {
  await page.goto('/');
  await page.getByTestId(`mat-${mat}`).click();
  await page.getByTestId('start-go').click();
  return S<{ base: string; tray: string; back: string }>(page, () => {
    const { store, ops } = (window as any).__cutforge;
    let out = { base: '', tray: '', back: '' };
    store.getState().apply((d: any) => {
      const base = ops.addRootPanel(d, 0, 0, 120, 80);
      const tray = ops.addTray(d, base, 60);
      ops.autoConnect(d);
      const back = (Object.values(d.connections) as any[]).find((c) => c.grown && c.a.panelId === base && c.a.edge === 'e2').b.panelId;
      out = { base, tray, back };
    });
    return out;
  });
}

test('a lid grown across a plywood box: hinged by default, lifts off when chosen, one ✓', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { tray, back } = await box(page, 'ply-3');
  await S(page, (id: string) => {
    const s = (window as any).__cutforge.store.getState();
    s.select({ kind: 'edge', panelId: id, edge: 'e2' });
    s.setGrow({ height: 80, angle: 90 });
  }, back);
  await expect(page.getByTestId('grow-closes')).toBeVisible();
  await expect(page.getByTestId('grow-closes')).toHaveAttribute('data-close', 'hinged');
  await page.getByTestId('grow-close-liftoff').click();
  await expect(page.getByTestId('grow-closes-bar')).toHaveAttribute('data-lid', 'liftoff');
  const past = await S<number>(page, () => (window as any).__cutforge.store.getState().past.length);
  await page.getByTestId('grow-go').click();
  const d = await design(page);
  // plywood's lid that lifts off is a Flat lid (milestone 79)
  expect(Object.values(d.panels).some((p: any) => p.lidOf?.tray === tray)).toBe(true);
  expect(await S<number>(page, () => (window as any).__cutforge.store.getState().past.length)).toBe(past + 1);
  expect(errors).toEqual([]);
});

test.describe('a first visit: the quieter card', () => {
  test.use({ storageState: { cookies: [], origins: [{ origin: 'http://localhost:5199', localStorage: [{ name: 'cutforge.viewPrefs', value: JSON.stringify({ mode: 'workshop' }) }] }] } });
  test('settings fold once there is a board; the grow card keeps its More… row shut; Edges is closed with its count', async ({ page }) => {
    const { base, back } = await box(page, 'card-0.5');
    await S(page, () => (window as any).__cutforge.store.getState().select(null));
    await expect(page.getByTestId('inspector-design')).toHaveAttribute('data-folded', 'true');
    await expect(page.getByTestId('settings-joints')).toHaveCount(0);
    await page.getByTestId('settings-toggle').click();
    await expect(page.getByTestId('settings-joints')).toBeVisible();
    // the grow card: height first, the rest under More…
    await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'edge', panelId: id, edge: 'e2' }), back);
    await expect(page.getByTestId('grow-height')).toBeVisible();
    await expect(page.getByTestId('grow-kind')).toHaveCount(0);
    await page.getByTestId('grow-more').click();
    await expect(page.getByTestId('grow-kind')).toBeVisible();
    // the bottom hint says how to grow it; the card does not repeat it
    await expect(page.locator('.view-hint')).toContainText('Press ✓');
    // a board's Edges: closed, with a count
    await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), back);
    await expect(page.getByTestId('edges-toggle')).toHaveAttribute('aria-expanded', 'false');
    await page.getByTestId('edges-toggle').click();
    await expect(page.locator('[data-testid^="grow-from-"]').first()).toBeVisible();
    void base;
  });
});
