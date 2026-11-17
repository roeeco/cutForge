// Regressions from the maintenance round after milestone 72: the 3D stage
// keeps in step with every edit, the stage's floating labels stay clear of
// the cards, and the contextual card's controls keep their room.
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));
const select = (page: Page, id: string) => S(page, (i) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id: i }), id);
const edges = (page: Page) => S<Record<string, { edges: number; highlight: number | null; drawn: number | null }>>(page, () => (window as any).__cutforge.panelEdges());

async function organiser(page: Page) {
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('tpl-organiser').click();
  await page.getByTestId('start-go').click();
  await expect(page.getByTestId('view3d')).toBeVisible();
  return design(page);
}

test('changing a joint redraws the panel and its highlight in 3D, as on the cut plan', async ({ page }) => {
  const d = await organiser(page);
  const front = d.order[1];
  await select(page, front);
  await expect.poll(async () => (await edges(page))[front]?.highlight ?? null).not.toBeNull();
  const base = d.order[0];
  const start = await edges(page);
  const before = start[front];
  expect(before.drawn).toBe(before.edges);
  // the joint to the base, from finger joints to tabs and slots
  await page.getByTestId('joints-advanced').click();
  await page.getByTestId('conn-kind').first().selectOption('tabslot');
  await expect.poll(async () => (await design(page)).connections[Object.keys(d.connections)[0]].kind).toBe('tabslot');
  // the slab has the new outline, and the whole of its new highlight is drawn (it used to keep the old one, or draw stray lines)
  await expect.poll(async () => (await edges(page))[front].edges).not.toBe(before.edges);
  await expect.poll(async () => (await edges(page))[front].drawn).toBe((await edges(page))[front].edges);
  const after = (await edges(page))[front];
  expect(after.highlight).toBe(after.edges);
  // the base, which now has slots instead of finger notches though nothing of its own changed, is redrawn too
  expect((await edges(page))[base].edges).not.toBe(start[base].edges);
});

test('Round and Rounded are rail buttons of their own; the Polygon card draws polygons only', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('start-go').click();
  await page.getByTestId('tool-round').click();
  await expect(page.getByTestId('tool-round')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tool-polygon')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('round-circle')).toBeVisible();
  await expect(page.locator('.view-hint')).toContainText('Drag a box');
  await page.getByTestId('tool-rounded').click();
  await expect(page.getByTestId('tool-rounded')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('round-corner')).toBeVisible();
  // the Polygon button (or G) goes back to clicking corners; its card has no Round or Rounded any more
  await page.keyboard.press('g');
  await expect(page.getByTestId('tool-polygon')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('poly-mode-click')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('poly-mode-round')).toHaveCount(0);
  await expect(page.getByTestId('poly-mode-rounded')).toHaveCount(0);
  // a rounded board drawn with its own button
  await page.getByTestId('tool-rounded').click();
  const a = await page.evaluate(() => (window as any).__cutforge.projectWorld(-50, 0, 30));
  const b = await page.evaluate(() => (window as any).__cutforge.projectWorld(50, 0, -30));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await page.getByTestId('ghost-ok').click();
  const d = await design(page);
  expect(d.order.length).toBe(1);
  expect(d.panels[d.order[0]].sketch.pts.every((q: any) => q.curve === 'round')).toBe(true);
});
