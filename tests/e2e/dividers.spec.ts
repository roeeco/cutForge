// Milestone 44 (DIVIDERS_PLAN.md): the Divider tool always makes a divider; its ends find the boards
// around it; it lines up with the first divider (Shift: 30° steps); Quick build gains Standing board.
import { test, expect, type Page } from '@playwright/test';
import { QUICK_STATE } from './util';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));
const onFace = (page: Page, id: string, x: number, y: number) => S<{ x: number; y: number }>(page, (a: any) => (window as any).__cutforge.projectFace(a.id, a.x, a.y, 1), { id, x, y });
async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }, mod?: 'Shift') {
  if (mod) await page.keyboard.down(mod);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  if (mod) await page.keyboard.up(mod);
}
/** A 160 × 110 plywood tray, seen from above. */
async function tray(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('start-go').click();
  const base = await S<string>(page, () => {
    const cf = (window as any).__cutforge;
    let b = '';
    cf.store.getState().apply((d: any) => {
      b = cf.ops.addRootPanel(d, -80, 55, 160, 110);
      cf.ops.addTray(d, b, 45);
    });
    cf.store.getState().select(null);
    return b;
  });
  await S(page, () => (window as any).__cutforge.setCamera([0, 420, 1], [0, 0, 0]));
  await page.waitForTimeout(300);
  return base;
}
const dividers = (d: any, base: string) => (Object.values(d.panels) as any[]).filter((p) => p.divider && p.place?.host === base);
const between = (d: any, a: string, b: string) => (Object.values(d.connections) as any[]).filter((c) => !c.broken && ((c.a.panelId === a && c.b.panelId === b) || (c.a.panelId === b && c.b.panelId === a)));

