// Milestone 112 (D3b): shaped flaps from the grow card, folding with the fold slider.
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const flaps = (page: Page, id: string) => S<any[]>(page, (pid: string) => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design.panels[pid].edgeFlaps ?? [])), id);

for (const lang of ['en', 'he'] as const) {
  test(`a tuck on a tray wall's top, folded and unfolded; then a hang tab with a euro slot (${lang})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    if (lang === 'he') await S(page, () => (window as any).__cutforge.store.getState().setLang('he'));
    await page.getByTestId('mat-card-0.5').click();
    await page.getByTestId('start-go').click();
    const id = await S<string>(page, () => {
      const cf = (window as any).__cutforge;
      let w = '';
      cf.store.getState().apply((d: any) => {
        const b = cf.ops.addRootPanel(d, -50, 35, 100, 70);
        const t = cf.ops.addTray(d, b, 40);
        cf.ops.autoConnect(d);
        w = `${t}/e2`;
      });
      cf.store.getState().select({ kind: 'edge', panelId: w, edge: 'e2' });
      return w;
    });
    await page.getByTestId('edge-add-flap').click();
    expect((await flaps(page, id))[0]).toMatchObject({ edge: 'e2' });
    await expect(page.getByTestId('flap-shape')).toBeVisible();
    await page.getByTestId('flap-shape-tuck').click();
    expect((await flaps(page, id))[0].shape).toBe('tuck');
    await expect(page.getByTestId('flap-angle')).toHaveValue('90');
    // the fold slider unfolds it (view only) and folds it back
    await page.getByTestId('fold-play').click();
    await expect.poll(() => S<number>(page, () => (window as any).__cutforge.store.getState().foldT)).toBe(0);
    await page.getByTestId('fold-play').click();
    await expect.poll(() => S<number>(page, () => (window as any).__cutforge.store.getState().foldT)).toBe(1);
    // a hang tab: flat, with a hole
    await page.getByTestId('flap-shape-hang').click();
    expect((await flaps(page, id))[0].shape).toBe('hang');
    await expect(page.getByTestId('flap-angle')).toHaveValue('0');
    await page.getByTestId('flap-hole-euro').click();
    expect((await flaps(page, id))[0].hole).toBe('euro');
    await page.getByTestId('view-2d').click();
    await expect(page.locator('[data-piece]')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}
