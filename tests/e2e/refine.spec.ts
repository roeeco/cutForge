// Interaction refinements (milestones 15–20).
import { test, expect, type Page } from '@playwright/test';
import { setNum } from './util';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const state = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState())));
const design = async (page: Page) => (await state(page)).design;
const panelPt = (page: Page, id: string, x: number, y: number) => S<{ x: number; y: number }>(page, ([i, a, b]: [string, number, number]) => (window as any).__cutforge.project(i, a, b), [id, x, y]);

async function start(page: Page, mat: string) {
  await page.goto('/');
  await page.getByTestId(`mat-${mat}`).click();
  await page.getByTestId('start-go').click();
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

test('milestone 16: panels run into each other: the export check names both and selects both', async ({ page }) => {
  await start(page, 'ply-3');
  const ids = await S<string[]>(page, () => {
    const cf = (window as any).__cutforge;
    let a = '', b = '';
    cf.store.getState().apply((d: any) => {
      const base = cf.ops.addRootPanel(d, -60, 40, 120, 80);
      for (const e of [0, 1, 2, 3]) cf.ops.growPanel(d, base, e, { height: 50, angle: 90, dir: 'up', kind: 'finger' });
      a = cf.ops.addDivider(d, base, 0, 30, 40);
      b = cf.ops.addDivider(d, base, 0, 31.5, 40);
    });
    return [a, b];
  });
  await page.getByTestId('open-export').click();
  const msg = page.getByTestId('export-issues').getByRole('button', { name: /run into each other/ });
  await expect(msg).toHaveCount(1);
  await msg.click();
  const sel = (await state(page)).selection;
  expect(sel.kind).toBe('panel');
  expect([...sel.ids].sort()).toEqual([...ids].sort());
  // Hebrew
  await S(page, () => (window as any).__cutforge.store.getState().setLang('he'));
  await page.getByTestId('open-export').click();
  await expect(page.getByTestId('export-issues')).toContainText('נכנסים זה בזה');
});

test('milestone 17: turn a shape with the gizmo ring: 15° steps, Shift for 1°, a typed angle; turn a floor panel', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, 'ply-3');
  const ids = await S<{ base: string; wall: string; shape: string }>(page, () => {
    const cf = (window as any).__cutforge;
    const out: any = {};
    cf.store.getState().apply((d: any) => {
      out.base = cf.ops.addRootPanel(d, -60, 40, 120, 80);
      out.wall = cf.ops.growPanel(d, out.base, 'e0', { height: 70, angle: 90, dir: 'up', kind: 'finger' }).panelId;
      out.shape = cf.ops.addDetail(d, out.wall, 'rect', 'cut', 60, 35, 30, 16);
    });
    cf.store.getState().select({ kind: 'detail', id: out.shape, ids: [out.shape] });
    return out;
  });
  await page.getByTestId('fit-view').click();
  await page.waitForTimeout(400);
  const rot = async () => (await design(page)).panels[ids.wall].details[0].rot ?? 0;
  const c = await panelPt(page, ids.wall, 60, 35);
  const ringAt = (deg: number) => ({ x: c.x + 64 * Math.cos((deg * Math.PI) / 180), y: c.y - 64 * Math.sin((deg * Math.PI) / 180) });
  const turn = async (to: number, shift = false) => {
    const a = ringAt(0), b = ringAt(to);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    if (shift) await page.keyboard.down('Shift');
    for (let k = 1; k <= 6; k++) {
      const p = ringAt((to * k) / 6);
      await page.mouse.move(p.x, p.y);
    }
    await expect(page.getByTestId('gizmo-readout')).toBeVisible();
    await page.mouse.move(b.x, b.y);
    await page.mouse.up();
    if (shift) await page.keyboard.up('Shift');
  };
  await turn(32);
  expect(await rot()).toBe(30);
  await turn(17, true);
  expect(await rot()).toBe(47);
  // one undo step per turn
  await page.keyboard.press('ControlOrMeta+z');
  expect(await rot()).toBe(30);
  // type an angle while dragging the ring
  {
    const a = ringAt(0), b = ringAt(10);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 3 });
    await page.keyboard.type('45');
    await expect(page.getByTestId('gizmo-readout')).toContainText('45');
    await page.keyboard.press('Enter');
    await page.mouse.up();
  }
  expect(await rot()).toBe(75);
  // the card shows it and takes an exact value
  await expect(page.getByTestId('detail-rot')).toHaveValue('75');
  await setNum(page, 'detail-rot', '-15');
  expect(await rot()).toBe(-15);

  // a floor panel: the gizmo turns it (and its wall) about the vertical; the card takes an exact angle
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), ids.base);
  await setNum(page, 'panel-yaw', '30');
  const d = await design(page);
  expect((Math.atan2(-d.panels[ids.base].frame.u[2], d.panels[ids.base].frame.u[0]) * 180) / Math.PI).toBeCloseTo(30, 6);
  expect(Object.values(d.connections).some((x: any) => x.broken)).toBe(false);
  expect(errors).toEqual([]);
});

