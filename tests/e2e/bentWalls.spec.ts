// Milestone 46 (CURVED_WALLS.md): walls bent along curves, Quick build's Round box, telescoping lids, matched walls.
import { test, expect, type Page } from '@playwright/test';
import { QUICK_STATE } from './util';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design, (k, v) => (k === 'bent' ? (v ? { closed: v.closed, n: v.facets.length } : v) : v))));
const floorPt = (page: Page, x: number, z: number) => S<{ x: number; y: number }>(page, ([a, b]: number[]) => (window as any).__cutforge.projectWorld(a, 0, b), [x, z]);
async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

test.describe('Quick build', () => {
  test.use({ storageState: QUICK_STATE });

  test('Box › Round: a Shift-drag makes a circle whose wall bends round it; ✓, then a lid on top', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.getByTestId('mat-card-0.5').click();
    await page.getByTestId('start-go').click();
    await page.getByTestId('quick-box').click();
    await page.getByTestId('box-round').click();
    await expect(page.getByTestId('box-reach')).toBeVisible();
    await page.keyboard.down('Shift');
    await drag(page, await floorPt(page, -40, 40), await floorPt(page, 40, -35));
    await page.keyboard.up('Shift');
    // the walls rise as a ghost: ✓
    await page.getByTestId('extrude-go').click();
    let d = await design(page);
    const base = d.order.find((id: string) => d.panels[id].sketch.round);
    expect(d.panels[base].sketch.round).toEqual({ shape: 'circle' });
    const walls = d.order.filter((id: string) => d.panels[id].bent);
    expect(walls).toHaveLength(1);
    expect(d.panels[walls[0]].bent.closed).toBe(true);
    const c = Object.values<any>(d.connections).find((x) => x.grown && x.b.panelId === walls[0]);
    expect(c.kind).toBe('teeth');
    // a lid from the tray's card
    await page.getByTestId('tray-lid').click();
    d = await design(page);
    const lid = Object.values<any>(d.trays).find((t) => t.lidOf);
    expect(lid).toBeTruthy();
    expect(d.panels[lid.baseId].w).toBeCloseTo(d.panels[base].w + 2 * (0.5 + 0.1), 6);
    await expect(page.getByTestId('ready-badge')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test('Workshop: a rounded tray’s curved walls take the tray card’s curved joint; a divider in a circle joins its wall', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('mat-corr-1.6').click();
  await page.getByTestId('start-go').click();
  const ids = await S<{ rr: string; circle: string }>(page, () => {
    const cf = (window as any).__cutforge;
    let out: any;
    cf.store.getState().apply((d: any) => {
      const rr = cf.ops.addRoundedRect(d, -150, 40, 120, 80, 30);
      cf.ops.addTray(d, rr, 40);
      const circle = cf.ops.addRoundPanel(d, 40, 60, 120, 120, { shape: 'circle' });
      cf.ops.addTray(d, circle, 50);
      cf.ops.autoConnect(d);
      out = { rr, circle };
    });
    cf.store.getState().select({ kind: 'panel', id: out.rr });
    return out;
  });
  await expect(page.getByTestId('tray-curve-kind')).toBeVisible();
  await expect(page.getByTestId('tray-curve-why')).toBeVisible();
  await page.getByTestId('tray-curve-kind').selectOption('wrap');
  let d = await design(page);
  const bent = Object.values<any>(d.connections).filter((c) => c.grown && c.a.panelId === ids.rr && d.panels[c.b.panelId].bent);
  expect(bent).toHaveLength(4);
  expect(bent.every((c) => c.kind === 'wrap')).toBe(true);
  // a divider across the circle with the Divider tool: joined to the curved wall at both ends
  await page.keyboard.press('d');
  const p = d.panels[ids.circle];
  const a = await S<{ x: number; y: number }>(page, ([id, x, y]: any[]) => (window as any).__cutforge.project(id, x, y, true), [ids.circle, 12, p.h / 2]);
  const b = await S<{ x: number; y: number }>(page, ([id, x, y]: any[]) => (window as any).__cutforge.project(id, x, y, true), [ids.circle, p.w - 12, p.h / 2]);
  await drag(page, a, b);
  await page.getByTestId('ghost-ok').click();
  d = await design(page);
  const div = d.order.find((id: string) => d.panels[id].divider);
  expect(div).toBeTruthy();
  const wall = d.order.find((id: string) => d.panels[id].bent && Object.values<any>(d.connections).some((c) => c.grown && c.a.panelId === ids.circle && c.b.panelId === id));
  const ends = Object.values<any>(d.connections).filter((c) => !c.grown && c.a.panelId === div && c.b.panelId === wall);
  expect(ends).toHaveLength(2);
  expect(ends.every((c) => !c.broken)).toBe(true);
  expect(errors).toEqual([]);
});

test('Workshop: a wall’s top follows the wall facing it; Own outline keeps the shape', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('start-go').click();
  const w = await S<{ front: string; back: string }>(page, () => {
    const cf = (window as any).__cutforge;
    let out: any;
    cf.store.getState().apply((d: any) => {
      const b = cf.ops.addRootPanel(d, -80, 50, 160, 100);
      const t = cf.ops.addTray(d, b, 60);
      cf.ops.autoConnect(d);
      out = { front: `${t}/e0`, back: `${t}/e2` };
    });
    cf.store.getState().select({ kind: 'panel', id: out.back });
    return out;
  });
  await page.getByTestId('match-with').selectOption(w.front);
  await expect(page.getByTestId('match-follows')).toBeVisible();
  await S(page, (f: string) => {
    const cf = (window as any).__cutforge;
    cf.store.getState().apply((d: any) => void cf.ops.addWallInsert(d, f, 'e2', 0.25, 30));
  }, w.front);
  let d = await design(page);
  expect(d.panels[w.back].sketch.inserts?.filter((x: any) => x.edge === 'e2')).toHaveLength(1);
  await page.getByTestId('match-own').click();
  d = await design(page);
  expect(d.panels[w.back].sketch.match).toBeUndefined();
  expect(d.panels[w.back].sketch.inserts).toHaveLength(1);
  expect(errors).toEqual([]);
});
