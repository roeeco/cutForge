// Milestone 2 through the UI: closing seams, dividers with half-laps, and a
// leaning plywood panel that needs side walls.
import { test, expect, type Page } from '@playwright/test';

const design = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));
const select = (page: Page, sel: unknown) => page.evaluate((s) => (window as any).__cutforge.store.getState().select(s), sel);

async function start(page: Page, w: number, h: number) {
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('hints-dismiss').click();
  await page.getByTestId('tool-panel').click();
  const box = (await page.locator('[data-testid=view3d] canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2 - 50);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 50, { steps: 5 });
  await page.mouse.up();
  await page.getByTestId('panel-w').fill(String(w));
  await page.getByTestId('panel-w').press('Enter');
  await page.getByTestId('panel-h').fill(String(h));
  await page.getByTestId('panel-h').press('Enter');
  return (await design(page)).order[0] as string;
}

test('plywood organiser: closing seams, dividers, half-laps', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const base = await start(page, 140, 100);
  for (const e of [0, 1, 2, 3]) {
    await select(page, { kind: 'panel', id: base });
    await page.getByTestId(`grow-from-${e}`).click();
    await page.getByTestId('grow-go').click();
  }
  // the meeting corners are offered and flagged until connected
  let d = await design(page);
  for (const id of d.order.slice(1)) {
    await select(page, { kind: 'panel', id });
    while (await page.getByTestId('seam-connect').count()) await page.getByTestId('seam-connect').first().click();
  }
  d = await design(page);
  expect(Object.values<any>(d.connections).filter((c) => !c.grown && c.kind === 'finger')).toHaveLength(4);

  await select(page, { kind: 'panel', id: base });
  await page.getByTestId('div-add').click();
  await select(page, { kind: 'panel', id: base });
  await page.getByTestId('div-edge').selectOption('3');
  await page.getByTestId('div-add').click();
  d = await design(page);
  const kinds = Object.values<any>(d.connections).map((c) => c.kind);
  expect(kinds.filter((k) => k === 'halflap')).toHaveLength(1);
  expect(Object.values<any>(d.connections).every((c) => !c.broken)).toBe(true);

  // clear sizes are shown on the base
  await select(page, { kind: 'panel', id: base });
  await expect(page.getByTestId('clear-sizes')).toBeVisible();

  // move the first divider: its half-lap follows, nothing breaks
  const div = d.order[5];
  await select(page, { kind: 'panel', id: div });
  await page.getByTestId('conn-offset').fill('30');
  await page.getByTestId('conn-offset').press('Enter');
  d = await design(page);
  expect(Object.values<any>(d.connections).every((c) => !c.broken)).toBe(true);

  // nothing to fix before cutting
  await page.getByTestId('open-export').click();
  await expect(page.getByTestId('export-issues')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('leaning plywood panel needs side walls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const base = await start(page, 120, 90);
  await page.getByTestId('grow-from-0').click();
  await page.getByTestId('grow-angle-30').click();
  await expect(page.getByTestId('grow-kind')).toHaveValue('lean');
  await expect(page.getByTestId('lean-needs-walls')).toBeVisible();
  await expect(page.getByTestId('grow-go')).toBeDisabled();
  await page.getByTestId('add-side-walls').click();
  await expect(page.getByTestId('lean-needs-walls')).toHaveCount(0);
  await page.getByTestId('grow-go').click();
  let d = await design(page);
  const lean = d.order[d.order.length - 1];
  const slots = Object.values<any>(d.connections).filter((c) => !c.grown && c.kind === 'tabslot' && c.a.panelId === lean);
  expect(slots).toHaveLength(2);

  // delete a side wall: the leaning panel is flagged unsupported
  const wall = slots[0].b.panelId;
  await select(page, { kind: 'panel', id: wall });
  await page.keyboard.press('Delete');
  await page.getByTestId('open-export').click();
  await expect(page.getByTestId('export-issues')).toContainText('leans but nothing holds it');
  await page.getByTestId('export-issues').getByRole('button').first().click();
  d = await design(page);
  expect((await page.evaluate(() => (window as any).__cutforge.store.getState().selection)).id).toBe(lean);
  void base;
  expect(errors).toEqual([]);
});
