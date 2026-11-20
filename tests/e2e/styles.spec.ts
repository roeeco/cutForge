// Milestone C1 (SENTENCE_STYLES_PLAN.md): named styles in the sentence's first word, and the same styles as cards.
import { test, expect, type Page } from '@playwright/test';

const design = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));
async function fresh(page: Page, lang: 'en' | 'he') {
  await page.goto('/');
  await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('cutforge'); q.onsuccess = q.onerror = q.onblocked = () => r(null); }));
  await page.evaluate((l) => (window as any).__cutforge.store.getState().setLang(l), lang);
  await page.goto('/');
  await expect(page.getByTestId('material-dialog')).toBeVisible();
}

for (const lang of ['en', 'he'] as const) {
  test(`the first word lists styles by group; a style fills in its words and names itself (${lang})`, async ({ page }) => {
    await fresh(page, lang);
    await page.getByTestId('mat-card-0.5').click();
    await page.getByTestId('sen-structure').click();
    const list = page.getByTestId('sen-structure-list');
    await expect(list.getByTestId('sen-structure-group').first()).toBeVisible();
    expect(await list.getByTestId('sen-structure-group').count()).toBeGreaterThanOrEqual(2);
    await list.getByTestId('sen-structure-opt-style:rte').click();
    await expect(page.getByTestId('sentence')).toHaveAttribute('data-structure', 'carton');
    await expect(page.getByTestId('sen-bottom')).toHaveAttribute('aria-label', /./);
    const word = await page.getByTestId('sen-structure').textContent();
    // a changed word names the style it now is
    await page.getByTestId('sen-bottom').click();
    await page.getByTestId('sen-bottom-opt-snap').click();
    await expect(page.getByTestId('sen-structure')).not.toHaveText(word!);
    await page.getByTestId('start-go').click();
    const d = await design(page);
    expect(d.template).toMatchObject({ id: 'carton', params: { top: 'tuck', bottom: 'snap' } });
  });

  test(`the card grid: the sentence by default, cards on the switch, a card fills the sentence, plywood hides cartons (${lang})`, async ({ page }) => {
    await fresh(page, lang);
    await page.getByTestId('mat-card-0.5').click();
    await expect(page.getByTestId('sentence')).toBeVisible();
    await expect(page.getByTestId('start-view-sentence')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('start-view-cards').click();
    await expect(page.getByTestId('style-cards')).toBeVisible();
    await expect(page.getByTestId('style-rte')).toBeVisible();
    await page.getByTestId('style-sealed').click();
    await expect(page.getByTestId('style-sealed')).toHaveAttribute('aria-checked', 'true');
    // the same choice in the sentence
    await page.getByTestId('start-view-sentence').click();
    await expect(page.getByTestId('sentence')).toHaveAttribute('data-structure', 'carton');
    await page.getByTestId('start-view-cards').click();
    // plywood: no cartons; the grid keeps what it can
    await page.getByTestId('mat-ply-3').click();
    await expect(page.getByTestId('style-trayLid')).toBeVisible();
    await expect(page.getByTestId('style-rte')).toHaveCount(0);
    await page.getByTestId('style-hexLid').click();
    await page.getByTestId('start-go').click();
    const d = await design(page);
    expect(d.template).toMatchObject({ id: 'box', params: { shape: 'poly', sides: 6, lid: 'liftoff' } });
    // the switch is remembered by this browser
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cutforge.viewPrefs')!).startView)).toBe('cards');
  });
}
