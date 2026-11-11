// Milestone 43: the first-use tour from the welcome screen (TOUR_PLAN.md).
import { test, expect, type Page, type Locator } from '@playwright/test';
import { setNum } from './util';

// the tour is off (TOUR_OFFERED in src/tour/TourNudge.tsx) until its issues are fixed
test.skip(true, 'the tour is not offered for now');

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S<any>(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));
const world = (page: Page, x: number, y: number, z: number) => S<{ x: number; y: number }>(page, (a: number[]) => (window as any).__cutforge.projectWorld(a[0], a[1], a[2]), [x, y, z]);
const onFace = (page: Page, id: string, x: number, y: number, face = 1) => S<{ x: number; y: number }>(page, (a: any) => (window as any).__cutforge.projectFace(a.id, a.x, a.y, a.face), { id, x, y, face });
const card = (page: Page) => page.getByTestId('tour-card');
const atStep = (page: Page, id: string) => expect(card(page)).toHaveAttribute('data-step', id, { timeout: 15_000 });

/** The tour's box as it stands: base, walls by position, the lid, dividers, cut-outs on the walls. */
async function box(page: Page) {
  return S<any>(page, () => {
    const d = (window as any).__cutforge.store.getState().design;
    const tray: any = Object.values(d.trays ?? {})[0];
    const conns: any[] = Object.values(d.connections);
    const walls = tray ? conns.filter((c) => c.grown && c.trayId === tray.id).map((c) => c.b.panelId) : [];
    const z = (id: string) => d.panels[id].frame.o[2] + d.panels[id].frame.u[2] * d.panels[id].w / 2;
    const back = walls.length ? walls.reduce((a: string, b: string) => (z(b) < z(a) ? b : a)) : null;
    const front = walls.length ? walls.reduce((a: string, b: string) => (z(b) > z(a) ? b : a)) : null;
    const lids = conns.filter((c) => c.grown && walls.includes(c.a.panelId) && c.a.edge.startsWith('e2')).map((c) => c.b.panelId);
    const dividers = tray ? conns.filter((c) => c.grown && c.a.panelId === tray.baseId && c.offset > 8 && !c.trayId).map((c) => c.b.panelId) : [];
    const cuts = walls.flatMap((id: string) => d.panels[id].details.filter((dt: any) => dt.op === 'cut').map(() => id));
    return { base: tray?.baseId ?? d.order[0], walls, back, front, lids, dividers, cuts, material: d.material.id };
  });
}

/** The ring's box contains the anchor's box (a DOM anchor) or point (a stage anchor). */
async function ringOn(page: Page, anchor: Locator | { x: number; y: number }) {
  await expect(async () => {
    const r = (await page.getByTestId('tour-ring').boundingBox())!;
    const a = 'x' in anchor ? { x: anchor.x, y: anchor.y, width: 0, height: 0 } : (await anchor.boundingBox())!;
    expect(r.x).toBeLessThanOrEqual(a.x + 0.5);
    expect(r.y).toBeLessThanOrEqual(a.y + 0.5);
    expect(r.x + r.width).toBeGreaterThanOrEqual(a.x + a.width - 0.5);
    expect(r.y + r.height).toBeGreaterThanOrEqual(a.y + a.height - 0.5);
  }).toPass({ timeout: 10_000 });
}

async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 8, a.y + ((b.y - a.y) * i) / 8);
  await page.mouse.up();
}

/** Skip or Next through the remaining steps until the last card, then Done. */
async function skipToEnd(page: Page) {
  for (let i = 0; i < 14; i++) {
    const step = await card(page).getAttribute('data-step');
    if (step === 'finish') break;
    const skip = page.getByTestId('tour-skip');
    if (await skip.isVisible()) await skip.click();
    else await page.getByTestId('tour-next').click();
    await expect(card(page)).not.toHaveAttribute('data-step', step!);
  }
  await atStep(page, 'finish');
  await page.getByTestId('tour-done').click();
  await expect(card(page)).toHaveCount(0);
}

