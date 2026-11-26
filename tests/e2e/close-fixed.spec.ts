// 26 November: closing a box for good in Workshop (Fixed, every material), and joint kinds a design's construction
// does not take greyed with why.
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));

async function box(page: Page, mat: string) {
  await page.goto('/');
  await page.getByTestId(`mat-${mat}`).click();
  await page.getByTestId('start-go').click();
  return S<{ base: string; tray: string; back: string }>(page, () => {
    const { store, ops } = (window as any).__cutforge;
    let out = { base: '', tray: '', back: '' };
    store.getState().apply((d: any) => {
      const base = ops.addRootPanel(d, 0, 0, 120, 80);
      const tray = ops.addTray(d, base, 60);
      ops.autoConnect(d);
      const back = (Object.values(d.connections) as any[]).find((c) => c.grown && c.a.panelId === base && c.a.edge === 'e2').b.panelId;
      out = { base, tray, back };
    });
    return out;
  });
}

/** The boards the top is joined to, none broken. */
const joined = (d: any, id: string) => new Set((Object.values(d.connections) as any[]).filter((c) => !c.broken && (c.a.panelId === id || c.b.panelId === id)).map((c) => (c.a.panelId === id ? c.b.panelId : c.a.panelId))).size;

test('card: a board grown across the top with a glue flap closes the box for good, joined to every wall', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { base, back } = await box(page, 'card-0.5');
  await S(page, (back: string) => {
    const s = (window as any).__cutforge.store.getState();
    s.select({ kind: 'edge', panelId: back, edge: 'e2' });
    s.setGrow({ height: 79.5, angle: 90, kind: 'glue' });
  }, back);
  // a joint that does not fold asks for a board joined shut: Fixed first, the folded lids after it
  await expect(page.getByTestId('grow-closes')).toHaveAttribute('data-close', 'fixed');
  await expect(page.getByTestId('grow-close-tuck')).toBeVisible();
  const past = await S<number>(page, () => (window as any).__cutforge.store.getState().past.length);
  await page.getByTestId('grow-go').click();
  const d = await design(page);
  const top = (Object.values(d.connections) as any[]).find((c) => c.grown && c.a.panelId === back && c.a.edge === 'e2');
  expect(top.kind).toBe('glue');
  expect(joined(d, top.b.panelId)).toBe(4);
  expect((Object.values(d.connections) as any[]).some((c) => c.kind === 'closure')).toBe(false);
  expect(await S<string[]>(page, () => (window as any).__cutforge.issues())).toEqual([]);
  expect(await S<number>(page, () => (window as any).__cutforge.store.getState().past.length)).toBe(past + 1);
  // the box's card says so
  await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), base);
  await expect(page.getByTestId('lid-section')).toHaveAttribute('data-lid', 'fixed');
  expect(errors).toEqual([]);
});

for (const mat of ['corr-1.6', 'corr-4', 'ply-3'])
  test(`${mat}: Fixed in the Lid section closes the box; None opens it again`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const { base } = await box(page, mat);
    await S(page, (id: string) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), base);
    await page.getByTestId('lid-fixed').click();
    await expect(page.getByTestId('lid-section')).toHaveAttribute('data-lid', 'fixed');
    const d = await design(page);
    const top = Object.keys(d.panels).find((id) => !(Object.values(d.connections) as any[]).some((c) => c.grown && c.b.panelId === id && c.trayId) && id !== base)!;
    expect(joined(d, top)).toBe(4);
    expect(await S<string[]>(page, () => (window as any).__cutforge.issues())).toEqual([]);
    await page.getByTestId('lid-none').click();
    await expect(page.getByTestId('lid-section')).toHaveAttribute('data-lid', 'none');
    expect(errors).toEqual([]);
  });

test('a kind the construction does not take is greyed, with why: the settings card and a carton corner', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('start-go').click();
  await S(page, () => (window as any).__cutforge.startTemplate('scoopTray', 'ply-3'));
  await S(page, () => (window as any).__cutforge.store.getState().select(null));
  if (!(await page.getByTestId('joints-base').count())) await page.getByTestId('settings-head-joints').click();
  // tabs and slots would cut a slot too near an edge of this tray
  await expect(page.getByTestId('joints-base-tabslot')).toBeDisabled();
  await expect(page.getByTestId('joints-base-why')).toContainText('Tabs and slots');
  await expect(page.getByTestId('joints-corner-finger')).toBeEnabled();
  // a card carton's net folds three corners: nothing else is offered there
  await S(page, () => (window as any).__cutforge.startTemplate('carton', 'card-0.5'));
  await S(page, () => {
    const s = (window as any).__cutforge.store.getState();
    const c = (Object.values(s.design.connections) as any[]).find((x) => !x.grown && x.kind === 'fold');
    s.select({ kind: 'panel', id: c.a.panelId });
    s.set({ openJoint: c.id });
  });
  if (!(await page.getByTestId('inspector-connection').count())) await page.getByRole('button', { name: /Joints/ }).first().click();
  await expect(page.getByTestId('conn-kind')).toHaveValue('fold');
  await expect(page.getByTestId('conn-kind-glue')).toBeDisabled();
  await expect(page.getByTestId('conn-kind-why')).toContainText('the way this box is built keeps this joint as it is');
  expect(errors).toEqual([]);
});
