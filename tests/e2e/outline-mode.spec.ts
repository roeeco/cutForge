// Milestone 101 (DIELINE_DNA_PLAN.md D0): outline mode: reshape boards one after another without opening a card.
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const pts = (page: Page, id: string) => S<{ x: number; y: number }[]>(page, (i: string) => (window as any).__cutforge.store.getState().design.panels[i].sketch.pts.map((q: any) => ({ x: q.x, y: q.y })), id);
const face = (page: Page, id: string, x: number, y: number) => S<{ x: number; y: number }>(page, (a: any) => (window as any).__cutforge.projectFace(a.id, a.x, a.y, 1), { id, x, y });

async function dragFrom(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

for (const lang of ['en', 'he'] as const) {
  test(`two boards reshaped one after another, no card opened (${lang})`, async ({ page }) => {
    await page.goto('/');
    if (lang === 'he') await page.getByTestId('lang-toggle-dialog').click();
    await page.getByTestId('mat-ply-3').click();
    await page.getByTestId('start-go').click();
    const [A, B] = await S<string[]>(page, () => {
      const cf = (window as any).__cutforge;
      let a = '', b = '';
      cf.store.getState().apply((d: any) => {
        a = cf.ops.addRootPanel(d, -120, 40, 100, 70);
        b = cf.ops.addRootPanel(d, 30, 40, 100, 70);
      });
      cf.store.getState().select(null);
      return [a, b];
    });
    await S(page, () => (window as any).__cutforge.setCamera([0, 320, 1], [0, 0, 0]));
    await page.waitForTimeout(400);
    await page.getByTestId('toggle-outline').click();
    await expect(page.getByTestId('toggle-outline')).toHaveAttribute('aria-pressed', 'true');
    const a0 = await pts(page, A), b0 = await pts(page, B);
    // board A: hover it, grab its corner (index 2), pull it out
    await page.mouse.move(...Object.values(await face(page, A, 50, 35)) as [number, number]);
    await page.waitForTimeout(200);
    const ca = a0[2];
    await dragFrom(page, await face(page, A, ca.x, ca.y), await face(page, A, ca.x + 15, ca.y + 10));
    const a1 = await pts(page, A);
    expect(Math.hypot(a1[2].x - a0[2].x, a1[2].y - a0[2].y)).toBeGreaterThan(5);
    // board B straight away: hover, grab a corner, without clicking B first
    await page.mouse.move(...Object.values(await face(page, B, 50, 35)) as [number, number]);
    await page.waitForTimeout(200);
    // (its left corner: the card that opened for A covers its right side in English)
    const cb = b0[0];
    await dragFrom(page, await face(page, B, cb.x, cb.y), await face(page, B, cb.x + 12, cb.y - 8));
    const b1 = await pts(page, B);
    expect(Math.hypot(b1[0].x - b0[0].x, b1[0].y - b0[0].y)).toBeGreaterThan(5);
    expect(await S(page, () => (window as any).__cutforge.store.getState().editOutline)).toBe(B);
    // the card was never needed: one undo per drag
    await page.keyboard.press('ControlOrMeta+z');
    expect(await pts(page, B)).toEqual(b0);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await pts(page, A)).toEqual(a0);
    // Esc lets go; the switch leaves the mode
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.getByTestId('toggle-outline').click();
    expect(await S(page, () => (window as any).__cutforge.store.getState().viewPrefs.outlineMode)).toBe(false);
  });
}
