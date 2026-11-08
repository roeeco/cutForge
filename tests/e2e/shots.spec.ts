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
