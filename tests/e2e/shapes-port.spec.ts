// Milestone 120 (Shapes R1): the shape modeller on this branch. Start *Shapes*, place
// a box and a cylinder, make the cylinder a hole, combine them. The stage bar's *Fold it*
// and *Build from boards* are greyed while there is nothing to make (since 126 they work
// once there is a shape).
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const shapes = (page: Page) => S<{ kind: string; hole?: boolean }[]>(page, () => Object.values((window as any).__cutforge.store.getState().design.sculpt?.shapes ?? {}).map((s: any) => ({ kind: s.kind, hole: s.hole })));

test('shapes: a box with a cylinder hole, combined; the two Make buttons wait for a shape', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('mat-card-0.5').click();
  await page.getByTestId('tpl-shapes').click();
  await expect(page.getByTestId('stage-stepper')).toBeVisible();
  await expect(page.getByTestId('sculpt-loading')).toBeHidden({ timeout: 20_000 });
  // nothing yet: the two buttons are greyed
  await expect(page.getByTestId('make-fold')).toBeDisabled();
  await expect(page.getByTestId('make-boards')).toBeDisabled();

  await page.keyboard.press('s');
  await page.getByTestId('shape-tile-box').click();
  for (const [f, v] of [['shape-w', '80'], ['shape-d', '80'], ['shape-h', '40']] as const) {
    await page.getByTestId(f).fill(v);
    await page.getByTestId(f).press('Enter');
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('s');
  await page.getByTestId('shape-tile-cylinder').click();
  await page.keyboard.press('h');
  await page.keyboard.press('Escape');
  expect((await shapes(page)).map((s) => s.kind).sort()).toEqual(['box', 'cylinder']);
  // select both and combine
  await S(page, () => {
    const st = (window as any).__cutforge.store.getState();
    const ids = st.design.sculpt.order;
    st.select({ kind: 'shape', id: ids[ids.length - 1], ids });
  });
  await page.keyboard.press('Control+g');
  const after = await shapes(page);
  expect(after.some((s) => s.kind === 'group')).toBe(true);
  expect(after.some((s) => s.kind === 'cylinder' && s.hole)).toBe(true);

  // something to make: both buttons work (126, 127)
  await expect(page.getByTestId('make-fold')).toBeEnabled();
  await expect(page.getByTestId('make-boards')).toBeEnabled();
  // the level switch is on the Shapes stage too (milestone 140, owner's decision of 20 November)
  await expect(page.getByTestId('mode-toggle')).toHaveCount(1);
  expect(errors).toEqual([]);
});
