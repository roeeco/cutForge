// Review screenshots for milestones 28–36 (skipped unless SHOTS=1):
//   SHOTS=1 npx playwright test -c pw-app.config.ts panel-shots
import { test, type Page } from '@playwright/test';
const OUT = 'docs/panel-shots';
const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
async function setup(page: Page, lang: string, mat: string) {
  await page.goto('/');
  await page.getByTestId(`mat-${mat}`).click();
  await page.getByTestId('start-go').click();
  await page.getByTestId('hints-dismiss').click();
  await S(page, (l: string) => (window as any).__cutforge.store.getState().setLang(l), lang);
}
const shot = (page: Page, lang: string, name: string) => page.screenshot({ path: `${OUT}/${lang}-${name}.png` });
const proj = (page: Page, id: string, x: number, y: number) => S<{ x: number; y: number }>(page, (a: any) => (window as any).__cutforge.projectFace(a.id, a.x, a.y, 1), { id, x, y });
async function box(page: Page, kind = 'finger') {
  return S<{ base: string; walls: string[] }>(page, (k: string) => {
    const cf = (window as any).__cutforge;
    let out: any;
    cf.store.getState().apply((d: any) => {
      const b = cf.ops.addRootPanel(d, -60, 45, 120, 90);
      const walls = [0, 1, 2, 3].map((e) => cf.ops.growPanel(d, b, e, { height: 45, angle: 90, dir: 'up', kind: k }).panelId);
      cf.ops.autoConnect(d);
      out = { base: b, walls };
    });
    cf.store.getState().select(null);
    return out;
  }, kind);
}

