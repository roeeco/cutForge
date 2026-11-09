// Gizmo, joints, flaps and settings (milestones 21–24).
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

/** Press at a, move to b in `steps` pointer moves, release. */
async function dragSteps(page: Page, a: { x: number; y: number }, b: { x: number; y: number }, steps: number) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let k = 1; k <= steps; k++) await page.mouse.move(a.x + ((b.x - a.x) * k) / steps, a.y + ((b.y - a.y) * k) / steps);
  await page.mouse.up();
}

async function wallWithShape(page: Page, shapes: [number, number][] = [[60, 35]]) {
  const ids = await S<{ base: string; wall: string; shapes: string[] }>(
    page,
    (pts: [number, number][]) => {
      const cf = (window as any).__cutforge;
      const out: any = { shapes: [] };
      cf.store.getState().apply((d: any) => {
        out.base = cf.ops.addRootPanel(d, -60, 40, 120, 80);
        out.wall = cf.ops.growPanel(d, out.base, 'e0', { height: 70, angle: 90, dir: 'up', kind: 'finger' }).panelId;
        for (const [x, y] of pts) out.shapes.push(cf.ops.addDetail(d, out.wall, 'rect', 'cut', x, y, 16, 10));
      });
      cf.store.getState().select({ kind: 'detail', id: out.shapes[0], ids: out.shapes });
      return out;
    },
    shapes,
  );
  await page.getByTestId('fit-view').click();
  await page.waitForTimeout(400);
  return ids;
}

const shapeAt = async (page: Page, wall: string, k = 0) => {
  const dt = (await design(page)).panels[wall].details[k];
  return { x: dt.cx, y: dt.cy, rot: dt.rot ?? 0 };
};

test('milestone 21: the gizmo pad and arrows land in the same place in 1, 5 and 30 steps', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, 'ply-3');
  const ids = await wallWithShape(page);
  const c = await panelPt(page, ids.wall, 60, 35);
  // screen directions of the wall's u and v axes at the shape
  const pu = await panelPt(page, ids.wall, 70, 35), pv = await panelPt(page, ids.wall, 60, 45);
  const unit = (p: { x: number; y: number }) => {
    const L = Math.hypot(p.x - c.x, p.y - c.y);
    return { x: (p.x - c.x) / L, y: (p.y - c.y) / L, pxPerMm: L / 10 };
  };
  const U = unit(pu), V = unit(pv);
  // the pad: 15 mm right and 10 mm up (on the wall), grid snapped
  const target = { x: c.x + U.x * 15 * U.pxPerMm + V.x * 10 * V.pxPerMm, y: c.y + U.y * 15 * U.pxPerMm + V.y * 10 * V.pxPerMm };
  const ends: { x: number; y: number }[] = [];
  for (const steps of [1, 5, 30]) {
    await dragSteps(page, c, target, steps);
    ends.push(await shapeAt(page, ids.wall));
    await page.keyboard.press('ControlOrMeta+z');
    expect(await shapeAt(page, ids.wall)).toMatchObject({ x: 60, y: 35 });
  }
  for (const e of ends) {
    expect(e.x).toBeCloseTo(75, 0);
    expect(e.y).toBeCloseTo(45, 0);
  }
  expect(ends[1]).toEqual(ends[0]);
  expect(ends[2]).toEqual(ends[0]);

  // each arrow, grabbed on its shaft (the wide hit zone), 20 mm along its axis
  for (const [m, A] of [
    ['x', U],
    ['y', V],
  ] as const) {
    const grab = { x: c.x + A.x * 26, y: c.y + A.y * 26 };
    const to = { x: grab.x + A.x * 20 * A.pxPerMm + (m === 'x' ? V.x : U.x) * 30, y: grab.y + A.y * 20 * A.pxPerMm + (m === 'x' ? V.y : U.y) * 30 };
    const got: { x: number; y: number }[] = [];
    for (const steps of [1, 5, 30]) {
      await dragSteps(page, grab, to, steps);
      got.push(await shapeAt(page, ids.wall));
      await page.keyboard.press('ControlOrMeta+z');
    }
    for (const e of got) {
      // 20 mm, within the test's own pixel arithmetic; the other coordinate does not move
      if (m === 'x') {
        expect(Math.abs(e.x - 80)).toBeLessThanOrEqual(1.5);
        expect(e.y).toBe(35);
      } else {
        expect(e.x).toBe(60);
        expect(Math.abs(e.y - 55)).toBeLessThanOrEqual(1.5);
      }
    }
    expect(got[1]).toEqual(got[0]);
    expect(got[2]).toEqual(got[0]);
  }
  expect(errors).toEqual([]);
});

