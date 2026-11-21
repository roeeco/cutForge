// Milestone 159 (PRESETS_OVERHAUL.md §7): the overhaul's after pictures, made the same way as
// docs/preset-shots/before/. Only with SHOTS=after (`npm run preset-after`): each board's contact sheet in English and
// Hebrew, the sentence's first-word list in card (as `before/sentence-list-card.png`) in both languages, and a tuck
// carton just started on the stage (as `before/stage-after-start.png`), written to docs/preset-shots/after/.
import { test, expect, type Page } from '@playwright/test';

const BOARDS = ['card-0.5', 'corr-1.6', 'corr-4', 'ply-3'];
const OUT = 'docs/preset-shots/after';

test.skip(process.env.SHOTS !== 'after', 'writes the after pictures only when asked (SHOTS=after)');

async function language(page: Page, lang: 'en' | 'he') {
  await page.goto('/');
  await page.evaluate((l) => localStorage.setItem('cutforge.lang', l), lang);
}

test('the after pictures, in English and Hebrew', async ({ page }) => {
  test.setTimeout(600_000);
  for (const lang of ['en', 'he'] as const) {
    await language(page, lang);
    await page.setViewportSize({ width: 1340, height: 900 });
    for (const mat of BOARDS) {
      await page.goto(`/?presets&mat=${mat}`);
      await expect(page.getByTestId('presets-dev')).toHaveAttribute('data-ready', '1', { timeout: 120_000 });
      await page.screenshot({ path: `${OUT}/sheet-${mat}-${lang}.png`, fullPage: true });
    }
    // the sentence's first-word list, in card
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/');
    await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('cutforge'); q.onsuccess = q.onerror = q.onblocked = () => r(null); }));
    await page.goto('/');
    await expect(page.getByTestId('material-dialog')).toBeVisible();
    await page.getByTestId('mat-card-0.5').click();
    await page.getByTestId('sen-structure').click();
    const list = page.getByTestId('sen-structure-list');
    await expect(list.locator('[role=option]').nth(1)).toBeVisible();
    await page.waitForTimeout(1500);
    await list.screenshot({ path: `${OUT}/sentence-list-card-${lang}.png` });
  }
  // a tuck carton just started, on the stage
  await language(page, 'en');
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__cutforge?.stage);
  await page.evaluate(async () => {
    const at = (p: string) => import(p);
    const reg = await at('/src/templates/registry.ts');
    const st = await at('/src/templates/styles.ts');
    const mats = await at('/src/model/materials.ts');
    const m = mats.MATERIALS.find((x: { id: string }) => x.id === 'card-0.5');
    const r = st.chooseStyle(st.styleById('tuckSnap'), m, reg.defaults(reg.templateById('box')), reg.templateById);
    (window as any).__cutforge.store.getState().replaceDesign(reg.generate(reg.templateById(r.id), m, r.params), false);
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/stage-after-start.png` });
});
