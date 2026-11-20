// Milestone 99 (SENTENCE_BUILDER_PLAN.md S6): after Start, the preset card follows the sentence's rules.
import { test, expect, type Page } from '@playwright/test';
import { setNum } from './util';

const design = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));

test('the card hides what does not apply, says what a change dropped, and refuses past the end', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('cutforge'); q.onsuccess = q.onerror = q.onblocked = () => r(null); }));
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('sen-more').click();
  await page.getByTestId('sen-more-opt-spacesBy').click();
  await expect(page.getByTestId('sen-nx')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('sen-nx').fill('12');
  await page.getByTestId('sen-nx').press('Enter');
  await expect(page.getByTestId('sen-nx')).toHaveValue('12', { timeout: 15_000 });
  await page.getByTestId('start-sentence').click();
  let d = await design(page);
  expect(d.template.params.nx).toBe(12);
  await expect(page.getByTestId('template-section')).toBeVisible();
  // words a count does not use are not on the card
  await expect(page.getByTestId('tp-sx')).toHaveCount(0);
  await expect(page.getByTestId('tp-sides')).toHaveCount(0);
  // a narrower box: fewer spaces, and the card says so
  await setNum(page, 'tp-width', '60');
  await expect(page.getByTestId('template-notes')).toBeVisible({ timeout: 15_000 });
  d = await design(page);
  expect(d.template.params.width).toBe(60);
  expect(d.template.params.nx).toBeLessThan(12);
  // past its end: refused, with the range
  // (the field's own bound is 11, ten dividers; the box holds fewer)
  await page.getByTestId('tp-nx').click();
  await page.getByTestId('tp-nx').press('ControlOrMeta+a');
  await page.getByTestId('tp-nx').pressSequentially('20');
  await page.getByTestId('tp-nx').press('Enter');
  await expect(page.getByTestId('template-refused')).toBeVisible({ timeout: 15_000 });
  expect((await design(page)).template.params.nx).toBe(d.template.params.nx);
});
