// The brief's end-to-end flow (POLYGONS_AND_CUTS.md §14): draw a polygon base,
// extrude it, push-pull the height, cut through a corner, check the warnings
// and the export check, then save, reload and get the same SVG.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));
const floorPt = (page: Page, x: number, z: number) => S<{ x: number; y: number }>(page, ([a, b]: number[]) => (window as any).__cutforge.projectWorld(a, 0, b), [x, z]);
const panelPt = (page: Page, id: string, x: number, y: number, top = true) => S<{ x: number; y: number }>(page, ([i, a, b, tp]: [string, number, number, boolean]) => (window as any).__cutforge.project(i, a, b, tp), [id, x, y, top]);

async function downloadSvg(page: Page, dir: string, name: string): Promise<string> {
  await page.getByTestId('open-export').click();
  await page.getByTestId('fmt-svg').check();
  const dl = page.waitForEvent('download');
  await page.getByTestId('export-go').click();
  const path = join(dir, name);
  await (await dl).saveAs(path);
  return readFileSync(path, 'utf8');
}

test('polygon base → extrude → push-pull → cut through a corner → warnings → save, reload, same SVG', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('start-go').click();
  await page.getByTestId('hints-dismiss').click();

  // a polygon base: a typed 120 mm segment, a Shift-locked vertical one, an apex, back to the start
  await page.keyboard.press('g');
  const p0 = await floorPt(page, -60, 40);
  await page.mouse.click(p0.x, p0.y);
  const toward = await floorPt(page, 0, 40);
  await page.mouse.move(toward.x, toward.y, { steps: 3 });
  await page.keyboard.type('120');
  await expect(page.getByTestId('poly-label')).toContainText('120');
  await page.keyboard.press('Enter');
  const near = await floorPt(page, 62, -38);
  await page.keyboard.down('Shift');
  await page.mouse.move(near.x, near.y, { steps: 3 });
  await page.mouse.click(near.x, near.y);
  await page.keyboard.up('Shift');
  for (const [x, z] of [[0, -75], [-60, -38]]) {
    const p = await floorPt(page, x, z);
    await page.mouse.click(p.x, p.y);
  }
  await page.mouse.click(p0.x, p0.y);
  // the closed polygon is a ghost until ✓ (milestone 30)
  await page.getByTestId('ghost-ok').click();
  let d = await design(page);
  const base = d.order[0];
  const pts = d.panels[base].sketch.pts as { x: number; y: number }[];
  expect(pts).toHaveLength(5);
  // the typed segment is exactly 120 mm; the Shift segment is exactly at a 15° step (here 90°)
  expect(Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)).toBeCloseTo(120, 6);
  expect(pts[2].x).toBeCloseTo(pts[1].x, 6);

  // extrude
  await page.getByTestId('extrude').click();
  await page.getByTestId('extrude-go').click();
  d = await design(page);
  const tray = Object.keys(d.trays)[0];
  const walls: string[] = d.order.filter((id: string) => id.startsWith(tray + '/'));
  expect(walls).toHaveLength(5);
  await page.getByTestId('fit-view').click();
  await page.waitForTimeout(300);

  // push-pull the front wall's height arrow up: the whole tray follows
  const front = walls[0];
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), front);
  await page.waitForTimeout(200);
  const W = d.panels[front];
  const top = await panelPt(page, front, W.w / 2, W.h);
  const arrow = { x: top.x, y: top.y - 12 };
  await page.mouse.move(arrow.x, arrow.y);
  await page.mouse.down();
  await page.mouse.move(arrow.x, arrow.y - 25, { steps: 5 });
  await page.mouse.move(arrow.x, arrow.y - 50, { steps: 5 });
  await page.mouse.up();
  d = await design(page);
  expect(d.trays[tray].height).toBeGreaterThan(45);
  const hs = walls.map((w) => d.panels[w].h);
  expect(new Set(hs).size).toBe(1);

  // cut through the front wall's top-left corner
  await page.getByTestId('op-cut').click();
  await page.getByTestId('op-through').click();
  await page.getByTestId('tool-rect').click();
  const H = d.panels[front].h;
  const a = await panelPt(page, front, 14, H - 14, false), b = await panelPt(page, front, -6, H + 6, false);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await expect(page.getByTestId('through-count')).toBeVisible();
  await page.mouse.up();
  d = await design(page);
  expect(d.panels[front].details[0].through).toBe(true);

  // ✓ makes the cut and goes back to Select (milestone 30)
  await page.getByTestId('ghost-ok').click();
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
  // the export check names the approximated bevel on the edge-on wall
  await page.getByTestId('open-export').click();
  await expect(page.getByTestId('export-issues')).toContainText('at an angle');
  await page.getByTestId('export-cancel').click();

  // save (autosave), reload: the same design and the same SVG
  const dir = mkdtempSync(join(tmpdir(), 'cutforge-flow-'));
  const before = await downloadSvg(page, dir, 'before.svg');
  await expect(page.getByTestId('save-state')).toHaveAttribute('class', /\bsaved\b/);
  await page.reload();
  await expect.poll(async () => (await design(page)).order.length).toBe(d.order.length);
  const after = await downloadSvg(page, dir, 'after.svg');
  if (after !== before) {
    const a = before.split('\n'), b = after.split('\n');
    a.forEach((l, i) => l !== b[i] && console.log('DIFF', i, '\n  -', l.slice(0, 400), '\n  +', (b[i] ?? '').slice(0, 400)));
  }
  expect(after).toBe(before);
  expect(errors).toEqual([]);
});
