// milestone 71 (PACKAGING_PLAN.md §6.3): telescoping lids, arched lids, matched walls.
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));

async function box(page: Page, mat: string) {
  await page.goto('/');
  await page.getByTestId(`mat-${mat}`).click();
  await page.getByTestId('start-go').click();
  return S<{ base: string; tray: string }>(page, () => {
    const { store, ops } = (window as any).__cutforge;
    let out = { base: '', tray: '' };
    store.getState().apply((d: any) => {
      const base = ops.addRootPanel(d, 0, 0, 120, 80);
      const tray = ops.addTray(d, base, 60);
      ops.autoConnect(d);
      out = { base, tray };
    });
    store.getState().select({ kind: 'panel', id: out.base });
    return out;
  });
}

test('the tray card adds an arched lid: two bands, the end walls cut to the arch, ready to cut', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await box(page, 'card-0.5');
  // the box's Lid section (milestone 73): Arched is one of its pictures in Workshop
  await expect(page.getByTestId('lid-section')).toHaveAttribute('data-lid', 'none');
  await expect(page.getByTestId('lid-arched')).not.toHaveAttribute('aria-disabled', 'true');
  await page.getByTestId('lid-arched').click();
  const d = await design(page);
  const bands = Object.values(d.connections).filter((c: any) => c.grown && c.kind === 'fold' && c.radius > 0);
  expect(bands).toHaveLength(2);
  await expect(page.getByTestId('lid-section')).toHaveAttribute('data-lid', 'arched');
  await page.screenshot({ path: test.info().outputPath('arched.png') });
  expect(errors).toEqual([]);
});

test('the tray card adds a telescoping lid; the lid’s own card says it is a lid', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { tray } = await box(page, 'corr-1.6');
  await page.getByTestId('lid-liftoff').click();
  const d = await design(page);
  const lid: any = Object.values(d.trays).find((t: any) => t.lidOf === tray);
  expect(lid).toBeTruthy();
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), lid.baseId);
  await expect(page.getByTestId('tray-is-lid')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('telescoping.png') });
  expect(errors).toEqual([]);
});

test('matched walls: the left wall follows the right wall’s top', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { tray } = await box(page, 'ply-3');
  const ok = await S<boolean>(page, (tr: string) => {
    const { store, ops } = (window as any).__cutforge;
    let r = false;
    store.getState().apply((d: any) => {
      r = ops.matchWall(d, `${tr}/e3`, `${tr}/e1`);
    });
    store.getState().select({ kind: 'panel', id: `${tr}/e3` });
    return r;
  }, tray);
  expect(ok).toBe(true);
  await expect(page.getByTestId('match-section')).toBeVisible();
  expect(errors).toEqual([]);
});
