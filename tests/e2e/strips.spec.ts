// Milestone 48 (CURVED_WALLS.md §4.3, §7.3): an arched lid in Quick build, strips and closing seams in the Workshop.
import { test, expect, type Page } from '@playwright/test';
import { QUICK_STATE, setNum } from './util';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const pt = (page: Page, x: number, y: number, z: number) => S<{ x: number; y: number }>(page, ([a, b, c]: number[]) => (window as any).__cutforge.projectWorld(a, b, c), [x, y, z]);
async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}
const arch = (page: Page) => S<any>(page, () => {
  const d = (window as any).__cutforge.store.getState().design;
  const t: any = Object.values(d.trays).find((x: any) => x.arch);
  return t ? { ...t.arch, lidW: d.panels[t.arch.lid].w, followArch: d.panels[t.arch.follow].sketch.arch } : null;
});

test.describe('Quick build', () => {
  test.use({ storageState: QUICK_STATE });

  test('Box, then Arched lid on its card: both end walls arch, the lid bends over them; its rise from the card and the arrow', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.getByTestId('mat-corr-1.6').click();
    await page.getByTestId('start-go').click();
    await S(page, () => (window as any).__cutforge.setCamera([0, 300, 260], [0, 0, 0]));
    await page.waitForTimeout(300);
    await page.getByTestId('quick-box').click();
    await drag(page, await pt(page, -70, 0, -45), await pt(page, 70, 0, 45));
    await page.getByTestId('extrude-go').click();
    await page.getByTestId('tray-arch').click();
    let a = await arch(page);
    expect(a.rise).toBe(20);
    expect(a.followArch).toBe(20);
    await setNum(page, 'tray-arch-rise', '35');
    a = await arch(page);
    expect(a.rise).toBe(35);
    expect(a.followArch).toBe(35);
    // the arrow over the arch: dragged up, the rise grows
    const w0 = a.lidW;
    // the arrow sits over the arch's apex on the leader wall
    await S(page, () => {
      const cf = (window as any).__cutforge;
      const d = cf.store.getState().design;
      const t: any = Object.values(d.trays).find((x: any) => x.arch);
      cf.setCamera([260, 220, 200], [0, 40, 0]);
      cf.store.getState().select({ kind: 'panel', id: t.baseId });
    });
    const at = await S<{ x: number; y: number }>(page, () => {
      const cf = (window as any).__cutforge;
      const d = cf.store.getState().design;
      const t: any = Object.values(d.trays).find((x: any) => x.arch);
      const L = d.panels[t.arch.lead], f = L.frame;
      const x = L.w / 2, y = L.h + t.arch.rise + 1.6;
      return cf.projectWorld(f.o[0] + f.u[0] * x + f.v[0] * y, f.o[1] + f.u[1] * x + f.v[1] * y, f.o[2] + f.u[2] * x + f.v[2] * y);
    });
    await page.waitForTimeout(200);
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/arch-before.png` });
    await drag(page, at, { x: at.x, y: at.y - 30 });
    a = await arch(page);
    expect(a.rise).toBeGreaterThan(35);
    expect(a.lidW).toBeGreaterThan(w0);
    await expect(page.getByTestId('ready-badge')).toBeVisible();
    await page.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/arch.png` : 'test-results/arch.png' });
    await page.getByTestId('tray-arch-remove').click();
    expect(await arch(page)).toBeNull();
    expect(errors).toEqual([]);
  });
});

test('Workshop: a card rounded box is one net; a corner says which wall it continues; a circle’s closing seam moves', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('mat-card-0.5').click();
  await page.getByTestId('start-go').click();
  const ids = await S<{ corner: string; circleWall: string }>(page, () => {
    const cf = (window as any).__cutforge;
    let out: any;
    cf.store.getState().apply((d: any) => {
      const rr = cf.ops.addRoundedRect(d, -150, 40, 120, 80, 15);
      cf.ops.addTray(d, rr, 40);
      const c = cf.ops.addRoundPanel(d, 40, 60, 100, 100, { shape: 'circle' });
      cf.ops.addTray(d, c, 40);
      cf.ops.autoConnect(d);
      const bent = d.order.filter((id: string) => d.panels[id].bent);
      out = { corner: bent.find((id: string) => !d.panels[id].bent.closed), circleWall: bent.find((id: string) => d.panels[id].bent.closed) };
    });
    cf.store.getState().select({ kind: 'panel', id: out.corner });
    return out;
  });
  await expect(page.getByTestId('bend-strip')).toBeVisible();
  await expect(page.getByTestId('bend-strip')).toContainText(/one strip/);
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), ids.circleWall);
  await setNum(page, 'bend-seam', '90');
  const seam = await S<number>(page, (id: string) => (window as any).__cutforge.store.getState().design.panels[id].bend?.seamAt, ids.circleWall);
  expect(seam).toBeCloseTo(0.25, 6);
  expect(errors).toEqual([]);
});
