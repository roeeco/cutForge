// milestone 63 (PACKAGING_PLAN.md §4.2, §5): a fold with a radius, its Bend card and the band on the stage.
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));
async function setNum(page: Page, id: string, v: string) {
  const f = page.getByTestId(id);
  await f.fill(v);
  await f.press('Enter');
}

/** A plywood box with a lid grown off its back wall by a fold (a living hinge); the lid selected. */
async function hingedBox(page: Page, mat = 'ply-3') {
  await page.goto('/');
  await page.getByTestId(`mat-${mat}`).click();
  await page.getByTestId('start-go').click();
  return S<{ lid: string; cid: string }>(page, () => {
    const { store, ops } = (window as any).__cutforge;
    let out = { lid: '', cid: '' };
    store.getState().apply((d: any) => {
      const base = ops.addRootPanel(d, 0, 0, 120, 80);
      ops.addTray(d, base, 60);
      ops.autoConnect(d);
      const back = Object.values(d.connections).find((c: any) => c.grown && c.a.panelId === base && c.a.edge === 'e2') as any;
      const g = ops.growPanel(d, back.b.panelId, 'e2', { height: 80, angle: 90, dir: 'up', kind: 'fold' });
      out = { lid: g.panelId, cid: g.connectionId };
    });
    store.getState().set({ selection: { kind: 'panel', id: out.lid } });
    return out;
  });
}

test('a plywood living hinge: the Bend card, its pattern, a radius too tight, and the fold view', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { cid } = await hingedBox(page);
  const card = page.getByTestId('bend-section');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Living hinge');
  await expect(page.getByTestId('bend-radius')).toHaveValue('30');
  await expect(page.getByTestId('bend-pattern-slits')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('bend-pattern-auto')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('bend-makes')).toContainText('Straight slits');
  // smooth plywood needs a far larger radius: greyed, saying so
  await expect(page.getByTestId('bend-pattern-smooth')).toBeDisabled();
  await expect(page.getByTestId('bend-pattern-smooth')).toHaveAttribute('title', /150 mm/);
  // denser: more lines
  const before = await page.getByTestId('bend-makes').textContent();
  await page.getByTestId('bend-density-0.5').click();
  await expect(page.getByTestId('bend-makes')).not.toHaveText(before ?? '');
  expect((await design(page)).connections[cid].bend).toEqual({ density: 0.5 });
  // too tight: the card says so, and the export check names it
  await setNum(page, 'bend-radius', '5');
  await expect(page.getByTestId('bend-why')).toBeVisible();
  expect((await design(page)).connections[cid].radius).toBe(5);
  await setNum(page, 'bend-radius', '40');
  await expect(page.getByTestId('bend-why')).toHaveCount(0);
  // the fold view unrolls it
  await expect(page.getByTestId('fold-slider')).toBeVisible();
  await page.getByTestId('fold-range').fill('0.4');
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('hinge-unfolding.png') });
  expect(errors).toEqual([]);
});

test('a card fold given a radius gets scores; radius 0 is a crease again', async ({ page }) => {
  const { cid } = await hingedBox(page, 'card-0.5');
  await expect(page.getByTestId('bend-crease')).toBeVisible();
  await setNum(page, 'bend-radius', '8');
  await expect(page.getByTestId('bend-makes')).toContainText('Scored');
  expect((await design(page)).connections[cid].radius).toBe(8);
  await setNum(page, 'bend-radius', '0');
  await expect(page.getByTestId('bend-crease')).toBeVisible();
});
