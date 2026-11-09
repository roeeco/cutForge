// Interaction refinements (milestones 15–20).
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const state = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState())));
const design = async (page: Page) => (await state(page)).design;
const panelPt = (page: Page, id: string, x: number, y: number) => S<{ x: number; y: number }>(page, ([i, a, b]: [string, number, number]) => (window as any).__cutforge.project(i, a, b), [id, x, y]);

async function start(page: Page, mat: string) {
  await page.goto('/');
  await page.getByTestId(`mat-${mat}`).click();
  await page.getByTestId('start-go').click();
  await page.getByTestId('hints-dismiss').click();
}

/** Drag from a to b in a few steps. */
async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

test('milestone 15: push-pull wins at the edge midpoints, the grow pill keeps out of the gap', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, 'ply-3');
  const wall = await S<string>(page, () => {
    const cf = (window as any).__cutforge;
    let w = '';
    cf.store.getState().apply((d: any) => {
      const b = cf.ops.addRootPanel(d, -60, 40, 120, 80);
      w = cf.ops.growPanel(d, b, 'e0', { height: 60, angle: 90, dir: 'up', kind: 'finger' }).panelId;
    });
    return w;
  });
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), wall);
  await page.getByTestId('fit-view').click();
  await page.waitForTimeout(300);
  let d = await design(page);
  const W0 = d.panels[wall].w, H0 = d.panels[wall].h;

  // hovering along the right and top edges shows the pill, never inside the midpoint gap
  for (const [edge, pts] of [
    ['e1', [0.1, 0.3, 0.45, 0.5, 0.55, 0.7, 0.9].map((k) => [W0, H0 * k])],
    ['e2', [0.1, 0.3, 0.45, 0.5, 0.55, 0.7, 0.9].map((k) => [W0 * k, H0])],
  ] as const) {
    for (const [x, y] of pts) {
      const p = await panelPt(page, wall, x, y);
      await page.mouse.move(p.x, p.y, { steps: 2 });
      await page.waitForTimeout(60);
      const pill = page.getByTestId('grow-pill');
      if (await pill.count()) {
        const s = Number(await pill.getAttribute('data-s'));
        const gap = Number(await pill.getAttribute('data-gap'));
        const L = Number(await pill.getAttribute('data-len'));
        expect(Math.abs(s - L / 2), `${edge} at ${x},${y}`).toBeGreaterThanOrEqual(gap - 0.2);
      }
    }
    // the pill does show away from the middle
    const away = edge === 'e1' ? await panelPt(page, wall, W0, H0 * 0.15) : await panelPt(page, wall, W0 * 0.15, H0);
    await page.mouse.move(away.x, away.y, { steps: 2 });
    await expect(page.getByTestId('grow-pill')).toBeVisible();
  }

  // drag the width arrow from the right edge's midpoint: a resize, not a grow
  const wMid = await panelPt(page, wall, W0, H0 / 2);
  const wTo = await panelPt(page, wall, W0 + 30, H0 / 2);
  await page.mouse.move(wMid.x, wMid.y, { steps: 2 });
  await drag(page, wMid, wTo);
  let st = await state(page);
  expect(st.selection).toEqual({ kind: 'panel', id: wall });
  expect(st.design.panels[wall].w).toBeGreaterThan(W0 + 10);
  // and the height arrow from the top edge's midpoint
  d = st.design;
  const W1 = d.panels[wall].w;
  const hMid = await panelPt(page, wall, W1 / 2, H0);
  const hTo = await panelPt(page, wall, W1 / 2, H0 + 25);
  await drag(page, hMid, hTo);
  st = await state(page);
  expect(st.selection).toEqual({ kind: 'panel', id: wall });
  expect(st.design.panels[wall].h).toBeGreaterThan(H0 + 10);
  expect(Object.keys(st.design.panels)).toHaveLength(2);
  expect(errors).toEqual([]);
});

for (const [mat, folds] of [
  ['card-0.5', true],
  ['corr-1.6', true],
  ['ply-3', false],
] as const) {
  test(`milestone 15: the fold slider is on the stage only when there is a fold (${mat} tray)`, async ({ page }) => {
    await start(page, mat);
    await S(page, () => {
      const cf = (window as any).__cutforge;
      cf.store.getState().apply((d: any) => {
        const b = cf.ops.addRootPanel(d, -50, 40, 100, 80);
        cf.ops.addTray(d, b, 40);
      });
    });
    const bar = page.locator('.fold-bar [data-testid=fold-slider]');
    if (folds) {
      await expect(bar).toBeVisible();
      await page.getByTestId('fold-play').click();
      await expect.poll(async () => (await state(page)).foldT).toBe(0);
      await page.getByTestId('fold-play').click();
      await expect.poll(async () => (await state(page)).foldT).toBe(1);
    } else await expect(page.getByTestId('fold-slider')).toHaveCount(0);
    // nowhere else: not in the view settings, not in a panel's card
    const base = (await design(page)).order[0];
    await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), base);
    await expect(page.locator('[data-testid=inspector-panel] [data-testid=fold-slider]')).toHaveCount(0);
    await page.getByTestId('open-view-settings').click();
    await expect(page.getByTestId('view-settings')).toBeVisible();
    await expect(page.locator('[data-testid=view-settings] [data-testid=fold-slider]')).toHaveCount(0);
    await expect(page.getByTestId('fold-slider')).toHaveCount(folds ? 1 : 0);
  });
}
