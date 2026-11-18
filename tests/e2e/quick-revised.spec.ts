// Quick build revised (LIDS_LINES_PROJECTS_PLAN.md §10, milestone 73): the
// rows of §10.2 as a student does them, in English and Hebrew, wide and narrow.
// A plywood box with a lid is one drag and ✓ and its lid lifts off; Wall / lid
// across a box's top never makes a finger-jointed lid; a carton's card shows
// Lid and Bottom and no other list; nothing Quick build hides is on screen.
import { test, expect, type Page } from '@playwright/test';
import { QUICK_STATE } from './util';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<any>(page, () => (window as any).__cutforge.store.getState().design);
const pt = (page: Page, x: number, z: number) => S<{ x: number; y: number }>(page, (a: number[]) => (window as any).__cutforge.projectWorld(a[0], 0, a[1]), [x, z]);
async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}
async function start(page: Page, mat: string, lang: string) {
  await page.goto('/');
  await page.getByTestId(`mat-${mat}`).click();
  await page.getByTestId('start-go').click();
  await S(page, (l: string) => (window as any).__cutforge.store.getState().setLang(l), lang);
  await S(page, () => (window as any).__cutforge.setCamera([0, 300, 260], [0, 0, 0]));
  await page.waitForTimeout(300);
}
/** Box of a kind: drag the footprint, ✓; the base is selected. */
async function box(page: Page, kind: 'open' | 'lid' | 'carton') {
  await page.getByTestId('quick-box').click();
  await page.getByTestId(`box-kind-${kind}`).click();
  await drag(page, await pt(page, -55, -35), await pt(page, 55, 35));
  await page.getByTestId('extrude-go').click();
  const d = await design(page);
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), d.order[0]);
  return d;
}
/** What Quick build hides (§10.5) is not on screen. */
async function nothingHidden(page: Page) {
  for (const id of ['tray-ends', 'tray-base', 'tray-top', 'tray-bottom', 'tray-corners', 'bend-section', 'cut-choice', 'match-section', 'edge-add-flap', 'closure-lip', 'closure-dust', 'closure-thumb', 'lid-arched', 'yield-text', 'nest', 'save-material', 'kerf-choice'])
    await expect(page.getByTestId(id), id).toHaveCount(0);
}

test.use({ storageState: QUICK_STATE });

for (const lang of ['en', 'he'])
  for (const width of [1400, 1024])
    test(`${lang} ${width}px: a plywood box with a lid is one drag and ✓; its lid lifts off, or hinges; Wall / lid never glues it shut`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewportSize({ width, height: 820 });
      await start(page, 'ply-3', lang);
      const d = await box(page, 'lid');
      // one undo step: the box and its lid
      expect(await S(page, () => (window as any).__cutforge.store.getState().past.length)).toBe(1);
      const trays = Object.values(d.trays) as any[];
      expect(trays).toHaveLength(2);
      expect(trays.filter((t) => t.lidOf)).toHaveLength(1);
      await expect(page.getByTestId('lid-section')).toHaveAttribute('data-lid', 'liftoff');
      await expect(page.getByTestId('lid-liftoff')).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('.field', { has: page.getByTestId('panel-h') })).toContainText(lang === 'en' ? 'Depth' : 'עומק');
      await expect(page.getByTestId('ready-badge')).toHaveAttribute('data-ok', 'true');
      await nothingHidden(page);
      // another kind of lid: one click
      await page.getByTestId('lid-hinged').click();
      await expect(page.getByTestId('lid-section')).toHaveAttribute('data-lid', 'hinged');
      const h = await design(page);
      expect((Object.values(h.trays) as any[]).filter((t) => t.lidOf)).toHaveLength(0);
      expect((Object.values(h.trays) as any[])[0].top).toBe('tuck');
      await expect(page.getByTestId('ready-badge')).toHaveAttribute('data-ok', 'true');
      // None, then Wall / lid across the top: the box's lid again, never fingers
      await page.getByTestId('lid-none').click();
      await expect(page.getByTestId('lid-section')).toHaveAttribute('data-lid', 'none');
      const n = await design(page);
      const base = n.order[0];
      const back = (Object.values(n.connections) as any[]).find((c) => c.grown && c.a.panelId === base && c.a.edge === 'e2').b.panelId;
      await page.getByTestId('quick-wall').click();
      const bw = n.panels[back];
      const e2 = await S<{ x: number; y: number }>(page, (a: any) => (window as any).__cutforge.project(a.id, a.x, a.y), { id: back, x: bw.w * 0.2, y: bw.h });
      await page.mouse.move(e2.x, e2.y, { steps: 3 });
      await page.mouse.click(e2.x, e2.y);
      await expect(page.getByTestId('grow-closes')).toHaveAttribute('data-lid', 'liftoff');
      await page.getByTestId('grow-go').click();
      const w = await design(page);
      expect((Object.values(w.connections) as any[]).filter((c) => c.grown && c.a.panelId === back && c.a.edge === 'e2')).toEqual([]);
      expect((Object.values(w.trays) as any[]).filter((t) => t.lidOf)).toHaveLength(1);
      expect(errors).toEqual([]);
    });

