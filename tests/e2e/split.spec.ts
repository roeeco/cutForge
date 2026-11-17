// milestone 69 (PACKAGING_PLAN.md §9): splitting a net, nesting, the yield report.
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));

async function classSet(page: Page, w: number, h: number, ht: number, q: number) {
  await page.goto('/');
  await page.getByTestId('mat-card-0.5').click();
  await page.getByTestId('start-go').click();
  return S<string>(
    page,
    ([w, h, ht, q]: number[]) => {
      const { store, ops } = (window as any).__cutforge;
      let base = '';
      store.getState().apply((d: any) => {
        base = ops.addRootPanel(d, 0, 0, w, h);
        ops.addTray(d, base, ht);
        d.pieces[base].quantity = q;
      });
      return base;
    },
    [w, h, ht, q],
  );
}

test('a class set of card trays: the cut plan reports its yield; Save material cuts the walls off and saves a sheet; Nest keeps it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await classSet(page, 60, 60, 50, 4);
  await page.getByTestId('view-2d').click();
  const y = page.getByTestId('yield');
  await expect(y).toHaveAttribute('data-sheets', '2');
  await expect(y).toHaveAttribute('data-pieces', '4');
  await page.getByTestId('save-material').click();
  await expect(page.getByTestId('save-text')).toContainText('1 sheet, not 2 sheets');
  await page.screenshot({ path: test.info().outputPath('save-material.png') });
  await page.getByTestId('save-apply').click();
  await expect(y).toHaveAttribute('data-sheets', '1');
  const d = await design(page);
  expect(Object.values(d.connections).some((c: any) => c.cut === 'cut' && c.split)).toBe(true);
  // one undo step brings the whole nets back
  await page.keyboard.press('Control+z');
  await expect(y).toHaveAttribute('data-sheets', '2');
  await page.keyboard.press('Control+y');
  await expect(y).toHaveAttribute('data-sheets', '1');
  await page.getByTestId('nest').click();
  await expect(y).toHaveAttribute('data-sheets', '1');
  expect(Object.values((await design(page)).placements).every((p: any) => p.nested)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('nested.png') });
  expect(errors).toEqual([]);
});

test('a tray too tall for its sheet is cut so it fits; a fold pinned Keep whole moves the cut; the wall card says why it is cut', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await classSet(page, 200, 180, 55, 1);
  const d = await design(page);
  const cut = Object.values(d.connections).find((c: any) => c.autoCut) as any;
  expect(cut).toBeTruthy();
  await S(page, (id: string) => (window as any).__cutforge.store.getState().set({ selection: { kind: 'panel', id } }), cut.b.panelId);
  await expect(page.getByTestId('cut-choice')).toBeVisible();
  await expect(page.getByTestId('cut-note')).toContainText('fits its sheet');
  await page.getByTestId('cut-keep').click();
  const after = await design(page);
  expect(after.connections[cut.id].split).toBeUndefined();
  expect(Object.values(after.connections).some((c: any) => c.autoCut && c.split)).toBe(true);
  expect(errors).toEqual([]);
});
