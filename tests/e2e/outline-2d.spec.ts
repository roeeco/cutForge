// Milestone 104 (DIELINE_DNA_PLAN.md D0b-2): edit outlines in the 2D view, double-clicked into.
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const soloPt = (page: Page, x: number, y: number) =>
  S<{ x: number; y: number }>(page, ([x, y]: number[]) => {
    const svg = document.querySelector('[data-testid=solo] svg') as SVGSVGElement;
    const st = (window as any).__cutforge.store.getState();
    const H = st.design.panels[st.soloPanel].h;
    const pt = svg.createSVGPoint();
    pt.x = x;
    pt.y = H - y;
    const r = pt.matrixTransform(svg.getScreenCTM()!);
    return { x: r.x, y: r.y };
  }, [x, y]);
const center = async (page: Page, testId: string) => {
  const b = (await page.getByTestId(testId).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
async function dragTo(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

for (const lang of ['en', 'he'] as const) {
  test(`a board's window and the board itself, edited in 2D (${lang})`, async ({ page }) => {
    await page.goto('/');
    if (lang === 'he') await page.getByTestId('lang-toggle-dialog').click();
    await page.getByTestId('mat-ply-3').click();
    await page.getByTestId('start-go').click();
    const id = await S<string>(page, () => {
      const cf = (window as any).__cutforge;
      let id = '';
      cf.store.getState().apply((d: any) => {
        id = cf.ops.addRootPanel(d, 0, 0, 200, 140);
        d.panels[id].details.push({ id: 'win', shape: 'rect', op: 'cut', cx: 100, cy: 70, w: 60, h: 40 });
      });
      cf.store.getState().openSolo(id);
      return id;
    });
    await expect(page.getByTestId('solo')).toBeVisible();
    // double-click into the window: its points appear, the 2D view stays
    const w = await soloPt(page, 108, 76);
    await page.mouse.dblclick(w.x, w.y);
    await expect(page.getByTestId('edit2d-layer')).toBeVisible();
    await expect(page.getByTestId('solo')).toBeVisible();
    const past0 = await S<number>(page, () => (window as any).__cutforge.store.getState().past.length);
    // drag the top right corner (130, 90) out to (145, 100)
    await dragTo(page, await center(page, 'e2d-pt-p2'), await soloPt(page, 145, 100));
    let dt = await S<any>(page, () => (window as any).__cutforge.store.getState().design.panels[(window as any).__cutforge.store.getState().soloPanel].details[0]);
    expect(dt.shape).toBe('polygon');
    expect(dt.cx + dt.w / 2).toBeCloseTo(145, 0);
    // type a side's length: click the bottom line, 40 mm
    // (a quarter along: its middle has the + that adds a point)
    const sb = (await page.getByTestId('e2d-seg-g0').boundingBox())!;
    await page.mouse.click(sb.x + sb.width * 0.25, sb.y + sb.height / 2);
    await expect(page.getByTestId('edit2d-length')).toBeVisible();
    await page.getByTestId('edit2d-length').fill('40');
    await page.getByTestId('edit2d-length').press('Enter');
    // round one corner
    await page.mouse.click(...(Object.values(await center(page, 'e2d-pt-p0')) as [number, number]));
    await page.getByTestId('edit2d-corner-round').click();
    dt = await S<any>(page, () => (window as any).__cutforge.store.getState().design.panels[(window as any).__cutforge.store.getState().soloPanel].details[0]);
    expect(dt.sketch.pts.p0.r).toBe(5);
    // one undo per change
    expect(await S<number>(page, () => (window as any).__cutforge.store.getState().past.length)).toBe(past0 + 3);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('edit2d-layer')).toHaveCount(0);
    // the board itself: double-click away from the window, drag a corner of the board
    const b = await soloPt(page, 20, 20);
    await page.mouse.dblclick(b.x, b.y);
    await expect(page.getByTestId('edit2d-layer')).toBeVisible();
    const before = await S<any>(page, (i: string) => (window as any).__cutforge.store.getState().design.panels[i].sketch.pts, id);
    await dragTo(page, await center(page, 'e2d-pt-p2'), await soloPt(page, 215, 150));
    const after = await S<any>(page, (i: string) => (window as any).__cutforge.store.getState().design.panels[i], id);
    expect(after.sketch.pts.length).toBe(before.length);
    expect(after.w).toBeGreaterThan(205);
    // the window is still there
    expect(after.details.map((x: any) => x.id)).toContain('win');
  });
}

test('from the cut plan, a double-click on a shape opens it in 2D already being edited', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('start-go').click();
  await S(page, () => {
    const cf = (window as any).__cutforge;
    cf.store.getState().apply((d: any) => {
      const id = cf.ops.addRootPanel(d, 0, 0, 200, 140);
      d.panels[id].details.push({ id: 'win', shape: 'circle', op: 'cut', cx: 100, cy: 70, w: 40, h: 40 });
    });
  });
  await page.getByTestId('view-2d').click();
  await expect(page.getByTestId('detail-win')).toBeVisible();
  const r = (await page.getByTestId('detail-win').boundingBox())!;
  await page.mouse.dblclick(r.x + r.width / 2, r.y + 1);
  await expect(page.getByTestId('solo')).toBeVisible();
  await expect(page.getByTestId('edit2d-layer')).toBeVisible();
  expect(await S<any>(page, () => (window as any).__cutforge.store.getState().edit2d)).toMatchObject({ kind: 'shape', id: 'win' });
});
