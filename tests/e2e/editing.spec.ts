// Milestone 3: solo view, smart snapping with guides, multiple selection,
// align/distribute, group move/duplicate/delete/resize, arrays, keyboard.
import { setNum, drawBoard, shapeTool } from './util';
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));
const state = (page: Page) => S(page, () => { const s = (window as any).__cutforge.store.getState(); return { past: s.past.length, sel: s.selection, view: s.view }; });

/** Screen point of panel-local (x, y) in the solo view. */
const soloPt = (page: Page, x: number, y: number) =>
  S(page, ([x, y]: number[]) => {
    const svg = document.querySelector('[data-testid=solo] svg') as SVGSVGElement;
    const st = (window as any).__cutforge.store.getState();
    const H = st.design.panels[st.soloPanel].h;
    const pt = svg.createSVGPoint();
    pt.x = x;
    pt.y = H - y;
    const r = pt.matrixTransform(svg.getScreenCTM()!);
    return { x: r.x, y: r.y };
  }, [x, y]);

async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }, opts: { during?: () => Promise<void>; mods?: string[] } = {}) {
  for (const m of opts.mods ?? []) await page.keyboard.down(m);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  if (opts.during) await opts.during();
  await page.mouse.up();
  for (const m of opts.mods ?? []) await page.keyboard.up(m);
}