test('the tour in English, every step done by hand: a box with a lid, a divider and a window', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('tour-offer')).toBeVisible();
  await page.getByTestId('tour-start').click();
  // 0 welcome: in the Workshop, on a new plywood design
  await atStep(page, 'welcome');
  await expect(page.getByTestId('mode-workshop')).toHaveAttribute('aria-checked', 'true');
  expect((await design(page)).material.id).toBe('ply-3');
  await expect(page.getByTestId('tour-dim')).toBeVisible();
  await page.getByTestId('tour-go').click();
  // 1 the Board tool
  await atStep(page, 'tool');
  await expect(page.getByTestId('tour-count')).toContainText('1 of 12');
  await ringOn(page, page.getByTestId('tool-panel'));
  await page.getByTestId('tool-panel').click();
  // 2 a base on the floor: the animated hand shows until the drag starts
  await atStep(page, 'base');
  await expect(page.getByTestId('tour-hand')).toBeVisible();
  await ringOn(page, await world(page, 0, 0, 0));
  await drag(page, await world(page, -60, 0, 40), await world(page, 60, 0, -40));
  // 3 the Standing board button (explain only)
  await atStep(page, 'perpendicular');
  await ringOn(page, page.getByTestId('tool-panel-standing'));
  await page.getByTestId('tour-next').click();
  // 4 walls: select the base, Extrude walls, ✓
  await atStep(page, 'walls');
  let b = await box(page);
  const d0 = await design(page);
  expect([d0.panels[b.base].w, d0.panels[b.base].h]).toEqual([120, 80]);
  // the base was selected when it was made: the spotlight is on Extrude walls already; deselected, it is on the base
  await ringOn(page, page.getByTestId('extrude'));
  await page.keyboard.press('Escape');
  await ringOn(page, await onFace(page, b.base, 60, 40));
  const bc = await onFace(page, b.base, 60, 40);
  await page.mouse.click(bc.x, bc.y);
  await ringOn(page, page.getByTestId('extrude'));
  await page.getByTestId('extrude').click();
  await ringOn(page, page.getByTestId('extrude-go'));
  await page.getByTestId('extrude-go').click();
  // 5 the lid: the back wall's top edge, grown to the front wall, ✓
  await atStep(page, 'lid');
  b = await box(page);
  expect(b.walls).toHaveLength(4);
  const back = (await design(page)).panels[b.back];
  await expect(async () => {
    const mid = await S<{ x: number; y: number }>(page, (a: any) => (window as any).__cutforge.project(a.id, a.x, a.y), { id: b.back, x: back.w / 2, y: back.h / 2 });
    const top = await S<{ x: number; y: number }>(page, (a: any) => (window as any).__cutforge.project(a.id, a.x, a.y), { id: b.back, x: back.w * 0.4, y: back.h });
    await page.mouse.move(mid.x, mid.y, { steps: 2 });
    await page.mouse.move(top.x, top.y, { steps: 3 });
    await page.mouse.click(top.x, top.y);
    await expect(page.getByTestId('grow-go')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await ringOn(page, page.getByTestId('grow-go'));
  await setNum(page, 'grow-height', '80');
  await page.getByTestId('grow-go').click();
  // 6 card
  await atStep(page, 'material');
  await ringOn(page, page.getByTestId('material-pill'));
  await page.getByTestId('material-pill').click();
  await ringOn(page, page.getByTestId('drawer-mat-card-0.5'));
  await page.getByTestId('drawer-mat-card-0.5').click();
  // 7 what changed: the joints view is on (explain only)
  await atStep(page, 'changed');
  await expect(page.getByTestId('toggle-joints')).toHaveAttribute('aria-pressed', 'true');
  await ringOn(page, page.getByTestId('toggle-joints'));
  await page.getByTestId('tour-next').click();
  // 8 corners: another kind from the design card's list
  await atStep(page, 'corners');
  const corner = page.getByTestId('joints-corner');
  await ringOn(page, corner);
  const now = await corner.inputValue();
  const other = (await corner.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))).find((v) => v !== now)!;
  await corner.selectOption(other);
  // 9 back to plywood
  await atStep(page, 'plywood');
  await page.getByTestId('material-pill').click();
  await page.getByTestId('drawer-mat-ply-3').click();
  // 10 a divider: the Standing board tool, a line across the box's floor from wall to wall
  await atStep(page, 'divider');
  await ringOn(page, page.getByTestId('tool-panel-standing'));
  await page.getByTestId('tool-panel-standing').click();
  await page.waitForTimeout(300);
  await drag(page, await onFace(page, b.base, 6, 40), await onFace(page, b.base, 114, 40));
  // 11 a window on the front wall: Shapes → Circle, Cut out, drag, ✓
  await atStep(page, 'cutter');
  await page.waitForTimeout(300);
  await ringOn(page, page.getByTestId('tool-shapes'));
  await page.getByTestId('tool-shapes').click();
  await ringOn(page, page.getByTestId('tool-circle'));
  await page.getByTestId('tool-circle').click();
  await expect(page.getByTestId('op-cut')).toHaveAttribute('aria-checked', 'true');
  const fw = (await design(page)).panels[b.front];
  await drag(page, await onFace(page, b.front, fw.w / 2 - 10, fw.h / 2 - 8, -1), await onFace(page, b.front, fw.w / 2 + 6, fw.h / 2 + 8, -1));
  await ringOn(page, page.getByTestId('ghost-ok'));
  await page.getByTestId('ghost-ok').click();
  // 12 finish
  await atStep(page, 'finish');
  await ringOn(page, page.getByTestId('open-export'));
  await page.getByTestId('tour-done').click();
  await expect(card(page)).toHaveCount(0);
  b = await box(page);
  expect(b.walls).toHaveLength(4);
  expect(b.lids).toHaveLength(1);
  expect(b.dividers).toHaveLength(1);
  expect(b.cuts).toContain(b.front);
  expect(b.material).toBe('ply-3');
  expect(await S<string | null>(page, () => localStorage.getItem('cutforge.tourDone'))).toBe('1');
  expect(errors).toEqual([]);
});

