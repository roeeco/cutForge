// Review screenshots for Quick build (milestones 37–41), skipped unless SHOTS=1:
//   SHOTS=1 npx playwright test -c pw-app.config.ts quick-shots
import { test, type Page } from '@playwright/test';
const OUT = 'docs/quick-shots';
const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const shot = (page: Page, lang: string, name: string) => page.screenshot({ path: `${OUT}/${lang}-${name}.png` });
const pt = (page: Page, x: number, y: number, z: number) => S<{ x: number; y: number }>(page, (a: number[]) => (window as any).__cutforge.projectWorld(a[0], a[1], a[2]), [x, y, z]);
const onFace = (page: Page, id: string, x: number, y: number) => S<{ x: number; y: number }>(page, (a: any) => (window as any).__cutforge.projectFace(a.id, a.x, a.y, 1), { id, x, y });
async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }, hold?: () => Promise<void>) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  if (hold) await hold();
  await page.mouse.up();
}

test.use({ storageState: { cookies: [], origins: [] } });

for (const lang of ['en', 'he']) {
  test(`quick build actions shots ${lang}`, async ({ page }) => {
    test.skip(!process.env.SHOTS);
    await page.goto('/');
    await page.getByTestId('mat-ply-3').click();
    await page.getByTestId('start-go').click();
    await S(page, (l: string) => (window as any).__cutforge.store.getState().setLang(l), lang);
    await S(page, () => (window as any).__cutforge.setCamera([150, 260, 260], [0, 10, 0]));
    await page.waitForTimeout(300);
    await shot(page, lang, '37-quick-empty');
    // Box
    await page.getByTestId('quick-box').click();
    await drag(page, await pt(page, -60, 0, -45), await pt(page, 60, 0, 45));
    await page.waitForTimeout(300);
    await shot(page, lang, '38-box-ghost');
    await page.getByTestId('extrude-go').click();
    const d = await S<any>(page, () => (window as any).__cutforge.store.getState().design);
    const base = d.order[0];
    const wallAt = (e: string) => (Object.values(d.connections) as any[]).find((c) => c.grown && c.a.panelId === base && c.a.edge === e).b.panelId;
    const back = wallAt('e2'), front = wallAt('e0');
    // Divider (seen from above)
    await S(page, () => (window as any).__cutforge.setCamera([0, 360, 120], [0, 0, 0]));
    await page.waitForTimeout(300);
    await page.getByTestId('quick-divider').click();
    await drag(page, await onFace(page, base, 45, 6), await onFace(page, base, 45, 84));
    await page.waitForTimeout(300);
    await shot(page, lang, '38-divider-ghost');
    await page.getByTestId('ghost-ok').click();
    // Lid
    await S(page, () => (window as any).__cutforge.setCamera([150, 260, 260], [0, 10, 0]));
    await page.waitForTimeout(300);
    await page.getByTestId('quick-wall').click();
    const bw = d.panels[back];
    const e2 = await S<{ x: number; y: number }>(page, (a: any) => (window as any).__cutforge.project(a.id, a.x, a.y), { id: back, x: bw.w * 0.2, y: bw.h });
    await page.mouse.move(e2.x, e2.y, { steps: 3 });
    await page.mouse.click(e2.x, e2.y);
    await page.waitForTimeout(300);
    await shot(page, lang, '38-lid-ghost');
    await page.getByTestId('grow-go').click();
    // Hole, text and a sticker on the front wall
    await S(page, () => (window as any).__cutforge.setCamera([60, 80, 320], [0, 20, 0]));
    await page.waitForTimeout(300);
    const fw = d.panels[front];
    await page.getByTestId('quick-hole').click();
    await drag(page, await onFace(page, front, fw.w * 0.2, fw.h * 0.4), await onFace(page, front, fw.w * 0.2 + 14, fw.h * 0.4 + 14));
    await page.waitForTimeout(250);
    await shot(page, lang, '38-hole-ghost');
    await page.getByTestId('ghost-ok').click();
    await page.getByTestId('quick-text').click();
    const tp = await onFace(page, front, fw.w * 0.55, fw.h * 0.5);
    await page.mouse.click(tp.x, tp.y);
    await page.getByTestId('ghost-ok').click();
    await page.getByTestId('quick-text').click();
    await page.getByTestId('quick-text-sticker').click();
    await page.getByTestId('sticker-star').click();
    const sp = await onFace(page, front, fw.w * 0.85, fw.h * 0.5);
    await page.mouse.click(sp.x, sp.y);
    await page.waitForTimeout(250);
    await shot(page, lang, '38-sticker-ghost');
    await page.getByTestId('ghost-ok').click();
    await S(page, () => (window as any).__cutforge.store.getState().select(null));
    await page.getByTestId('fit-view').click();
    await page.waitForTimeout(400);
    await shot(page, lang, '38-made');
  });
}

