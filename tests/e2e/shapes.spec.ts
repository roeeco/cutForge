// Milestone 9: Add and Cut shapes that change outlines, drawn on the stage.
import { shapeTool, opPick } from './util';
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));
const panelPt = (page: Page, id: string, x: number, y: number) => S<{ x: number; y: number }>(page, ([i, a, b]: [string, number, number]) => (window as any).__cutforge.project(i, a, b), [id, x, y]);

async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

test('a Cut across a walled edge notches the base and splits its wall; an Add joins the outline', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('start-go').click();
  // a base with a wall on its back edge (built through the model, then drawn on with the tools)
  const ids = await S<string[]>(page, () => {
    const cf = (window as any).__cutforge;
    let out: string[] = [];
    cf.store.getState().apply((d: any) => {
      const b = cf.ops.addRootPanel(d, -80, 50, 160, 100);
      const w = cf.ops.growPanel(d, b, 'e2', { height: 40, angle: 90, dir: 'up', kind: 'finger' }).panelId;
      out = [b, w];
    });
    return out;
  });
  const [base, wall] = ids;
  await page.getByTestId('fit-view').click();
  await page.waitForTimeout(300);

  // Cut: a rectangle from inside the base out past its front edge
  await opPick(page, 'cut');
  await shapeTool(page, 'rect');
  await drag(page, await panelPt(page, base, 70, 25), await panelPt(page, base, 90, -10));
  let d = await design(page);
  expect(d.panels[base].details).toHaveLength(1);
  // ✓ keeps it and goes back to Select (milestone 30); the notch is in the outline: the front edge is now two pieces you can grow from
  await page.getByTestId('ghost-ok').click();
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), base);
  await expect(page.getByTestId('grow-from-e0#0')).toBeVisible();
  await expect(page.getByTestId('grow-from-e0#1')).toBeVisible();

  // a Cut across the walled back edge splits the wall in two
  await shapeTool(page, 'rect');
  await drag(page, await panelPt(page, base, 70, 85), await panelPt(page, base, 90, 110));
  await page.getByTestId('ghost-ok').click();
  await shapeTool(page, 'rect');
  d = await design(page);
  expect(d.panels[`${wall}~1`]).toBeTruthy();
  expect(d.panels[wall].w + d.panels[`${wall}~1`].w).toBeCloseTo(160 - 20, 0);

  // Add: a tab on the left edge
  await opPick(page, 'add');
  await expect(page.getByTestId('op-add')).toHaveAttribute('aria-checked', 'true');
  await drag(page, await panelPt(page, base, 10, 40), await panelPt(page, base, -15, 60));
  await page.getByTestId('ghost-ok').click();
  d = await design(page);
  const add = d.panels[base].details.find((x: any) => x.op === 'add');
  expect(add).toBeTruthy();
  expect(d.panels[base].w).toBe(160); // the sketch is unchanged: the Add is a shape

  // the cut plan shows one piece for the base with the notches and tab, and the split wall's two pieces
  await page.getByTestId('view-2d').click();
  await expect(page.getByTestId(`detail-${add.id}`)).toBeVisible();
  const pieces = await page.locator('[data-piece]').count();
  expect(pieces).toBe(3);
  expect(errors).toEqual([]);
});
