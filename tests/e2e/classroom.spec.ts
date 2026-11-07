// Milestone 6 (acceptance 10): a student submits with a class code and name;
// the teacher sees it, batches it with another submission of the same
// material onto shared sheets with name labels, downloads the result and
// marks both as cut. Mixed materials are refused. A failed submission
// offers the download instead and loses no work. Runs against the real
// Worker (workerd, local D1 and R2).
import { test, expect, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const KEY = 'e2e-teacher-key';

async function student(browser: Browser, material: string, name: string, code: string, title: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByTestId('tpl-organiser').check();
  await page.getByTestId(`mat-${material}`).click();
  await page.getByTestId('start-go').click();
  await page.getByTestId('hints-dismiss').click();
  await page.getByLabel('Design name').fill(title);
  await page.getByLabel('Design name').blur();
  await page.getByTestId('open-submit').click();
  await page.getByTestId('sub-code').fill(code);
  await page.getByTestId('sub-name').fill(name);
  await page.getByTestId('submit-go').click();
  return { page, ctx };
}

async function teacherLogin(page: Page) {
  await page.goto('/#/teacher');
  await page.getByTestId('teacher-key').fill(KEY);
  await page.getByTestId('teacher-login').click();
  await expect(page.getByTestId('classes')).toBeVisible();
}

test('submit to class, teacher batches, downloads and marks as cut', async ({ browser, page }) => {
  await teacherLogin(page);
  const cname = `Grade 8 ${Date.now()}`;
  await page.getByTestId('new-class-name').fill(cname);
  await page.getByTestId('create-class').click();
  const code = (await page.locator('.class-list li', { hasText: cname }).getByTestId('class-code').innerText()).trim();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);

  // two plywood students and one corrugated student
  const a = await student(browser, 'ply-3', 'נועה כהן', code, 'Dice box');
  await expect(a.page.getByTestId('submit-done')).toBeVisible();
  const b = await student(browser, 'ply-3', 'Dan Levi', code, 'Pencil tray');
  await expect(b.page.getByTestId('submit-done')).toBeVisible();
  const c = await student(browser, 'corr-1.6', 'Maya', code, 'Card box');
  await expect(c.page.getByTestId('submit-done')).toBeVisible();

  // teacher sees them
  await page.getByTestId(`class-${code}`).click();
  await expect(page.getByTestId('submission-row')).toHaveCount(3);
  await expect(page.getByTestId('submissions')).toContainText('נועה כהן');

  const row = (name: string) => page.getByTestId('submission-row').filter({ hasText: name });
  // mixed materials are refused with an explanation
  await row('Maya').getByTestId('sub-select').check();
  await row('Dan Levi').getByTestId('sub-select').check();
  await page.getByTestId('batch').click();
  await expect(page.getByTestId('teacher-msg')).toContainText('different materials');
  await row('Maya').getByTestId('sub-select').uncheck();

  // same material: batch onto shared sheets with name labels on the guide layer
  await row('נועה כהן').getByTestId('sub-select').check();
  await page.getByTestId('batch').click();
  await expect(page.getByTestId('batch-ready')).toBeVisible();
  const dl = page.waitForEvent('download');
  await page.getByTestId('batch-svg').click();
  const svg = readFileSync((await (await dl).path())!, 'utf8');
  expect(svg).toMatch(/id="GUIDE/);
  expect(svg).toMatch(/id="CUT/);
  expect(svg).not.toMatch(/<text/);

  // mark both as cut
  await page.getByTestId('batch-mark-cut').click();
  await expect(row('נועה כהן').getByTestId('sub-status')).toHaveText('Cut');
  await expect(row('Dan Levi').getByTestId('sub-status')).toHaveText('Cut');
  await expect(row('Maya').getByTestId('sub-status')).toHaveText('New');

  // a single submission downloads as files regenerated from its project
  const dl2 = page.waitForEvent('download');
  await row('Maya').getByTestId('sub-svg').click();
  expect((await dl2).suggestedFilename()).toMatch(/Maya-Card-box-nominal\.svg$/);
  for (const s of [a, b, c]) await s.ctx.close();
});

test('a class profile mismatch is explained; a failed submission offers the download and keeps the work', async ({ browser, page }) => {
  await teacherLogin(page);
  const cname = `Profile ${Date.now()}`;
  await page.getByTestId('new-class-name').fill(cname);
  await page.getByTestId('create-class').click();
  const code = (await page.locator('.class-list li', { hasText: cname }).getByTestId('class-code').innerText()).trim();
  await page.getByTestId('class-profile').selectOption('corr-4');
  await expect(page.getByTestId('class-profile')).toHaveValue('corr-4');
  await expect.poll(() => page.evaluate(async (n) => (await (await fetch('/api/teacher/classes')).json()).find((c: any) => c.name === n)?.material?.id, cname)).toBe('corr-4');

  const ctx = await browser.newContext();
  const st = await ctx.newPage();
  await st.goto('/');
  await st.getByTestId('tpl-organiser').check();
  await st.getByTestId('mat-ply-3').click();
  await st.getByTestId('start-go').click();
  await st.getByTestId('hints-dismiss').click();
  await st.getByTestId('open-submit').click();
  await st.getByTestId('sub-code').fill(code);
  await st.getByTestId('sub-name').fill('Omer');
  await st.getByTestId('submit-go').click();
  await expect(st.getByTestId('submit-profile')).toContainText('Your class uses');
  await st.getByTestId('submit-use-class').click();
  await expect(st.getByTestId('submit-done')).toBeVisible();
  const mat = await st.evaluate(() => (window as any).__cutforge.store.getState().design.material.id);
  expect(mat).toBe('corr-4');
  await st.getByText('Close').click();

  // server unreachable: plain message, download offered, nothing lost
  const before = await st.evaluate(() => JSON.stringify((window as any).__cutforge.store.getState().design));
  await st.route('**/api/**', (r) => r.abort());
  await st.getByTestId('open-submit').click();
  await st.getByTestId('submit-go').click();
  await expect(st.getByTestId('submit-error')).toContainText('Could not reach the class server');
  await st.getByTestId('submit-fallback-download').click();
  await expect(st.getByTestId('export-dialog')).toBeVisible();
  const dl = st.waitForEvent('download');
  await st.getByTestId('export-go').click();
  expect((await dl).suggestedFilename()).toMatch(/\.svg$/);
  expect(await st.evaluate(() => JSON.stringify((window as any).__cutforge.store.getState().design))).toBe(before);
  await ctx.close();
});
