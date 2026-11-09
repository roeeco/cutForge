// Review screenshots for milestones 21–24 (skipped unless SHOTS=1):
//   SHOTS=1 npx playwright test -c pw-app.config.ts gizmo-shots
import { test, type Page } from '@playwright/test';
const OUT = 'docs/gizmo-shots';
const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
async function setup(page: Page, lang: string, mat: string) {
  await page.goto('/');
  await page.getByTestId(`mat-${mat}`).click();
  await page.getByTestId('start-go').click();
  await page.getByTestId('hints-dismiss').click();
  await S(page, (l: string) => (window as any).__cutforge.store.getState().setLang(l), lang);
}

for (const lang of ['en', 'he']) {
  test(`gizmo shots ${lang}`, async ({ page }) => {
    test.skip(!process.env.SHOTS);
    await setup(page, lang, 'corr-1.6');
    await S(page, () => {
      const cf = (window as any).__cutforge;
      cf.store.getState().apply((d: any) => {
        const b = cf.ops.addRootPanel(d, -40, 30, 80, 60);
        for (const e of [0, 1, 2, 3]) cf.ops.growPanel(d, b, e, { height: 40, angle: 90, dir: 'up', kind: 'fold' });
        cf.ops.setAllJoints(d, 'corner', 'glue');
      });
      cf.store.getState().select(null);
    });
    await page.getByTestId('fit-view').click();
    await page.waitForTimeout(400);
    // milestone 24: the settings card (joints changed by the corner list)
    await page.getByTestId('joints-corner').selectOption('tabslot');
    await page.getByTestId('joints-corner').selectOption('glue');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${lang}-24-settings-card.png` });
    // milestone 22: glue flaps half folded, turning with their own walls
    await S(page, () => (window as any).__cutforge.store.getState().set({ foldT: 0.55 }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${lang}-22-flaps-half-folded.png` });
    // the snapping toggles at the bottom of the settings card
    await S(page, () => (window as any).__cutforge.store.getState().set({ foldT: 1 }));
    await page.getByTestId('settings-snapping').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${lang}-25-snapping-toggles.png` });
  });

  test(`outline curve shots ${lang}`, async ({ page }) => {
    test.skip(!process.env.SHOTS);
    await setup(page, lang, 'ply-3');
    await S(page, () => {
      const cf = (window as any).__cutforge;
      let id = '';
      cf.store.getState().apply((d: any) => {
        id = cf.ops.addRootPanel(d, -60, 40, 120, 80);
        cf.ops.setPointCurve(d, id, 2, true);
        cf.ops.growPanel(d, id, 'e0', { height: 50, angle: 90, dir: 'up', kind: 'finger' });
      });
      cf.store.getState().select({ kind: 'panel', id });
      cf.store.getState().set({ editOutline: id, selVertex: 2 });
      cf.setCamera([0, 260, 160], [0, 0, 0]);
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${lang}-25-curve-point.png` });
  });
}
