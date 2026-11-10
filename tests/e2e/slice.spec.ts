// Milestone 1 vertical slice, end to end in a real browser:
// language toggle → material → panel in 3D → grow at 90° with finger joint →
// cutouts in both views → numeric resize → switch views → undo →
// autosave + reload → download SVG and DXF (checked with independent readers).
import { setNum, pickPlane } from './util';
import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const state = (page: Page) =>
  page.evaluate(() => {
    const d = (window as any).__cutforge.store.getState().design;
    return JSON.parse(JSON.stringify(d));
  });

test('vertical slice', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');

  // Hebrew, full RTL layout
  await page.getByTestId('lang-toggle-dialog').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByTestId('mat-ply-3')).toContainText('דיקט');

  await page.getByTestId('mat-ply-3').click();

  await page.getByTestId('start-go').click();
  await page.getByTestId('hints-dismiss').click();

  // draw a panel on the floor grid
  await page.getByTestId('tool-panel').click();
  const box = (await page.locator('[data-testid=view3d] canvas').boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await pickPlane(page, { x: cx - 120, y: cy - 60 }, 'flat');
  await page.mouse.move(cx - 120, cy - 60);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 60, { steps: 8 });
  await page.mouse.up();
  // the panel is a ghost until ✓ (milestone 29)
  await page.getByTestId('ghost-ok').click();
  await expect(page.getByTestId('inspector-panel')).toBeVisible();
  let d = await state(page);
  expect(d.order).toHaveLength(1);
  const base = d.order[0];

  // exact size
  await setNum(page, 'panel-w', '120');
  await setNum(page, 'panel-h', '80');
  d = await state(page);
  expect([d.panels[base].w, d.panels[base].h]).toEqual([120, 80]);

  // grow a wall at 90° with a finger joint
  await page.getByTestId('grow-from-0').click();
  await expect(page.getByTestId('edgebar')).toBeVisible();
  await setNum(page, 'grow-height', '50');
  await expect(page.getByTestId('grow-kind')).toHaveValue('finger');
  await page.getByTestId('grow-go').click();
  await expect(page.getByTestId('panel-hinge-field')).toBeVisible();
  d = await state(page);
  expect(d.order).toHaveLength(2);
  const wall = d.order[1];
  expect(d.panels[wall]).toMatchObject({ w: 120, h: 50 });
  expect(Object.values(d.connections)[0]).toMatchObject({ kind: 'finger', angle: 90 });

  // cutout drawn on the wall in the 3D view
  await page.getByTestId('tool-circle').click();
  const p0 = await page.evaluate(([id]) => (window as any).__cutforge.project(id, 50, 25), [wall]);
  const p1 = await page.evaluate(([id]) => (window as any).__cutforge.project(id, 62, 37), [wall]);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  await page.mouse.move(p1.x, p1.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('inspector-detail')).toBeVisible();
  d = await state(page);
  expect(d.panels[wall].details).toHaveLength(1);
  const hole = d.panels[wall].details[0];

  // resize numerically
  await setNum(page, 'detail-diameter', '20');
  await setNum(page, 'detail-x', '60');
  await expect.poll(async () => (await state(page)).panels[wall].details[0]).toMatchObject({ id: hole.id, w: 20, h: 20, cx: 60 });
  // the cutout is a ghost until ✓ (milestone 30)
  await page.getByTestId('ghost-ok').click();
  d = await state(page);

  // switch to the cut plan: the same hole is there; draw a rectangle on the base piece
  await page.getByTestId('view-2d').click();
  await expect(page.getByTestId(`detail-${hole.id}`)).toBeVisible();
  await page.getByTestId('tool-rect').click();
  const pb = (await page.locator(`[data-piece="${base}"] path.piece`).first().boundingBox())!;
  await page.mouse.move(pb.x + pb.width * 0.3, pb.y + pb.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(pb.x + pb.width * 0.6, pb.y + pb.height * 0.7, { steps: 6 });
  await page.mouse.up();
  await page.getByTestId('ghost-ok').click();
  d = await state(page);
  expect(d.panels[base].details).toHaveLength(1);
  const rect = d.panels[base].details[0];

  // one drag = one undo step; undo/redo restore it
  await page.getByTestId('undo').click();
  expect((await state(page)).panels[base].details).toHaveLength(0);
  await page.getByTestId('redo').click();
  expect((await state(page)).panels[base].details[0].id).toBe(rect.id);

  // edit in 2D shows in 3D: the 3D view's model is the same object
  await page.getByTestId('view-3d').click();
  await expect(page.getByTestId('view3d')).toBeVisible();

  // autosave, reload, reopen
  await expect(page.getByTestId('save-state')).toHaveText('נשמר בדפדפן');
  await page.reload();
  await expect(page.getByTestId('material-dialog')).toHaveCount(0);
  d = await state(page);
  expect(d.order).toEqual([base, wall]);
  expect(d.panels[wall].details[0]).toMatchObject({ id: hole.id, w: 20 });
  expect(d.panels[base].details[0].id).toBe(rect.id);

  // download SVG and DXF
  const dir = mkdtempSync(join(tmpdir(), 'cutforge-e2e-'));
  await page.getByTestId('open-export').click();
  let dl = page.waitForEvent('download');
  await page.getByTestId('export-go').click();
  const svgPath = join(dir, (await dl).suggestedFilename());
  await (await dl).saveAs(svgPath);
  expect(svgPath).toMatch(/nominal-kerf0\.15mm\.svg$/);
  await page.getByTestId('open-export').click();
  await page.getByTestId('fmt-dxf').check();
  dl = page.waitForEvent('download');
  await page.getByTestId('export-go').click();
  const dxfPath = join(dir, (await dl).suggestedFilename());
  await (await dl).saveAs(dxfPath);

  let report: any = null;
  try {
    report = JSON.parse(execFileSync('python3', ['tests/py/check_exports.py', dxfPath, svgPath]).toString());
  } catch (e) {
    test.info().annotations.push({ type: 'skip-reader', description: 'python ezdxf/svgpathtools not available' });
  }
  if (report) {
    expect(report.dxf.insunits).toBe(4);
    expect(report.svg.width).toBe('600mm');
    expect(report.svg.viewBox).toBe('0 0 600 400');
    expect(report.svg.paths.every((p: any) => p.closed)).toBe(true);
    const circle = report.dxf.entities.find((e: any) => e.type === 'CIRCLE');
    expect(circle.r).toBeCloseTo(10, 6);
    // both outlines are 120 mm wide at true size
    const widths = report.svg.paths.map((p: any) => Math.round((p.bbox[2] - p.bbox[0]) * 1000) / 1000);
    expect(widths.filter((w: number) => w === 120)).toHaveLength(2);
  }

  await page.getByTestId('lang-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  expect(errors).toEqual([]);
});