test('the tour in Hebrew: the card sits on the stage side of the rail in RTL; Skip step through to the end makes the same box', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('lang-toggle-dialog').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByTestId('tour-start').click();
  await atStep(page, 'welcome');
  await page.getByTestId('tour-go').click();
  await atStep(page, 'tool');
  // the rail is at the right in Hebrew: the card is to its left, not over it
  const rail = (await page.getByTestId('tool-panel').boundingBox())!;
  const c = (await card(page).boundingBox())!;
  expect(c.x + c.width).toBeLessThanOrEqual(rail.x);
  await expect(page.getByTestId('tour-count')).toContainText('1 מתוך 12');
  await skipToEnd(page);
  const b = await box(page);
  expect(b.walls).toHaveLength(4);
  expect(b.lids).toHaveLength(1);
  expect(b.dividers).toHaveLength(1);
  expect(b.cuts).toContain(b.front);
  expect(b.material).toBe('ply-3');
  expect(errors).toEqual([]);
});

test('ending the tour keeps the design; next time the welcome screen offers a link; the menu asks before replacing a design', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tour-start').click();
  await page.getByTestId('tour-go').click();
  await page.getByTestId('tour-skip').click();
  await page.getByTestId('tour-skip').click();
  await atStep(page, 'perpendicular');
  await page.getByTestId('tour-next').click();
  await atStep(page, 'walls');
  const before = await design(page);
  expect(before.order).toHaveLength(1);
  await page.getByTestId('tour-end').click();
  await expect(card(page)).toHaveCount(0);
  expect((await design(page)).order).toEqual(before.order);
  // the menu's tour asks first: No keeps the design
  let asked = 0;
  page.once('dialog', (dl) => (asked++, dl.dismiss()));
  await page.getByTestId('project-menu').click();
  await page.getByTestId('menu-tour').click();
  expect(asked).toBe(1);
  await expect(card(page)).toHaveCount(0);
  expect((await design(page)).order).toEqual(before.order);
  // New design: the welcome screen now has the footer link, not the card
  page.once('dialog', (dl) => dl.accept());
  await page.getByTestId('project-menu').click();
  await page.getByTestId('new-design').click();
  await expect(page.getByTestId('material-dialog')).toBeVisible();
  await expect(page.getByTestId('tour-offer')).toHaveCount(0);
  await expect(page.getByTestId('tour-link')).toBeVisible();
  await page.getByTestId('tour-link').click();
  await atStep(page, 'welcome');
  // a Start without the tour: no "New here?" note once the tour was taken
  await page.getByTestId('tour-not-now').click();
  await expect(page.getByTestId('tour-nudge')).toHaveCount(0);
});