for (const lang of ['en', 'he']) {
  test(`guardrails shots ${lang}`, async ({ page }) => {
    test.skip(!process.env.SHOTS);
    await page.goto('/');
    await page.getByTestId('mat-ply-3').click();
    await page.getByTestId('start-go').click();
    await S(page, (l: string) => (window as any).__cutforge.store.getState().setLang(l), lang);
    const { p, c } = await S<{ p: string; c: string }>(page, () => {
      const cf = (window as any).__cutforge;
      const out: any = {};
      cf.store.getState().apply((d: any) => {
        out.p = cf.ops.addRootPanel(d, -60, 40, 120, 80);
        cf.ops.addTray(d, out.p, 40);
        out.c = cf.ops.addDetail(d, out.p, 'circle', 'cut', 60, 40, 14, 14);
      });
      cf.store.getState().select({ kind: 'detail', id: out.c, ids: [out.c] });
      return out;
    });
    await S(page, () => (window as any).__cutforge.setCamera([0, 260, 60], [0, 0, 0]));
    await page.waitForTimeout(300);
    const a = await onFace(page, p, 60, 40), b = await onFace(page, p, 140, 40);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 10 });
    await page.waitForTimeout(200);
    await shot(page, lang, '39-clamped-drag');
    await page.mouse.up();
    // a shape too near the edge, made outside the guard: one thing to fix
    await S(page, (id: string) => {
      const cf = (window as any).__cutforge;
      cf.store.getState().setPrefs({ mode: 'workshop' });
      cf.store.getState().apply((d: any) => void cf.ops.addDetail(d, id, 'rect', 'cut', 20, 4, 14, 6));
      cf.store.getState().setPrefs({ mode: 'quick' });
      cf.store.getState().select(null);
    }, p);
    await page.waitForTimeout(400);
    await page.getByTestId('ready-badge').click();
    await page.waitForTimeout(200);
    await shot(page, lang, '39-badge-fix');
    await page.getByTestId('ready-fix').click();
    await page.waitForTimeout(400);
    await page.locator('.ready-wrap').screenshot({ path: `${OUT}/${lang}-39-ready-and-meter.png` });
  });
}

for (const lang of ['en', 'he']) {
  test(`missions shots ${lang}`, async ({ page }) => {
    test.skip(!process.env.SHOTS);
    await page.goto('/');
    if (lang === 'he') await page.getByTestId('lang-toggle-dialog').click();
    await page.getByTestId('mat-ply-3').click();
    await page.getByTestId('mission-game-organiser').click();
    await page.waitForTimeout(300);
    await shot(page, lang, '40-start-missions');
    await page.getByTestId('start-go').click();
    await S(page, () => {
      const cf = (window as any).__cutforge;
      const s = cf.store.getState();
      // one more object, too big for its compartment
      s.apply((d: any) => void d.contents.push({ id: 'o_phone', object: 'phone', baseId: 't:base', x: 150, y: 70, count: 1 }));
      s.select({ kind: 'panel', id: 't:base' });
    });
    await S(page, () => (window as any).__cutforge.setCamera([60, 300, 230], [0, 0, 0]));
    await page.waitForTimeout(500);
    await shot(page, lang, '40-mission-objects');
    await S(page, () => (window as any).__cutforge.store.getState().set({ assemble: 0.6 }));
    await page.waitForTimeout(300);
    await shot(page, lang, '40-assembly');
    await S(page, () => (window as any).__cutforge.store.getState().set({ assemble: null }));
  });
}

for (const lang of ['en', 'he']) {
  test(`quick and workshop side by side ${lang}`, async ({ page }) => {
    test.skip(!process.env.SHOTS);
    await page.goto('/');
    if (lang === 'he') await page.getByTestId('lang-toggle-dialog').click();
    await page.getByTestId('mat-ply-3').click();
    await page.getByTestId('tpl-organiser').click();
    await page.getByTestId('start-go').click();
    await S(page, () => (window as any).__cutforge.store.getState().select({ kind: 'panel', id: 't:divX1' }));
    await page.getByTestId('fit-view').click();
    await page.waitForTimeout(500);
    await shot(page, lang, '41-quick');
    await page.getByTestId('mode-workshop').click();
    await page.getByTestId('hints-dismiss').click().catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, lang, '41-workshop');
  });
}