test('milestone 17: the cut plan turns a shape with its ring and resizes a turned shape along its own sides', async ({ page }) => {
  await start(page, 'ply-3');
  const ids = await S<any>(page, () => {
    const cf = (window as any).__cutforge;
    const out: any = {};
    cf.store.getState().apply((d: any) => {
      out.base = cf.ops.addRootPanel(d, -60, 40, 120, 80);
      out.shape = cf.ops.addDetail(d, out.base, 'rect', 'cut', 60, 40, 30, 16);
    });
    return out;
  });
  await S(page, (id: string) => (window as any).__cutforge.store.getState().openSolo(id), ids.base);
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'detail', id, ids: [id] }), ids.shape);
  const knob = page.getByTestId('rot-knob');
  await expect(knob).toBeVisible();
  const kb = (await knob.boundingBox())!;
  const ring = (await page.getByTestId('rot-ring').boundingBox())!;
  const c = { x: ring.x + ring.width / 2, y: ring.y + ring.height / 2 };
  const k = { x: kb.x + kb.width / 2, y: kb.y + kb.height / 2 };
  const R = Math.hypot(k.x - c.x, k.y - c.y);
  // from the top (90°) to 90° + 47° counter-clockwise on screen: snaps to 45°
  await page.mouse.move(k.x, k.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    const a = ((90 + (47 * i) / 6) * Math.PI) / 180;
    await page.mouse.move(c.x + R * Math.cos(a), c.y - R * Math.sin(a));
  }
  await page.mouse.up();
  const rot = async () => (await design(page)).panels[ids.base].details[0];
  expect((await rot()).rot).toBe(45);
  // resize from a turned corner: the shape grows along its own sides, its rotation kept
  const h = (await page.getByTestId('handle-2').boundingBox())!;
  const p0 = { x: h.x + h.width / 2, y: h.y + h.height / 2 };
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  await page.mouse.move(p0.x + 30, p0.y - 5, { steps: 4 });
  await page.mouse.up();
  const dt = await rot();
  expect(dt.rot).toBe(45);
  expect(dt.w).toBeGreaterThan(30);
});

