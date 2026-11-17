// milestone 64 (PACKAGING_PLAN.md §4.2, §4.4): curved tray walls round a rounded base's corners.
import { test, expect, type Page } from '@playwright/test';
import { QUICK_STATE } from './util';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));
const pt = (page: Page, x: number, y: number, z: number) => S<{ x: number; y: number }>(page, (a: number[]) => (window as any).__cutforge.projectWorld(a[0], a[1], a[2]), [x, y, z]);
async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}
const wings = (d: any) => (Object.values(d.connections) as any[]).filter((c) => c.wing);

test.describe('Quick build', () => {
  test.use({ storageState: QUICK_STATE });
  test('a Rounded box in plywood: corners raised to what the walls bend to, the walls one strip with living hinges, keyed shut', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.getByTestId('mat-ply-3').click();
    await page.getByTestId('start-go').click();
    await S(page, () => (window as any).__cutforge.setCamera([0, 300, 260], [0, 0, 0]));
    await page.waitForTimeout(300);
    await page.getByTestId('quick-box').click();
    await page.getByTestId('box-rounded').click();
    const f = page.getByTestId('box-corner');
    await f.fill('10');
    await f.press('Enter');
    // 10 mm is tighter than a 3 mm plywood hinge bends: the card says what the corners will be
    await expect(page.getByTestId('box-reach')).toBeVisible();
    await drag(page, await pt(page, -70, 0, -50), await pt(page, 70, 0, 50));
    await page.getByTestId('extrude-go').click();
    const d = await design(page);
    expect(d.order).toHaveLength(5);
    const ws = wings(d);
    expect(ws.map((c: any) => c.kind).sort()).toEqual(['fold', 'fold', 'fold', 'key']);
    const base = d.panels[d.order[0]];
    expect(base.sketch.pts.every((q: any) => q.curve === 'round' && q.r > 10)).toBe(true);
    // ready to cut: no bend issue
    const issues = await S<string[]>(page, () => (window as any).__cutforge.issues?.() ?? []);
    expect(issues).toEqual([]);
    await expect(page.getByTestId('ready-badge')).toHaveAttribute('data-ok', 'true');
    await page.screenshot({ path: test.info().outputPath('rounded-box.png') });
    expect(errors).toEqual([]);
  });
});

test.describe('Quick build round', () => {
  test.use({ storageState: QUICK_STATE });
  test('a Round box in card: a square drag is a circle with a seam flat, its wall all round with glue teeth, ready to cut', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.getByTestId('mat-card-0.5').click();
    await page.getByTestId('start-go').click();
    await S(page, () => (window as any).__cutforge.setCamera([0, 300, 260], [0, 0, 0]));
    await page.waitForTimeout(300);
    await page.getByTestId('quick-box').click();
    await page.getByTestId('box-round').click();
    await expect(page.getByTestId('box-round-help')).toBeVisible();
    await drag(page, await pt(page, -45, 0, -45), await pt(page, 45, 0, 45));
    await page.getByTestId('extrude-go').click();
    const d = await design(page);
    const base = d.panels[d.order[0]];
    expect(base.sketch.round.shape).toBe('circle');
    expect(base.sketch.round.seam.w).toBe(12);
    expect(d.order).toHaveLength(2);
    const ws = wings(d);
    expect(ws).toHaveLength(1);
    expect(ws[0].kind).toBe('glue');
    await expect(page.getByTestId('ready-badge')).toHaveAttribute('data-ok', 'true');
    await page.screenshot({ path: test.info().outputPath('round-box.png') });
    expect(errors).toEqual([]);
  });
});

async function roundedTray(page: Page, mat: string) {
  await page.goto('/');
  await page.getByTestId(`mat-${mat}`).click();
  await page.getByTestId('start-go').click();
  return S<string>(page, () => {
    const { store, ops } = (window as any).__cutforge;
    let id = '';
    store.getState().apply((d: any) => {
      id = ops.addRoundedRect(d, 0, 0, 120, 80, 32);
      ops.addTray(d, id, 40);
    });
    store.getState().set({ selection: { kind: 'panel', id } });
    return id;
  });
}

test('Workshop: a card tray on a rounded rectangle has its corners glued; all of them made plain at once', async ({ page }) => {
  await roundedTray(page, 'card-0.5');
  await expect(page.getByTestId('tray-corners')).toBeVisible();
  await expect(page.getByTestId('tray-corners-kind')).toHaveValue('glue');
  await page.getByTestId('tray-corners-kind').selectOption('butt');
  await expect.poll(async () => wings(await design(page)).every((c: any) => c.kind === 'butt')).toBe(true);
  await expect(page.getByTestId('tray-close-at')).toHaveCount(0);
});

test('Workshop: a plywood strip all round is keyed shut at the back left; its closing seam moved to another corner', async ({ page }) => {
  await roundedTray(page, 'ply-3');
  await expect(page.getByTestId('tray-corners-kind')).toHaveValue('fold');
  const sel = page.getByTestId('tray-close-at');
  await expect(sel).toBeVisible();
  const before = wings(await design(page)).find((c: any) => c.kind === 'key').a.panelId;
  const other = (await sel.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))).find((v) => v !== before)!;
  await sel.selectOption(other);
  await expect.poll(async () => wings(await design(page)).find((c: any) => c.kind === 'key').a.panelId).toBe(other);
});
