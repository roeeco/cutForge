// Milestone 12: through-cuts drawn on the stage, with the live "Cuts N panels" preview.
import { shapeTool, opPick } from './util';
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));
const state = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState())));
const panelPt = (page: Page, id: string, x: number, y: number, top = true) => S<{ x: number; y: number }>(page, ([i, a, b, tp]: [string, number, number, boolean]) => (window as any).__cutforge.project(i, a, b, tp), [id, x, y, top]);

async function start(page: Page) {
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('start-go').click();
  await page.getByTestId('tour-nudge-dismiss').click();
}

test('a through-cut chamfer: live count while drawing, every panel updates, linked selection', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  const walls = await S<string[]>(page, () => {
    const cf = (window as any).__cutforge;
    let ws: string[] = [];
    cf.store.getState().apply((d: any) => {
      const b = cf.ops.addRootPanel(d, -60, 40, 120, 80);
      ws = [0, 1, 2, 3].map((e: number) => cf.ops.growPanel(d, b, e, { height: 50, angle: 90, dir: 'up', kind: 'finger' }).panelId);
    });
    return ws;
  });
  const [front, , back, left] = walls;
  await page.getByTestId('fit-view').click();
  await page.waitForTimeout(300);

  // Cut + Cut through, then a rectangle over the front wall's top-left corner
  await opPick(page, 'cut');
  await expect(page.getByTestId('op-through')).toBeVisible();
  await page.getByTestId('op-through').click();
  await expect(page.getByTestId('op-through')).toBeChecked();
  await shapeTool(page, 'rect');
  const a = await panelPt(page, front, 12, 38, false), b = await panelPt(page, front, -6, 56, false);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  // before letting go: the panels it will cut are counted
  await expect(page.getByTestId('through-count')).toContainText('Cuts 2 panels');
  await page.mouse.up();
  let d = await design(page);
  const cut = d.panels[front].details[0];
  expect(cut.through).toBe(true);
  // the shape card says so too
  await expect(page.getByTestId('detail-through')).toBeChecked();
  await expect(page.getByTestId('detail-through-count')).toHaveText('Cuts 2 panels');

  // the op row: Engrave hides the through toggle
  await opPick(page, 'engrave');
  await expect(page.getByTestId('op-through')).toHaveCount(0);
  // ✓ keeps the cut and goes back to Select (milestone 30)
  await page.getByTestId('ghost-ok').click();

  // linked selection: clicking where it cut the back wall selects the source shape
  await S(page, () => (window as any).__cutforge.store.getState().select(null));
  // under load the camera may still be settling: project the point again and retry the click until it lands
  await expect(async () => {
    const onBack = await panelPt(page, back, 120 - 5, 47, false);
    await page.mouse.click(onBack.x, onBack.y);
    const sel = (await state(page)).selection;
    expect(sel?.kind === 'detail' ? sel.id : null).toBe(cut.id);
  }).toPass({ timeout: 10_000 });

  // switching it off restores the other panels
  await page.getByTestId('detail-through').uncheck();
  d = await design(page);
  expect(d.panels[front].details[0].through).toBeUndefined();
  await expect(page.getByTestId('through-count')).toHaveCount(0);
  expect(left).toBeTruthy();
  expect(errors).toEqual([]);
});

test('a through-hole in a base shows that it will slot the divider before commit', async ({ page }) => {
  await start(page);
  const [base, div] = await S<string[]>(page, () => {
    const cf = (window as any).__cutforge;
    let out: string[] = [];
    cf.store.getState().apply((d: any) => {
      const b = cf.ops.addRootPanel(d, -60, 40, 120, 80);
      // no front wall and a low divider, so the base under it can be seen from the default camera
      for (const e of [1, 2, 3]) cf.ops.growPanel(d, b, e, { height: 50, angle: 90, dir: 'up', kind: 'finger' });
      out = [b, cf.ops.addDivider(d, b, 3, 60, 12)];
    });
    return out;
  });
  await page.getByTestId('fit-view').click();
  await page.waitForTimeout(300);
  await opPick(page, 'cut');
  await page.getByTestId('op-through').click();
  await shapeTool(page, 'circle');
  // a circle across the divider (parallel to the left edge, 60 mm in)
  const a = await panelPt(page, base, 54, 20), b = await panelPt(page, base, 66, 32);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  expect((await design(page)).panels[base].details).toHaveLength(1);
  await expect(page.getByTestId('through-count')).toContainText('Cuts 1 panels');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  const d = await design(page);
  expect(d.panels[base].details).toHaveLength(0);
  expect(div).toBeTruthy();
});