for (const lang of ['en', 'he']) {
  test(`panels and dividers shots ${lang}`, async ({ page }) => {
    test.skip(!process.env.SHOTS);
    await setup(page, lang, 'ply-3');
    const { base, walls } = await box(page);
    await S(page, () => (window as any).__cutforge.setCamera([0, 230, 200], [0, 15, -10]));
    await page.waitForTimeout(400);
    // milestones 29, 42: a flat board on a wall's inner face, as a ghost while it is drawn (release makes it)
    await page.getByTestId('tool-panel').click();
    await shot(page, lang, '42-rail-flyout-out');
    const back = walls[2];
    const a = await proj(page, back, 30, 12), b = await proj(page, back, 80, 36);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.waitForTimeout(250);
    await shot(page, lang, '29-flat-on-wall-ghost');
    await page.mouse.up();
    // a standing partition from wall to wall (seen from above, so the line is drawn on the base): perpendicular on, it is a divider
    await S(page, () => (window as any).__cutforge.setCamera([0, 320, 110], [0, 0, 0]));
    await page.waitForTimeout(300);
    await page.getByTestId('tool-panel').click();
    await page.getByTestId('tool-panel-standing').click();
    await shot(page, lang, '42-rail-flyout-pressed');
    const c = await proj(page, base, 3.8, 30), e = await proj(page, base, 116.2, 30);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(e.x, e.y, { steps: 6 });
    await page.waitForTimeout(250);
    await shot(page, lang, '29-standing-partition-ghost');
    await page.mouse.up();
    await page.waitForTimeout(250);
    await S(page, () => (window as any).__cutforge.setCamera([0, 230, 200], [0, 15, -10]));
    await page.waitForTimeout(300);
    await shot(page, lang, '29-standing-partition');
    // milestone 32: + Divider between two walls
    await S(page, (w: string[]) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id: w[1], ids: [w[3], w[1]] }), walls);
    await page.waitForTimeout(300);
    await shot(page, lang, '32-add-divider');
    // milestone 33: a paste following the pointer
    await S(page, (bid: string) => {
      const cf = (window as any).__cutforge;
      let ids: string[] = [];
      cf.store.getState().apply((d: any) => void (ids = [cf.ops.addDetail(d, bid, 'circle', 'cut', 20, 70, 10, 10), cf.ops.addDetail(d, bid, 'circle', 'cut', 35, 70, 10, 10)]));
      cf.store.getState().select({ kind: 'detail', id: ids[1], ids });
    }, base);
    await page.keyboard.press('ControlOrMeta+c');
    const f = await proj(page, back, 90, 25);
    await page.mouse.move(f.x, f.y, { steps: 3 });
    await page.keyboard.press('ControlOrMeta+v');
    await page.mouse.move(f.x + 4, f.y, { steps: 2 });
    await page.waitForTimeout(250);
    await shot(page, lang, '33-paste-ghost');
    await page.keyboard.press('Escape');
  });

  test(`construction and arranging shots ${lang}`, async ({ page }) => {
    test.skip(!process.env.SHOTS);
    await setup(page, lang, 'ply-3');
    const ids = await S<any>(page, () => {
      const cf = (window as any).__cutforge;
      const out: any = {};
      cf.store.getState().apply((d: any) => {
        out.guide = cf.ops.addRootPanel(d, -150, 60, 120, 90);
        cf.ops.setConstruction(d, out.guide, true);
        out.on = cf.ops.addPlacedPanel(d, { host: out.guide, face: 1, x: 30, y: 20, rot: 0, pose: 'standing' }, 60, 30);
        out.boards = [cf.ops.addRootPanel(d, 30, 40, 40, 30), cf.ops.addRootPanel(d, 90, 10, 25, 50), cf.ops.addRootPanel(d, 140, 30, 35, 35)];
      });
      cf.store.getState().select({ kind: 'panel', id: out.on });
      return out;
    });
    await page.getByTestId('fit-view').click();
    await page.waitForTimeout(400);
    await shot(page, lang, '28-construction-with-panel');
    await S(page, (b: string[]) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id: b[2], ids: b }), ids.boards);
    await page.getByTestId('panel-align-top').click();
    await page.getByTestId('panel-dist-hgap').click();
    await page.waitForTimeout(300);
    await shot(page, lang, '31-aligned-boards');
  });

  test(`flat nets shots ${lang}`, async ({ page }) => {
    test.skip(!process.env.SHOTS);
    await setup(page, lang, 'card-0.5');
    const b = await S<string>(page, () => {
      const cf = (window as any).__cutforge;
      let id = '';
      cf.store.getState().apply((d: any) => {
        id = cf.ops.addRootPanel(d, -60, 60, 100, 100);
        const L = [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 60 }, { x: 60, y: 60 }, { x: 60, y: 120 }, { x: 0, y: 120 }];
        d.panels[id].sketch = { kind: 'poly', pts: L, edgeIds: L.map((_: unknown, i: number) => `e${i}`) };
        cf.ops.solve(d);
      });
      cf.store.getState().select({ kind: 'panel', id });
      return id;
    });
    await page.getByTestId('fit-view').click();
    await page.waitForTimeout(300);
    await page.getByTestId('extrude').click();
    // from the front right, so the wall at the inside corner can be seen
    await S(page, () => (window as any).__cutforge.setCamera([190, 170, 170], [0, 20, 0]));
    await page.waitForTimeout(400);
    await shot(page, lang, '35-flat-height-tick');
    const h = page.getByTestId('extrude-height');
    await h.click();
    await h.press('ControlOrMeta+a');
    await h.pressSequentially('80');
    await h.press('Enter');
    await page.waitForTimeout(400);
    await shot(page, lang, '35-amber-wall-note');
    await h.click();
    await h.press('ControlOrMeta+a');
    await h.pressSequentially('35');
    await h.press('Enter');
    await page.getByTestId('extrude-go').click();
    await S(page, () => (window as any).__cutforge.store.getState().set({ foldT: 0.45 }));
    await page.waitForTimeout(400);
    await shot(page, lang, '35-hinged-wall-folding');
    await S(page, () => (window as any).__cutforge.store.getState().set({ foldT: 1 }));
    // Cmd/Ctrl-drag on an edge of a fresh base
    const p2 = await S<string>(page, () => {
      const cf = (window as any).__cutforge;
      let id = '';
      cf.store.getState().apply((d: any) => void (id = cf.ops.addRootPanel(d, 120, 60, 120, 80)));
      cf.store.getState().select(null);
      return id;
    });
    await S(page, () => (window as any).__cutforge.setCamera([180, 200, 220], [180, 0, 20]));
    await page.waitForTimeout(300);
    const mid = await proj(page, p2, 60, 40);
    await page.mouse.move(mid.x, mid.y);
    const s0 = await proj(page, p2, 40, 0), s1 = await proj(page, p2, 60, 0);
    await page.mouse.move(s0.x, s0.y, { steps: 3 });
    await page.keyboard.down('Control');
    await page.mouse.down();
    await page.mouse.move(s1.x, s1.y, { steps: 6 });
    await page.waitForTimeout(250);
    await shot(page, lang, '35-ctrl-drag-edge');
    await page.mouse.up();
    await page.keyboard.up('Control');
    void b;
  });

  test(`board materials shots ${lang}`, async ({ page }) => {
    test.skip(!process.env.SHOTS);
    await setup(page, lang, 'ply-3');
    const { walls } = await box(page);
    await S(page, (w: string[]) => {
      const cf = (window as any).__cutforge;
      const m = cf.store.getState().design.material;
      cf.store.getState().apply((d: any) => {
        cf.ops.setPanelMaterial(d, [w[0]], { ...m, id: 'ply-6mm', nameKey: 'ply-6mm', thickness: 6 });
        cf.ops.setPanelMaterial(d, [w[1]], { id: 'corr-4', kind: 'corrugated', nameKey: 'mat.corr4', thickness: 4, kerf: 0.25, clearance: 0.3, foldAllowance: 5, sheetW: 600, sheetH: 400, grain: 'y' });
      });
      cf.store.getState().select({ kind: 'panel', id: w[1] });
    }, walls);
    await page.getByTestId('fit-view').click();
    await page.waitForTimeout(400);
    await shot(page, lang, '36-mixed-material-box');
    await page.getByTestId('board-material').focus();
    await shot(page, lang, '36-board-card-material');
    await S(page, () => (window as any).__cutforge.store.getState().select(null));
    await page.waitForTimeout(200);
    await page.locator('[data-testid=material-legend]').screenshot({ path: `${OUT}/${lang}-36-legend.png` });
    await page.getByTestId('view-2d').click();
    await page.waitForTimeout(500);
    await shot(page, lang, '36-cut-plan-two-materials');
  });
}
