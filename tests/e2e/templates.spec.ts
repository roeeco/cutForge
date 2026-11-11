// Milestone 5: start from a template, change parameters, keep user edits.
import { setNum, shapeTool } from './util';
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));

test('organiser template: parameters regenerate, user cutouts stay, lid follows', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tpl-organiser').check();
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('start-go').click();
  let d = await design(page);
  expect(d.template.id).toBe('organiser');
  expect(d.order).toContain('t:divX2');
  await expect(page.getByTestId('template-section')).toBeVisible();

  // a cutout on the front wall (normal tools: Rectangle tool in the wall's solo view)
  await S(page, () => (window as any).__cutforge.store.getState().openSolo('t:wall0'));
  await shapeTool(page, 'circle');
  const pt = (x: number, y: number) =>
    S(page, ([x, y]: number[]) => {
      const svg = document.querySelector('[data-testid=solo] svg') as SVGSVGElement;
      const st = (window as any).__cutforge.store.getState();
      const q = svg.createSVGPoint();
      q.x = x;
      q.y = st.design.panels['t:wall0'].h - y;
      const r = q.matrixTransform(svg.getScreenCTM()!);
      return { x: r.x, y: r.y };
    }, [x, y]);
  const a = await pt(40, 25), b = await pt(52, 37);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  // a ghost until ✓ (milestone 30)
  await page.getByTestId('ghost-ok').click();
  await page.getByTestId('solo-back').click();
  d = await design(page);
  const holeId = d.panels['t:wall0'].details[0].id;

  // change parameters in the inspector
  await S(page, () => (window as any).__cutforge.store.getState().select(null));
  await setNum(page, 'tp-width', '200');
  await setNum(page, 'tp-dividersX', '3');
  await page.getByTestId('tp-lid').selectOption('liftoff');
  d = await design(page);
  expect(d.panels['t:base'].w).toBeCloseTo(206, 6);
  expect(d.order).toContain('t:divX3');
  expect(d.panels['t:wall0'].details.map((x: any) => x.id)).toEqual([holeId]);
  const t = d.material.thickness, c = d.material.clearance;
  expect(d.panels['t:lidbase'].w - 2 * t).toBeCloseTo(d.panels['t:base'].w + 2 * c, 6);

  // one undo step per parameter change
  await page.getByTestId('undo').click();
  expect((await design(page)).order).not.toContain('t:lidbase');
  await page.getByTestId('redo').click();

  // an edit that cannot be kept is listed
  await S(page, () => (window as any).__cutforge.store.getState().apply((x: any) => void x.panels['t:divX3'].details.push({ id: 'z', shape: 'circle', op: 'cut', cx: 20, cy: 10, w: 6, h: 6 })));
  await setNum(page, 'tp-dividersX', '1');
  await expect(page.getByTestId('template-lost')).toContainText('1 shape(s) on panel');

  // the export checks pass for the template as generated
  await page.getByTestId('open-export').click();
  await expect(page.getByTestId('export-issues')).toHaveCount(0);
});

test('card stand template in corrugated', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tpl-stand').check();
  await page.getByTestId('mat-corr-1.6').click();
  await page.getByTestId('start-go').click();
  const d = await design(page);
  expect(d.order).toEqual(expect.arrayContaining(['t:base', 't:support1', 't:support3', 't:lip']));
  await page.getByTestId('tp-angle').selectOption('30');
  expect((await design(page)).connections['t:c:base.0-support1.0'].angle).toBe(30);
});
