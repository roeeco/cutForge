// Milestone 97 (SENTENCE_BUILDER_PLAN.md S4): the sentence on its own (`?sentence`, development only).
import { test, expect, type Page } from '@playwright/test';

async function open(page: Page, lang: 'en' | 'he', width = 1366) {
  await page.setViewportSize({ width, height: 860 });
  await page.goto('/?sentence');
  await expect(page.getByTestId('sentence')).toBeVisible();
  if (lang === 'he') await page.getByTestId('dev-lang').click();
  await expect(page.getByTestId('sen-out')).not.toHaveText(/Checking|בודקים/, { timeout: 15_000 });
}

for (const lang of ['en', 'he'] as const) {
  test(`every word can be chosen with the keyboard alone (${lang})`, async ({ page }) => {
    await open(page, lang);
    // the structure: Enter opens, arrows move, Enter picks
    await page.getByTestId('sen-structure').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('sen-structure-list')).toBeFocused({ timeout: 10_000 });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('sentence')).toHaveAttribute('data-structure', 'tray');
    // a number: typed and committed with Enter
    await page.getByTestId('sen-width').focus();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('140');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('sen-width')).toHaveValue('140');
    // an add-on through + more, with the keyboard
    await page.getByTestId('sen-more').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('sen-more-list')).toBeFocused({ timeout: 10_000 });
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('sen-clause-spacesBy')).toBeVisible({ timeout: 15_000 });
    // and removed with its ×
    await page.getByTestId('sen-remove-spacesBy').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('sen-clause-spacesBy')).toHaveCount(0);
  });

  test(`a narrower box lowers the space count and says so; a refused number shows its range (${lang})`, async ({ page }) => {
    await open(page, lang);
    await page.getByTestId('sen-more').click();
    await page.getByTestId('sen-more-opt-spacesBy').click();
    await expect(page.getByTestId('sen-nx')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('sen-nx').fill('12');
    await page.getByTestId('sen-nx').press('Enter');
    await expect(page.getByTestId('sen-nx')).toHaveValue('12', { timeout: 15_000 });
    await page.getByTestId('sen-width').fill('60');
    await page.getByTestId('sen-width').press('Enter');
    await expect(page.getByTestId('sen-nx')).not.toHaveValue('12', { timeout: 20_000 });
    await expect(page.getByTestId('sen-note')).toBeVisible();
    await expect(page.getByTestId('sen-live')).not.toBeEmpty();
    // past its end: refused, the range shown, the value kept
    const before = await page.getByTestId('sen-nx').inputValue();
    await page.getByTestId('sen-nx').fill('40');
    await page.getByTestId('sen-nx').press('Enter');
    await expect(page.getByTestId('sen-nx-why')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('sen-nx')).toHaveValue(before);
  });
}

test('the narrow layout shows the same words as rows', async ({ page }) => {
  await open(page, 'en', 375);
  await expect(page.locator('.sentence.narrow')).toBeVisible();
  await expect(page.getByTestId('sen-width')).toHaveValue('160');
  await expect(page.getByTestId('sen-structure')).toBeVisible();
  await page.getByTestId('sen-depth').fill('90');
  await page.getByTestId('sen-depth').press('Enter');
  await expect(page.getByTestId('sen-depth')).toHaveValue('90');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
