// Milestone 8: the polygon tool (click corners and regular n-gon), outline
// editing, and growing walls from polygon edges.
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const state = (page: Page) => S(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState())));
const design = async (page: Page) => (await state(page)).design;
const floorPt = (page: Page, x: number, z: number) => S<{ x: number; y: number }>(page, ([a, b]: number[]) => (window as any).__cutforge.projectWorld(a, 0, b), [x, z]);
const panelPt = (page: Page, id: string, x: number, y: number) => S<{ x: number; y: number }>(page, ([i, a, b]: [string, number, number]) => (window as any).__cutforge.project(i, a, b), [id, x, y]);

async function start(page: Page, mat = 'ply-3') {
  await page.goto('/');
  await page.getByTestId(`mat-${mat}`).click();
  await page.getByTestId('start-go').click();
}

test('polygon base by clicks, n-gon, vertex editing and growing from a sloped edge', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);

  // click corners of a pentagon ("house") on the floor; close on the first point
  await page.keyboard.press('g');
  await expect(page.getByTestId('poly-card')).toBeVisible();
  const corners: [number, number][] = [[-60, 40], [60, 40], [60, -20], [0, -60], [-60, -20]];
  for (const [x, z] of corners) {
    const p = await floorPt(page, x, z);
    await page.mouse.click(p.x, p.y);
  }
  await expect(page.getByTestId('poly-label')).toBeVisible();
  const first = await floorPt(page, ...corners[0]);
  await page.mouse.click(first.x, first.y);
  // the closed polygon is a ghost until ✓, then back to Select (milestone 30)
  await page.getByTestId('ghost-ok').click();
  let d = await design(page);
  expect(d.order).toHaveLength(1);
  const base = d.order[0];
  expect(d.panels[base].sketch.kind).toBe('poly');
  expect(d.panels[base].sketch.pts).toHaveLength(5);
  expect(d.panels[base].w).toBeCloseTo(120, 0);
  expect(d.panels[base].h).toBeCloseTo(100, 0);
  // back to Select with the new base selected; it can grow from every edge
  await expect(page.getByTestId('inspector-panel')).toBeVisible();
  await expect(page.locator('[data-testid^=grow-from-]')).toHaveCount(5);

  // grow a wall from a sloped edge (e2: 60,-20 → 0,-60) with the standard grow card
  await page.getByTestId('grow-from-2').click();
  await expect(page.getByTestId('edgebar')).toBeVisible();
  await page.getByTestId('grow-go').click();
  d = await design(page);
  const wall = d.order[1];
  expect(d.panels[wall].w).toBeCloseTo(Math.hypot(60, 40), 1);

  // edit the outline: move a vertex and the wall follows the edge
  await S(page, ([id]: string[]) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), [base]);
  await page.getByTestId('edit-outline').click();
  await expect(page.locator('.view-hint')).toContainText('Drag a point');
  const pts = d.panels[base].sketch.pts as { x: number; y: number }[];
  // the apex (0,-60) is the vertex with the largest local y
  const apex = pts.reduce((a, q, i) => (q.y > pts[a].y ? i : a), 0);
  const from = await panelPt(page, base, pts[apex].x, pts[apex].y);
  const to = await panelPt(page, base, pts[apex].x, pts[apex].y + 20);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  d = await design(page);
  expect(d.panels[base].h).toBeGreaterThan(110);
  expect(d.panels[wall].w).toBeGreaterThan(Math.hypot(60, 40) + 5);
  await page.keyboard.press('Escape');
  expect((await state(page)).editOutline).toBeNull();

  // regular n-gon: 8 sides, drag from the centre
  await page.keyboard.press('g');
  await page.getByTestId('poly-mode-ngon').click();
  await page.getByTestId('ngon-plus').click();
  await page.getByTestId('ngon-plus').click();
  await expect(page.getByTestId('ngon-sides')).toHaveText('8');
  const c = await floorPt(page, -170, 0), r = await floorPt(page, -130, 0);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move((c.x + r.x) / 2, c.y, { steps: 3 });
  await page.mouse.move(r.x, r.y, { steps: 3 });
  await page.mouse.up();
  await page.getByTestId('ghost-ok').click();
  d = await design(page);
  expect(d.order).toHaveLength(3);
  const oct = d.panels[d.order[2]];
  expect(oct.sketch.pts).toHaveLength(8);

  // a polygon shape on a panel: three clicks and Enter
  await page.keyboard.press('g');
  await page.getByTestId('poly-mode-click').click();
  for (const [x, y] of [[40, 30], [80, 30], [60, 60]]) {
    const p = await panelPt(page, base, x, y);
    await page.mouse.click(p.x, p.y);
  }
  await page.keyboard.press('Enter');
  d = await design(page);
  expect(d.panels[base].details).toHaveLength(1);
  expect(d.panels[base].details[0].shape).toBe('polygon');
  expect(d.panels[base].details[0].path.polys[0]).toHaveLength(3);

  await page.getByTestId('view-2d').click();
  await expect(page.locator('[data-testid=cutplan] path').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('Hebrew polygon card is right-to-left', async ({ page }) => {
  await start(page);
  await S(page, () => (window as any).__cutforge.store.getState().setLang('he'));
  await page.keyboard.press('g');
  await expect(page.getByTestId('poly-card')).toContainText('מצולע');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});
