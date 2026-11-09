// Quick build (milestones 37–41): a new browser starts in Quick build, with
// five actions and no joint controls; Workshop is today's editor; parts made
// with Workshop tools show read-only in Quick build.
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<string>(page, () => JSON.stringify((window as any).__cutforge.store.getState().design));

// a browser that has never used CutForge
test.use({ storageState: { cookies: [], origins: [] } });

test('Quick build: five actions, no joint controls, Workshop parts read-only', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('start-go').click();
  await expect(page.getByTestId('mode-quick')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('hints')).toHaveCount(0);
  await expect(page.getByTestId('quick-guide')).toBeVisible();
  for (const a of ['box', 'wall', 'divider', 'hole', 'text']) await expect(page.getByTestId(`quick-${a}`)).toBeVisible();
  await expect(page.getByTestId('tool-panel')).toHaveCount(0);
  await expect(page.getByTestId('op-cut')).toHaveCount(0);

  // the settings card: no joints or snapping, material read-only
  await expect(page.getByTestId('inspector-design')).toBeVisible();
  await expect(page.getByTestId('settings-joints')).toHaveCount(0);
  await expect(page.getByTestId('settings-snapping')).toHaveCount(0);
  await expect(page.getByTestId('settings-material')).toBeVisible();

  // a box, and a board with a leaning wall (made in Workshop)
  const ids = await S<{ walls: string[]; lean: string }>(page, () => {
    const cf = (window as any).__cutforge;
    let out: any;
    cf.store.getState().apply((d: any) => {
      const b = cf.ops.addRootPanel(d, -60, 45, 120, 90);
      const walls = [0, 1, 2, 3].map((e) => cf.ops.growPanel(d, b, e, { height: 45, angle: 90, dir: 'up' }).panelId);
      cf.ops.autoConnect(d);
      const b2 = cf.ops.addRootPanel(d, 120, 45, 80, 60);
      const lean = cf.ops.growPanel(d, b2, 0, { height: 40, angle: 70, dir: 'up' }).panelId;
      out = { walls, lean };
    });
    return out;
  });
  const before = await design(page);
  await page.getByTestId('fit-view').click();
  await expect(page.getByTestId('toggle-joints')).toHaveAttribute('aria-label', "How it's built");

  // a wall: no joint list, no hinge; More… shows the Workshop card
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), ids.walls[0]);
  await expect(page.getByTestId('inspector-panel')).toBeVisible();
  await expect(page.getByTestId('joints-advanced')).toHaveCount(0);
  await expect(page.getByTestId('panel-hinge-field')).toHaveCount(0);
  await page.getByTestId('quick-more').click();
  await expect(page.getByTestId('joints-advanced')).toBeVisible();
  await expect(page.getByTestId('panel-hinge-field')).toBeVisible();
  // … until the selection changes
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), ids.walls[1]);
  await expect(page.getByTestId('joints-advanced')).toHaveCount(0);

  // the leaning wall is shown read-only
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), ids.lean);
  await expect(page.getByTestId('inspector-readonly')).toBeVisible();
  await expect(page.getByTestId('readonly-why')).toContainText('angle');
  await expect(page.getByTestId('panel-w')).toHaveCount(0);

  // a key starts an action: H is a hole, cut out
  await page.locator('body').click({ position: { x: 5, y: 400 } }).catch(() => {});
  await page.keyboard.press('h');
  expect(await S(page, () => { const s = (window as any).__cutforge.store.getState(); return [s.tool, s.shapeOp]; })).toEqual(['circle', 'cut']);
  await page.keyboard.press('v');

  // Open in Workshop: today's editor, the same design
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), ids.lean);
  await page.getByTestId('quick-open-workshop').click();
  await expect(page.getByTestId('mode-workshop')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('tool-panel')).toBeVisible();
  await expect(page.getByTestId('op-cut')).toBeVisible();
  await expect(page.getByTestId('panel-hinge-field')).toBeVisible();
  await expect(page.getByTestId('quick-rail')).toHaveCount(0);
  expect(await design(page)).toBe(before);
  // the choice is kept for this browser
  await page.reload();
  await expect(page.getByTestId('mode-workshop')).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});

const pt = (page: Page, x: number, y: number, z: number) => S<{ x: number; y: number }>(page, (a: number[]) => (window as any).__cutforge.projectWorld(a[0], a[1], a[2]), [x, y, z]);
const onFace = (page: Page, id: string, x: number, y: number) => S<{ x: number; y: number }>(page, (a: any) => (window as any).__cutforge.projectFace(a.id, a.x, a.y, 1), { id, x, y });
async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}
const st = (page: Page) => S<any>(page, () => { const s = (window as any).__cutforge.store.getState(); return { tool: s.tool, past: s.past.length, order: s.design.order, sel: s.selection }; });

