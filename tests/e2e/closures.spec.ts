// milestone 67 (PACKAGING_PLAN.md §7): a lid that reaches the front wall closes the box.
import { test, expect, type Page } from '@playwright/test';
import { QUICK_STATE } from './util';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));

test('a card lid grown to the front wall: the grow card says it will close the box; its card sets a tuck with slit locks and a thumb notch', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('mat-card-0.5').click();
  await page.getByTestId('start-go').click();
  const ids = await S<{ back: string; base: string }>(page, () => {
    const { store, ops } = (window as any).__cutforge;
    let out = { back: '', base: '' };
    store.getState().apply((d: any) => {
      const base = ops.addRootPanel(d, 0, 0, 120, 80);
      ops.addTray(d, base, 50);
      ops.autoConnect(d);
      const back = Object.values(d.connections).find((c: any) => c.grown && c.a.panelId === base && c.a.edge === 'e2') as any;
      out = { back: back.b.panelId, base };
    });
    return out;
  });
  // grow from the back wall's top edge, by fold, to the front wall
  await S(page, (back: string) => {
    const st = (window as any).__cutforge.store.getState();
    st.set({ selection: { kind: 'edge', panelId: back, edge: 'e2' } });
    st.setGrow({ height: 79.5, angle: 90, kind: 'fold', adapt: false });
  }, ids.back);
  await expect(page.getByTestId('grow-closes')).toBeVisible();
  await expect(page.getByTestId('grow-closes')).toContainText('Tuck flap');
  // make it, by the model, at the front wall's inside face
  const lid = await S<string>(page, (back: string) => {
    const { store, ops } = (window as any).__cutforge;
    let id = '';
    store.getState().apply((d: any) => {
      id = ops.growPanel(d, back, 'e2', { height: 79.5, angle: 90, dir: 'up', kind: 'fold' }).panelId;
      ops.autoConnect(d);
    });
    store.getState().set({ selection: { kind: 'panel', id } });
    return id;
  }, ids.back);
  await expect(page.getByTestId('closure-section')).toBeVisible();
  await page.getByTestId('closure-style').selectOption('tuckLock');
  await page.getByTestId('closure-thumb').check();
  const d = await design(page);
  expect(d.closures[lid]).toMatchObject({ style: 'tuckLock', thumb: true });
  expect(d.connections[`close:${lid}`].kind).toBe('closure');
  await page.screenshot({ path: test.info().outputPath('tuck.png') });
  expect(errors).toEqual([]);
});

test.describe('Quick build cartons (milestone 68)', () => {
  test.use({ storageState: QUICK_STATE });
  test('a Box of kind Carton: no base cut, one strip of walls, a tuck lid, a bottom that snaps shut, ready to cut', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.getByTestId('mat-card-0.5').click();
    await page.getByTestId('start-go').click();
    await S(page, () => (window as any).__cutforge.setCamera([0, 300, 260], [0, 0, 0]));
    await page.waitForTimeout(300);
    await page.getByTestId('quick-box').click();
    await page.getByTestId('box-kind-carton').click();
    await expect(page.getByTestId('box-carton-help')).toBeVisible();
    const pt = (x: number, z: number) => S<{ x: number; y: number }>(page, (a: number[]) => (window as any).__cutforge.projectWorld(a[0], 0, a[1]), [x, z]);
    const a = await pt(-45, -30), b = await pt(45, 30);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.up();
    await page.getByTestId('extrude-go').click();
    const d = await design(page);
    const tray = Object.values(d.trays)[0] as any;
    expect(tray).toMatchObject({ base: 'open', bottom: 'snap', top: 'tuck' });
    expect(d.connections[`end:${tray.id}:bottom`]).toBeTruthy();
    await expect(page.getByTestId('ready-badge')).toHaveAttribute('data-ok', 'true');
    await page.screenshot({ path: test.info().outputPath('carton.png') });
    expect(errors).toEqual([]);
  });
});
