// Milestone 146 (PRESETS_OVERHAUL.md §5.1, §5.4): the presets' contact sheet (`?presets&mat=<id>`, development only).
// In every list a student picks a preset from, two pictures that look alike at list size (a difference hash within
// LOOKALIKE_BITS) must be a pair known in tests/presetLookalikes.ts, and every known pair must still look alike in
// some board (so the list only shrinks). With SHOTS=1 (`npm run preset-sheet`) each board's sheet is saved to
// docs/preset-shots/sheet-<board>.png, the before and after of each milestone of the overhaul.
import { test, expect } from '@playwright/test';
import { VISUAL } from '../presetLookalikes';

const BOARDS = ['card-0.5', 'corr-1.6', 'corr-4', 'ply-3'];

test('look-alike pictures are only the known pairs', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1340, height: 900 });
  const found = new Map<string, string[]>();
  for (const mat of BOARDS) {
    await page.goto(`/?presets&mat=${mat}`);
    const sheet = page.getByTestId('presets-dev');
    await expect(sheet).toHaveAttribute('data-ready', '1', { timeout: 120_000 });
    const pairs = JSON.parse((await sheet.getAttribute('data-pairs')) ?? '[]') as { list: string; a: string; b: string; bits: number }[];
    for (const p of pairs) {
      const k = [p.list, ...[p.a, p.b].sort()].join(' ');
      found.set(k, [...(found.get(k) ?? []), `${mat} ${p.bits}`]);
    }
    if (process.env.SHOTS) await page.screenshot({ path: `docs/preset-shots/sheet-${mat}.png`, fullPage: true });
  }
  const known = new Set(VISUAL.map((x) => [x.list, ...[x.a, x.b].sort()].join(' ')));
  expect([...found.keys()].filter((k) => !known.has(k)).map((k) => `${k} (${found.get(k)!.join(', ')})`).sort(), 'new look-alikes').toEqual([]);
  expect([...known].filter((k) => !found.has(k)).sort(), 'look-alikes that no longer are (remove them)').toEqual([]);
});
