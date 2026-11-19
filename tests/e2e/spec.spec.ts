// Milestone 90: Print a plan opens a print view of the pieces at a stated scale.
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;

test('Print a plan opens a page per kind of piece with its scale and title block', async ({ page, context }) => {
  await page.goto('/');
  await page.getByTestId('mat-card-0.5').click();
  await page.getByTestId('start-go').click();
  await S(page, () => {
    const cf = (window as any).__cutforge;
    cf.store.getState().apply((d: any) => {
      d.name = 'Pencil box';
      const b = cf.ops.addRootPanel(d, 0, 0, 160, 110);
      cf.ops.addTray(d, b, 60);
      cf.ops.autoConnect(d);
    });
  });
  await page.getByRole('button', { name: /Download for laser/ }).click();
  const popup = context.waitForEvent('page');
  await page.getByTestId('export-spec').click();
  const p = await popup;
  await p.waitForLoadState();
  await expect(p.locator('.page')).toHaveCount(1);
  await expect(p.locator('svg')).toContainText('Scale 1 : 2');
  await expect(p.locator('svg')).toContainText('Pencil box');
});
