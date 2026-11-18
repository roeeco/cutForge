// Regressions from the maintenance round after milestone 72: the 3D stage
// keeps in step with every edit, the stage's floating labels stay clear of
// the cards, and the contextual card's controls keep their room.
import { test, expect, type Page } from '@playwright/test';
import { boardTool } from './util';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));
const select = (page: Page, id: string) => S(page, (i) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id: i }), id);
const edges = (page: Page) => S<Record<string, { edges: number; highlight: number | null; drawn: number | null }>>(page, () => (window as any).__cutforge.panelEdges());

async function organiser(page: Page) {
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('tpl-organiser').click();
  await page.getByTestId('start-go').click();
  await expect(page.getByTestId('view3d')).toBeVisible();
  return design(page);
}

test('changing a joint redraws the panel and its highlight in 3D, as on the cut plan', async ({ page }) => {
  const d = await organiser(page);
  const front = d.order[1];
  await select(page, front);
  await expect.poll(async () => (await edges(page))[front]?.highlight ?? null).not.toBeNull();
  const base = d.order[0];
  const start = await edges(page);
  const before = start[front];
  expect(before.drawn).toBe(before.edges);
  // the joint to the base, from finger joints to tabs and slots
  await page.getByTestId('joints-advanced').click();
  await page.getByTestId('conn-kind').first().selectOption('tabslot');
  await expect.poll(async () => (await design(page)).connections[Object.keys(d.connections)[0]].kind).toBe('tabslot');
  // the slab has the new outline, and the whole of its new highlight is drawn (it used to keep the old one, or draw stray lines)
  await expect.poll(async () => (await edges(page))[front].edges).not.toBe(before.edges);
  await expect.poll(async () => (await edges(page))[front].drawn).toBe((await edges(page))[front].edges);
  const after = (await edges(page))[front];
  expect(after.highlight).toBe(after.edges);
  // the base, which now has slots instead of finger notches though nothing of its own changed, is redrawn too
  expect((await edges(page))[base].edges).not.toBe(start[base].edges);
});

test('Round and Rounded are footprints of the Shapes tool; G goes back to polygon corners', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('start-go').click();
  await boardTool(page, 'circle');
  await expect(page.getByTestId('foot-circle')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('foot-polygon')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('round-circle')).toBeVisible();
  await expect(page.locator('.view-hint')).toContainText('Drag a box');
  await boardTool(page, 'rounded');
  await expect(page.getByTestId('foot-rounded')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('round-corner')).toBeVisible();
  // G goes back to clicking corners
  await page.keyboard.press('g');
  await expect(page.getByTestId('foot-polygon')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('poly-card')).toHaveAttribute('data-mode', 'click');
  // a rounded board drawn with the footprint
  await boardTool(page, 'rounded');
  const a = await page.evaluate(() => (window as any).__cutforge.projectWorld(-50, 0, 30));
  const b = await page.evaluate(() => (window as any).__cutforge.projectWorld(50, 0, -30));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await page.getByTestId('ghost-ok').click();
  const d = await design(page);
  expect(d.order.length).toBe(1);
  expect(d.panels[d.order[0]].sketch.pts.every((q: any) => q.curve === 'round')).toBe(true);
});

