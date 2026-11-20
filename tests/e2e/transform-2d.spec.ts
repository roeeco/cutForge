// Milestone 103 (DIELINE_DNA_PLAN.md D0c): the 2D transform frame: side handles, keep proportions, typed pills.
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const shape = (page: Page) => S<any>(page, () => { const s = (window as any).__cutforge.store.getState(); const p = s.design.panels[s.soloPanel]; return { ...p.details[0] }; });
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

async function setup(page: Page) {
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('start-go').click();
  await S(page, () => {
    const cf = (window as any).__cutforge;
    let id = '';
    cf.store.getState().apply((d: any) => {
      id = cf.ops.addRootPanel(d, 0, 0, 200, 140);
      d.panels[id].details.push({ id: 'win', shape: 'rect', op: 'cut', cx: 100, cy: 70, w: 60, h: 40 });
    });
    cf.store.getState().openSolo(id);
    cf.store.getState().select({ kind: 'detail', id: 'win', ids: ['win'] });
  });
  await expect(page.getByTestId('solo')).toBeVisible();
}

test('a side handle changes one direction; a typed percent with proportions kept changes both', async ({ page }) => {
  await setup(page);
  await expect(page.getByTestId('handle-side-1')).toBeVisible();
  // the right side's middle (130, 70) dragged to 150: only the width
  const a = await soloPt(page, 130, 70), b = await soloPt(page, 150.3, 85);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  let s = await shape(page);
  expect(s.w).toBeCloseTo(80, 0);
  expect(s.h).toBeCloseTo(40, 6);
  // the W pill: 150% without proportions
  await page.getByTestId('frame-pill-w').click();
  await page.getByTestId('frame-pill-w-input').fill('150%');
  await page.getByTestId('frame-pill-w-input').press('Enter');
  s = await shape(page);
  expect(s.w).toBeCloseTo(80 * 1.5, 0);
  const w1 = s.w;
  expect(s.h).toBeCloseTo(40, 6);
  // keep proportions on, then a typed height: the width follows
  await S(page, () => (window as any).__cutforge.store.getState().setPrefs({ keepRatio: true }));
  await page.getByTestId('frame-pill-h').click();
  await page.getByTestId('frame-pill-h-input').fill('60+20');
  await page.getByTestId('frame-pill-h-input').press('Enter');
  s = await shape(page);
  expect(s.h).toBeCloseTo(80, 6);
  expect(s.w).toBeCloseTo(w1 * 2, 6);
  await S(page, () => (window as any).__cutforge.store.getState().setPrefs({ keepRatio: false }));
});
