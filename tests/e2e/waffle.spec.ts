// Waffle mode (WAFFLE_MODE.md, milestone 54): start a waffle sculpture, add a
// box and a cylinder hole, group them, go to stage 2, export SVG, and check the
// number of parts in the file.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const shapes = (page: Page) => S<{ id: string; kind: string; hole?: boolean }[]>(page, () => Object.values((window as any).__cutforge.store.getState().design.sculpt?.shapes ?? {}).map((s: any) => ({ id: s.id, kind: s.kind, hole: s.hole })));

/** Drag a footprint on the stage, from and to points given relative to the canvas centre. */
async function drag(page: Page, a: [number, number], b: [number, number]) {
  const c = (await page.getByTestId('sculpt-view').locator('canvas').boundingBox())!;
  const cx = c.x + c.width / 2, cy = c.y + c.height / 2;
  await page.mouse.move(cx + a[0], cy + a[1]);
  await page.mouse.down();
  await page.mouse.move(cx + b[0], cy + b[1], { steps: 10 });
  await page.mouse.up();
}

/** Parts in an SVG: cut paths whose box no other cut path's box contains (holes and slots sit inside their part). */
function partsInSvg(svg: string): number {
  const cut = svg.split('<g id="CUT')[1]?.split('</g>')[0] ?? '';
  const boxes = [...cut.matchAll(/<path d="([^"]+)"/g)].map((m) => {
    const nums = [...m[1].matchAll(/([ML])\s*(-?[\d.]+) (-?[\d.]+)|A[\d.]+ [\d.]+ 0 [01] [01] (-?[\d.]+) (-?[\d.]+)/g)].map((x) => (x[1] ? [Number(x[2]), Number(x[3])] : [Number(x[4]), Number(x[5])]));
    const xs = nums.map((p) => p[0]), ys = nums.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  });
  const inside = (a: (typeof boxes)[0], b: (typeof boxes)[0]) => a !== b && a.x0 >= b.x0 - 1e-6 && a.x1 <= b.x1 + 1e-6 && a.y0 >= b.y0 - 1e-6 && a.y1 <= b.y1 + 1e-6;
  return boxes.filter((a) => !boxes.some((b) => inside(a, b))).length;
}

test('waffle sculpture: a box with a cylinder hole, grouped, sliced and exported', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('tpl-waffle').click();
  await page.getByTestId('start-go').click();
  await expect(page.getByTestId('stage-stepper')).toBeVisible();
  await expect(page.getByTestId('sculpt-loading')).toBeHidden({ timeout: 20_000 });

  // a box: the Shapes tool, click its tile (milestone 55: placed at once), then type its size
  await page.keyboard.press('s');
  await page.getByTestId('shape-tile-box').click();
  await expect(page.getByTestId('shape-card')).toBeVisible();
  for (const [f, v] of [['shape-w', '120'], ['shape-d', '120'], ['shape-h', '50']] as const) {
    await page.getByTestId(f).fill(v);
    await page.getByTestId(f).press('Enter');
  }
  expect((await shapes(page)).map((s) => s.kind)).toEqual(['box']);
  expect(await S(page, () => Object.values((window as any).__cutforge.store.getState().design.sculpt.shapes).map((s: any) => s.size)[0])).toEqual([120, 50, 120]);

  // a cylinder hole in its middle, taller than the box: dragged from its tile onto the stage
  await page.keyboard.press('s');
  await page.getByTestId('next-hole').click();
  const tile = (await page.getByTestId('shape-tile-cylinder').boundingBox())!;
  const c = (await page.getByTestId('sculpt-view').locator('canvas').boundingBox())!;
  await page.mouse.move(tile.x + tile.width / 2, tile.y + tile.height / 2);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2 + 40, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId('shape-card')).toBeVisible();
  for (const [f, v] of [['shape-w', '50'], ['shape-d', '50'], ['shape-h', '80']] as const) {
    await page.getByTestId(f).fill(v);
    await page.getByTestId(f).press('Enter');
  }
  const made = await shapes(page);
  expect(made.map((s) => [s.kind, !!s.hole])).toEqual([
    ['box', false],
    ['cylinder', true],
  ]);
  // until it is grouped the hole cuts nothing, and the check says so
  await page.getByTestId('stage-waffle').click();
  await expect(page.getByTestId('waffle-issue').first()).toContainText(/hole/i);
  await page.getByTestId('stage-shape').click();

  // both selected, then Ctrl+G
  await S(page, (ids: string[]) => (window as any).__cutforge.store.getState().select({ kind: 'shape', id: ids[1], ids }), made.map((s) => s.id));
  await expect(page.getByTestId('shapes-multi')).toBeVisible();
  await page.keyboard.press('Control+g');
  expect((await shapes(page)).filter((s) => s.kind === 'group').length).toBe(1);

  // stage 2: slices with slots; nothing to fix
  await page.getByTestId('stage-waffle').click();
  await expect(page.getByTestId('waffle-card')).toBeVisible();
  await expect(page.getByTestId('waffle-ok')).toBeVisible();
  const expected = await page.evaluate(async () => {
    const m = await import('/src/waffle/pieces.ts' as string);
    return m.wafflePieces((window as any).__cutforge.store.getState().design).length;
  });
  expect(expected).toBeGreaterThanOrEqual(6);

  // the steps view walks through every slice
  await page.getByTestId('steps-open').click();
  await expect(page.getByTestId('steps-count')).toContainText(`1`);
  await page.getByTestId('steps-next').click();
  await page.getByTestId('steps-close').click();

  // export SVG and count the parts in the file
  await page.getByTestId('open-export').click();
  await page.getByTestId('fmt-svg').check();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-go').click()]);
  const svg = readFileSync((await dl.path())!, 'utf8');
  expect(svg).toContain('ENGRAVE');
  expect(partsInSvg(svg)).toBe(expected);

  // the design reopens from its autosave as the same waffle
  await page.reload();
  await expect(page.getByTestId('stage-stepper')).toBeVisible();
  expect((await shapes(page)).filter((s) => s.kind === 'group').length).toBe(1);
  expect(errors).toEqual([]);
});
