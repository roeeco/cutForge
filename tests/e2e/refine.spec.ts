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
  expect([sel.id, ...sel.also].sort()).toEqual([...ids].sort());
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
  test(`milestone 18: automatic dividers, drag one out of the set, a divider between two faces (${mat})`, async ({ page }) => {
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
      cf.store.getState().select({ kind: 'panel', id: out.base });
      return out;
    });
    await page.getByTestId('fit-view').click();
    await page.waitForTimeout(300);
    // automatic: 2 across, 1 along
    await page.getByTestId('div-toggle').click();
    await page.getByTestId('div-across-inc').click();
    await page.getByTestId('div-across-inc').click();
    await page.getByTestId('div-along-inc').click();
    await expect(page.getByTestId('div-set-count')).toContainText('3');
    let d = await design(page);
    const set = Object.keys(d.dividerSets)[0];
    expect(d.order.filter((id: string) => id.startsWith(set + '/'))).toHaveLength(3);
    expect(Object.values(d.connections).filter((c: any) => c.kind === 'halflap')).toHaveLength(2);
    // drag the first across divider with its slide arrow: it leaves the set, the other re-spaces
    const a1 = `${set}/a1`;
    await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), a1);
    await page.waitForTimeout(200);
    const p = d.panels[a1];
    const from = await panelPt(page, a1, p.w / 2, p.h * 0.3);
    // the arrow points into the base from its left edge (+x): move the pointer towards the right on screen
    const off0 = Object.values(d.connections).find((c: any) => c.grown && c.b.panelId === a1) as any;
    const to = await S<{ x: number; y: number }>(page, ([b, o]: [string, number]) => {
      const cf = (window as any).__cutforge;
      const base = cf.store.getState().design.panels[b];
      return cf.project(b, o + 12, base.h / 2);
    }, [ids.base, off0.offset]);
    const here = await S<{ x: number; y: number }>(page, ([b, o]: [string, number]) => {
      const cf = (window as any).__cutforge;
      const base = cf.store.getState().design.panels[b];
      return cf.project(b, o, base.h / 2);
    }, [ids.base, off0.offset]);
    await drag(page, from, { x: from.x + (to.x - here.x), y: from.y + (to.y - here.y) });
    const st = await state(page);
    d = st.design;
    expect(st.selection.kind).toBe('panel');
    const loose = st.selection.id;
    expect(loose.startsWith(set + '/')).toBe(false);
    expect(d.dividerSets[set].loose).toEqual([loose]);
    expect(d.dividerSets[set].across).toBe(1);
    const lc = Object.values(d.connections).find((c: any) => c.grown && c.b.panelId === loose) as any;
    expect(lc.offset).toBeGreaterThan(off0.offset + 5);
    // compartment sizes are shown along the row
    await expect(page.getByTestId('div-comp-0')).toBeVisible();
    // Space evenly again
    await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), ids.base);
    await page.getByTestId('div-toggle').click();
    await page.getByTestId('div-respace').click();
    d = await design(page);
    expect(d.dividerSets[set].across).toBe(2);
    expect(d.panels[loose]).toBeUndefined();

    // between two faces: Shift-click the left wall's inner face, then the right wall's (the set removed so nothing hides them)
    await S(page, (b: string) => {
      const cf = (window as any).__cutforge;
      cf.store.getState().apply((x: any) => cf.ops.setDividerSet(x, b, { across: 0, along: 0 }));
      cf.store.getState().select(null);
    }, ids.base);
    d = await design(page);
    expect(d.dividerSets?.[set]).toBeUndefined();
    const t = d.material.thickness;
    const [, right, , left] = ids.walls;
    const L = d.panels[left], R = d.panels[right];
    const pa = await S<{ x: number; y: number }>(page, ([i, x, y]: [string, number, number]) => (window as any).__cutforge.project(i, x, y, true), [left, L.w * 0.35, L.h * 0.85]);
    const pb = await S<{ x: number; y: number }>(page, ([i, x, y]: [string, number, number]) => (window as any).__cutforge.project(i, x, y, true), [right, R.w * 0.6, R.h * 0.85]);
    await page.keyboard.down('Shift');
    await page.mouse.click(pa.x, pa.y);
    await expect(page.locator('.view-hint')).toContainText('Shift-click the face opposite');
    await page.mouse.click(pb.x, pb.y);
    await page.keyboard.up('Shift');
    await expect(page.getByTestId('div-between')).toBeEnabled();
    const before = (await design(page)).order.length;
    await page.getByTestId('div-between').click();
    d = await design(page);
    expect(d.order.length).toBe(before + 1);
    const nd = d.order[d.order.length - 1];
    for (const w of [left, right]) {
      const cs = Object.values(d.connections).filter((c: any) => !c.grown && [c.a.panelId, c.b.panelId].includes(nd) && [c.a.panelId, c.b.panelId].includes(w)) as any[];
      expect(cs.length, `joined to ${w}`).toBe(1);
      expect(cs[0].broken).toBe(false);
      expect(cs[0].kind).toBe(mat === 'ply-3' ? 'tabslot' : 'slide');
    }
    void t;
    // two faces that are not parallel: the pill is greyed with the reason
    const front = ids.walls[0];
    const F = d.panels[front];
    const pf = await S<{ x: number; y: number }>(page, ([i, x, y]: [string, number, number]) => (window as any).__cutforge.project(i, x, y, false), [front, F.w * 0.2, F.h * 0.6]);
    await page.keyboard.down('Shift');
    await page.mouse.click(pa.x, pa.y);
    await page.mouse.click(pf.x, pf.y);
    await page.keyboard.up('Shift');
    await expect(page.getByTestId('div-between')).toBeDisabled();
    await expect(page.getByTestId('div-between-why')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('div-between')).toHaveCount(0);
    // the export check is clean of joint messages
    await page.getByTestId('open-export').click();
    const issues = page.getByTestId('export-issues');
    if (await issues.count()) await expect(issues).not.toContainText(/touch but are not joined|run into each other|no longer meets/);
    expect(errors).toEqual([]);
  });
}