/** Controls in a card that run out of it, and buttons closer than `gap` px to each other. */
async function cramped(page: Page, selector: string, gap = 6) {
  return page.evaluate(
    ([sel, g]) => {
      const out: string[] = [];
      for (const card of document.querySelectorAll(sel as string)) {
        const box = card.getBoundingClientRect();
        const name = (el: Element) => (el as HTMLElement).dataset.testid ?? el.textContent?.trim().slice(0, 24) ?? el.tagName;
        const ctl = [...card.querySelectorAll('button, input, select')].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && !el.closest('.segmented, .pictures, .seg, .stepper-row, .num-wrap, .dial, .collapse-head, .conn-row');
        });
        for (const el of ctl) {
          const r = el.getBoundingClientRect();
          if (r.left < box.left - 0.5 || r.right > box.right + 0.5) out.push(`${name(el)} runs out of the card`);
        }
        const btns = ctl.filter((el) => el.tagName === 'BUTTON' && !el.classList.contains('link'));
        for (let i = 0; i < btns.length; i++)
          for (let j = i + 1; j < btns.length; j++) {
            const a = btns[i].getBoundingClientRect(), b = btns[j].getBoundingClientRect();
            const sameRow = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4;
            const sameCol = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4;
            const dx = Math.max(b.left - a.right, a.left - b.right), dy = Math.max(b.top - a.bottom, a.top - b.bottom);
            if ((sameRow && dx < g) || (sameCol && dy < g && dy > -1)) out.push(`${name(btns[i])} / ${name(btns[j])}: ${Math.round(sameRow ? dx : dy)}px apart`);
          }
      }
      return out;
    },
    [selector, gap] as const,
  );
}

test('the contextual card keeps its controls inside it and apart', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1600 });
  const d = await organiser(page);
  const sel = (s: unknown) => S(page, (x) => (window as any).__cutforge.store.getState().select(x), s);
  const front = d.order[1];
  const shape = await S<string>(page, (id) => {
    const { store, ops } = (window as any).__cutforge;
    let a = '', b = '', c = '';
    store.getState().apply((x: any) => {
      a = ops.addDetail(x, id, 'rect', 'cut', 30, 25, 12, 10);
      b = ops.addDetail(x, id, 'circle', 'cut', 80, 25, 10, 10);
      c = ops.addDetail(x, id, 'rect', 'engrave', 130, 25, 12, 10);
    });
    return [a, b, c].join(',');
  }, front);
  const ids = shape.split(',');
  const states: [string, unknown][] = [
    ['nothing', null],
    ['base', { kind: 'panel', id: d.order[0] }],
    ['wall', { kind: 'panel', id: front }],
    ['divider', { kind: 'panel', id: d.order[6] }],
    ['shape', { kind: 'detail', id: ids[0], ids: [ids[0]] }],
    ['shapes', { kind: 'detail', id: ids[2], ids }],
    ['walls', { kind: 'panel', id: d.order[2], ids: [d.order[1], d.order[2]] }],
    ['edge', { kind: 'edge', panelId: front, edge: 'e2' }],
  ];
  for (const [name, s] of states) {
    await sel(s);
    await expect(page.locator('.card-dock .card')).toBeVisible();
    expect(await cramped(page, '.card-dock .card'), name).toEqual([]);
  }
  // the joints list open
  await sel({ kind: 'panel', id: front });
  await page.getByTestId('joints-advanced').click();
  expect(await cramped(page, '.card-dock .card'), 'joints').toEqual([]);
});

test('the narrow tool cards keep their pickers inside them, in both languages', async ({ page }) => {
  await page.goto('/');
  // card: the Box card also offers its kinds (open, with a lid, carton) as pictures
  await page.getByTestId('mat-card-0.5').click();
  await page.getByTestId('start-go').click();
  for (const lang of ['en', 'he']) {
    await page.evaluate((l) => (window as any).__cutforge.store.getState().setLang(l), lang);
    for (const foot of ['polygon', 'circle', 'rounded', 'rect'] as const) {
      await boardTool(page, foot);
      expect(await cramped(page, '.poly-card, .shape-card'), `${lang} ${foot}`).toEqual([]);
    }
    await page.evaluate(() => (window as any).__cutforge.store.getState().setPrefs({ mode: 'quick' }));
    await page.getByTestId('quick-box').click();
    expect(await cramped(page, '.quick-card'), `${lang} box`).toEqual([]);
    await page.evaluate(() => (window as any).__cutforge.store.getState().setPrefs({ mode: 'workshop' }));
  }
});

