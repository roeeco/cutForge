// Milestones 161–163 (GROW_ENDINGS_PLAN.md): after ✓ on a grow, the new board's card shows its edge endings. A free
// edge takes a flap or a fold-over at its automatic length; the length and the fold are set on the card and with the
// grown fold's handles on the stage; where two walls meet, a lip is there from the start.
import { test, expect, type Page } from '@playwright/test';
import { setNum, settle } from './util';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const flaps = (page: Page, id: string) => S<any[]>(page, (pid: string) => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design.panels[pid].edgeFlaps ?? [])), id);
const past = (page: Page) => S<number>(page, () => (window as any).__cutforge.store.getState().past.length);
const selected = (page: Page) => S<string>(page, () => (window as any).__cutforge.store.getState().selection?.id);

async function setup(page: Page, lang: 'en' | 'he') {
  await page.goto('/');
  if (lang === 'he') await S(page, () => (window as any).__cutforge.store.getState().setLang('he'));
  await page.getByTestId('mat-card-0.5').click();
  await page.getByTestId('start-go').click();
  const b = await S<string>(page, () => {
    const cf = (window as any).__cutforge;
    let id = '';
    cf.store.getState().apply((d: any) => void (id = cf.ops.addRootPanel(d, -50, 35, 100, 70)));
    cf.store.getState().select(null);
    return id;
  });
  return b;
}

async function growFrom(page: Page, base: string, edge: string): Promise<string> {
  await S(page, (a: { id: string; e: string }) => (window as any).__cutforge.store.getState().select({ kind: 'edge', panelId: a.id, edge: a.e }), { id: base, e: edge });
  await expect(page.getByTestId('grow-ghost-bar')).toBeVisible();
  await page.getByTestId('grow-go').click();
  return selected(page);
}

for (const lang of ['en', 'he'] as const) {
  test(`a grown wall's edge endings: a tuck at its automatic length, set on the card and on the stage; a lip where walls meet (${lang})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const base = await setup(page, lang);
    const w = await growFrom(page, base, 'e0');
    // ✓ selects the new wall: its card shows its endings, one row per edge but its hinge
    const sec = page.getByTestId('endings-section');
    await expect(sec).toBeVisible();
    for (const e of ['e1', 'e2', 'e3']) await expect(page.getByTestId(`ending-${e}`)).toHaveAttribute('data-ending', 'none');
    await expect(page.getByTestId('ending-e0')).toHaveCount(0);
    // a tuck on the top: one undo step, at its automatic length
    const p0 = await past(page);
    await page.getByTestId('ending-e2-tuck').click();
    await expect(page.getByTestId('ending-e2')).toHaveAttribute('data-ending', 'tuck');
    expect(await past(page)).toBe(p0 + 1);
    expect((await flaps(page, w))[0]).toMatchObject({ edge: 'e2', shape: 'tuck', auto: true });
    await expect(page.getByTestId('ending-len-e2-auto')).toBeVisible();
    // a fold-over is only for the top: the sides say why
    await page.getByTestId('ending-e1-foldover').click({ force: true });
    await expect(page.getByTestId('ending-e1-choice-why')).toBeVisible();
    await expect(page.getByTestId('ending-e1')).toHaveAttribute('data-ending', 'none');
    // a length typed is the student's; Automatic gives it back
    // (the wall is 60 mm high: a tuck's automatic length is 18 mm)
    expect((await flaps(page, w))[0].len).toBe(18);
    await setNum(page, 'ending-len-e2', '20');
    expect((await flaps(page, w))[0]).toMatchObject({ len: 20 });
    expect((await flaps(page, w))[0].auto).toBeUndefined();
    await page.getByTestId('ending-len-e2-reset').click();
    expect((await flaps(page, w))[0]).toMatchObject({ auto: true, len: 18 });
    // the dial, with the grown fold's numbers: 270 folds it out
    await page.getByTestId('ending-hinge-e2-value').click();
    const dial = page.getByTestId('ending-hinge-e2-input');
    await dial.fill('270');
    await dial.press('Enter');
    await expect.poll(async () => (await flaps(page, w))[0]).toMatchObject({ angle: 90, dir: 'out' });
    // on the stage: the length arrow and the hinge ring, as a grown fold has
    await settle(page);
    await expect.poll(() => S(page, () => (window as any).__cutforge.handleAt('end-len-e2'))).not.toBeNull();
    await expect.poll(() => S(page, () => (window as any).__cutforge.handleAt('end-hinge-e2'))).not.toBeNull();
    // click the arrow to type a length
    const at = (await S<{ x: number; y: number }>(page, () => (window as any).__cutforge.handleAt('end-len-e2')))!;
    await page.mouse.click(at.x, at.y);
    const field = page.getByTestId('end-len-e2-input');
    await expect(field).toBeVisible();
    await field.fill('25');
    await field.press('Enter');
    await expect.poll(async () => (await flaps(page, w))[0].len).toBe(25);
    expect((await flaps(page, w))[0].auto).toBeUndefined();
    // drag it: the length changes, and letting go is one undo step
    await settle(page);
    const a2 = (await S<{ x: number; y: number }>(page, () => (window as any).__cutforge.handleAt('end-len-e2')))!;
    const p1 = await past(page);
    await page.mouse.move(a2.x, a2.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(a2.x + i * 6, a2.y - i * 6);
    await page.mouse.up();
    await expect.poll(async () => (await flaps(page, w))[0].len).not.toBe(25);
    expect(await past(page)).toBe(p1 + 1);
    // a second wall off the base's right edge meets the first: a lip on the corner, at its automatic width
    const w2 = await growFrom(page, base, 'e1');
    expect(w2).not.toBe(w);
    const lip = page.locator('[data-testid^="ending-"][data-ending="lip"]');
    await expect(lip).toHaveCount(1);
    const edge = ((await lip.getAttribute('data-testid')) ?? '').replace('ending-', '');
    await expect(page.getByTestId(`ending-len-${edge}-auto`)).toBeVisible();
    await expect(page.getByTestId(`ending-lip-on-${edge}`)).toBeVisible();
    await setNum(page, `ending-len-${edge}`, '14');
    const width = await S<number>(page, () => {
      const d = (window as any).__cutforge.store.getState().design;
      return (Object.values(d.connections) as any[]).find((c) => !c.grown && c.kind === 'glue')?.flap;
    });
    expect(width).toBe(14);
    await expect.poll(() => S(page, (e: string) => (window as any).__cutforge.handleAt(`end-len-${e}`), edge)).not.toBeNull();
    // the cut plan has the one net with its flaps
    await page.getByTestId('view-2d').click();
    await expect(page.locator('[data-piece]')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}
