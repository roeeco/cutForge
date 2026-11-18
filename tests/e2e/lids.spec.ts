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

// milestone 76 (UI_CLEANUP_PLAN.md Part 3): a lid beside the box, Put on / Take off; a folded lid shown open, Close / Open
test('a cap lies beside the box and Put on shows it in place; a hinged lid is shown open until Close', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { tray, base } = await box(page, 'corr-4');
  await page.getByTestId('lid-liftoff').click();
  let d = await design(page);
  const lt: any = Object.values(d.trays).find((t: any) => t.lidOf === tray);
  // beside: on the floor, to the right of the box
  expect(d.panels[lt.baseId].frame.o[1]).toBeCloseTo(d.panels[base].frame.o[1], 6);
  expect(d.panels[lt.baseId].frame.o[0]).toBeGreaterThan(d.panels[base].frame.o[0] + 120);
  await expect(page.getByTestId('lid-pose')).toHaveText('Put on');
  await page.getByTestId('lid-pose').click();
  await expect(page.getByTestId('lid-pose')).toHaveText('Take off');
  // the design did not change
  expect(JSON.stringify((await design(page)).panels)).toBe(JSON.stringify(d.panels));
  await page.screenshot({ path: test.info().outputPath('cap-on.png') });
  await page.getByTestId('lid-pose').click();
  // hinged: shown open, Close shows it shut
  await page.getByTestId('lid-hinged').click();
  await expect(page.getByTestId('lid-section')).toHaveAttribute('data-lid', 'hinged');
  await expect(page.getByTestId('lid-pose')).toHaveText('Close');
  await page.getByTestId('lid-pose').click();
  await expect(page.getByTestId('lid-pose')).toHaveText('Open');
  expect(errors).toEqual([]);
});

// milestone 79 (LIDS_LINES_PROJECTS_PLAN.md §3.2): the kind of lid that lifts off, Automatic, why not, a cap's rim
test('Lifts off on plywood makes a Flat lid; Cap and its rim', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { tray } = await box(page, 'ply-3');
  await page.getByTestId('lid-liftoff').click();
  await expect(page.getByTestId('lid-style-flat')).toHaveAttribute('aria-checked', 'true');
  let d = await design(page);
  expect(Object.values(d.panels).some((p: any) => p.lidOf?.tray === tray && p.lidOf.kind === 'flat')).toBe(true);
  expect(Object.keys(d.connections).filter((k) => k.startsWith('lidtab:'))).toHaveLength(4);
  await page.getByTestId('lid-style-cap').click();
  await expect(page.getByTestId('lid-style-cap')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('lid-rim-full').click();
  d = await design(page);
  const cap: any = Object.values(d.trays).find((t: any) => t.lidOf === tray);
  expect(cap.height).toBeCloseTo(60 + 3, 6);
  await page.screenshot({ path: test.info().outputPath('cap-full.png') });
  expect(errors).toEqual([]);
});

test('on card the Flat lid is greyed, and says why', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const c = await box(page, 'card-0.5');
  await page.getByTestId('lid-liftoff').click();
  await expect(page.getByTestId('lid-style-flat')).toHaveAttribute('aria-disabled', 'true');
  await page.getByTestId('lid-style-flat').click({ force: true });
  await expect(page.getByTestId('lid-section')).toContainText('On card, use the Cap');
  void c;
  expect(errors).toEqual([]);
});
