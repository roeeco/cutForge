// The settings card on a short stage (milestone 27) and design-wide joints the
// material does not allow (milestone 26).
import { test, expect, type Page } from '@playwright/test';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));

async function start(page: Page, mat: string, template?: string) {
  await page.goto('/');
  await page.getByTestId(`mat-${mat}`).click();
  if (template) await page.getByTestId(`tpl-${template}`).click();
  await page.getByTestId('start-go').click();
  await page.getByTestId('hints-dismiss').click();
}

const scrolls = (page: Page) => S<boolean>(page, () => {
  const a = document.querySelector('.card-dock .inspector')!;
  return a.scrollHeight > a.clientHeight + 1;
});

test.describe('milestone 27: the settings card on a Chromebook (1366 × 768)', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('sections with summaries; the default card does not scroll; the open state is kept', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await start(page, 'corr-1.6');
    await expect(page.getByTestId('inspector-design')).toBeVisible();
    // Joints open, the others closed, and nothing to scroll
    await expect(page.getByTestId('settings-head-joints')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('settings-head-material')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('settings-head-snapping')).toHaveAttribute('aria-expanded', 'false');
    expect(await scrolls(page)).toBe(false);
    // closed sections say what is set
    await expect(page.getByTestId('settings-sum-material')).toHaveText('Corrugated 1.6 mm · clearance 0.2');
    await expect(page.getByTestId('settings-sum-snapping')).toHaveText('Smart · Grid 1 mm · 15°');
    await expect(page.getByTestId('joints-base')).toBeVisible();
    await expect(page.getByTestId('settings-clearance')).toHaveCount(0);
    // open Snapping, reload: still open (and the design is restored from autosave)
    await page.getByTestId('settings-head-snapping').click();
    await expect(page.getByTestId('settings-snap')).toBeVisible();
    await page.getByTestId('settings-snap').click();
    await page.reload();
    await page.getByTestId('hints-dismiss').click({ timeout: 2000 }).catch(() => {});
    await expect(page.getByTestId('settings-head-snapping')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('settings-snap')).toHaveAttribute('aria-pressed', 'false');
    // the closed summary follows the setting
    await page.getByTestId('settings-head-snapping').click();
    await expect(page.getByTestId('settings-sum-snapping')).toHaveText('Smart off · Grid 1 mm · 15°');
    expect(errors).toEqual([]);
  });

  test('a long template keeps its sizes open; Joints closes to make room', async ({ page }) => {
    await start(page, 'corr-1.6', 'organiser');
    await expect(page.getByTestId('settings-head-template')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('tp-width')).toBeVisible();
    await expect(page.getByTestId('settings-head-joints')).toHaveAttribute('aria-expanded', 'false');
    await page.getByTestId('settings-head-template').click();
    await expect(page.getByTestId('settings-sum-template')).toContainText('160 × 110 × 45 mm');
    expect(await scrolls(page)).toBe(false);
  });
});

test('milestone 26: a design-wide joint the new material does not allow is named, and comes back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, 'ply-3');
  await S(page, () => {
    const cf = (window as any).__cutforge;
    cf.store.getState().apply((d: any) => {
      const b = cf.ops.addRootPanel(d, -40, 30, 80, 60);
      for (const e of [0, 1, 2, 3]) cf.ops.growPanel(d, b, e, { height: 40, angle: 90, dir: 'up', kind: 'finger' });
      cf.ops.autoConnect(d);
    });
    cf.store.getState().select(null);
  });
  await page.getByTestId('joints-corner').selectOption('finger');
  await expect(page.getByTestId('joints-corner-inactive')).toHaveCount(0);
  // switch to card in the drawer
  await page.getByTestId('settings-head-material').click();
  await page.getByTestId('open-drawer').click();
  await page.getByTestId('drawer-mat-card-0.5').click();
  await page.getByTestId('drawer-close').click();
  const note = page.getByTestId('joints-corner-inactive');
  await expect(note).toBeVisible();
  await expect(note).toContainText('Finger joint does not work on card');
  await expect(note).toContainText('plywood');
  const used = await page.getByTestId('joints-corner').inputValue();
  await expect(note).toContainText(await page.getByTestId('joints-corner').locator(`option[value="${used}"]`).innerText());
  expect((await design(page)).joints).toEqual({ plywood: { corner: 'finger' } });
  // back to plywood: fingers again, no note
  await page.getByTestId('open-drawer').click();
  await page.getByTestId('drawer-mat-ply-3').click();
  await page.getByTestId('drawer-close').click();
  await expect(page.getByTestId('joints-corner-inactive')).toHaveCount(0);
  await expect(page.getByTestId('joints-corner')).toHaveValue('finger');
  expect(errors).toEqual([]);
});