test('editing tools in the solo view and 3D', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('start-go').click();
  await page.getByTestId('hints-dismiss').click();
  const box = (await page.locator('[data-testid=view3d] canvas').boundingBox())!;
  await drawBoard(page, { x: box.x + box.width / 2 - 120, y: box.y + box.height / 2 - 50 }, { x: box.x + box.width / 2 + 120, y: box.y + box.height / 2 + 50 });
  await setNum(page, 'panel-w', '200');
  await setNum(page, 'panel-h', '120');
  const base = (await design(page)).order[0];
  await page.getByTestId('fit-view').click();
  await page.waitForTimeout(300);
  const cam = await S(page, () => (window as any).__cutforge.camera());

  // double-click the panel in 3D opens the face-on solo view
  const c = await S(page, ([id]: string[]) => (window as any).__cutforge.project(id, 100, 60), [base]);
  await page.mouse.dblclick(c.x, c.y);
  await expect(page.getByTestId('solo')).toBeVisible();

  // draw a rectangle, then a second one whose bottom lands 1 px off the first's: snapping aligns it
  await shapeTool(page, 'rect');
  await drag(page, await soloPt(page, 20, 20), await soloPt(page, 50, 40));
  // each shape is a ghost until ✓, then the tool goes back to Select (milestone 30)
  await page.getByTestId('ghost-ok').click();
  await shapeTool(page, 'rect');
  let d = await design(page);
  expect(d.panels[base].details).toHaveLength(1);
  const r1 = d.panels[base].details[0];
  expect([r1.cx, r1.cy, r1.w, r1.h]).toEqual([35, 30, 30, 20]);
  const a = await soloPt(page, 80, 20);
  const b = await soloPt(page, 105, 40.3); // 0.3 mm off the first shape's top edge
  await drag(page, { x: a.x, y: a.y + 1.5 }, b, {
    during: async () => {
      expect(await page.locator('[data-testid=solo] line.guide').count()).toBeGreaterThan(0);
    },
  });
  await page.getByTestId('ghost-ok').click();
  await shapeTool(page, 'rect');
  d = await design(page);
  const r2 = d.panels[base].details[1];
  expect(r2.cy - r2.h / 2).toBeCloseTo(20, 9);
  expect(r2.cy + r2.h / 2).toBeCloseTo(40, 9);
  await drag(page, await soloPt(page, 140, 60), await soloPt(page, 160, 85));
  await page.getByTestId('ghost-ok').click();
  d = await design(page);
  expect(d.panels[base].details).toHaveLength(3);
  const ids = d.panels[base].details.map((x: any) => x.id);

  // box-select all three
  await page.getByTestId('tool-select').click();
  await drag(page, await soloPt(page, 5, 5), await soloPt(page, 195, 115));
  await expect(page.getByTestId('inspector-multi')).toContainText('3 shapes selected');

  // align tops, then equal gaps
  await page.getByTestId('align-top').click();
  d = await design(page);
  const tops = d.panels[base].details.map((x: any) => x.cy + x.h / 2);
  expect(new Set(tops.map((v: number) => v.toFixed(6))).size).toBe(1);
  await page.getByTestId('dist-hgap').click();
  d = await design(page);
  const xs = d.panels[base].details.map((x: any) => [x.cx - x.w / 2, x.cx + x.w / 2]).sort((p: number[], q: number[]) => p[0] - q[0]);
  expect(xs[1][0] - xs[0][1]).toBeCloseTo(xs[2][0] - xs[1][1], 6);

  // group move by dragging one of them = one undo step
  const before = await state(page);
  const d0 = d.panels[base].details[0];
  await drag(page, await soloPt(page, d0.cx, d0.cy), await soloPt(page, d0.cx + 7, d0.cy - 9), { mods: ['Alt'] });
  let after = await state(page);
  expect(after.past).toBe(before.past + 1);
  const moved = await design(page);
  moved.panels[base].details.forEach((x: any, i: number) => {
    expect(x.cx).toBeCloseTo(d.panels[base].details[i].cx + 7, 0);
    expect(x.cy).toBeCloseTo(d.panels[base].details[i].cy - 9, 0);
  });
  await page.getByTestId('undo').click();
  expect((await design(page)).panels[base].details[0].cx).toBeCloseTo(d0.cx, 9);

  // keyboard: arrows nudge the group, Shift = 10 mm; Ctrl+D duplicates; Delete removes
  await page.locator('[data-testid=solo] svg').focus().catch(() => {});
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowUp');
  d = await design(page);
  expect(d.panels[base].details[0].cx).toBeCloseTo(d0.cx + 1, 9);
  expect(d.panels[base].details[0].cy).toBeCloseTo(d0.cy + 10, 9);
  await page.keyboard.press('Control+d');
  expect((await design(page)).panels[base].details).toHaveLength(6);
  await page.keyboard.press('Delete');
  expect((await design(page)).panels[base].details.map((x: any) => x.id)).toEqual(ids);

  // box-select again, then shift-click removes one from the selection
  await drag(page, await soloPt(page, 2, 2), await soloPt(page, 198, 118));
  await expect(page.getByTestId('inspector-multi')).toContainText('3 shapes selected');
  await page.keyboard.down('Shift');
  const s0 = (await design(page)).panels[base].details[2];
  const p0 = await soloPt(page, s0.cx - s0.w / 2 + 1, s0.cy);
  await page.mouse.click(p0.x, p0.y);
  await page.keyboard.up('Shift');
  after = await state(page);
  expect(after.sel.ids).toHaveLength(2);

  // group size: width doubles about the group's left edge
  const g0 = await design(page);
  const two = g0.panels[base].details.filter((x: any) => after.sel.ids.includes(x.id));
  const left = Math.min(...two.map((x: any) => x.cx - x.w / 2));
  const right = Math.max(...two.map((x: any) => x.cx + x.w / 2));
  await setNum(page, 'group-w', String((right - left) * 2));
  await expect
    .poll(async () => {
      const g = await design(page);
      const two1 = g.panels[base].details.filter((x: any) => after.sel.ids.includes(x.id));
      return Math.max(...two1.map((x: any) => x.cx + x.w / 2)) - left;
    })
    .toBeCloseTo((right - left) * 2, 6);
  const g1 = await design(page);

  // live array, then explode
  await page.mouse.click((await soloPt(page, 190, 110)).x, (await soloPt(page, 190, 110)).y);
  const one = g1.panels[base].details[0];
  const op = await soloPt(page, one.cx - one.w / 2 + 1, one.cy);
  await page.mouse.click(op.x, op.y);
  await page.getByTestId('array-grid').click();
  await setNum(page, 'array-nx', '4');
  await expect(page.getByTestId('array-section')).toContainText('8');
  expect((await design(page)).panels[base].details.find((x: any) => x.id === one.id).array).toMatchObject({ nx: 4, ny: 2 });
  await page.getByTestId('array-explode').click();
  expect((await design(page)).panels[base].details).toHaveLength(3 + 7);
  await expect(page.getByTestId('inspector-multi')).toContainText('8 shapes selected');

  // back to 3D: same camera as before
  await page.getByTestId('solo-back').click();
  await expect(page.getByTestId('view3d')).toBeVisible();
  await page.waitForTimeout(300);
  await expect.poll(() => S(page, () => (window as any).__cutforge.camera())).toEqual(cam);

  // shapes on panels that face different ways cannot be aligned, and the reason is shown
  await S(page, ([id]: string[]) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), [base]);
  await page.getByTestId('grow-from-0').click();
  await page.getByTestId('grow-go').click();
  d = await design(page);
  const wall = d.order[1];
  await S(page, ([w]: string[]) => {
    const s = (window as any).__cutforge.store.getState();
    s.apply((x: any) => void x.panels[w].details.push({ id: 'xw', shape: 'circle', op: 'cut', cx: 50, cy: 30, w: 10, h: 10 }));
  }, [wall]);
  await S(page, ([a]: string[]) => (window as any).__cutforge.store.getState().select({ kind: 'detail', id: 'xw', ids: [a, 'xw'] }), [ids[0]]);
  await expect(page.getByTestId('align-unavailable')).toBeVisible();
  await expect(page.getByTestId('align-left')).toBeDisabled();
  expect(errors).toEqual([]);
});
