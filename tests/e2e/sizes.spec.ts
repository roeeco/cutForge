// Milestone 88 (LIDS_LINES_PROJECTS_PLAN.md §7.3, §8): sizes in the settings card, each downloaded under its own name.
import { test, expect, type Page } from '@playwright/test';
import { setNum } from './util';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;

test('a box gets a size L in the settings card; the download offers it and names the file by it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('mat-card-0.5').click();
  await page.getByTestId('start-go').click();
  await S(page, () => {
    const cf = (window as any).__cutforge;
    cf.store.getState().apply((d: any) => {
      d.name = 'Box';
      const b = cf.ops.addRootPanel(d, 0, 0, 120, 80);
      cf.ops.addTray(d, b, 50);
      cf.ops.autoConnect(d);
    });
    cf.store.getState().select(null);
  });
  await page.getByTestId('settings-head-sizes').click();
  await page.getByTestId('size-add').click();
  await page.getByTestId('size-name-0').fill('L');
  await setNum(page, 'size-w-0', '200');
  const d = await S<any>(page, () => (window as any).__cutforge.store.getState().design);
  expect(d.sizes).toEqual([expect.objectContaining({ name: 'L', w: 200, d: 80, h: 50 })]);
  await page.getByRole('button', { name: /Download for laser/ }).click();
  await page.getByTestId('export-size-master').uncheck();
  await page.getByTestId('export-size-L').check();
  await expect(page.getByTestId('export-size-issue')).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByTestId('export-go').click();
  expect((await download).suggestedFilename()).toContain('Box-L');
  expect(errors).toEqual([]);
});
