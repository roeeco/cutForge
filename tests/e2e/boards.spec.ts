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

/** Screen point of a point on a panel's material-side face. */
const proj = (page: Page, id: string, x: number, y: number) => S<{ x: number; y: number }>(page, (a: any) => (window as any).__cutforge.projectFace(a.id, a.x, a.y, 1), { id, x, y });
async function dragOn(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
  await page.mouse.up();
}

test.describe('milestone 29: the Panel tool on faces', () => {
  test('a flat panel on a wall’s inner face, snapped to the wall’s corner, then ✓', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await start(page, 'ply-3');
    const { walls } = await plyBox(page);
    const back = walls[2];
    // high enough to see the back wall's inner face over the front wall
    await S(page, () => (window as any).__cutforge.setCamera([0, 200, 160], [0, 20, -30]));
    await page.getByTestId('tool-panel').click();
    await dragOn(page, await proj(page, back, 30, 20), await proj(page, back, 0.8, 39.2));
    await expect(page.getByTestId('panel-ghost-bar')).toBeVisible();
    await expect(page.getByTestId('ghost-w')).toContainText('30');
    await page.getByTestId('ghost-ok').click();
    const d = await design(page);
    const p: any = Object.values(d.panels).find((x: any) => x.place);
    expect(p.place).toMatchObject({ host: back, face: 1, x: 0, y: 20, rot: 0, pose: 'flat' });
    expect([p.w, p.h]).toEqual([30, 20]);
    // selected, back to Select, its card says where it is
    await expect(page.getByTestId('panel-kicker')).toContainText('inner face');
    await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
  });

  test('a standing partition drawn wall to wall: both ends on the walls, height typed, ✓; slots in the base and walls', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await start(page, 'ply-3');
    const { base } = await plyBox(page);
    await S(page, () => (window as any).__cutforge.setCamera([0, 260, 120], [0, 0, 0]));
    await page.getByTestId('tool-panel').click();
    // Standing; a line across the box from just inside one side wall to just inside the other (walls stand at x 0–3 and 77–80 of the base)
    await S(page, () => (window as any).__cutforge.store.getState().set({ panelPose: 'standing' }));
    await dragOn(page, await proj(page, base, 3.8, 30), await proj(page, base, 76.2, 30));
    await expect(page.getByTestId('panel-ghost-bar')).toBeVisible();
    await expect(page.getByTestId('ghost-standing')).toHaveAttribute('aria-checked', 'true');
    const g = await S<any>(page, () => (window as any).__cutforge.store.getState().panelGhost);
    // the ends land on the walls' inner faces
    expect(Math.min(g.a.x, g.b.x)).toBeCloseTo(3, 6);
    expect(Math.max(g.a.x, g.b.x)).toBeCloseTo(77, 6);
    await page.getByTestId('ghost-h').click();
    await page.getByTestId('ghost-h-input').fill('25');
    await page.getByTestId('ghost-h-input').press('Enter');
    await page.getByTestId('ghost-ok').click();
    const d = await design(page);
    const p: any = Object.values(d.panels).find((x: any) => x.place);
    expect(p.place.pose).toBe('standing');
    expect(p.h).toBe(25);
    expect(p.w).toBeCloseTo(74, 6);
    const joins = Object.values(d.connections).filter((c: any) => c.a.panelId === p.id || c.b.panelId === p.id) as any[];
    expect(joins.length).toBe(3);
    expect(joins.every((c) => c.kind === 'tabslot' && !c.broken)).toBe(true);
    // the cut plan: slots in the base and both walls
    // its joints put slots in the base and in both side walls
    const slotted = new Set(joins.map((c) => (c.a.panelId === p.id ? c.b.panelId : c.a.panelId)));
    expect(slotted.size).toBe(3);
    for (const c of joins) expect(c.geom.holes.length).toBeGreaterThan(0);
    await page.getByTestId('view-2d').click();
    await expect(page.getByTestId('cutplan')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Esc drops the ghost', async ({ page }) => {
    await start(page, 'ply-3');
    const { base } = await plyBox(page);
    await S(page, () => (window as any).__cutforge.setCamera([0, 260, 120], [0, 0, 0]));
    await page.getByTestId('tool-panel').click();
    await dragOn(page, await proj(page, base, 20, 20), await proj(page, base, 50, 40));
    await expect(page.getByTestId('panel-ghost-bar')).toBeVisible();
    const before = Object.keys((await design(page)).panels).length;
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('panel-ghost-bar')).toHaveCount(0);
    expect(Object.keys((await design(page)).panels).length).toBe(before);
  });
});

