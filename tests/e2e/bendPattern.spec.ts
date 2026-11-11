// Milestone 47 (CURVED_WALLS.md §5.2, §5.5): a bent wall's Bend section and the bend test download.
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const pattern = (page: Page, id: string) => S<any>(page, (w: string) => {
  const p = (window as any).__cutforge.store.getState().design.panels[w];
  return { bend: p.bend ?? null, style: p.bent?.pattern?.style, auto: p.bent?.pattern?.auto };
}, id);

test('Workshop: a plywood corner shows its living hinge; Smooth is named too loose; Auto again; a bend test downloads', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('start-go').click();
  const wall = await S<string>(page, () => {
    const cf = (window as any).__cutforge;
    let out = '';
    cf.store.getState().apply((d: any) => {
      const rr = cf.ops.addRoundedRect(d, -60, 40, 120, 80, 30);
      cf.ops.addTray(d, rr, 40);
      cf.ops.autoConnect(d);
      out = d.order.find((id: string) => d.panels[id].bent);
    });
    cf.store.getState().select({ kind: 'panel', id: out });
    return out;
  });
  await expect(page.getByTestId('bend-section')).toBeVisible();
  await expect(page.getByTestId('bend-auto')).toContainText(/Living hinge/);
  expect(await pattern(page, wall)).toEqual({ bend: null, style: 'lattice', auto: true });
  await page.getByTestId('bend-style-smooth').click();
  expect(await pattern(page, wall)).toEqual({ bend: { style: 'smooth' }, style: 'smooth', auto: false });
  await expect(page.getByTestId('bend-reach')).toHaveClass(/warn/);
  await page.getByTestId('bend-style-auto').click();
  expect(await pattern(page, wall)).toEqual({ bend: null, style: 'lattice', auto: true });
  // a set line spacing
  await page.getByTestId('bend-pitch-auto').uncheck();
  await expect(page.getByTestId('bend-pitch')).toBeVisible();
  expect((await pattern(page, wall)).bend).toEqual({ pitch: 2 });
  // the bend test strip from the material drawer
  await page.getByTestId('material-pill').click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('mat-bend-test').click();
  expect((await dl).suggestedFilename()).toMatch(/bend-test\.svg$/);
  expect(errors).toEqual([]);
});
