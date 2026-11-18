// Review screenshots for Quick build revised (LIDS_LINES_PROJECTS_PLAN.md, milestone 73), skipped unless SHOTS=1:
//   SHOTS=1 npx playwright test -c pw-app.config.ts lid-shots
import { test, type Page } from '@playwright/test';
import { QUICK_STATE } from './util';
const OUT = 'docs/lid-shots';
const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const shot = (page: Page, lang: string, name: string) => page.screenshot({ path: `${OUT}/${lang}-${name}.png` });
const pt = (page: Page, x: number, y: number, z: number) => S<{ x: number; y: number }>(page, (a: number[]) => (window as any).__cutforge.projectWorld(a[0], a[1], a[2]), [x, y, z]);
async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}
/** A Box of the kind chosen, dragged on the floor and ✓. */
async function box(page: Page, kind: 'open' | 'lid' | 'carton') {
  await page.getByTestId('quick-box').click();
  await page.getByTestId(`box-kind-${kind}`).click();
  await drag(page, await pt(page, -60, 0, -40), await pt(page, 60, 0, 40));
  await page.getByTestId('extrude-go').click();
  const base = await S<string>(page, () => (window as any).__cutforge.store.getState().design.order[0]);
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), base);
  await page.waitForTimeout(300);
}

test.use({ storageState: QUICK_STATE });

for (const lang of ['en', 'he']) {
  test(`quick build revised shots ${lang}`, async ({ page }) => {
    test.skip(!process.env.SHOTS);
    await page.goto('/');
    await page.getByTestId('mat-ply-3').click();
    await page.getByTestId('start-go').click();
    await S(page, (l: string) => (window as any).__cutforge.store.getState().setLang(l), lang);
    await S(page, () => (window as any).__cutforge.setCamera([170, 230, 280], [0, 20, 0]));
    await page.waitForTimeout(300);
    // the Box card: footprint and kind as pictures; a carton greyed on plywood, saying why
    await page.getByTestId('quick-box').click();
    // greyed (aria-disabled) but tappable: it says why
    await page.getByTestId('box-kind-carton').click({ force: true });
    await shot(page, lang, '73-box-card');
    await page.getByTestId('tool-select').click();
    // a plywood box with a lid: one drag and ✓
    await box(page, 'lid');
    await shot(page, lang, '73-box-with-lid');
    await page.getByTestId('lid-hinged').click();
    await page.waitForTimeout(300);
    await shot(page, lang, '73-lid-hinged-living');
    // Workshop: the same section, with Arched
    await S(page, () => (window as any).__cutforge.store.getState().setPrefs({ mode: 'workshop' }));
    await page.waitForTimeout(300);
    await shot(page, lang, '73-lid-workshop');
  });
  test(`quick build carton shots ${lang}`, async ({ page }) => {
    test.skip(!process.env.SHOTS);
    await page.goto('/');
    await page.getByTestId('mat-card-0.5').click();
    await page.getByTestId('start-go').click();
    await S(page, (l: string) => (window as any).__cutforge.store.getState().setLang(l), lang);
    await S(page, () => (window as any).__cutforge.setCamera([170, 230, 280], [0, 20, 0]));
    await page.waitForTimeout(300);
    // a card carton: its card has Lid and Bottom, no lists
    await box(page, 'carton');
    await shot(page, lang, '73-carton-card');
    // the cut plan: Use less board
    await page.getByTestId('view-2d').click();
    await page.waitForTimeout(300);
    await page.getByTestId('use-less').click();
    await page.waitForTimeout(300);
    await shot(page, lang, '73-use-less-board');
    await page.getByTestId('less-close').click();
    // the download dialog: no kerf choice, where the kerf is set
    await page.getByTestId('open-export').click();
    await page.waitForTimeout(300);
    await shot(page, lang, '73-download');
  });
}
