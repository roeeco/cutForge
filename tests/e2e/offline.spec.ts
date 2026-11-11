// With the network disabled after load, a student can design, save the
// project file and download SVG and DXF.
import { drawBoard } from './util';
import { test, expect } from '@playwright/test';

test('works offline after load', async ({ page, context }) => {
  const requests: string[] = [];
  await page.goto('/');
  await page.getByTestId('mat-ply-3').click();
  await page.getByTestId('start-go').click();
  await page.getByTestId('hints-dismiss').click();
  await context.setOffline(true);
  page.on('request', (r) => requests.push(r.url()));

  const box = (await page.locator('[data-testid=view3d] canvas').boundingBox())!;
  await drawBoard(page, { x: box.x + box.width / 2 - 100, y: box.y + box.height / 2 - 50 }, { x: box.x + box.width / 2 + 100, y: box.y + box.height / 2 + 50 });
  await expect(page.getByTestId('inspector-panel')).toBeVisible();

  let dl = page.waitForEvent('download');
  await page.getByTestId('project-menu').click();
  await page.getByTestId('save-project').click();
  expect((await dl).suggestedFilename()).toMatch(/\.cutforge\.json$/);

  for (const fmt of ['svg', 'dxf'] as const) {
    await page.getByTestId('open-export').click();
    await page.getByTestId(`fmt-${fmt}`).check();
    dl = page.waitForEvent('download');
    await page.getByTestId('export-go').click();
    expect((await dl).suggestedFilename()).toMatch(new RegExp(`\\.${fmt}$`));
  }
  // nothing but local blob/data URLs was requested while offline
  expect(requests.filter((u) => !u.startsWith('blob:') && !u.startsWith('data:'))).toEqual([]);
});
