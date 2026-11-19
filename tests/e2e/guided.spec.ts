// Guided from the gallery to the file (milestones 105–109): only taps, in English and Hebrew, at 1366 and
// 1024 px wide. No key is pressed and nothing is right-clicked; Workshop's and Quick build's controls are absent.
import { expect, test, type Page } from '@playwright/test';

const GUIDED = (lang: 'en' | 'he') => ({
  cookies: [],
  origins: ['http://localhost:5199'].map((origin) => ({
    origin,
    localStorage: [
      { name: 'cutforge.viewPrefs', value: JSON.stringify({ mode: 'guided', guidedPreview: true }) },
      { name: 'cutforge.lang', value: lang },
    ],
  })),
});

async function noOtherLevels(page: Page) {
  for (const id of ['toggle-joints', 'tool-shapes', 'quick-rail', 'material-pill', 'mode-toggle', 'inspector-design']) await expect(page.getByTestId(id), id).toHaveCount(0);
}

for (const lang of ['en', 'he'] as const)
  for (const [w, h] of [
    [1366, 768],
    [1024, 768],
  ] as const)
    test.describe(`${lang} ${w} × ${h}`, () => {
      test.use({ storageState: GUIDED(lang), viewport: { width: w, height: h } });

      test('Pencil box: Make it fit, a name, Send: ready, three stars, an SVG', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto('/');
        await expect(page.getByTestId('g-start')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
        await page.getByTestId('g-thing-pencil-box').click();
        await expect(page.getByTestId('g-topbar')).toBeVisible();
        // the pictures of the gestures, the first time
        await page.getByTestId('g-demo-ok').click();
        await noOtherLevels(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
        // Build: what goes inside, Make it fit
        await expect(page.getByTestId('goal-fits-pencil')).toHaveAttribute('data-ok', 'false');
        await page.getByTestId('g-add-inside').click();
        await page.getByTestId('g-fit-pencil').click();
        await expect(page.getByTestId('goal-fits-pencil')).toHaveAttribute('data-ok', 'true');
        await expect(page.getByTestId('g-lot-pencil')).toHaveAttribute('data-ok', 'true');
        // Decorate: a name on the front
        await page.getByTestId('g-step-decorate').click();
        await page.getByTestId('g-add-name').click();
        await expect(page.getByTestId('g-deco-side')).toBeVisible();
        await page.getByTestId('g-deco-text').fill(lang === 'he' ? 'מאיה' : 'Maya');
        await page.getByTestId('g-deco-text').blur();
        await expect(page.getByTestId('goal-name')).toHaveCount(0); // the mission card is the stage's; the face-on view has none
        await page.getByTestId('solo-back').click();
        await expect(page.getByTestId('goal-name')).toHaveAttribute('data-ok', 'true');
        // Send: ready, three stars, the file
        await page.getByTestId('g-step-send').click();
        await expect(page.getByTestId('g-ready')).toHaveAttribute('data-ok', 'true');
        await expect(page.getByTestId('g-goals')).toHaveAttribute('data-stars', '3');
        await expect(page.getByTestId('g-send-dot')).toHaveAttribute('data-warn', 'false');
        const download = page.waitForEvent('download');
        await page.getByTestId('g-download').click();
        const file = await download;
        // headless Chromium names a download with non-Latin letters (the Hebrew design name) just "download"
        if (lang === 'en') expect(file.suggestedFilename()).toMatch(/\.svg$/);
        const chunks: Buffer[] = [];
        for await (const c of (await file.createReadStream())!) chunks.push(c as Buffer);
        expect(Buffer.concat(chunks).toString('utf8')).toContain('<svg');
        expect(errors).toEqual([]);
      });

      test('Box with a lid: its lid changed to Hinged', async ({ page }) => {
        await page.goto('/');
        await page.getByTestId('g-thing-box-lid').click();
        await page.getByTestId('g-demo-ok').click();
        await expect(page.getByTestId('g-sheet-lid')).toHaveText(lang === 'he' ? 'מורם' : 'Lifts off');
        await page.getByTestId('g-add-lid').click();
        await page.getByTestId('g-lid-hinged').click();
        await expect(page.getByTestId('g-sheet-lid')).toHaveText(lang === 'he' ? 'על ציר' : 'Hinged');
        await page.getByTestId('g-undo').click();
        await expect(page.getByTestId('g-sheet-lid')).toHaveText(lang === 'he' ? 'מורם' : 'Lifts off');
        await noOtherLevels(page);
      });
    });
