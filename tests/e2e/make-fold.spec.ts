// Milestone 126 (Shapes R7): Fold it, in one click. A house from shapes (an extruded
// gable end), one click on *Fold it*, and the export: as many pieces in the SVG as the
// design cuts, the made model on the Workshop's 3D stage, no problems.
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;

/** Outer cut outlines in an SVG: cut paths whose box no other cut path's box contains. */
function partsInSvg(svg: string): number {
  const cut = svg.split('<g id="CUT')[1]?.split('</g>')[0] ?? '';
  const boxes = [...cut.matchAll(/<path d="([^"]+)"/g)].map((m) => {
    const nums = [...m[1].matchAll(/(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g)].map((x) => [Number(x[1]), Number(x[2])]);
    const xs = nums.map((p) => p[0]), ys = nums.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), area: (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) };
  }).filter((b) => b.area > 1);
  const inside = (a: (typeof boxes)[0], b: (typeof boxes)[0]) => a !== b && a.x0 >= b.x0 - 1e-6 && a.x1 <= b.x1 + 1e-6 && a.y0 >= b.y0 - 1e-6 && a.y1 <= b.y1 + 1e-6;
  return boxes.filter((a) => !boxes.some((b) => inside(a, b))).length;
}

test('a house from shapes, Fold it, one click: it exports as card with no problems', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('mat-card-0.5').click();
  await page.getByTestId('tpl-shapes').click();
  await expect(page.getByTestId('sculpt-loading')).toBeHidden({ timeout: 20_000 });
  // a house: its gable end drawn on an upright plane and pulled out 60 mm
  await S(page, async () => {
    const { sketchShape } = await import('/src/sculpt/sketch.ts' as string);
    const { addShape } = await import('/src/sculpt/ops.ts' as string);
    const st = (window as any).__cutforge.store.getState();
    st.apply((d: any) => addShape(d, sketchShape({ kind: 'upright', o: [-40, 0, 30], ang: 0 }, [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 50 }, { x: 40, y: 80 }, { x: 0, y: 50 }], 'extrude', 60)));
  });
  await expect(page.getByTestId('make-fold')).toBeEnabled({ timeout: 10_000 });
  await page.getByTestId('make-fold').click();
  await expect(page.getByTestId('make-card')).toBeVisible({ timeout: 20_000 });
  const d = await S<{ outcome: string; panels: number; folds: number }>(page, () => {
    const d = (window as any).__cutforge.store.getState().design;
    return { outcome: d.outcome, panels: d.order.length, folds: Object.values(d.connections).filter((c: any) => c.seam && c.kind === 'fold').length };
  });
  expect(d.outcome).toBe('fold');
  expect(d.panels).toBe(7);
  expect(d.folds).toBeGreaterThanOrEqual(5);
  await expect(page.getByTestId('make-problem')).toHaveCount(0);
  // the made model is on the Workshop's 3D stage, and the export cuts as many pieces as the net has
  const pieces = 7 - d.folds;
  const svg = await S<string>(page, () => (window as any).__cutforge.svg());
  expect(partsInSvg(svg)).toBe(pieces);
  // back to the shape: nothing lost
  await page.getByTestId('stage-shape').click();
  await expect(page.getByTestId('sculpt-view')).toBeVisible();
  expect(await S<number>(page, () => (window as any).__cutforge.store.getState().design.order.length)).toBe(7);
  expect(errors).toEqual([]);
});