for (const lang of ['en', 'he'])
  test(`${lang}: a card carton: Lid and Bottom as pictures and no other list; No glue; Use less board; the download says where the kerf is`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await start(page, 'card-0.5', lang);
    // greyed for a regular footprint, with its reason
    await page.getByTestId('quick-box').click();
    await page.getByTestId('box-regular').click();
    await page.getByTestId('box-kind-carton').click({ force: true });
    await expect(page.getByTestId('box-kind-why')).toBeVisible();
    await page.getByTestId('box-rect').click();
    await page.getByTestId('tool-select').click();
    const d = await box(page, 'carton');
    const tray = Object.values(d.trays)[0] as any;
    expect(tray).toMatchObject({ base: 'open', bottom: 'snap', top: 'tuck' });
    await expect(page.getByTestId('carton-bottom-snap')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('lid-section')).toHaveAttribute('data-lid', 'hinged');
    await expect(page.getByTestId('lid-liftoff')).toHaveAttribute('aria-disabled', 'true');
    await nothingHidden(page);
    await page.getByTestId('carton-bottom-tuck').click();
    expect((Object.values((await design(page)).trays)[0] as any).bottom).toBe('tuck');
    // the lid's card: its closure style, not its details
    await page.getByTestId('lid-select').click();
    await expect(page.getByTestId('closure-section')).toBeVisible();
    await expect(page.getByTestId('lid-section')).toBeVisible();
    await nothingHidden(page);
    // No glue: one switch in the settings card
    await S(page, () => (window as any).__cutforge.store.getState().select(null));
    await page.getByTestId('settings-no-glue').check();
    const g = await design(page);
    expect((Object.values(g.connections) as any[]).filter((c) => c.trayId && !c.grown && c.kind === 'glue')).toEqual([]);
    expect((Object.values(g.connections) as any[]).some((c) => c.kind === 'lock')).toBe(true);
    // Use less board on the cut plan
    await page.getByTestId('view-2d').click();
    await nothingHidden(page);
    await page.getByTestId('use-less').click();
    await expect(page.getByTestId('less-text')).toBeVisible();
    await page.getByTestId('less-close').click();
    // the download: nominal, and where the kerf is set
    await page.getByTestId('open-export').click();
    await expect(page.getByTestId('kerf-choice')).toHaveCount(0);
    await expect(page.getByTestId('kerf-box')).toContainText('0.1');
    expect(errors).toEqual([]);
  });

test.describe('Workshop', () => {
  test.use({ storageState: { cookies: [], origins: ['http://localhost:5199'].map((origin) => ({ origin, localStorage: [{ name: 'cutforge.viewPrefs', value: JSON.stringify({ mode: 'workshop' }) }] })) } });
  test('the Lid section replaces the two buttons, with Arched; the lists and details are all there', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('mat-card-0.5').click();
    await page.getByTestId('start-go').click();
    const base = await S<string>(page, () => {
      const cf = (window as any).__cutforge;
      let b = '';
      cf.store.getState().apply((d: any) => {
        b = cf.ops.addRootPanel(d, -60, 40, 120, 80);
        cf.ops.addTray(d, b, 60);
        cf.ops.autoConnect(d);
      });
      cf.store.getState().select({ kind: 'panel', id: b });
      return b;
    });
    expect(base).toBeTruthy();
    await expect(page.getByTestId('lid-section')).toHaveAttribute('data-lid', 'none');
    await expect(page.getByTestId('tray-ends')).toBeVisible();
    await expect(page.locator('.field', { has: page.getByTestId('panel-h') })).toContainText('Height');
    await page.getByTestId('lid-arched').click();
    await expect(page.getByTestId('lid-section')).toHaveAttribute('data-lid', 'arched');
    await page.getByTestId('lid-hinged').click();
    await expect(page.getByTestId('lid-section')).toHaveAttribute('data-lid', 'hinged');
    await page.getByTestId('lid-select').click();
    await expect(page.getByTestId('closure-lip')).toBeVisible();
    await page.getByTestId('view-2d').click();
    await expect(page.getByTestId('nest')).toBeVisible();
    await expect(page.getByTestId('use-less')).toBeVisible();
  });
});
