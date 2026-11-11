// Milestone 45 (CURVED_WALLS.md §6.1): round bases and rounded corners in the Workshop.
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));
const floorPt = (page: Page, x: number, z: number) => S<{ x: number; y: number }>(page, ([a, b]: number[]) => (window as any).__cutforge.projectWorld(a, 0, b), [x, z]);
async function setNum(page: Page, id: string, v: string) {
  const f = page.getByTestId(id);
  await f.fill(v);
  await f.press('Enter');
}

async function start(page: Page) {
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('start-go').click();
}
async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

test('a circle dragged with the polygon tool’s Round mode; its card makes it an oval, sets its ends, and converts it to points', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  await page.keyboard.press('g');
  await page.getByTestId('poly-mode-round').click();
  await page.getByTestId('round-circle').click();
  await drag(page, await floorPt(page, -40, 40), await floorPt(page, 40, -40));
  await page.getByTestId('ghost-ok').click();
  let d = await design(page);
  const id = d.order[0];
  expect(d.panels[id].sketch.round).toEqual({ shape: 'circle' });
  expect(d.panels[id].w).toBeCloseTo(80, 6);
  expect(d.panels[id].h).toBeCloseTo(80, 6);
  // the card: an oval, 60 deep, ends of 20
  await expect(page.getByTestId('round-section')).toBeVisible();
  await page.getByTestId('round-shape-oval').click();
  await setNum(page, 'panel-h', '60');
  // the end radius field follows the new depth (its ends can be at most half of it round) before it is typed in
  await expect(page.getByTestId('round-end')).toHaveValue('30');
  await setNum(page, 'round-end', '20');
  d = await design(page);
  expect(d.panels[id].sketch.round).toEqual({ shape: 'oval', rEnd: 20 });
  expect(d.panels[id].h).toBeCloseTo(60, 6);
  // its side radius: (20² + 30² − 20²) / (2 · 10) = 45
  await expect(page.getByTestId('round-side')).toContainText('45');
  // tighter than plywood bends (30 mm with its living hinge): the card says so
  await expect(page.getByTestId('round-tight')).toBeVisible();
  await page.getByTestId('round-to-points').click();
  d = await design(page);
  expect(d.panels[id].sketch.round).toBeUndefined();
  await expect(page.getByTestId('round-section')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Rounded mode, a corner rounded in Edit outline, and the material’s bend limits in the drawer', async ({ page }) => {
  await start(page);
  await page.keyboard.press('g');
  await page.getByTestId('poly-mode-rounded').click();
  await setNum(page, 'round-corner', '12');
  await drag(page, await floorPt(page, -60, 40), await floorPt(page, 60, -40));
  await page.getByTestId('ghost-ok').click();
  let d = await design(page);
  const id = d.order[0];
  expect(d.panels[id].sketch.pts.map((q: any) => q.r)).toEqual([12, 12, 12, 12]);
  // one radius for all its corners on its card
  await setNum(page, 'round-corner-all', '20');
  d = await design(page);
  expect(d.panels[id].sketch.pts.map((q: any) => q.r)).toEqual([20, 20, 20, 20]);
  // a point back to a corner, then rounded again, in Edit outline
  await page.getByTestId('edit-outline').click();
  await S(page, () => (window as any).__cutforge.store.getState().set({ selVertex: 0 }));
  await page.getByTestId('point-corner').click();
  d = await design(page);
  expect(d.panels[id].sketch.pts[0].curve).toBeUndefined();
  await page.getByTestId('point-round').click();
  await setNum(page, 'point-radius', '8');
  d = await design(page);
  expect(d.panels[id].sketch.pts[0]).toMatchObject({ curve: 'round', r: 8 });
  // the drawer's bend limits: plywood's starting points, editable
  await page.getByTestId('material-pill').click();
  await expect(page.getByTestId('drawer-bend')).toBeVisible();
  await expect(page.getByTestId('mat-patternR')).toHaveValue('30');
  await setNum(page, 'mat-patternR', '24');
  d = await design(page);
  expect(d.material.bend.patternR).toBe(24);
});