test.describe('Workshop: the Divider tool', () => {
  test('a line across, a T meeting it, and a line crossing it: their ends find the boards, each one ✓', async ({ page }) => {
    const base = await tray(page);
    // 1. across the box, drawn short of the walls
    await page.getByTestId('tool-divider').click();
    await drag(page, await onFace(page, base, 40, 55), await onFace(page, base, 120, 55));
    await expect(page.getByTestId('divider-makes')).toHaveAttribute('data-kind', 'divider');
    await expect(page.getByTestId('div-mark-board')).toHaveCount(2);
    await page.getByTestId('ghost-ok').click();
    let d = await design(page);
    const [a] = dividers(d, base);
    expect(a.w).toBeCloseTo(160, 3);
    // 2. a short line above it, stopping short of both it and the back wall: a T on it
    await page.getByTestId('tool-divider').click();
    await drag(page, await onFace(page, base, 60, 70), await onFace(page, base, 60, 95));
    await page.getByTestId('ghost-ok').click();
    d = await design(page);
    const t = dividers(d, base).find((p) => p.id !== a.id);
    expect(between(d, t.id, a.id).map((c) => c.kind)).toEqual(['tabslot']);
    // 3. a line across the first one: a half-lap there, and on to the walls
    await page.getByTestId('tool-divider').click();
    await drag(page, await onFace(page, base, 110, 45), await onFace(page, base, 110, 65));
    await expect(page.getByTestId('div-mark-cross')).toHaveCount(1);
    await page.getByTestId('ghost-ok').click();
    d = await design(page);
    const x = dividers(d, base).find((p) => p.id !== a.id && p.id !== t.id);
    expect(between(d, x.id, a.id).map((c) => c.kind)).toEqual(['halflap']);
    expect(x.w).toBeCloseTo(110, 3);
    // the card names what each end meets
    await expect(page.getByTestId('divider-section')).toBeVisible();
    await expect(page.getByTestId('div-end-0-name')).toBeVisible();
  });

  test('Shift lays a divider at 30°; the next one follows it; a line on a wall is refused with the reason', async ({ page }) => {
    const base = await tray(page);
    await page.getByTestId('tool-divider').click();
    // drawn about 25° off the box: with Shift, 30°
    const c = { x: 80, y: 55 };
    const r = 30, a25 = (25 * Math.PI) / 180;
    await drag(page, await onFace(page, base, c.x - r * Math.cos(a25), c.y - r * Math.sin(a25)), await onFace(page, base, c.x + r * Math.cos(a25), c.y + r * Math.sin(a25)), 'Shift');
    await page.getByTestId('ghost-ok').click();
    let d = await design(page);
    const first = dividers(d, base)[0];
    expect(((first.divider.rot % 180) + 180) % 180).toBeCloseTo(30, 6);
    // the next one, drawn roughly square to it without Shift: square to it (120°)
    await page.getByTestId('tool-divider').click();
    const b = (115 * Math.PI) / 180;
    await drag(page, await onFace(page, base, 40 - 20 * Math.cos(b), 70 - 20 * Math.sin(b)), await onFace(page, base, 40 + 20 * Math.cos(b), 70 + 20 * Math.sin(b)));
    await page.getByTestId('ghost-ok').click();
    d = await design(page);
    const second = dividers(d, base).find((p) => p.id !== first.id);
    expect(((second.divider.rot % 180) + 180) % 180).toBeCloseTo(120, 6);
    // a line whose middle lies in a wall: refused, ✓ greyed, the reason shown
    await page.getByTestId('tool-divider').click();
    await drag(page, await onFace(page, base, 1.5, 20), await onFace(page, base, 1.5, 40));
    await expect(page.getByTestId('divider-makes')).toHaveAttribute('data-kind', 'refused');
    await expect(page.getByTestId('ghost-ok')).toBeDisabled();
    await page.keyboard.press('Escape');
    expect(dividers(await design(page), base)).toHaveLength(2);
  });

  test('the card: ‹ › let an end stop a board sooner or reach one further', async ({ page }) => {
    const base = await tray(page);
    await page.getByTestId('tool-divider').click();
    await drag(page, await onFace(page, base, 20, 55), await onFace(page, base, 140, 55));
    await page.getByTestId('ghost-ok').click();
    await page.getByTestId('tool-divider').click();
    await drag(page, await onFace(page, base, 60, 70), await onFace(page, base, 60, 95));
    await page.getByTestId('ghost-ok').click();
    let d = await design(page);
    const [a] = dividers(d, base);
    const t = dividers(d, base).find((p) => p.id !== a.id);
    // which end meets the first divider
    const k = (await page.getByTestId('div-end-0-more').isEnabled()) ? 0 : 1;
    await page.getByTestId(`div-end-${k}-more`).click();
    d = await design(page);
    expect(between(d, t.id, a.id).map((c) => c.kind)).toEqual(['halflap']);
    await page.getByTestId(`div-end-${k}-less`).click();
    d = await design(page);
    expect(between(d, t.id, a.id).map((c) => c.kind)).toEqual(['tabslot']);
  });
});

test.describe('Quick build', () => {
  test.use({ storageState: QUICK_STATE });

  test('Standing board has its own button below Divider; D again switches between them; the Divider makes dividers only', async ({ page }) => {
    const base = await tray(page);
    await page.keyboard.press('d');
    await expect(page.getByTestId('quick-divider')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('d');
    await expect(page.getByTestId('quick-standing')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('quick-divider')).toHaveAttribute('aria-pressed', 'false');
    // a standing board along a line on the base
    await drag(page, await onFace(page, base, 30, 20), await onFace(page, base, 30, 60));
    let d = await design(page);
    expect((Object.values(d.panels) as any[]).filter((p) => p.place?.host === base).map((p) => !!p.divider)).toEqual([false]);
    // the Divider, from a short line: a divider wall to wall
    await page.getByTestId('quick-divider').click();
    await drag(page, await onFace(page, base, 100, 40), await onFace(page, base, 100, 70));
    await page.getByTestId('ghost-ok').click();
    d = await design(page);
    const divs = dividers(d, base);
    expect(divs).toHaveLength(1);
    expect(divs[0].w).toBeCloseTo(110, 3);
  });
});
