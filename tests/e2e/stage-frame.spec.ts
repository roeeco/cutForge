// Milestone 152: a preset opens framed whole at 1366 × 768 (its open lid and top flaps included), and Show how it
// goes together ends with it closed.
import { test, expect, type Page } from '@playwright/test';

async function open(page: Page, style: string | null, structure: string, mat: string) {
  await page.evaluate(
    async ([style, structure, mat]) => {
      const at = (p: string) => import(p);
      const reg = await at('/src/templates/registry.ts');
      const st = await at('/src/templates/styles.ts');
      const mats = await at('/src/model/materials.ts');
      const m = mats.MATERIALS.find((x: { id: string }) => x.id === mat);
      const box = reg.defaults(reg.templateById('box'));
      const r = style ? st.chooseStyle(st.styleById(style), m, box, reg.templateById) : { id: structure, params: reg.defaults(reg.templateById(structure)) };
      (window as any).__cutforge.store.getState().replaceDesign(reg.generate(reg.templateById(r.id), m, r.params), false);
    },
    [style, structure, mat] as const,
  );
}

/** The shown design's corners on screen (normalised, -1 to 1 within the canvas). */
async function corners(page: Page): Promise<number[][]> {
  return page.evaluate(async () => {
    const pose = await (async (p: string) => import(p))('/src/views/pose.ts');
    const h = (window as any).__cutforge;
    const s = h.store.getState();
    const b = pose.shownBox(s.design, s.lidShut);
    const { camera } = h.stage();
    camera.updateMatrixWorld();
    const out: number[][] = [];
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      const v = b.min.clone().set(x, y, z).project(camera);
      out.push([v.x, v.y]);
    }
    return out;
  });
}

test('every preset with a lid or flaps opens framed whole at 1366 × 768', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__cutforge?.stage);
  for (const [style, structure, mat] of [['rte', 'carton', 'card-0.5'], ['sealed', 'carton', 'corr-1.6'], ['hingedTray', 'box', 'corr-1.6'], [null, 'drawer', 'card-0.5'], [null, 'stand', 'ply-3']] as const) {
    await open(page, style, structure, mat);
    await page.waitForTimeout(1200);
    const cs = await corners(page);
    for (const [x, y] of cs) {
      expect(Math.abs(x), `${style ?? structure} x`).toBeLessThanOrEqual(1.0);
      expect(Math.abs(y), `${style ?? structure} y`).toBeLessThanOrEqual(1.0);
    }
  }
});

test('Show how it goes together ends with the flaps shut', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__cutforge?.stage);
  await open(page, 'sealed', 'carton', 'corr-1.6');
  const seen: number[] = [];
  await page.exposeFunction('noteAssemble', (a: number) => seen.push(a));
  await page.evaluate(() => {
    const st = (window as any).__cutforge.store;
    st.subscribe((s: { assemble: number | null }) => s.assemble !== null && (window as any).noteAssemble(s.assemble));
  });
  await page.getByTestId('assemble-go').click();
  await page.waitForFunction(() => (window as any).__cutforge.store.getState().assemble !== null, null, { timeout: 10_000, polling: 20 });
  await page.waitForFunction(() => (window as any).__cutforge.store.getState().assemble === null, null, { timeout: 30_000, polling: 100 });
  // it ran to the end, through the closing part
  expect(Math.max(...seen)).toBe(1);
  expect(seen.some((a) => a > 0.85 && a < 1)).toBe(true);
});
