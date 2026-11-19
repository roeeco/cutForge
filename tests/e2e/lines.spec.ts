// Milestone 84 (LIDS_LINES_PROJECTS_PLAN.md §6): the Shapes tool's Line footprint draws a line of a type on a board.
import { test, expect, type Page } from '@playwright/test';
import { openShapes } from './util';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;

test('a perforation drawn with Line across a board: three points and Enter; its card changes its type and deletes it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('mat-card-0.5').click();
  await page.getByTestId('start-go').click();
  const id = await S<string>(page, () => {
    const cf = (window as any).__cutforge;
    let id = '';
    cf.store.getState().apply((d: any) => void (id = cf.ops.addRootPanel(d, -60, 40, 120, 80)));
    cf.store.getState().select(null);
    cf.setCamera([0, 400, 1], [0, 0, 0]);
    return id;
  });
  await page.waitForTimeout(300);
  await openShapes(page);
  await page.getByTestId('foot-line').click();
  await page.getByTestId('line-perf').click();
  for (const [x, y] of [[10, 40], [60, 60], [110, 40]]) {
    const q = await S<{ x: number; y: number }>(page, (a: any) => (window as any).__cutforge.projectFace(a.id, a.x, a.y, 1), { id, x, y });
    await page.mouse.click(q.x, q.y);
  }
  await page.screenshot({ path: test.info().outputPath('drawing.png') });
  await page.keyboard.press('Enter');
  const lines = await S<any[]>(page, (pid: string) => (window as any).__cutforge.store.getState().design.panels[pid].lines, id);
  expect(lines).toHaveLength(1);
  expect(lines[0].type).toBe('perf');
  expect(lines[0].pts).toHaveLength(3);
  await expect(page.getByTestId('lines-section')).toBeVisible();
  await page.getByTestId('line-type-0').selectOption('crease');
  expect((await S<any[]>(page, (pid: string) => (window as any).__cutforge.store.getState().design.panels[pid].lines, id))[0].type).toBe('crease');
  await page.getByTestId('line-delete-0').click();
  await expect(page.getByTestId('lines-section')).toHaveCount(0);
  expect(errors).toEqual([]);
});
