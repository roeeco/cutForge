// Review screenshots (skipped unless SHOTS=1): SHOTS=1 npx playwright test -c pw-app.config.ts shots
import { test, type Page } from '@playwright/test';
const OUT = 'docs/polygon-shots';
const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
async function setup(page: Page, lang: string, mat: string) {
  await page.goto('/');
  await page.getByTestId(`mat-${mat}`).click();
  await page.getByTestId('start-go').click();
  await page.getByTestId('hints-dismiss').click();
  await S(page, (l: string) => (window as any).__cutforge.store.getState().setLang(l), lang);
}
async function hexTray(page: Page) {
  return S<string>(page, () => {
    const cf = (window as any).__cutforge;
    let base = '';
    cf.store.getState().apply((d: any) => {
      base = cf.ops.addPolygonPanel(d, 0, 0, cf.ops.regularPolygon(6, 70));
      for (const k of ['e0', 'e1', 'e2', 'e3', 'e4', 'e5']) cf.ops.growPanel(d, base, k, { height: 45, angle: 90, dir: 'up', kind: d.material.kind === 'plywood' ? 'finger' : 'fold' });
    });
    return base;
  });
}
for (const lang of ['en', 'he']) {
  test(`shots ${lang}`, async ({ page }) => {
    test.skip(!process.env.SHOTS);
    await setup(page, lang, 'ply-3');
    await page.keyboard.press('g');
    await page.getByTestId('poly-mode-ngon').click();
    await page.screenshot({ path: `${OUT}/${lang}-01-polygon-card.png` });
    await page.keyboard.press('Escape');
    const base = await hexTray(page);
    await page.getByTestId('fit-view').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${lang}-02-hex-ply-tray.png` });
    await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), base);
    await page.getByTestId('edit-outline').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${lang}-03-edit-outline.png` });
    await page.keyboard.press('Escape');
    // joint card for an angled corner
    const wall = await S<string>(page, () => { const d = (window as any).__cutforge.store.getState().design; return d.order[1]; });
    await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), wall);
    await page.locator('.collapse-head', { hasText: lang === 'en' ? 'Joints' : 'חיבורים' }).first().click().catch(() => undefined);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${lang}-04-angled-joint.png` });
  });
}

for (const lang of ['en', 'he']) {
  test(`shots shapes ${lang}`, async ({ page }) => {
    test.skip(!process.env.SHOTS);
    await setup(page, lang, 'ply-3');
    const base = await S<string>(page, () => {
      const cf = (window as any).__cutforge;
      let b = '';
      cf.store.getState().apply((d: any) => {
        b = cf.ops.addRootPanel(d, -80, 50, 160, 100);
        for (const e of [0, 1, 2, 3]) cf.ops.growPanel(d, b, e, { height: 45, angle: 90, dir: 'up', kind: 'finger' });
        cf.ops.addDetail(d, b, 'rect', 'cut', 80, 100, 30, 30);
        cf.ops.addDetail(d, b, 'circle', 'cut', 160, 0, 50, 50);
        cf.ops.addDetail(d, b, 'rect', 'add', -8, 50, 20, 30);
      });
      return b;
    });
    await page.getByTestId('fit-view').click();
    await page.waitForTimeout(400);
    await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), base);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${lang}-05-notches-3d.png` });
    await page.getByTestId('view-2d').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${lang}-06-notches-cutplan.png` });
  });
}

for (const lang of ['en', 'he']) {
  test(`shots trays ${lang}`, async ({ page }) => {
    test.skip(!process.env.SHOTS);
    await setup(page, lang, 'corr-4');
    const base = await S<string>(page, () => {
      const cf = (window as any).__cutforge;
      let b = '';
      cf.store.getState().apply((d: any) => void (b = cf.ops.addPolygonPanel(d, 0, 0, cf.ops.regularPolygon(6, 70))));
      return b;
    });
    await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), base);
    await page.getByTestId('extrude').click();
    await page.getByTestId('fit-view').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${lang}-07-extrude-ghost.png` });
    await page.getByTestId('extrude-go').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${lang}-08-corrugated-hex-tray.png` });
    // plywood L tray with an inside corner
    await page.getByTestId('project-menu').click().catch(() => undefined);
    await S(page, () => {
      const cf = (window as any).__cutforge;
      cf.store.getState().apply((d: any) => {
        for (const id of [...d.order]) cf.ops.deletePanel(d, id);
        d.material = { ...d.material, id: 'ply-3', kind: 'plywood', nameKey: 'mat.ply3', thickness: 3, kerf: 0.15, clearance: 0.1, foldAllowance: 0, grain: 'x' };
        const b = cf.ops.addRootPanel(d, -70, 50, 140, 100);
        cf.ops.addTray(d, b, 45);
        cf.ops.addDetail(d, b, 'rect', 'cut', 140, 100, 70, 50);
      });
    });
    await page.keyboard.press('Escape');
    await page.getByTestId('fit-view').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${lang}-09-ply-L-tray.png` });
  });
}

for (const lang of ['en', 'he']) {
  test(`shots gable ${lang}`, async ({ page }) => {
    test.skip(!process.env.SHOTS);
    await setup(page, lang, 'ply-3');
    const front = await S<string>(page, () => {
      const cf = (window as any).__cutforge;
      let f = '';
      cf.store.getState().apply((d: any) => {
        const b = cf.ops.addRootPanel(d, -70, 50, 140, 100);
        const ws = [0, 1, 2, 3].map((e: number) => cf.ops.growPanel(d, b, e, { height: 60, angle: 90, dir: 'up', kind: 'finger' }).panelId);
        f = ws[0];
        cf.ops.addWallInsert(d, ws[0], 'e2', 0.5, 35);
        cf.ops.addWallInsert(d, ws[2], 'e2', 0.5, 35);
        cf.ops.growPanel(d, ws[0], 'e2', { height: 100, angle: 90, dir: 'up', kind: 'finger' });
      });
      return f;
    });
    await page.getByTestId('fit-view').click();
    await page.waitForTimeout(400);
    await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), front);
    await page.getByTestId('edit-outline').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${lang}-10-gable-roof.png` });
  });
}

for (const lang of ['en', 'he']) {
  test(`shots through ${lang}`, async ({ page }) => {
    test.skip(!process.env.SHOTS);
    await setup(page, lang, 'ply-3');
    const cut = await S<string>(page, () => {
      const cf = (window as any).__cutforge;
      let id = '';
      cf.store.getState().apply((d: any) => {
        const b = cf.ops.addRootPanel(d, -70, 50, 140, 100);
        const ws = [0, 1, 2, 3].map((e: number) => cf.ops.growPanel(d, b, e, { height: 60, angle: 90, dir: 'up', kind: 'finger' }).panelId);
        id = cf.ops.addPolygonShape(d, ws[0], [{ x: -5, y: 65 }, { x: 30, y: 65 }, { x: 30, y: 60 }, { x: -5, y: 25 }], 'cut', undefined, undefined, true);
        cf.ops.addDivider(d, b, 3, 70, 30);
        cf.ops.addDetail(d, b, 'circle', 'cut', 70, 50, 16, 16, undefined, true);
      });
      return id;
    });
    await page.getByTestId('fit-view').click();
    await page.waitForTimeout(400);
    await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'detail', id, ids: [id] }), cut);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${lang}-11-through-chamfer.png` });
    await page.getByTestId('view-2d').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${lang}-12-through-cutplan.png` });
  });
}
