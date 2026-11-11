// BUGFIX_PLAN U1: the top bar fits its window: nothing scrolls, and every button is inside the window and the bar.
import { test, expect, type Page } from '@playwright/test';
import { QUICK_STATE, WORKSHOP_STATE } from './util';

async function start(page: Page, lang: 'en' | 'he', mode: 'workshop' | 'quick') {
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('start-go').click();
  const nudge = page.getByTestId('tour-nudge-dismiss');
  if (await nudge.isVisible().catch(() => false)) await nudge.click();
  // a board, so the Ready badge and the sheet meter show in Quick build
  await page.evaluate(() => {
    const { store, ops } = (window as any).__cutforge;
    store.getState().apply((d: any) => void ops.addRootPanel(d, 0, 0, 120, 80));
  });
  // Quick build's bar is laid out once its Ready badge is there
  if (mode === 'quick') await page.locator('.ready-wrap').waitFor({ state: 'attached' });
  if (lang === 'he') {
    // on a narrow bar the language is in the ⋯ menu
    if (await page.getByTestId('lang-toggle').isVisible()) await page.getByTestId('lang-toggle').click();
    else {
      await page.getByTestId('top-more').click();
      await page.getByTestId('more-lang').click();
    }
  }
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

async function fits(page: Page) {
  return page.evaluate(() => {
    const h = document.querySelector('header.topbar') as HTMLElement;
    const bar = h.getBoundingClientRect();
    const out: string[] = [];
    if (h.scrollWidth > h.clientWidth + 0.5) out.push(`scrollWidth ${h.scrollWidth} > ${h.clientWidth}`);
    for (const b of [...h.querySelectorAll('button, .ready-wrap, .sheet-meter')] as HTMLElement[]) {
      const r = b.getBoundingClientRect();
      if (!r.width || getComputedStyle(b).visibility === 'hidden' || b.closest('.menu')) continue;
      if (r.left < -0.5 || r.right > innerWidth + 0.5 || r.top < bar.top - 0.5 || r.bottom > bar.bottom + 0.5) out.push(`${b.dataset.testid ?? b.textContent?.trim().slice(0, 20)} at ${Math.round(r.left)}..${Math.round(r.right)} x ${Math.round(r.top)}..${Math.round(r.bottom)}`);
    }
    return out;
  });
}

const SIZES = [
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
];

for (const [mode, state] of [['workshop', WORKSHOP_STATE], ['quick', QUICK_STATE]] as const)
  for (const lang of ['en', 'he'] as const)
    test.describe(`${mode} ${lang}`, () => {
      test.use({ storageState: state });
      for (const size of SIZES)
        test(`${size.width} x ${size.height}`, async ({ page }) => {
          await page.setViewportSize(size);
          await start(page, lang, mode);
          expect(await fits(page)).toEqual([]);
          // Download for laser and Undo / Redo are always on the bar itself
          for (const id of ['open-export', 'undo', 'redo']) await expect(page.getByTestId(id)).toBeVisible();
        });
    });
