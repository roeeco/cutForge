// Milestone 11: a gable made by editing a wall's outline, and a roof grown from its sloped edge.
import { test, expect, type Page } from '@playwright/test';
import { settle } from './util';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));
const panelPt = (page: Page, id: string, x: number, y: number) => S<{ x: number; y: number }>(page, ([i, a, b]: [string, number, number]) => (window as any).__cutforge.project(i, a, b), [id, x, y]);

test('gable wall by outline editing, then a roof from its sloped edge', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('start-go').click();
  await page.getByTestId('tour-nudge-dismiss').click();
  const front = await S<string>(page, () => {
    const cf = (window as any).__cutforge;
    let w = '';
    cf.store.getState().apply((d: any) => {
      const b = cf.ops.addRootPanel(d, -60, 40, 120, 80);
      w = cf.ops.growPanel(d, b, 'e0', { height: 50, angle: 90, dir: 'up', kind: 'finger' }).panelId;
    });
    return w;
  });
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), front);
  await page.getByTestId('fit-view').click();
  await settle(page);
  await page.getByTestId('edit-outline').click();
  await settle(page);

  // "+" in the middle of the top edge adds a point; drag it up 30 mm
  const mid = await panelPt(page, front, 60, 50);
  await page.mouse.click(mid.x, mid.y);
  let d = await design(page);
  const ins = d.panels[front].sketch.inserts;
  expect(ins).toHaveLength(1);
  expect(ins[0].edge).toBe('e2');
  const to = await panelPt(page, front, 60, 80);
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move((mid.x + to.x) / 2, (mid.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  d = await design(page);
  expect(d.panels[front].sketch.inserts[0].off).toBeGreaterThan(20);
  expect(d.panels[front].sketch.inserts[0].t).toBeCloseTo(0.5, 1);
  await page.keyboard.press('Escape');

  // grow a roof from the right-hand slope
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), front);
  await page.getByTestId('grow-from-2').click();
  await expect(page.getByTestId('edgebar')).toBeVisible();
  await page.getByTestId('grow-go').click();
  d = await design(page);
  const roof = d.order[2];
  const off = d.panels[front].sketch.inserts[0].off;
  expect(d.panels[roof].w).toBeCloseTo(Math.hypot(60, off), 0);
  const c = Object.values(d.connections).find((x: any) => x.grown && x.b.panelId === roof) as any;
  expect(c.a.edge).toBe('e2');
  expect(c.broken).toBe(false);
  expect(errors).toEqual([]);
});
