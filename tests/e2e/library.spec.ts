import { answerDialog } from './util';
// Milestone 86 (LIDS_LINES_PROJECTS_PLAN.md §7.1, §8): designs kept in the browser, and two tabs on one design.
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
async function make(page: Page, name: string) {
  await S(page, (n: string) => {
    const cf = (window as any).__cutforge;
    cf.store.getState().apply((d: any) => {
      d.name = n;
      cf.ops.addRootPanel(d, -50, 30, 100, 60);
    });
  }, name);
  await page.waitForTimeout(900); // the autosave
}

test('New keeps the open design; Your designs lists both, opens, duplicates, deletes and restores', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('start-go').click();
  await make(page, 'Box A');
  await page.getByTestId('project-menu').click();
  await page.getByTestId('new-design').click();
  await expect(page.getByTestId('library')).toBeVisible();
  await expect(page.getByTestId('lib-card-0')).toContainText('Box A');
  await page.getByTestId('mat-card-0.5').click();
  await page.getByTestId('start-go').click();
  await make(page, 'Box B');
  await page.getByTestId('project-menu').click();
  await page.getByTestId('menu-designs').click();
  await expect(page.locator('[data-testid^="lib-card-"]')).toHaveCount(2);
  await expect(page.getByTestId('lib-card-0')).toContainText('Box B');
  // open the older one
  await page.getByTestId('lib-open-1').click();
  await expect(page.getByTestId('library')).toHaveCount(0);
  expect(await S<string>(page, () => (window as any).__cutforge.store.getState().design.name)).toBe('Box A');
  // duplicate, rename, delete and restore from the library
  await page.getByTestId('project-menu').click();
  await page.getByTestId('menu-designs').click();
  await page.getByTestId('lib-duplicate-0').click();
  await expect(page.locator('[data-testid^="lib-card-"]')).toHaveCount(3);
  const copy = page.locator('.lib-card', { hasText: '(copy)' });
  await copy.locator('[data-testid^="lib-rename-"]').click();
  await answerDialog(page, { text: 'Renamed' });
  await expect(page.locator('.lib-card', { hasText: 'Renamed' })).toHaveCount(1);
  // the open design cannot be deleted; the renamed copy can
  await expect(page.locator('.lib-card', { hasText: 'Box A' }).locator('[data-testid^="lib-delete-"]')).toHaveCount(0);
  await page.locator('.lib-card', { hasText: 'Renamed' }).locator('[data-testid^="lib-delete-"]').click();
  await expect(page.locator('[data-testid^="lib-card-"]')).toHaveCount(2);
  await page.getByTestId('lib-deleted-toggle').click();
  await page.getByTestId('lib-restore-0').click();
  await expect(page.locator('[data-testid^="lib-card-"]')).toHaveCount(3);
  await page.screenshot({ path: test.info().outputPath('library.png') });
  await page.getByTestId('lib-back').click();
  // a reload opens the design that was open
  await page.reload();
  await expect.poll(() => S<string>(page, () => (window as any).__cutforge?.store.getState().design.name)).toBe('Box A');
  expect(errors).toEqual([]);
});

test('a design changed in another tab is not overwritten: Reload or Keep mine', async ({ page, context }) => {
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('start-go').click();
  await make(page, 'Shared');
  const other = await context.newPage();
  await other.goto('/');
  await expect.poll(() => S<string>(other, () => (window as any).__cutforge?.store.getState().design.name)).toBe('Shared');
  await S(other, () => (window as any).__cutforge.store.getState().apply((d: any) => void (d.name = 'Changed there')));
  await expect(page.getByTestId('other-tab')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('other-tab-reload').click();
  await expect(page.getByTestId('other-tab')).toHaveCount(0);
  await expect.poll(() => S<string>(page, () => (window as any).__cutforge.store.getState().design.name)).toBe('Changed there');
});

test('two designs moved into a project: grouped in the library; the download offers the whole project', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mat-card-0.5').click();
  await page.getByTestId('start-go').click();
  await make(page, 'Board');
  await page.getByTestId('project-menu').click();
  await page.getByTestId('new-design').click();
  await page.getByTestId('mat-card-0.5').click();
  await page.getByTestId('start-go').click();
  await make(page, 'Tokens');
  await page.getByTestId('project-menu').click();
  await page.getByTestId('menu-designs').click();
  await page.getByTestId('lib-move-0').click();
  await answerDialog(page, { text: 'Game kit' });
  // the list is read again once the move is saved (the app's dialog does not block the page as the browser's did)
  await expect(page.getByTestId('lib-project-Game kit').locator('.lib-card')).toHaveCount(1);
  await page.locator('.lib-card', { hasText: 'Board' }).locator('[data-testid^="lib-move-"]').click();
  await answerDialog(page, { text: 'Game kit' });
  await expect(page.getByTestId('lib-project-Game kit').locator('.lib-card')).toHaveCount(2);
  await page.getByTestId('lib-back').click();
  await page.getByTestId('export-open').or(page.getByRole('button', { name: /Download for laser/ })).first().click();
  await expect(page.getByTestId('export-scope')).toBeVisible();
  await page.getByTestId('export-scope-project').check();
  const download = page.waitForEvent('download');
  await page.getByTestId('export-go').click();
  expect((await download).suggestedFilename()).toContain('Game-kit');
});