test.describe('milestone 30: one floating ✓ for every ghost', () => {
  const past = (page: Page) => S<number>(page, () => (window as any).__cutforge.store.getState().past.length);
  const nShapes = async (page: Page) => Object.values((await design(page)).panels).reduce((n: number, p: any) => n + p.details.length, 0);
  async function setup(page: Page) {
    await start(page, 'ply-3');
    const b = await S<string>(page, () => {
      const cf = (window as any).__cutforge;
      let id = '';
      cf.store.getState().apply((d: any) => void (id = cf.ops.addRootPanel(d, -60, 50, 120, 100)));
      cf.store.getState().select(null);
      return id;
    });
    await S(page, () => (window as any).__cutforge.setCamera([0, 300, 1], [0, 0, 0]));
    return b;
  }

  test('rectangle, circle, rounded rectangle and text: ✓ is one undo step and back to Select; ✕, Esc and another tool drop it', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const b = await setup(page);
    // ✓
    const p0 = await past(page);
    await page.getByTestId('tool-rect').click();
    await dragOn(page, await proj(page, b, 20, 20), await proj(page, b, 50, 40));
    await expect(page.getByTestId('pending-bar')).toBeVisible();
    expect(await nShapes(page)).toBe(1);
    // its size can still change before ✓
    await page.getByTestId('detail-w').fill('35');
    await page.getByTestId('detail-w').press('Enter');
    await page.getByTestId('ghost-ok').click();
    await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
    expect(await past(page)).toBe(p0 + 1);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await nShapes(page)).toBe(0);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    expect(await nShapes(page)).toBe(1);
    // ✕
    await page.getByTestId('tool-circle').click();
    await dragOn(page, await proj(page, b, 70, 60), await proj(page, b, 90, 80));
    expect(await nShapes(page)).toBe(2);
    await page.getByTestId('ghost-cancel').click();
    expect(await nShapes(page)).toBe(1);
    // Esc
    await page.getByTestId('tool-roundrect').click();
    await dragOn(page, await proj(page, b, 70, 60), await proj(page, b, 90, 80));
    expect(await nShapes(page)).toBe(2);
    await page.keyboard.press('Escape');
    expect(await nShapes(page)).toBe(1);
    // another tool drops it
    await page.getByTestId('tool-rect').click();
    await dragOn(page, await proj(page, b, 70, 60), await proj(page, b, 90, 80));
    expect(await nShapes(page)).toBe(2);
    await page.getByTestId('tool-circle').click();
    expect(await nShapes(page)).toBe(1);
    // text: placed, then ✓
    await page.getByTestId('tool-text').click();
    const q = await proj(page, b, 60, 70);
    await page.mouse.click(q.x, q.y);
    await expect(page.getByTestId('pending-bar')).toBeVisible();
    await page.keyboard.press('Enter');
    expect(await nShapes(page)).toBe(2);
    await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
  });

  test('grow and extrude are confirmed on the stage', async ({ page }) => {
    const b = await setup(page);
    await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'edge', panelId: id, edge: 'e0' }), b);
    await expect(page.getByTestId('grow-ghost-bar')).toBeVisible();
    const p0 = await past(page);
    await page.getByTestId('grow-go').click();
    expect(Object.keys((await design(page)).panels)).toHaveLength(2);
    expect(await past(page)).toBe(p0 + 1);
    // the card no longer has its own Grow button
    await expect(page.getByTestId('edgebar')).toHaveCount(0);
  });

  test('the cut plan: a drawn shape waits for ✓', async ({ page }) => {
    await setup(page);
    await page.getByTestId('view-2d').click();
    await page.getByTestId('tool-rect').click();
    const piece = page.locator('path.piece').first();
    const bb = (await piece.boundingBox())!;
    await dragOn(page, { x: bb.x + bb.width * 0.3, y: bb.y + bb.height * 0.3 }, { x: bb.x + bb.width * 0.6, y: bb.y + bb.height * 0.6 });
    await expect(page.getByTestId('pending-bar')).toBeVisible();
    await page.getByTestId('ghost-ok').click();
    await expect(page.getByTestId('pending-bar')).toHaveCount(0);
    expect(await nShapes(page)).toBe(1);
    await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
  });
});

test('milestone 31: Shift-click three floor panels, distribute them, undo', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, 'ply-3');
  const ids = await S<string[]>(page, () => {
    const cf = (window as any).__cutforge;
    let out: string[] = [];
    cf.store.getState().apply((d: any) => void (out = [cf.ops.addRootPanel(d, -220, 20, 40, 30), cf.ops.addRootPanel(d, -40, 30, 20, 40), cf.ops.addRootPanel(d, 160, 10, 50, 30)]));
    cf.store.getState().select(null);
    return out;
  });
  await S(page, () => (window as any).__cutforge.setCamera([0, 500, 1], [0, 0, 0]));
  await page.waitForTimeout(300);
  const sizes = [[40, 30], [20, 40], [50, 30]];
  // under load the camera may still be settling: click again until each one is in the selection
  for (let i = 0; i < 3; i++) {
    await expect(async () => {
      const cur: string[] = await S(page, () => {
        const s = (window as any).__cutforge.store.getState().selection;
        return s?.kind === 'panel' ? (s.ids ?? [s.id]) : [];
      });
      if (cur.includes(ids[i])) return;
      const q = await proj(page, ids[i], sizes[i][0] / 2, sizes[i][1] / 2);
      if (i) await page.keyboard.down('Shift');
      await page.mouse.click(q.x, q.y);
      if (i) await page.keyboard.up('Shift');
      const now: string[] = await S(page, () => {
        const s = (window as any).__cutforge.store.getState().selection;
        return s?.kind === 'panel' ? (s.ids ?? [s.id]) : [];
      });
      expect(now).toContain(ids[i]);
    }).toPass({ timeout: 10_000 });
  }
  await expect(page.getByTestId('inspector-multi-panel')).toContainText('3 panels selected');
  const before = await design(page);
  await page.getByTestId('panel-dist-hgap').click();
  const d = await design(page);
  const x0 = (id: string) => d.panels[id].frame.o[0];
  const gap1 = x0(ids[1]) - (x0(ids[0]) + 40), gap2 = x0(ids[2]) - (x0(ids[1]) + 20);
  expect(gap1).toBeCloseTo(gap2, 6);
  await page.getByTestId('undo').click();
  expect((await design(page)).panels[ids[1]].frame.o).toEqual(before.panels[ids[1]].frame.o);
  // the panels stay selected; Shift-click takes one out again
  const q = await proj(page, ids[0], 20, 15);
  await page.keyboard.down('Shift');
  await page.mouse.click(q.x, q.y);
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('inspector-multi-panel')).toContainText('2 panels selected');
  expect(errors).toEqual([]);
});
