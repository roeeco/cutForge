// Milestone 4: text, SVG import, quantity and packing with manual placement,
// pre-export validation, kerf modes.
import { setNum } from './util';
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const S = <T,>(page: Page, fn: (arg: any) => T, arg?: unknown) => page.evaluate(fn as any, arg) as Promise<T>;
const design = (page: Page) => S(page, () => JSON.parse(JSON.stringify((window as any).__cutforge.store.getState().design)));

async function start(page: Page, w: number, h: number) {
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('hints-dismiss').click();
  await page.getByTestId('tool-panel').click();
  const box = (await page.locator('[data-testid=view3d] canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2 - 40);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  await setNum(page, 'panel-w', String(w));
  await setNum(page, 'panel-h', String(h));
  return (await design(page)).order[0] as string;
}

async function download(page: Page, fmt: 'svg' | 'dxf', kerf: 'nominal' | 'compensated' = 'nominal') {
  await page.getByTestId('open-export').click();
  await page.getByTestId(`fmt-${fmt}`).check();
  await page.getByTestId(`kerf-${kerf}`).check();
  const dl = page.waitForEvent('download');
  await page.getByTestId('export-go').click();
  const f = await dl;
  return { name: f.suggestedFilename(), text: readFileSync((await f.path())!, 'utf8') };
}

test('text and SVG import export as outlines', async ({ page }) => {
  const base = await start(page, 160, 80);
  await page.getByTestId('tool-text').click();
  const c = await S(page, ([id]: string[]) => (window as any).__cutforge.project(id, 80, 50), [base]);
  await page.mouse.click(c.x, c.y);
  await expect(page.getByTestId('text-fields')).toBeVisible();
  await page.getByTestId('text-value').fill('קופסה של Dana 7');
  await page.getByTestId('text-value').blur();
  await setNum(page, 'text-size', '12');
  const d = await design(page);
  expect(d.panels[base].details[0]).toMatchObject({ shape: 'text', op: 'engrave', text: { value: 'קופסה של Dana 7', size: 12 } });

  // import an SVG icon onto the selected panel
  await S(page, ([id]: string[]) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), [base]);
  page.once('dialog', (dlg) => dlg.accept());
  await page.getByTestId('import-file').setInputFiles({
    name: 'star.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><polygon points="10,0 13,7 20,7 14,12 16,20 10,15 4,20 6,12 0,7 7,7"/><line x1="0" y1="0" x2="5" y2="5"/></svg>'),
  });
  await expect.poll(async () => (await design(page)).panels[base].details.map((x: any) => x.shape)).toEqual(['text', 'path']);

  // refused file, with the reason
  let msg = '';
  page.once('dialog', (dlg) => ((msg = dlg.message()), dlg.accept()));
  await page.getByTestId('import-file').setInputFiles({ name: 'words.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>hi</text></svg>') });
  await expect.poll(() => msg).toContain('Convert the text to paths');

  const svg = await download(page, 'svg');
  expect(svg.text).not.toMatch(/<text|font-family|@font-face/);
  expect((svg.text.match(/M[-\d]/g) ?? []).length).toBeGreaterThan(12); // one subpath per letter outline
  expect(svg.text).toContain('fill-rule="evenodd"');
  expect(svg.text).toContain('stroke="#000000"');
  const dxf = await download(page, 'dxf');
  expect(dxf.text).not.toMatch(/\nTEXT\n|\nMTEXT\n/);
});

test('quantity, packing, manual placement and kerf modes', async ({ page }) => {
  const base = await start(page, 50, 50);
  await page.getByTestId('tool-circle').click();
  await page.getByTestId('tool-select').click();
  await S(page, ([id]: string[]) => (window as any).__cutforge.store.getState().apply((x: any) => void x.panels[id].details.push({ id: 'h1', shape: 'circle', op: 'cut', cx: 25, cy: 25, w: 10, h: 10 })), [base]);
  await S(page, ([id]: string[]) => (window as any).__cutforge.store.getState().select({ kind: 'panel', id }), [base]);
  await setNum(page, 'panel-qty', '30');
  await page.getByTestId('view-2d').click();
  await expect(page.locator('path.piece')).toHaveCount(30);
  await expect(page.locator('path.piece.bad')).toHaveCount(0);

  // drag one copy partly off the sheet: it stays where it was put (manual), the others pack around it, and it is flagged
  const b = (await page.locator('path.piece').nth(1).boundingBox())!;
  const sheet = (await page.locator('rect.sheet').first().boundingBox())!;
  await page.mouse.move(b.x + 6, b.y + 6); // a corner of the piece, away from its hole
  await page.mouse.down();
  await page.mouse.move(sheet.x + sheet.width - 4, sheet.y + sheet.height / 2, { steps: 8 });
  await page.mouse.up();
  const d = await design(page);
  expect(Object.values<any>(d.placements).filter((p) => p.manual)).toHaveLength(1);
  await expect(page.locator('path.piece.bad')).not.toHaveCount(0);
  await page.getByTestId('open-export').click();
  await expect(page.getByTestId('export-issues')).toContainText('outside its sheet');
  await page.getByText(/^Cancel$/).click();

  // rotate respects grain (plywood): blocked with a reason
  await expect(page.getByTestId('rotate-copy')).toBeDisabled();

  // repack clears manual placements (after confirming)
  page.once('dialog', (dlg) => dlg.accept());
  await page.getByTestId('repack').click();
  await expect(page.locator('path.piece.bad')).toHaveCount(0);

  // kerf: nominal vs compensated
  await setNum(page, 'panel-qty', '1');
  const nom = await download(page, 'svg', 'nominal');
  expect(nom.name).toMatch(/-nominal-kerf0\.15mm\.svg$/);
  const comp = await download(page, 'svg', 'compensated');
  expect(comp.name).toMatch(/-compensated-kerf0\.15mm\.svg$/);
  expect(comp.text).toMatch(/A4\.925 4\.925/); // hole radius 5 - 0.075
  expect(nom.text).toMatch(/A5 5 /);
});
