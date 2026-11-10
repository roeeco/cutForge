// Milestone 10: extrude a polygon base into a tray, change its height, open and close a side.
import { test, expect, type Page } from '@playwright/test';
import { setNum } from './util';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));
const floorPt = (page: Page, x: number, z: number) => S<{ x: number; y: number }>(page, ([a, b]: number[]) => (window as any).__cutforge.projectWorld(a, 0, b), [x, z]);

test('card hexagon: extrude, one net, shared height, open a side and wall it again', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('mat-card-0.5').click();
  await page.getByTestId('start-go').click();
  await page.getByTestId('hints-dismiss').click();

  // a regular hexagon base with the polygon tool
  await page.keyboard.press('g');
  await page.getByTestId('poly-mode-ngon').click();
  const c = await floorPt(page, 0, 0), r = await floorPt(page, 60, 0);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move((c.x + r.x) / 2, c.y, { steps: 3 });
  await page.mouse.move(r.x, r.y, { steps: 3 });
  await page.mouse.up();
  // the polygon is a ghost until ✓ (milestone 30)
  await page.getByTestId('ghost-ok').click();
  let d = await design(page);
  const base = d.order[0];
  expect(d.panels[base].sketch.pts).toHaveLength(6);

  // Extrude: the card shows the ghost's height; Add walls commits
  await page.getByTestId('extrude').click();
  await expect(page.getByTestId('extrude-card')).toBeVisible();
  await expect(page.getByTestId('tray-ghost-dim')).toBeVisible();
  await setNum(page, 'extrude-height', '35');
  await page.getByTestId('extrude-go').click();
  d = await design(page);
  const tray = Object.keys(d.trays)[0];
  expect(d.trays[tray].height).toBe(35);
  const walls = d.order.filter((id: string) => id.startsWith(tray + '/'));
  expect(walls).toHaveLength(6);
  const corners = Object.values(d.connections).filter((x: any) => !x.grown && x.trayId === tray);
  expect(corners.map((x: any) => x.kind)).toEqual(Array(6).fill('glue'));

  // the tray card changes the shared height
  await expect(page.getByTestId('tray-card')).toBeVisible();
  await setNum(page, 'tray-height', '50');
  d = await design(page);
  for (const w of walls) expect(d.panels[w].h).toBeCloseTo(50 - 0.5, 6);

  // a wall's card: height is shared; typing a new height changes every wall
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), walls[2]);
  await expect(page.getByTestId('tray-wall')).toBeVisible();
  await setNum(page, 'panel-h', '29.5');
  d = await design(page);
  expect(d.trays[tray].height).toBe(30);

  // delete a wall: that side opens; Wall it closes it again
  await page.getByTestId('delete-panel').click();
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), base);
  await expect(page.getByTestId('tray-open')).toBeVisible();
  d = await design(page);
  const open = d.trays[tray].openEdges[0];
  await page.getByTestId(`wall-it-${open}`).click();
  d = await design(page);
  expect(d.trays[tray].openEdges).toEqual([]);
  expect(d.order.filter((id: string) => id.startsWith(tray + '/'))).toHaveLength(6);

  // the cut plan: one folded net
  await page.getByTestId('view-2d').click();
  await expect(page.locator('[data-piece]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('corrugated tray: tab-and-slot corners switched to through tabs on the tray card', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mat-corr-4').click();
  await page.getByTestId('start-go').click();
  await page.getByTestId('hints-dismiss').click();
  const base = await S<string>(page, () => {
    const cf = (window as any).__cutforge;
    let b = '';
    cf.store.getState().apply((d: any) => {
      b = cf.ops.addRootPanel(d, -75, 50, 150, 100);
      cf.ops.addTray(d, b, 60);
    });
    return b;
  });
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), base);
  await expect(page.getByTestId('tray-corner-kind')).toHaveValue('tabslot');
  await page.getByTestId('tray-tablen-through').click();
  const d = await design(page);
  const cs = Object.values(d.connections).filter((x: any) => !x.grown && x.trayId);
  expect(cs).toHaveLength(4);
  for (const c of cs as any[]) {
    expect(c.tabLen).toBe('through');
    expect(c.geom.scores.length).toBeGreaterThan(0);
  }
  // the joint card shows the fold-under length
  const wall = (cs[0] as any).a.panelId;
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), wall);
  await page.getByTestId('joints-advanced').click();
  await S(page, (id: string) => (window as any).__cutforge.store.getState().set({ openJoint: id }), (cs[0] as any).id);
  await expect(page.getByTestId('conn-tablen-through')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('conn-lockdepth')).toBeVisible();
});