test('a first-time student who chose Start gets one "New here?" note; it opens the tour', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-go').click();
  await expect(page.getByTestId('tour-nudge')).toBeVisible();
  await page.getByTestId('tour-nudge-go').click();
  await atStep(page, 'welcome');
  await expect(page.getByTestId('tour-nudge')).toHaveCount(0);
});

test.describe('a class that locks Quick build', () => {
  test.use({ storageState: { cookies: [], origins: ['http://localhost:5199', 'http://localhost:5299'].map((origin) => ({ origin, localStorage: [{ name: 'cutforge.viewPrefs', value: JSON.stringify({ mode: 'quick', modeLocked: true }) }] })) } });
  test('the welcome screen does not offer the tour', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('material-dialog')).toBeVisible();
    await expect(page.getByTestId('tour-start')).toHaveCount(0);
    await expect(page.getByTestId('tour-link')).toHaveCount(0);
  });
});

for (const [w, h] of [[1366, 768], [1280, 800]]) {
  test(`at ${w} × ${h}, in both languages, no card hides the Download button or the rail, or leaves the window`, async ({ browser }) => {
    test.setTimeout(180_000);
    const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    for (const lang of ['en', 'he']) {
      // a new browser for each language
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      await page.goto('/');
      if (lang === 'he') await page.getByTestId('lang-toggle-dialog').click();
      await page.getByTestId('tour-start').click();
      for (let i = 0; i < 14; i++) {
        const step = (await card(page).getAttribute('data-step'))!;
        await page.waitForTimeout(150);
        const c = (await card(page).boundingBox())!;
        expect(c.x, step).toBeGreaterThanOrEqual(0);
        expect(c.y, step).toBeGreaterThanOrEqual(0);
        expect(c.x + c.width, step).toBeLessThanOrEqual(w);
        expect(c.y + c.height, step).toBeLessThanOrEqual(h);
        expect(overlap(c, (await page.getByTestId('open-export').boundingBox())!), `${lang} ${step}: Download`).toBe(false);
        expect(overlap(c, (await page.locator('nav.rail').boundingBox())!), `${lang} ${step}: rail`).toBe(false);
        if (step === 'finish') break;
        if (step === 'welcome') await page.getByTestId('tour-go').click();
        else if (await page.getByTestId('tour-skip').isVisible()) await page.getByTestId('tour-skip').click();
        else await page.getByTestId('tour-next').click();
        await expect(card(page)).not.toHaveAttribute('data-step', step);
      }
      await page.getByTestId('tour-done').click();
      await ctx.close();
    }
  });
}

for (const lang of ['en', 'he']) {
  test(`tour shots ${lang}`, async ({ page }) => {
    test.skip(!process.env.SHOTS);
    test.setTimeout(180_000);
    await page.goto('/');
    if (lang === 'he') await page.getByTestId('lang-toggle-dialog').click();
    await page.screenshot({ path: `docs/tour-shots/${lang}-00-welcome-screen.png` });
    await page.getByTestId('tour-start').click();
    for (let i = 0; i < 14; i++) {
      const step = (await card(page).getAttribute('data-step'))!;
      const n = (await card(page).getAttribute('data-n'))!;
      await page.waitForTimeout(400);
      await page.screenshot({ path: `docs/tour-shots/${lang}-${n.padStart(2, '0')}-${step}.png` });
      if (step === 'finish') break;
      if (step === 'welcome') await page.getByTestId('tour-go').click();
      else if (await page.getByTestId('tour-skip').isVisible()) await page.getByTestId('tour-skip').click();
      else await page.getByTestId('tour-next').click();
      await expect(card(page)).not.toHaveAttribute('data-step', step);
    }
  });
}
