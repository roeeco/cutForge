// Panels and dividers round (PANELS_AND_DIVIDERS.md): a material for each
// board (milestone 36).
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));

async function start(page: Page, mat: string) {
  await page.goto('/');
  await page.getByTestId(`mat-${mat}`).click();
  await page.getByTestId('start-go').click();
  await page.getByTestId('hints-dismiss').click();
}

/** A plywood box (base and four finger-jointed walls); returns the base and wall ids. */
async function plyBox(page: Page) {
  return S<{ base: string; walls: string[] }>(page, () => {
    const cf = (window as any).__cutforge;
    let out: any;
    cf.store.getState().apply((d: any) => {
      const b = cf.ops.addRootPanel(d, -40, 30, 80, 60);
      const walls = [0, 1, 2, 3].map((e) => cf.ops.growPanel(d, b, e, { height: 40, angle: 90, dir: 'up', kind: 'finger' }).panelId);
      cf.ops.autoConnect(d);
      out = { base: b, walls };
    });
    return out;
  });
}

test('milestone 36: a board switched to another material changes colour and thickness, gets its own sheets and its own file', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, 'ply-3');
  const { walls } = await plyBox(page);
  const w = walls[0];
  const before = await S<any>(page, () => (window as any).__cutforge.stageBoxes());
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), w);
  await expect(page.getByTestId('board-material')).toHaveValue('__same__');
  // corrugated 4 mm: a different look, 4 mm thick
  await page.getByTestId('board-material').selectOption('corr-4');
  await expect(page.getByTestId('board-mat-result')).toBeVisible();
  const d = await design(page);
  expect(d.panels[w].material).toBe('corr-4');
  expect(d.materials['corr-4'].thickness).toBe(4);
  const after = await S<any>(page, () => (window as any).__cutforge.stageBoxes());
  expect(after.colors[w]).not.toBe(before.colors[w]);
  // the wall stands at the base's front edge: its slab is now 4 mm deep (along z) instead of 3
  const depth = (b: number[]) => Math.round((b[5] - b[2]) * 100) / 100;
  expect(depth(before.panels[w])).toBeCloseTo(3, 1);
  expect(depth(after.panels[w])).toBeCloseTo(4, 1);
  // the legend lists both materials
  await expect(page.getByTestId('material-legend')).toBeVisible();
  await expect(page.getByTestId('legend-corr-4')).toContainText('1');
  // the cut plan: a heading per material
  await page.getByTestId('view-2d').click();
  await expect(page.getByTestId('mat-heading-ply-3')).toBeVisible();
  await expect(page.getByTestId('mat-heading-corr-4')).toBeVisible();
  // the export names one file per material
  await page.getByTestId('open-export').click();
  await expect(page.getByTestId('export-per-material')).toContainText('ply-3');
  await expect(page.getByTestId('export-per-material')).toContainText('corr-4');
  const names: string[] = [];
  page.on('download', (dl) => names.push(dl.suggestedFilename()));
  await page.getByTestId('export-go').click();
  await expect.poll(() => names.length).toBe(2);
  expect(names.some((n) => n.includes('-ply-3-'))).toBe(true);
  expect(names.some((n) => n.includes('-corr-4-'))).toBe(true);
  expect(errors).toEqual([]);
});

test('milestone 35: an L base extruded past its flat height is told so, and Lower to … keeps the net in one piece', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, 'card-0.5');
  const b = await S<string>(page, () => {
    const cf = (window as any).__cutforge;
    let id = '';
    cf.store.getState().apply((d: any) => {
      id = cf.ops.addRootPanel(d, -60, 60, 100, 100);
      const L = [ { x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 60 }, { x: 60, y: 60 }, { x: 60, y: 120 }, { x: 0, y: 120 } ];
      d.panels[id].sketch = { kind: 'poly', pts: L, edgeIds: L.map((_: unknown, i: number) => `e${i}`) };
      cf.ops.solve(d);
    });
    cf.store.getState().select({ kind: 'panel', id });
    return id;
  });
  await page.getByTestId('extrude').click();
  // at 40 mm the closing wall folds off its neighbour; the tick shows the flat height
  await expect(page.getByTestId('flat-hinge')).toBeVisible();
  await expect(page.getByTestId('flat-tick')).toBeVisible();
  const fh = Number(await page.getByTestId('flat-tick').getAttribute('data-h'));
  expect(fh).toBeGreaterThan(40);
  expect(fh).toBeLessThan(60);
  // past it: a wall is cut as its own piece
  const f = page.getByTestId('extrude-height');
  await f.click();
  await f.press('ControlOrMeta+a');
  await f.pressSequentially('80');
  await f.press('Enter');
  await expect(page.getByTestId('flat-own')).toContainText(`Above ${fh}`);
  await page.getByTestId('extrude-go').click();
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), b);
  await expect(page.getByTestId('tray-card')).toBeVisible();
  await expect(page.getByTestId('flat-own')).toBeVisible();
  await page.getByTestId('flat-lower').click();
  await expect(page.getByTestId('flat-own')).toHaveCount(0);
  const d = await design(page);
  const tray: any = Object.values(d.trays)[0];
  expect(tray.height).toBe(fh);
  expect(Object.values(tray.fixes ?? {})).not.toContain('own');
  expect(errors).toEqual([]);
});
