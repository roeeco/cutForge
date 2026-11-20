// Milestone 114 (D2): building in the flat — grow a lid from a wall in Nets, ✓, undo; drag a flap's length.
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const st = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify({ d: (window as any).__cutforge.store.getState().design, grow: (window as any).__cutforge.store.getState().grow })));

for (const lang of ['en', 'he'] as const) {
  test(`a lid grown off the back wall in Nets, one undo step; a flap's length dragged (${lang})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    if (lang === 'he') await S(page, () => (window as any).__cutforge.store.getState().setLang('he'));
    await page.getByTestId('mat-card-0.5').click();
    await page.getByTestId('start-go').click();
    const back = await S<string>(page, () => {
      const cf = (window as any).__cutforge;
      let w = '';
      cf.store.getState().apply((d: any) => {
        const b = cf.ops.addRootPanel(d, -50, 35, 100, 70);
        const t = cf.ops.addTray(d, b, 40);
        cf.ops.autoConnect(d);
        w = `${t}/e2`;
      });
      return w;
    });
    await page.getByTestId('view-2d').click();
    await page.getByTestId('plan-mode-nets').click();
    await expect(page.getByTestId('net-view')).toBeVisible();
    await page.getByTestId(`net-edge-${back}-e2`).dispatchEvent('pointerdown', { button: 0, bubbles: true });
    await expect(page.getByTestId('net-ghost')).toBeVisible();
    await expect(page.getByTestId('grow-ghost-bar')).toBeVisible();
    // only one ✓: the preview has none
    await expect(page.getByTestId('grow-go')).toHaveCount(1);
    // drag the height handle outward
    const h = (await page.getByTestId('net-grow-height').boundingBox())!;
    const g = (await page.getByTestId('net-ghost').locator('polygon').boundingBox())!;
    const c = { x: h.x + h.width / 2, y: h.y + h.height / 2 };
    const out = { x: c.x - (g.x + g.width / 2), y: c.y - (g.y + g.height / 2) };
    const k = 40 / Math.max(1, Math.hypot(out.x, out.y));
    const h0 = (await st(page)).grow.height;
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(c.x + (out.x * k * i) / 6, c.y + (out.y * k * i) / 6);
    await page.mouse.up();
    expect((await st(page)).grow.height).toBeGreaterThan(h0);
    // to the front wall (the box's depth): the lid closes the box
    await S(page, () => (window as any).__cutforge.store.getState().setGrow({ height: 70 }));
    const before = (await st(page)).d;
    await page.getByTestId('grow-go').click();
    const after = (await st(page)).d;
    expect(after.order.length).toBeGreaterThan(before.order.length);
    // undo: one step
    await S(page, () => (window as any).__cutforge.store.getState().undo());
    expect((await st(page)).d.order.length).toBe(before.order.length);
    // a flap on the left wall's top, its length dragged in the flat
    const left = back.replace('/e2', '/e3');
    await S(page, (id: string) => {
      const cf = (window as any).__cutforge;
      cf.store.getState().apply((d: any) => cf.ops.addEdgeFlap(d, id, 'e2', 12));
      cf.store.getState().select({ kind: 'panel', id });
    }, left);
    const fh = page.getByTestId(`net-flap-${left}-e2`);
    await expect(fh).toBeVisible();
    const fb = (await fh.boundingBox())!;
    const p0 = { x: fb.x + fb.width / 2, y: fb.y + fb.height / 2 };
    const past0 = await S<number>(page, () => (window as any).__cutforge.store.getState().past.length);
    await page.mouse.move(p0.x, p0.y);
    await page.mouse.down();
    // outward from the wall: away from the board's middle (the flap's handle is past its edge)
    const lb = (await page.locator(`[data-testid="net-edge-${left}-e0"]`).boundingBox())!;
    const dir = { x: p0.x - (lb.x + lb.width / 2), y: p0.y - (lb.y + lb.height / 2) };
    const kk = 30 / Math.max(1, Math.hypot(dir.x, dir.y));
    for (let i = 1; i <= 5; i++) await page.mouse.move(p0.x + (dir.x * kk * i) / 5, p0.y + (dir.y * kk * i) / 5);
    await page.mouse.up();
    const flap = (await st(page)).d.panels[left].edgeFlaps[0];
    expect(flap.len).toBeGreaterThan(12);
    expect(await S<number>(page, () => (window as any).__cutforge.store.getState().past.length)).toBe(past0 + 1);
    expect(errors).toEqual([]);
  });
}
