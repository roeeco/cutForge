// Milestone 151: the design card's variant switch. A reverse tuck carton's card shows the other tuck cartons as
// pictures; picking the snap-lock makes the design one, in one undo step.
import { test, expect } from '@playwright/test';

test('a carton changes to another of its kind from the design card', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__cutforge);
  await page.evaluate(async () => {
    // the dev server's modules (a path in a variable: the type checker does not look for it)
    const at = (p: string) => import(p);
    const reg = await at('/src/templates/registry.ts');
    const st = await at('/src/templates/styles.ts');
    const mats = await at('/src/model/materials.ts');
    const m = mats.MATERIALS.find((x: { id: string }) => x.id === 'card-0.5');
    const box = reg.defaults(reg.templateById('box'));
    const r = st.chooseStyle(st.styleById('rte'), m, box, reg.templateById);
    (window as any).__cutforge.store.getState().replaceDesign(reg.generate(reg.templateById(r.id), m, r.params), false);
  });
  const head = page.getByTestId('settings-head-template');
  await expect(head).toBeVisible({ timeout: 15_000 });
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
  const sw = page.getByTestId('variant-switch');
  await expect(sw).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('variant-rte')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('variant-tuckSnap').click();
  await expect(page.getByTestId('variant-tuckSnap')).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 });
  const bottom = await page.evaluate(() => (window as any).__cutforge.store.getState().design.template.params.bottom);
  expect(bottom).toBe('snap');
  // one undo step back to the reverse tuck
  await page.evaluate(() => (window as any).__cutforge.store.getState().undo());
  await expect(page.getByTestId('variant-rte')).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 });
});
