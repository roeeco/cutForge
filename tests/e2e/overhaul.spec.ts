// Visual overhaul: start screen, material drawer, stage widgets (angle dial,
// flip badge, in-place dimensions), seam pills and the fold slider.
import { setNum } from './util';
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const state = (page: Page) => S(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState())));
const design = async (page: Page) => (await state(page)).design;

test('start screen, drawer, stage widgets, seam pills and folding', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');

  // start screen: material first, then a template drawn by the renderer
  await page.getByTestId('mat-corr-1.6').click();
  await expect(page.getByTestId('mat-corr-1.6')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('tpl-organiser').check();
  await expect(page.getByTestId('tpl-organiser').locator('img')).toHaveAttribute('src', /^data:image\/png/);
  await page.getByTestId('start-go').click();
  let d = await design(page);
  expect(d.material.id).toBe('corr-1.6');
  expect(d.template.id).toBe('organiser');

  // role names instead of numbers
  await S(page, () => (window as any).__cutforge.store.getState().select({ kind: 'panel', id: 't:wall0' }));
  await expect(page.getByTestId('inspector-panel').locator('h3')).toHaveText('Front wall');

  // fold slider (view only): unfold flat and back; the model does not change
  await page.getByTestId('fold-play').click();
  await expect.poll(async () => (await state(page)).foldT).toBe(0);
  await expect(page.locator('.view-hint')).toContainText('unfolded');
  expect((await design(page)).panels['t:wall0']).toEqual(d.panels['t:wall0']);
  await page.getByTestId('fold-play').click();
  await expect.poll(async () => (await state(page)).foldT).toBe(1);

  // material & sheet drawer: the only place for calibration values
  await S(page, () => (window as any).__cutforge.store.getState().select(null));
  await expect(page.getByTestId('mat-kerf')).toHaveCount(0);
  await page.getByTestId('material-pill').click();
  await expect(page.getByTestId('material-drawer')).toBeVisible();
  await page.getByTestId('drawer-mat-ply-3').click();
  await setNum(page, 'mat-kerf', '0.2');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('material-drawer')).toHaveCount(0);
  d = await design(page);
  expect(d.material.kind).toBe('plywood');
  expect(d.material.kerf).toBe(0.2);

  // in-place dimension on the selected panel
  await S(page, () => (window as any).__cutforge.store.getState().select({ kind: 'panel', id: 't:base' }));
  await page.getByTestId('dim-w').click();
  await page.getByTestId('dim-w-input').fill('200');
  await page.getByTestId('dim-w-input').press('Enter');
  await expect.poll(async () => (await design(page)).panels['t:base'].w).toBe(200);

  // joints are hidden on the stage until turned on; a pill opens the joint's menu: its kinds, and all its settings in the card
  await expect(page.getByTestId('seam-pill-finger')).toHaveCount(0);
  await page.getByTestId('toggle-joints').click();
  // the joints view hides the move and grow handles
  await expect(page.getByTestId('dim-w')).toHaveCount(0);
  await page.getByTestId('seam-pill-finger').first().click();
  await expect(page.getByTestId('joint-menu')).toBeVisible();
  await expect(page.getByTestId('joint-kind-tabslot')).toBeVisible();
  await page.getByTestId('joint-more').click();
  await expect.poll(async () => (await state(page)).openJoint).toBeTruthy();
  await expect(page.getByTestId('conn-fingers')).toBeVisible();
  // change a joint from its label
  const fingers = Object.values((await design(page)).connections).filter((c: any) => c.kind === 'finger').length;
  await page.getByTestId('seam-pill-finger').first().click();
  await page.getByTestId('joint-kind-tabslot').click();
  await expect.poll(async () => Object.values((await design(page)).connections).filter((c: any) => c.kind === 'finger').length).toBeLessThan(fingers);
  await page.getByTestId('undo').click();
  await page.getByTestId('toggle-joints').click();

  // grow card: 360° hinge dial (ticks, arrow keys, typing), zones, ghost height label
  await S(page, () => (window as any).__cutforge.store.getState().select({ kind: 'edge', panelId: 't:wall0', edge: 2 }));
  await expect(page.getByTestId('edgebar')).toBeVisible();
  await page.getByTestId('grow-angle-60').click();
  expect((await state(page)).grow.angle).toBe(60);
  await page.getByTestId('grow-angle-60').press('ArrowDown');
  expect((await state(page)).grow.angle).toBe(55);
  await expect(page.getByTestId('lean-needs-walls')).toBeVisible();
  await page.getByTestId('grow-angle-270').click();
  expect((await state(page)).grow.angle).toBe(270);
  await page.getByTestId('grow-angle-value').click();
  await page.getByTestId('grow-angle-input').fill('120');
  await page.getByTestId('grow-angle-input').press('Enter');
  expect((await state(page)).grow.angle).toBe(120);
  await expect(page.getByTestId('grow-angle-msg')).toContainText('only a glued edge');
  await expect(page.getByTestId('grow-go')).toBeEnabled();
  await page.getByTestId('grow-angle-0').click();
  await expect(page.getByTestId('grow-go')).toBeDisabled();
  await page.getByTestId('grow-angle-90').click();
  await page.getByTestId('ghost-dim-h').click();
  await page.getByTestId('ghost-dim-h-input').fill('75');
  await page.getByTestId('ghost-dim-h-input').press('Enter');
  expect((await state(page)).grow.height).toBe(75);

  // view settings: outlines and quality are per-browser preferences
  await page.getByTestId('open-view-settings').click();
  await page.getByTestId('pref-outlines').uncheck();
  await page.getByTestId('pref-quality-simple').click();
  const prefs = (await state(page)).viewPrefs;
  expect(prefs).toMatchObject({ outlines: false, quality: 'simple' });
  await expect(page.getByTestId('quality')).toHaveAttribute('data-quality', 'simple');

  // project menu holds the file actions
  await page.getByTestId('project-menu').click();
  await expect(page.getByTestId('save-project')).toBeVisible();
  await expect(page.getByTestId('open-teacher')).toBeVisible();
  await page.keyboard.press('Escape');

  expect(errors).toEqual([]);
});
