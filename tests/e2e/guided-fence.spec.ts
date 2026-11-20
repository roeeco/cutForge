// Guided stays apart from the other levels (milestones 105–106): Workshop and Quick build open on the
// sentence's welcome screen with none of Guided's parts, and a trip to Guided and back changes nothing.
import { expect, test } from '@playwright/test';
import { QUICK_STATE, WORKSHOP_STATE } from './util';

for (const [name, state] of [['Workshop', WORKSHOP_STATE], ['Quick build', QUICK_STATE]] as const) {
  test.describe(name, () => {
    test.use({ storageState: state });
    test('opens on the sentence welcome screen; no Guided part is loaded', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('/');
      await expect(page.getByTestId('material-dialog')).toBeVisible();
      await expect(page.getByTestId('sentence')).toBeVisible();
      await expect(page.getByTestId('g-start')).toHaveCount(0);
      await expect(page.getByTestId('g-topbar')).toHaveCount(0);
      // the switch offers the three levels (milestone 110); this one stays chosen
      await page.getByTestId('mat-ply-3').click();
      await page.getByTestId('start-sentence').click();
      await expect(page.getByTestId('view3d')).toBeVisible();
      await expect(page.getByTestId('mode-toggle')).toBeVisible();
      await expect(page.getByTestId(name === 'Workshop' ? 'mode-workshop' : 'mode-quick')).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('view-cluster')).toBeVisible();
      expect(errors).toEqual([]);
    });

    test('to Guided and back: the same design, and this level looks as it did', async ({ page }) => {
      await page.goto('/');
      await page.getByTestId('mat-ply-3').click();
      await page.getByTestId('start-sentence').click();
      await expect(page.getByTestId('view3d')).toBeVisible();
      const design = () => page.evaluate(() => JSON.stringify((window as any).__cutforge.store.getState().design));
      const before = await design();
      const back = name === 'Workshop' ? 'workshop' : 'quick';
      await page.getByTestId('mode-toggle').click();
    await page.getByTestId('mode-guided').click();
      await expect(page.getByTestId('g-topbar')).toBeVisible();
      await expect(page.getByTestId('view-cluster')).toHaveCount(0);
      await page.getByTestId('g-menu').click();
      await page.getByTestId(back === 'workshop' ? 'g-menu-workshop' : 'g-menu-quick').click();
      await expect(page.getByTestId('g-topbar')).toHaveCount(0);
      await expect(page.getByTestId(`mode-${back}`)).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('view-cluster')).toBeVisible();
      expect(await design()).toBe(before);
      // the welcome screen is still the sentence's
      await page.getByTestId('project-menu').click();
      await page.getByTestId('menu-designs').click();
      await expect(page.getByTestId('sentence')).toBeVisible();
      await expect(page.getByTestId('g-start')).toHaveCount(0);
    });
  });
}
