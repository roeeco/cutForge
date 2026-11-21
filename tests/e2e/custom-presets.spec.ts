// Milestone 158: custom presets in the app. In Workshop the open box is a record: its corners made gussets from the
// slot's pictures; a tube refused on plywood says why; *Save as preset* keeps it, and the start screen offers it as a
// card of its own that opens as the same record.
import { test, expect, type Page } from '@playwright/test';

async function start(page: Page, mat: string, words: Record<string, unknown> = {}) {
  await page.evaluate(
    async ({ mat, words }) => {
      const at = (p: string) => import(p);
      const reg = await at('/src/templates/registry.ts');
      const mats = await at('/src/model/materials.ts');
      const m = mats.MATERIALS.find((x: { id: string }) => x.id === mat);
      const box = reg.templateById('box');
      (window as any).__cutforge.store.getState().replaceDesign(reg.generate(box, m, { ...reg.defaults(box), ...words }), false);
    },
    { mat, words },
  );
  const head = page.getByTestId('settings-head-preset');
  await expect(head).toBeVisible({ timeout: 15_000 });
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
  await expect(page.getByTestId('preset-editor')).toBeVisible();
}

test('a box made a preset of its own, saved, and started again from the start screen', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__cutforge);
  await start(page, 'card-0.5');
  // the catalogue names it: an open box, already a preset
  await expect(page.getByTestId('preset-name')).toHaveAttribute('data-same', 'true');
  await page.getByTestId('preset-head-corner').click();
  const gusset = page.getByTestId('preset-opt-corner-gusset');
  await expect(gusset).toHaveAttribute('data-ok', 'true', { timeout: 30_000 });
  await gusset.click();
  await expect(gusset).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
  const kinds = await page.evaluate(() => Object.values((window as any).__cutforge.store.getState().design.connections as Record<string, { grown: boolean; kind: string; trayId?: string }>).filter((c) => !c.grown && c.trayId).map((c) => c.kind));
  expect(new Set(kinds)).toEqual(new Set(['gusset']));
  // a preset of its own now: it can be saved
  await expect(page.getByTestId('preset-name')).toHaveAttribute('data-same', 'false');
  await page.getByTestId('preset-name-input').fill('Gusset tray');
  await page.getByTestId('preset-save').click();
  await expect(page.getByTestId('preset-saved')).toContainText('Gusset tray');
  // the start screen offers it, and it opens as the same record
  await page.evaluate(() => (window as any).__cutforge.store.getState().replaceDesign((window as any).__cutforge.store.getState().design, true));
  await page.evaluate(() => (window as any).__cutforge.store.setState({ needsMaterial: true }));
  await expect(page.getByTestId('my-presets')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('mat-card-0.5').click();
  await page.getByTestId('my-preset-open-0').click();
  await expect.poll(() => page.evaluate(() => (window as any).__cutforge.store.getState().design.name)).toBe('Gusset tray');
  const corner = await page.evaluate(() => Object.values((window as any).__cutforge.store.getState().design.trays as Record<string, { cornerKind: string }>)[0].cornerKind);
  expect(corner).toBe('gusset');
});

test('a choice the engine refuses says why', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__cutforge);
  await start(page, 'ply-3');
  const tube = page.getByTestId('preset-opt-body-tube');
  await expect(tube).toHaveAttribute('data-ok', 'false', { timeout: 30_000 });
  // greyed (aria-disabled), still clickable: it says why
  await tube.click({ force: true });
  await expect(page.getByTestId('preset-why')).toContainText('folds');
  // the design is unchanged
  expect(await page.evaluate(() => (window as any).__cutforge.store.getState().design.template.id)).toBe('box');
});