test('the five actions: Box, Lid, two Dividers, Hole, Text and a Sticker, each one ✓ and one undo step', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('start-go').click();
  await S(page, () => (window as any).__cutforge.setCamera([0, 300, 260], [0, 0, 0]));
  await page.waitForTimeout(300);

  // Box: drag the footprint on the floor; the walls rise at 45 mm; ✓
  await page.getByTestId('quick-box').click();
  await expect(page.getByTestId('quick-card-box')).toBeVisible();
  await drag(page, await pt(page, -60, 0, -45), await pt(page, 60, 0, 45));
  await expect(page.getByTestId('extrude-go')).toBeVisible();
  await page.getByTestId('extrude-go').click();
  let s = await st(page);
  expect(s.past).toBe(1);
  expect(s.tool).toBe('select');
  const d0 = await S<any>(page, () => (window as any).__cutforge.store.getState().design);
  const base = d0.order[0];
  expect(d0.order).toHaveLength(5);
  const wallAt = (d: any, e: string) => (Object.values(d.connections) as any[]).find((c) => c.grown && c.a.panelId === base && c.a.edge === e).b.panelId;
  const back = wallAt(d0, 'e2'), front = wallAt(d0, 'e0');
  expect(d0.panels[front].h).toBeGreaterThan(40);

  // Lid: the Wall tool, click the back wall's top edge, ✓
  await page.getByTestId('quick-wall').click();
  const bw = d0.panels[back];
  const e2 = await S<{ x: number; y: number }>(page, (a: any) => (window as any).__cutforge.project(a.id, a.x, a.y), { id: back, x: bw.w * 0.2, y: bw.h });
  await page.mouse.move(e2.x, e2.y, { steps: 3 });
  await page.mouse.click(e2.x, e2.y);
  await expect(page.getByTestId('grow-go')).toBeVisible();
  // Quick build: no angle dial on the ghost
  await expect(page.getByTestId('ghost-hinge')).toHaveCount(0);
  await page.getByTestId('grow-go').click();
  s = await st(page);
  expect(s.past).toBe(2);
  expect(s.order).toHaveLength(6);
  expect(s.tool).toBe('select');

  // two Dividers: lines across the base from the front wall to the back one (seen from above)
  await S(page, () => (window as any).__cutforge.setCamera([0, 420, 1], [0, 0, 0]));
  await page.waitForTimeout(300);
  for (const x of [40, 80]) {
    await page.getByTestId('quick-divider').click();
    await drag(page, await onFace(page, base, x, 6), await onFace(page, base, x, 84));
    await expect(page.getByTestId('divider-makes')).toHaveAttribute('data-kind', 'divider');
    await page.getByTestId('ghost-ok').click();
  }
  s = await st(page);
  expect(s.past).toBe(4);
  expect(s.order).toHaveLength(8);
  const d1 = await S<any>(page, () => (window as any).__cutforge.store.getState().design);
  const divs = (Object.values(d1.connections) as any[]).filter((c) => c.grown && c.a.panelId === base && c.offset > 6);
  expect(divs).toHaveLength(2);

  // Hole on the front wall (seen from the front), then Text and a Sticker
  await S(page, () => (window as any).__cutforge.setCamera([0, 60, 320], [0, 20, 0]));
  await page.waitForTimeout(300);
  const fw = d1.panels[front];
  await page.getByTestId('quick-hole').click();
  await page.getByTestId('hole-circle').click();
  await drag(page, await onFace(page, front, fw.w * 0.2, fw.h * 0.4), await onFace(page, front, fw.w * 0.2 + 12, fw.h * 0.4 + 12));
  await page.getByTestId('ghost-ok').click();
  await page.getByTestId('quick-text').click();
  await page.getByTestId('quick-text-text').click();
  const tp = await onFace(page, front, fw.w * 0.55, fw.h * 0.5);
  await page.mouse.click(tp.x, tp.y);
  await page.getByTestId('ghost-ok').click();
  await page.getByTestId('quick-text').click();
  await page.getByTestId('quick-text-sticker').click();
  await page.getByTestId('sticker-heart').click();
  const sp = await onFace(page, front, fw.w * 0.85, fw.h * 0.5);
  await page.mouse.click(sp.x, sp.y);
  await page.getByTestId('ghost-ok').click();
  s = await st(page);
  expect(s.past).toBe(7);
  expect(s.tool).toBe('select');
  const d2 = await S<any>(page, () => (window as any).__cutforge.store.getState().design);
  const ops = d2.panels[front].details.map((x: any) => [x.shape, x.op]);
  expect(ops).toEqual([['circle', 'cut'], ['text', 'engrave'], ['path', 'engrave']]);

  // seven actions, seven undos: back to the empty design
  for (let i = 0; i < 7; i++) await page.getByTestId('undo').click();
  expect((await st(page)).order).toEqual([]);
  expect(errors).toEqual([]);
});

test.describe('Workshop', () => {
  test.use({ storageState: { cookies: [], origins: ['http://localhost:5199'].map((origin) => ({ origin, localStorage: [{ name: 'cutforge.viewPrefs', value: JSON.stringify({ mode: 'workshop' }) }] })) } });
  test('the Panel tool on a box’s base offers Divider: a line from wall to wall becomes a divider (milestone 38)', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('mat-ply-3').click();
    await page.getByTestId('start-go').click();
    await page.getByTestId('hints-dismiss').click();
    const base = await S<string>(page, () => {
      const cf = (window as any).__cutforge;
      let b = '';
      cf.store.getState().apply((d: any) => {
        b = cf.ops.addRootPanel(d, -60, 45, 120, 90);
        cf.ops.addTray(d, b, 45);
      });
      cf.store.getState().select(null);
      return b;
    });
    await S(page, () => (window as any).__cutforge.setCamera([0, 420, 1], [0, 0, 0]));
    await page.waitForTimeout(300);
    await page.getByTestId('tool-panel').click();
    await S(page, () => (window as any).__cutforge.store.getState().set({ panelPose: 'standing' }));
    await drag(page, await onFace(page, base, 70, 6), await onFace(page, base, 70, 84));
    await page.getByTestId('ghost-divider').click();
    await expect(page.getByTestId('divider-makes')).toHaveAttribute('data-kind', 'divider');
    await page.getByTestId('ghost-ok').click();
    const d = await S<any>(page, () => (window as any).__cutforge.store.getState().design);
    const divs = (Object.values(d.connections) as any[]).filter((c) => c.grown && c.a.panelId === base && c.offset > 6);
    expect(divs).toHaveLength(1);
    expect((await st(page)).tool).toBe('select');
  });
});