test('milestone 21: turning two shapes keeps the pivot where the turn started', async ({ page }) => {
  await start(page, 'ply-3');
  const ids = await wallWithShape(page, [
    [40, 35],
    [80, 35],
  ]);
  const c = await panelPt(page, ids.wall, 60, 35);
  const ringAt = (deg: number) => ({ x: c.x + 64 * Math.cos((deg * Math.PI) / 180), y: c.y - 64 * Math.sin((deg * Math.PI) / 180) });
  await page.mouse.move(ringAt(0).x, ringAt(0).y);
  await page.mouse.down();
  for (let k = 1; k <= 30; k++) await page.mouse.move(ringAt((92 * k) / 30).x, ringAt((92 * k) / 30).y);
  await page.mouse.up();
  const a = await shapeAt(page, ids.wall, 0), b = await shapeAt(page, ids.wall, 1);
  // 90° about (60, 35): (40, 35) → (60, 15), (80, 35) → (60, 55)
  expect(a.rot).toBe(90);
  expect(a.x).toBeCloseTo(60, 6);
  expect(a.y).toBeCloseTo(15, 6);
  expect(b.x).toBeCloseTo(60, 6);
  expect(b.y).toBeCloseTo(55, 6);
});

test('milestone 21: a floor panel seen almost edge-on moves by screen distance, not by tens of millimetres', async ({ page }) => {
  await start(page, 'ply-3');
  const base = await S<string>(page, () => {
    const cf = (window as any).__cutforge;
    let id = '';
    cf.store.getState().apply((d: any) => (id = cf.ops.addRootPanel(d, -60, 40, 120, 80)));
    cf.store.getState().select({ kind: 'panel', id });
    return id;
  });
  // look along the floor, 5° above it
  await S(page, () => (window as any).__cutforge.setCamera([0, 400 * Math.sin((5 * Math.PI) / 180), 400 * Math.cos((5 * Math.PI) / 180)], [0, 0, 0]));
  await page.waitForTimeout(300);
  if (process.env.SHOTS) await page.screenshot({ path: 'test-results/edge-on.png' });
  const d0 = await design(page);
  const o0 = d0.panels[base].frame.o;
  const c = await panelPt(page, base, 60, 40);
  // 12 px up the screen: a small move away from the camera, not a leap
  for (const steps of [1, 5, 30]) {
    await dragSteps(page, c, { x: c.x, y: c.y - 12 }, steps);
    const o = (await design(page)).panels[base].frame.o;
    const moved = Math.hypot(o[0] - o0[0], o[2] - o0[2]);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(40);
    expect(o[2]).toBeLessThan(o0[2]);
    await page.keyboard.press('ControlOrMeta+z');
  }
});

test('milestone 22: in the fold view a glue flap moves with the panel it is cut from', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, 'corr-1.6');
  await S(page, () => {
    const cf = (window as any).__cutforge;
    cf.store.getState().apply((d: any) => {
      const b = cf.ops.addRootPanel(d, -40, 30, 80, 60);
      for (const e of [0, 1, 2, 3]) cf.ops.growPanel(d, b, e, { height: 40, angle: 90, dir: 'up', kind: 'fold' });
    });
  });
  // the corners are joined automatically; make them glue flaps
  await S(page, () => {
    const cf = (window as any).__cutforge;
    cf.store.getState().apply((d: any) => {
      for (const c of Object.values(d.connections) as any[]) if (!c.grown) cf.ops.setConnection(d, c.id, { kind: 'glue' });
    });
  });
  await page.getByTestId('fit-view').click();
  const boxes = async (t: number) => {
    await S(page, (x: number) => (window as any).__cutforge.store.getState().set({ foldT: x }), t);
    await page.waitForTimeout(150);
    return S<any>(page, () => (window as any).__cutforge.stageBoxes());
  };
  const th = 1.6;
  const gapXZ = (a: number[], b: number[]) => Math.max(0, a[0] - b[3], b[0] - a[3]) + Math.max(0, a[2] - b[5], b[2] - a[5]);
  const overlapXZ = (a: number[], b: number[]) => Math.max(0, Math.min(a[3], b[3]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[5], b[5]) - Math.max(a[2], b[2]));
  const flat = await boxes(0);
  expect(flat.flaps).toHaveLength(4);
  for (const f of flat.flaps) {
    expect(f.owner).not.toBe(f.on);
    // flat on the floor, beside its own wall (as in the cut net), not on the wall it glues to
    expect(f.box[4]).toBeLessThanOrEqual(th + 0.01);
    expect(gapXZ(f.box, flat.panels[f.owner])).toBeLessThan(0.01);
    expect(overlapXZ(f.box, flat.panels[f.on])).toBeLessThan(0.01);
  }
  // folded, it stands against the wall it glues to
  const shut = await boxes(1);
  for (const f of shut.flaps) {
    expect(f.box[4]).toBeGreaterThan(30);
    expect(gapXZ(f.box, shut.panels[f.on])).toBeLessThan(0.01);
  }
  // half way it has left the floor with its wall, as the wall has
  const half = await boxes(0.5);
  for (const f of half.flaps) {
    expect(f.box[4]).toBeGreaterThan(5);
    expect(Math.abs(f.box[4] - half.panels[f.owner][4])).toBeLessThan(15);
  }
  expect(errors).toEqual([]);
});
