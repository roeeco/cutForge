// Review screenshots for milestones 15–20 (skipped unless SHOTS=1):
//   SHOTS=1 npx playwright test -c pw-app.config.ts refine-shots
import { test, type Page } from '@playwright/test';
const OUT = 'docs/refine-shots';
const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const panelPt = (page: Page, id: string, x: number, y: number) => S<{ x: number; y: number }>(page, ([i, a, b]: [string, number, number]) => (window as any).__cutforge.project(i, a, b), [id, x, y]);
async function setup(page: Page, lang: string, mat: string) {
  await page.goto('/');
  await page.getByTestId(`mat-${mat}`).click();
  await page.getByTestId('start-go').click();
  await page.getByTestId('hints-dismiss').click();
  await S(page, (l: string) => (window as any).__cutforge.store.getState().setLang(l), lang);
}

for (const lang of ['en', 'he']) {
  test(`refine shots m15 ${lang}`, async ({ page }) => {
    test.skip(!process.env.SHOTS);
    await setup(page, lang, 'card-0.5');
    const wall = await S<string>(page, () => {
      const cf = (window as any).__cutforge;
      let w = '';
      cf.store.getState().apply((d: any) => {
        const b = cf.ops.addRootPanel(d, -60, 40, 120, 80);
        cf.ops.addTray(d, b, 50);
        w = d.order[1];
      });
      return w;
    });
    await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), wall);
    await page.getByTestId('fit-view').click();
    await page.waitForTimeout(400);
    const d = await S<any>(page, () => (window as any).__cutforge.store.getState().design);
    const p = d.panels[wall];
    const at = await panelPt(page, wall, p.w * 0.2, p.h);
    await page.mouse.move(at.x, at.y, { steps: 3 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${lang}-15-grow-pill-and-fold-bar.png` });
  });
}

for (const lang of ['en', 'he']) {
  test(`refine shots m17 ${lang}`, async ({ page }) => {
    test.skip(!process.env.SHOTS);
    await setup(page, lang, 'ply-3');
    const ids = await S<any>(page, () => {
      const cf = (window as any).__cutforge;
      const out: any = {};
      cf.store.getState().apply((d: any) => {
        out.base = cf.ops.addRootPanel(d, -60, 40, 120, 80);
        out.wall = cf.ops.growPanel(d, out.base, 'e0', { height: 70, angle: 90, dir: 'up', kind: 'finger' }).panelId;
        out.shape = cf.ops.addDetail(d, out.wall, 'roundrect', 'cut', 60, 35, 34, 16);
        cf.ops.updateDetail(d, out.shape, { r: 4, rot: 30 });
      });
      cf.store.getState().select({ kind: 'detail', id: out.shape, ids: [out.shape] });
      return out;
    });
    await page.getByTestId('fit-view').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${lang}-17-shape-gizmo.png` });
    await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), ids.base);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${lang}-17-floor-gizmo.png` });
  });
}

for (const lang of ['en', 'he']) {
  test(`refine shots m18 ${lang}`, async ({ page }) => {
    test.skip(!process.env.SHOTS);
    await setup(page, lang, 'ply-3');
    const ids = await S<any>(page, () => {
      const cf = (window as any).__cutforge;
      const out: any = {};
      cf.store.getState().apply((d: any) => {
        out.base = cf.ops.addRootPanel(d, -80, 55, 160, 110);
        out.walls = [0, 1, 2, 3].map((e: number) => cf.ops.growPanel(d, out.base, e, { height: 50, angle: 90, dir: 'up', kind: 'finger' }).panelId);
        cf.ops.setDividerSet(d, out.base, { across: 2, along: 1 });
      });
      cf.store.getState().select({ kind: 'panel', id: out.base });
      return out;
    });
    await page.getByTestId('fit-view').click();
    await page.waitForTimeout(300);
    await page.getByTestId('div-toggle').click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${lang}-18-divider-set-card.png` });
    const set = await S<string>(page, () => Object.keys((window as any).__cutforge.store.getState().design.dividerSets)[0]);
    await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), `${set}/a1`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${lang}-18-divider-slide.png` });
    await S(page, (w: string[]) => {
      const cf = (window as any).__cutforge;
      const d = cf.store.getState().design;
      const pick = (id: string, k: number) => {
        const p = d.panels[id];
        const f = p.frame, t = d.material.thickness;
        const m = [f.u[1] * f.v[2] - f.u[2] * f.v[1], f.u[2] * f.v[0] - f.u[0] * f.v[2], f.u[0] * f.v[1] - f.u[1] * f.v[0]].map((x: number) => x * f.side);
        const x = p.w * k, y = p.h * 0.85;
        return { panelId: id, side: 1, point: [0, 1, 2].map((i) => f.o[i] + f.u[i] * x + f.v[i] * y + m[i] * t) };
      };
      cf.store.getState().select(null);
      cf.store.getState().set({ facePick: [pick(w[3], 0.3), pick(w[0], 0.3)] });
    }, ids.walls);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${lang}-18-between-refused.png` });
  });
}

for (const lang of ['en', 'he']) {
  test(`refine shots m19 ${lang}`, async ({ page }) => {
    test.skip(!process.env.SHOTS);
    await setup(page, lang, 'ply-3');
    await S(page, () => {
      const cf = (window as any).__cutforge;
      const out: any = {};
      cf.store.getState().apply((x: any) => {
        out.base = cf.ops.addRootPanel(x, -60, 40, 120, 80);
        out.front = cf.ops.growPanel(x, out.base, 'e0', { height: 40, angle: 90, dir: 'up', kind: 'finger' }).panelId;
        out.back = cf.ops.growPanel(x, out.base, 'e2', { height: 80, angle: 90, dir: 'up', kind: 'finger' }).panelId;
      });
      cf.store.getState().apply((x: any) => {
        const a = 90 - (Math.atan2(40, 80) * 180) / Math.PI;
        cf.ops.growPanel(x, out.back, 'e2', { height: Math.hypot(80, 40), angle: a, dir: 'up', kind: 'lean' });
      });
      cf.store.getState().select({ kind: 'edge', panelId: out.base, edge: 'e1' });
      cf.store.getState().setGrow({ angle: 90, height: 110 });
    });
    await page.getByTestId('fit-view').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${lang}-19-adapted-gable-ghost.png` });
    await S(page, () => (window as any).__cutforge.store.getState().setGrow({ span: [10, 60] }));
    await page.getByTestId('grow-edit-outline').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${lang}-19-span-and-outline.png` });
  });
}
