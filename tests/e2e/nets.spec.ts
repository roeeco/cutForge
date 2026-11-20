// Milestone 113 (D1): the cut plan's Nets — the nets picked edge by edge, the folded model beside them.
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;

async function cardTray(page: Page, lang: 'en' | 'he') {
  await page.goto('/');
  if (lang === 'he') await S(page, () => (window as any).__cutforge.store.getState().setLang('he'));
  await page.getByTestId('mat-card-0.5').click();
  await page.getByTestId('start-go').click();
  return S<{ base: string; walls: string[] }>(page, () => {
    const cf = (window as any).__cutforge;
    let out = { base: '', walls: [] as string[] };
    cf.store.getState().apply((d: any) => {
      const b = cf.ops.addRootPanel(d, -50, 35, 100, 70);
      const walls = ['e0', 'e1', 'e2', 'e3'].map((e) => cf.ops.growPanel(d, b, e, { height: 40, angle: 90, dir: 'up', kind: 'fold' }).panelId);
      cf.ops.autoConnect(d);
      out = { base: b, walls };
    });
    return out;
  });
}

for (const lang of ['en', 'he'] as const) {
  test(`Nets: pick a wall top (the edge card), a fold (its joint), the preview folds (${lang})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const { walls } = await cardTray(page, lang);
    await page.getByTestId('view-2d').click();
    await expect(page.getByTestId('cutplan')).toBeVisible();
    await page.getByTestId('plan-mode-nets').click();
    await expect(page.getByTestId('net-view')).toBeVisible();
    await expect(page.getByTestId('net-preview')).toBeVisible();
    for (const w of walls) await expect(page.getByTestId(`net-edge-${w}-e2`)).toHaveCount(1);
    // a wall's top: the edge card
    await page.getByTestId(`net-edge-${walls[2]}-e2`).dispatchEvent('pointerdown', { button: 0, bubbles: true });
    await expect(page.getByTestId('edgebar')).toBeVisible();
    expect(await S<any>(page, () => (window as any).__cutforge.store.getState().selection)).toMatchObject({ kind: 'edge', panelId: walls[2], edge: 'e2' });
    // a fold: its board selected, its joint open
    await page.getByTestId(`net-edge-${walls[0]}-e0`).dispatchEvent('pointerdown', { button: 0, bubbles: true });
    const st = await S<any>(page, () => ({ sel: (window as any).__cutforge.store.getState().selection, open: (window as any).__cutforge.store.getState().openJoint }));
    expect(st.sel).toMatchObject({ kind: 'panel', id: walls[0] });
    expect(st.open).toBeTruthy();
    // the fold slider in the preview
    await page.getByTestId('fold-play').click();
    await expect.poll(() => S<number>(page, () => (window as any).__cutforge.store.getState().foldT)).toBe(0);
    // the preview can be turned off, and the choice is kept
    await page.getByTestId('net-preview-toggle').click();
    await expect(page.getByTestId('net-preview')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('a narrow window shows the preview in place of the net, on request', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await cardTray(page, 'en');
  await page.getByTestId('view-2d').click();
  // (at 800 px the plan dock is crowded and the switch sits under the card: dispatched rather than clicked)
  await page.getByTestId('plan-mode-nets').dispatchEvent('click');
  await expect(page.getByTestId('net-view')).toBeVisible();
  await expect(page.getByTestId('net-preview')).toHaveCount(0);
  await page.getByTestId('net-preview-toggle').dispatchEvent('click');
  await expect(page.getByTestId('net-preview')).toBeVisible();
});

test('Quick build has no Nets switch, and a stored choice shows the sheets', async ({ page }) => {
  await cardTray(page, 'en');
  await S(page, () => (window as any).__cutforge.store.getState().setPrefs({ planMode: 'nets', mode: 'quick' }));
  await page.getByTestId('view-2d').click();
  await expect(page.getByTestId('cutplan')).toBeVisible();
  await expect(page.getByTestId('plan-mode-nets')).toHaveCount(0);
  await expect(page.getByTestId('net-view')).toHaveCount(0);
});