test('Rich quality draws the stage in its own colour, not tone-mapped grey', async ({ page }) => {
  await organiser(page);
  const stagePixel = () =>
    page.evaluate(() => {
      const c = document.querySelector('.view3d canvas') as HTMLCanvasElement;
      const k = document.createElement('canvas');
      k.width = c.width;
      k.height = c.height;
      const g = k.getContext('2d')!;
      g.drawImage(c, 0, 0);
      // open stage near the bottom left, clear of the box and of the grid's lines
      const d = g.getImageData(Math.round(c.width * 0.2), Math.round(c.height * 0.9), 1, 1).data;
      return [d[0], d[1], d[2]];
    });
  await page.evaluate(() => (window as any).__cutforge.store.getState().setPrefs({ quality: 'simple' }));
  await expect(page.getByTestId('quality')).toHaveAttribute('data-quality', 'simple');
  await page.waitForTimeout(300);
  const simple = await stagePixel();
  await page.evaluate(() => (window as any).__cutforge.store.getState().setPrefs({ quality: 'rich' }));
  await expect(page.getByTestId('quality')).toHaveAttribute('data-quality', 'rich');
  await page.waitForTimeout(800);
  const rich = await stagePixel();
  // #eef1f5 in both (it came out about #dddedf in Rich)
  for (const px of [simple, rich]) for (const [i, v] of [238, 241, 245].entries()) expect(Math.abs(px[i] - v)).toBeLessThanOrEqual(6);
});

test('stage controls stay clear of the card when zoomed in; labels under it hide', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const d = await organiser(page);
  const rect = (sel: string) => page.evaluate((s) => document.querySelector(s)?.getBoundingClientRect().toJSON() ?? null, sel);
  const clear = async (sel: string) => {
    const a = await rect(sel), card = await rect('.card-dock .card');
    if (!a || !card) return true;
    return Math.min(a.right, card.right) - Math.max(a.left, card.left) <= 0 || Math.min(a.bottom, card.bottom) - Math.max(a.top, card.top) <= 0;
  };
  // a grow ghost whose ✓ bar would sit under the card: it is kept beside it, where it can be clicked
  await page.evaluate(() => (window as any).__cutforge.setCamera([0, 200, 20], [0, 20, 0]));
  await page.evaluate((id) => (window as any).__cutforge.store.getState().select({ kind: 'edge', panelId: id, edge: 'e2' }), d.order[6]);
  await expect(page.getByTestId('grow-ghost-bar')).toBeVisible();
  await expect.poll(() => clear('[data-testid=grow-ghost-bar]')).toBe(true);
  await page.getByTestId('grow-go').click();
  expect((await design(page)).order.length).toBe(d.order.length + 1);
  // a wall's width label whose point is beside the card: hidden rather than half under it
  await page.evaluate(() => (window as any).__cutforge.setCamera([0, 130, 170], [0, 20, 0]));
  await page.evaluate((id) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), d.order[2]);
  await expect.poll(() => clear('[data-testid=dim-w]')).toBe(true);
});

for (const shape of ['circle', 'oval'] as const)
  test(`Workshop: a ${shape} base drawn with the Round tool can be walled from its card`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.getByTestId('mat-card-0.5').click();
    await page.getByTestId('start-go').click();
    await boardTool(page, 'circle');
    await page.getByTestId(`round-${shape}`).click();
    const pt = (x: number, z: number) => page.evaluate((a) => (window as any).__cutforge.projectWorld(a[0], 0, a[1]), [x, z]);
    const a = await pt(-50, 40), b = await pt(50, -40);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.up();
    await page.getByTestId('ghost-ok').click();
    await page.getByTestId('extrude').click();
    // it said "a wall stands on each of the 0 edges", and no ghost or ✓ came
    await expect(page.getByTestId('extrude-card')).not.toContainText(' 0 ');
    await page.getByTestId('extrude-go').click();
    const d = await design(page);
    const tray = Object.values<any>(d.trays)[0];
    expect(tray).toBeTruthy();
    expect(d.panels[tray.baseId].sketch.round.seam).toBeTruthy();
    expect(d.order.length).toBeGreaterThan(1);
    expect(errors).toEqual([]);
  });
