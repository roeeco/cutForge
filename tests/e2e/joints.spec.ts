// Milestone 2 flows through the UI: closing seams, dividers with half-laps,
// a leaning plywood panel held by side walls, and a folded card tray.
import { setNum } from './util';
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));
const select = (page: Page, id: string) => S(page, (i) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id: i }), id);

async function start(page: Page, material: string, w: number, h: number) {
  await page.goto('/');
  await page.getByTestId(`mat-${material}`).click();
  await page.getByTestId('start-go').click();
  await page.getByTestId('hints-dismiss').click();
  // a base panel of exact size (drawing by mouse is covered by the vertical-slice test)
  await page.getByTestId('tool-panel').click();
  const box = (await page.locator('[data-testid=view3d] canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2 - 40);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  await setNum(page, 'panel-w', String(w));
  await setNum(page, 'panel-h', String(h));
  return (await design(page)).order[0] as string;
}

async function grow(page: Page, base: string, edge: number, height: number, angle = 90, kind?: string) {
  await select(page, base);
  await page.getByTestId(`grow-from-${edge}`).click();
  await page.getByTestId(`grow-angle-${angle}`).click();
  await setNum(page, 'grow-height', String(height));
  if (kind) await page.getByTestId('grow-kind').selectOption(kind);
  await page.getByTestId('grow-go').click();
}

async function connectAll(page: Page, ids: string[]) {
  for (const id of ids) {
    await select(page, id);
    if (await page.getByTestId('seam-connect-all').count()) await page.getByTestId('seam-connect-all').click();
  }
}

async function issues(page: Page) {
  await page.getByTestId('open-export').click();
  const n = await page.getByTestId('export-issues').count();
  const text = n ? await page.getByTestId('export-issues').innerText() : '';
  await page.keyboard.press('Escape');
  await page.getByText(/^Cancel$/).click();
  return text;
}

test('plywood organiser: closing finger seams, dividers, half-laps', async ({ page }) => {
  const base = await start(page, 'ply-3', 120, 90);
  for (const e of [0, 1, 2, 3]) await grow(page, base, e, 40);
  const walls = (await design(page)).order.slice(1);
  // the corners join themselves with finger joints
  const corners = Object.values<any>((await design(page)).connections).filter((c) => !c.grown);
  expect(corners.map((c) => c.kind)).toEqual(['finger', 'finger', 'finger', 'finger']);
  expect(await issues(page)).toBe('');
  await select(page, walls[0]);
  await expect(page.getByTestId('seams-pending')).toHaveCount(0);
  // unjoining one by hand sticks until it is connected again
  await page.getByTestId('joints-advanced').click();
  await page.getByTestId('joint-row-finger').nth(1).click();
  await page.getByTestId('conn-delete').click();
  await expect(page.getByTestId('seams-pending')).toBeVisible();
  expect(await issues(page)).toContain('overlap');
  expect(Object.values<any>((await design(page)).connections).filter((c) => !c.grown)).toHaveLength(3);
  await connectAll(page, walls);
  expect(await issues(page)).toBe('');

  await select(page, base);
  await page.getByTestId('div-toggle').click();
  await page.getByTestId('div-add').click();
  await select(page, base);
  await page.getByTestId('div-toggle').click();
  await page.getByTestId('div-edge').selectOption('3');
  await page.getByTestId('div-add').click();
  const d = await design(page);
  const kinds = Object.values<any>(d.connections).map((c) => c.kind);
  expect(kinds.filter((k) => k === 'finger')).toHaveLength(8);
  expect(kinds.filter((k) => k === 'halflap')).toHaveLength(1);
  expect(kinds.filter((k) => k === 'tabslot')).toHaveLength(6);
  await select(page, base);
  await expect(page.getByTestId('clear-sizes')).toBeVisible();

  // move the first divider: half-lap follows, nothing breaks
  const div = d.order[5];
  await select(page, div);
  await page.getByTestId('joints-advanced').click();
  await setNum(page, 'conn-offset', '30');
  const d2 = await design(page);
  expect(Object.values<any>(d2.connections).some((c) => c.broken)).toBe(false);
  expect(await issues(page)).toBe('');
});

test('leaning plywood panel needs side walls', async ({ page }) => {
  const base = await start(page, 'ply-3', 100, 80);
  await select(page, base);
  await page.getByTestId('grow-from-0').click();
  await page.getByTestId('grow-angle-30').click();
  await expect(page.getByTestId('lean-needs-walls')).toContainText('An angled panel needs a side wall to hold it');
  // a note, not an error: it can still be grown (the export check flags it), or held with side walls
  await expect(page.getByTestId('grow-go')).toBeEnabled();
  await page.getByTestId('add-side-walls').click();
  await expect(page.getByTestId('lean-needs-walls')).toHaveCount(0);
  await page.getByTestId('grow-go').click();
  let d = await design(page);
  const lean = d.order[3];
  const seams = Object.values<any>(d.connections).filter((c) => !c.grown && c.kind === 'tabslot' && c.a.panelId === lean);
  expect(seams).toHaveLength(2);
  expect(await issues(page)).toBe('');

  // deleting a side wall flags the leaning panel
  await select(page, seams[0].b.panelId);
  await page.keyboard.press('Delete');
  expect(await issues(page)).toContain('leans but nothing holds it');
  await select(page, lean);
  await expect(page.getByTestId('insp-add-side-walls')).toBeVisible();
  await page.getByTestId('insp-add-side-walls').click();
  expect(await issues(page)).toBe('');
});

test('folded card tray with glue flaps is one piece', async ({ page }) => {
  const base = await start(page, 'card-0.5', 100, 70);
  for (const e of [0, 1, 2, 3]) await grow(page, base, e, 30, 90, 'fold');
  await connectAll(page, (await design(page)).order.slice(1));
  const d = await design(page);
  expect(Object.values<any>(d.connections).map((c) => c.kind).sort()).toEqual(['fold', 'fold', 'fold', 'fold', 'glue', 'glue', 'glue', 'glue']);
  await page.getByTestId('view-2d').click();
  await expect(page.locator('[data-piece]')).toHaveCount(1);
  await expect(page.locator('path.fold-line')).toHaveCount(4);
  expect(await issues(page)).toBe('');
});