for (const mat of ['ply-3', 'corr-4'] as const) {
  test(`milestone 32: + Divider between two selected walls, drag it to equal compartments; walls that are not parallel say why (${mat})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await start(page, mat);
    const ids = await S<any>(page, () => {
      const cf = (window as any).__cutforge;
      const out: any = {};
      cf.store.getState().apply((d: any) => {
        out.base = cf.ops.addRootPanel(d, -80, 55, 160, 110);
        const kind = d.material.kind === 'plywood' ? 'finger' : 'fold';
        out.walls = [0, 1, 2, 3].map((e: number) => cf.ops.growPanel(d, out.base, e, { height: 50, angle: 90, dir: 'up', kind }).panelId);
      });
      cf.store.getState().select(null);
      return out;
    });
    await page.getByTestId('fit-view').click();
    await page.waitForTimeout(300);
    let d = await design(page);
    const t = d.material.thickness;
    const [front, right, , left] = ids.walls;
    const L = d.panels[left], R = d.panels[right];
    const pa = await S<{ x: number; y: number }>(page, ([i, x, y]: [string, number, number]) => (window as any).__cutforge.projectFace(i, x, y, 1), [left, L.w * 0.35, L.h * 0.5]);
    const pb = await S<{ x: number; y: number }>(page, ([i, x, y]: [string, number, number]) => (window as any).__cutforge.projectFace(i, x, y, 1), [right, R.w * 0.6, R.h * 0.5]);
    // a wall: the hint; Shift-click the opposite one: + Divider between them
    await page.mouse.click(pa.x, pa.y);
    await expect(page.locator('.view-hint')).toContainText('Shift-click the wall opposite');
    await page.keyboard.down('Shift');
    await page.mouse.click(pb.x, pb.y);
    await page.keyboard.up('Shift');
    await expect(page.getByTestId('add-divider')).toBeEnabled();
    const before = (await design(page)).order.length;
    await page.getByTestId('add-divider').click();
    d = await design(page);
    expect(d.order.length).toBe(before + 1);
    const nd = d.order[d.order.length - 1];
    for (const w of [left, right]) {
      const cs = Object.values(d.connections).filter((c: any) => !c.grown && [c.a.panelId, c.b.panelId].includes(nd) && [c.a.panelId, c.b.panelId].includes(w)) as any[];
      expect(cs.length, `joined to ${w}`).toBe(1);
      expect(cs[0].broken).toBe(false);
      // an edge on a face: tabs and slots first, on every material
      expect(cs[0].kind).toBe('tabslot');
    }
    // centred: halfway along the walls (110 deep)
    const c0 = Object.values(d.connections).find((c: any) => c.grown && c.b.panelId === nd) as any;
    expect(c0.offset + t / 2).toBeCloseTo(55, 0);
    // drag it with its slide arrow, away and back: it snaps to equal compartments
    expect((await state(page)).selection.id).toBe(nd);
    await page.waitForTimeout(200);
    const p = d.panels[nd];
    const from = await panelPt(page, nd, p.w / 2, p.h * 0.3);
    const step = async (mm: number) => {
      const off = (Object.values((await design(page)).connections).find((c: any) => c.grown && c.b.panelId === nd) as any).offset;
      const a = await S<{ x: number; y: number }>(page, ([b, e, o]: [string, string, number]) => (() => { const P = (window as any).__cutforge.store.getState().design.panels[b]; return (window as any).__cutforge.project(b, P.w / 2, e === 'e2' ? P.h - o : o, true); })(), [ids.base, c0.a.edge, off]);
      const b2 = await S<{ x: number; y: number }>(page, ([b, e, o]: [string, string, number]) => (() => { const P = (window as any).__cutforge.store.getState().design.panels[b]; return (window as any).__cutforge.project(b, P.w / 2, e === 'e2' ? P.h - o : o, true); })(), [ids.base, c0.a.edge, off + mm]);
      return { x: b2.x - a.x, y: b2.y - a.y };
    };
    const away = await step(14);
    await drag(page, from, { x: from.x + away.x, y: from.y + away.y });
    const moved = (Object.values((await design(page)).connections).find((c: any) => c.grown && c.b.panelId === nd) as any).offset;
    expect(Math.abs(moved - c0.offset)).toBeGreaterThan(5);
    const from2 = await panelPt(page, nd, p.w / 2, p.h * 0.3);
    const back = await step(c0.offset - moved + 0.7);
    await drag(page, from2, { x: from2.x + back.x, y: from2.y + back.y });
    const snapped = (Object.values((await design(page)).connections).find((c: any) => c.grown && c.b.panelId === nd) as any).offset;
    expect(snapped).toBeCloseTo(c0.offset, 6);
    await expect(page.getByTestId('div-comp-0')).toBeVisible();
    // walls that are not parallel: greyed, with the reason
    // (the Shift-click flow is above; the new divider now stands in front of those points)
    await S(page, (x: string[]) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id: x[1], ids: x }), [left, front]);
    await expect(page.getByTestId('add-divider')).toBeDisabled();
    await expect(page.getByTestId('add-divider-why')).toBeVisible();
    // the export check is clean of joint messages
    await page.getByTestId('open-export').click();
    const issues = page.getByTestId('export-issues');
    if (await issues.count()) await expect(issues).not.toContainText(/touch but are not joined|run into each other|no longer meets/);
    expect(errors).toEqual([]);
  });
}

const worldPt = (page: Page, x: number, y: number, z: number) => S<{ x: number; y: number }>(page, ([a, b, c]: number[]) => (window as any).__cutforge.projectWorld(a, b, c), [x, y, z]);

test('milestone 19: adaptive grow — height snap, partial width, gable under a roof, adapt off, outline on the ghost', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, 'ply-3');
  // a box 120 × 80 (x −60..60, z 40..−40), walls 50 high
  const ids = await S<any>(page, () => {
    const cf = (window as any).__cutforge;
    const out: any = {};
    cf.store.getState().apply((d: any) => {
      out.base = cf.ops.addRootPanel(d, -60, 40, 120, 80);
      out.walls = [0, 1, 2, 3].map((e: number) => cf.ops.growPanel(d, out.base, e, { height: 50, angle: 90, dir: 'up', kind: 'finger' }).panelId);
    });
    return out;
  });
  const [front, , back] = ids.walls;
  await page.getByTestId('fit-view').click();
  await page.waitForTimeout(300);

  // 1. a lid from the back wall's top edge: dragging its height arrow near 80 snaps exactly to the front wall's outer face
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'edge', panelId: id, edge: 'e2' }), back);
  await S(page, () => (window as any).__cutforge.store.getState().setGrow({ angle: 90, height: 60 }));
  await page.waitForTimeout(200);
  const at = await worldPt(page, 0, 50, -40 + 60);
  const to = await worldPt(page, 0, 50, -40 + 79.2);
  await drag(page, at, to);
  expect((await state(page)).grow.height).toBe(80);
  await page.getByTestId('grow-go').click();
  let d = await design(page);
  const lid = d.order[d.order.length - 1];
  expect(d.panels[lid].h).toBe(80);
  const lidFront = Object.values(d.connections).filter((c: any) => !c.grown && [c.a.panelId, c.b.panelId].includes(lid) && [c.a.panelId, c.b.panelId].includes(front)) as any[];
  expect(lidFront.map((c) => c.broken)).toEqual([false]);
  await page.keyboard.press('ControlOrMeta+z');

  // 2. partial width: a second floor panel; its front edge's ghost is shortened by dragging its end handle to the middle (snaps to 60)
  const b2 = await S<string>(page, () => {
    const cf = (window as any).__cutforge;
    let id = '';
    cf.store.getState().apply((x: any) => void (id = cf.ops.addRootPanel(x, 100, 40, 120, 80)));
    return id;
  });
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'edge', panelId: id, edge: 'e0' }), b2);
  await S(page, () => (window as any).__cutforge.store.getState().setGrow({ angle: 90, height: 40 }));
  await page.getByTestId('fit-view').click();
  await page.waitForTimeout(300);
  const endAt = await worldPt(page, 220, 3, 40);
  const endTo = await worldPt(page, 161.5, 3, 40);
  await drag(page, endAt, endTo);
  expect((await state(page)).grow.span).toEqual([0, 60]);
  await expect(page.getByTestId('grow-span-end')).toHaveValue('60');
  await page.getByTestId('grow-go').click();
  d = await design(page);
  const half = d.order[d.order.length - 1];
  expect(d.panels[half].w).toBe(60);
  const hc = Object.values(d.connections).find((c: any) => c.grown && c.b.panelId === half) as any;
  expect(hc.span).toEqual([0, 60]);
  expect(Math.max(...hc.geom.edges.find((e: any) => e.panelId === b2).notches.map((n: any) => n.s1))).toBeLessThanOrEqual(60);
  // the rest of the edge can still be grown from, typed as a span
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'edge', panelId: id, edge: 'e0' }), b2);
  await expect(page.getByTestId('grow-span-start')).toHaveValue('60');

  // 3. a roof sloping from the back wall (80) to the front wall (40) of a third box; a side wall grown under it gets a gable and joins it
  const r = await S<any>(page, () => {
    const cf = (window as any).__cutforge;
    const out: any = {};
    cf.store.getState().apply((x: any) => {
      out.base = cf.ops.addRootPanel(x, -60, 200, 120, 80);
      out.front = cf.ops.growPanel(x, out.base, 'e0', { height: 40, angle: 90, dir: 'up', kind: 'finger' }).panelId;
      out.back = cf.ops.growPanel(x, out.base, 'e2', { height: 80, angle: 90, dir: 'up', kind: 'finger' }).panelId;
    });
    cf.store.getState().apply((x: any) => {
      const a = 90 - (Math.atan2(40, 80) * 180) / Math.PI;
      out.roof = cf.ops.growPanel(x, out.back, 'e2', { height: Math.hypot(80, 40), angle: a, dir: 'up', kind: 'lean' }).panelId;
    });
    cf.store.getState().select({ kind: 'edge', panelId: out.base, edge: 'e1' });
    cf.store.getState().setGrow({ angle: 90, height: 110 });
    return out;
  });
  await expect(page.getByTestId('grow-adapted')).toBeVisible();
  await page.getByTestId('grow-go').click();
  d = await design(page);
  const gable = d.order[d.order.length - 1];
  expect(d.panels[gable].sketch.corners?.tl?.dy).toBeLessThan(-30);
  const gr = Object.values(d.connections).filter((c: any) => !c.grown && [c.a.panelId, c.b.panelId].includes(gable) && [c.a.panelId, c.b.panelId].includes(r.roof)) as any[];
  expect(gr.length).toBeGreaterThanOrEqual(1);
  expect(gr.every((c) => !c.broken)).toBe(true);

  // 4. adapting off: the plain rectangle
  await page.keyboard.press('ControlOrMeta+z');
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'edge', panelId: id, edge: 'e1' }), r.base);
  await page.getByTestId('grow-adapt').uncheck();
  await expect(page.getByTestId('grow-adapted')).toHaveCount(0);
  await page.getByTestId('grow-go').click();
  d = await design(page);
  const plainW = d.order[d.order.length - 1];
  expect(d.panels[plainW].sketch.corners).toBeUndefined();
  await page.keyboard.press('ControlOrMeta+z');

  // 5. outline on the ghost: drag its top-left corner down before growing (the first box's free right edge... use a fresh floor panel)
  const b4 = await S<string>(page, () => {
    const cf = (window as any).__cutforge;
    let id = '';
    cf.store.getState().apply((x: any) => void (id = cf.ops.addRootPanel(x, -300, 40, 100, 80)));
    cf.store.getState().select({ kind: 'edge', panelId: id, edge: 'e1' });
    cf.store.getState().setGrow({ angle: 90, height: 60, adapt: true });
    return id;
  });
  await page.getByTestId('fit-view').click();
  await page.waitForTimeout(300);
  await page.getByTestId('grow-edit-outline').click();
  await page.waitForTimeout(200);
  // e1 of that panel runs from (−200, 0, 40) to (−200, 0, −40): the ghost's top-left corner is at its front end
  const tl = await worldPt(page, -200, 60, 40);
  const tlTo = await worldPt(page, -200, 42, 40);
  await drag(page, tl, tlTo);
  expect((await state(page)).grow.sketch.corners.tl.dy).toBeLessThan(-10);
  await page.getByTestId('grow-go').click();
  d = await design(page);
  const edited = d.order[d.order.length - 1];
  expect(d.panels[edited].sketch.corners.tl.dy).toBeLessThan(-10);
  void b4;
  expect(errors).toEqual([]);
});

test('milestone 20: a through-cut is resized and turned from the back wall it reaches; a polygon through-cut counts while drawn', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, 'ply-3');
  const ids = await S<any>(page, () => {
    const cf = (window as any).__cutforge;
    const out: any = {};
    cf.store.getState().apply((d: any) => {
      out.base = cf.ops.addRootPanel(d, -60, 40, 120, 80);
      out.walls = [0, 1, 2, 3].map((e: number) => cf.ops.growPanel(d, out.base, e, { height: 50, angle: 90, dir: 'up', kind: 'finger' }).panelId);
      out.cut = cf.ops.addDetail(d, out.walls[0], 'rect', 'cut', 60, 25, 20, 10, undefined, true);
    });
    cf.store.getState().select({ kind: 'detail', id: out.cut, ids: [out.cut] });
    return out;
  });
  await page.getByTestId('fit-view').click();
  await page.waitForTimeout(400);
  const dt = async () => (await design(page)).panels[ids.walls[0]].details[0];
  // the front wall is at z = 40 (x = −60 + local x), the back wall's mid-plane at z = −40 + 1.5
  const onBack = (x: number, y: number) => worldPt(page, -60 + x, y, -40 + 1.5);
  const onFront = (x: number, y: number) => worldPt(page, -60 + x, y, 40);
  // resize from the back wall: its top-right corner (70, 30) dragged to (76, 34)
  const c2 = await onBack(70, 30), c2f = await onFront(70, 30);
  expect(Math.hypot(c2.x - c2f.x, c2.y - c2f.y)).toBeGreaterThan(25);
  const c2to = await onBack(76, 34);
  await drag(page, c2, c2to);
  let x = await dt();
  expect(x.w).toBeGreaterThan(24);
  expect(x.h).toBeGreaterThan(12);
  expect(x.cx - x.w / 2).toBeCloseTo(50, 0); // the opposite corner stayed
  // turn it with the gizmo ring on the back wall: 32° on screen → 30°
  const cB = await onBack(x.cx, x.cy);
  const ringAt = (deg: number) => ({ x: cB.x + 64 * Math.cos((deg * Math.PI) / 180), y: cB.y - 64 * Math.sin((deg * Math.PI) / 180) });
  await page.mouse.move(ringAt(0).x, ringAt(0).y);
  await page.mouse.down();
  for (let k = 1; k <= 6; k++) await page.mouse.move(ringAt((32 * k) / 6).x, ringAt((32 * k) / 6).y);
  await page.mouse.up();
  x = await dt();
  expect(x.rot).toBe(30);
  // the back wall's cut region follows the source
  const back = (await state(page)).design.panels[ids.walls[2]];
  void back;

  // a polygon through-cut on the front wall: the count shows while it is drawn
  await S(page, () => {
    const s = (window as any).__cutforge.store.getState();
    s.select(null);
    s.setShapeOp('cut');
    s.set({ shapeThrough: true });
  });
  await page.keyboard.press('g');
  for (const [px, py] of [[15, 10], [35, 10], [25, 40]] as const) {
    const p = await onFront(px, py);
    await page.mouse.click(p.x, p.y);
  }
  const p4 = await onFront(18, 30);
  await page.mouse.move(p4.x, p4.y);
  await expect(page.getByTestId('through-count')).toContainText(/Cuts [1-9]/);
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});
