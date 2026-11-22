// Milestone 98 (SENTENCE_BUILDER_PLAN.md S5): the welcome screen's step 2 is Blank design or the sentence.
import { test, expect, type Page } from '@playwright/test';

const design = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));
const MATS = ['card-0.5', 'corr-1.6', 'corr-4', 'ply-3'];
/** The welcome screen in a browser with no saved design (a design started before would open instead). */
async function fresh(page: Page) {
  await page.goto('/');
  await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('cutforge'); q.onsuccess = q.onerror = q.onblocked = () => r(null); }));
  await page.goto('/');
  await expect(page.getByTestId('material-dialog')).toBeVisible();
}

test('Blank design still gives an empty design in each material', async ({ page }) => {
  for (const m of MATS) {
    await fresh(page);
    await page.getByTestId(`mat-${m}`).click();
    await page.getByTestId('start-go').click();
    const d = await design(page);
    expect(d.material.id).toBe(m);
    expect(d.order).toEqual([]);
  }
});

// milestone 185: one test per board (about seventy structures since milestones 171–184, each started on a fresh page)
for (const m of MATS)
test(`every structure the sentence lists starts, in every material that lists it (${m})`, async ({ page }) => {
  test.setTimeout(1_200_000);
  {
    await fresh(page);
    await page.getByTestId(`mat-${m}`).click();
    await page.getByTestId('sen-structure').click();
    await expect(page.getByTestId('sen-structure-list').locator('[role=option]').nth(1)).toBeVisible();
    const ids = await page.getByTestId('sen-structure-list').locator('[role=option]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.replace('sen-structure-opt-', '')));
    await page.keyboard.press('Escape');
    expect(ids.length).toBeGreaterThan(1);
    if (m === 'ply-3') expect(ids).not.toContain('carton');
    for (const id of ids) {
      await fresh(page);
      await page.getByTestId(`mat-${m}`).click();
      await page.getByTestId('sen-structure').click();
      await page.getByTestId(`sen-structure-opt-${id}`).click();
      // a named style (milestone C1) is a structure with some of its words set
      const want = await page.getByTestId('sentence').getAttribute('data-structure');
      if (!id.startsWith('style:')) expect(want).toBe(id);
      await page.getByTestId('start-sentence').click();
      const d = await design(page);
      expect(d.template?.id, `${id} on ${m}`).toBe(want);
      expect(d.material.id).toBe(m);
      expect(await page.evaluate(() => (window as any).__cutforge.issues().filter((k: string) => k !== 'val.split')), `${id} on ${m}`).toEqual([]);
    }
  }
});

test('a change of material after the sentence is filled in keeps what it can and notes the rest', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('mat-card-0.5').click();
  await page.getByTestId('sen-structure').click();
  // milestone 146: on card a carton at its own words is the snap-lock style, listed once under that name
  await expect(page.getByTestId('sen-structure-opt-carton')).toHaveCount(0);
  await page.getByTestId('sen-structure-opt-style:tuckSnap').click();
  await expect(page.getByTestId('sentence')).toHaveAttribute('data-structure', 'carton');
  await page.getByTestId('sen-width').fill('90');
  await page.getByTestId('sen-width').press('Enter');
  await expect(page.getByTestId('sen-width')).toHaveValue('90');
  await page.getByTestId('mat-ply-3').click();
  await expect(page.getByTestId('sentence')).toHaveAttribute('data-structure', 'box');
  await expect(page.getByTestId('sen-width')).toHaveValue('90');
  await expect(page.getByTestId('sen-clause-lid')).toBeVisible();
  await expect(page.getByTestId('sen-note')).toBeVisible();
  await page.getByTestId('start-sentence').click();
  const d = await design(page);
  expect(d.template.id).toBe('box');
  expect(d.template.params.lid).toBe('liftoff');
});
