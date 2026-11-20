import { expect, type Page } from '@playwright/test';

/** Type an exact value into a numeric field and commit it (Enter), then check it took. */
export async function setNum(page: Page, testId: string, value: string) {
  const f = page.getByTestId(testId);
  await f.click();
  await f.press('ControlOrMeta+a');
  await f.pressSequentially(value);
  await expect(f).toHaveValue(value);
  await f.press('Enter');
  await expect(f).toHaveValue(String(Number(value)));
}

/** A browser that has used CutForge before: it opens in the Workshop (milestone 37), the grow card's More… and the settings card open (milestone 78). */
export const WORKSHOP_STATE = {
  cookies: [],
  origins: ['http://localhost:5199', 'http://localhost:5299', 'http://127.0.0.1:8787', 'http://localhost:8787'].map((origin) => ({ origin, localStorage: [{ name: 'cutforge.viewPrefs', value: JSON.stringify({ mode: 'workshop', growMore: true, settingsOpen: true, edgesOpen: true, partMore: true }) }] })),
};

/** Open the Shapes tool (milestone 75) if its menu is not showing. */
export async function openShapes(page: Page) {
  if (!(await page.getByTestId('shape-feet').isVisible().catch(() => false))) await page.getByTestId('tool-shapes').click();
  await expect(page.getByTestId('shape-feet')).toBeVisible();
}

/** The Shapes tool with a footprint and the operator Board (what the Board, Round, Rounded and Polygon buttons were). */
export async function boardTool(page: Page, foot: 'rect' | 'rounded' | 'circle' | 'polygon' | 'regular', opts: { standing?: boolean } = {}) {
  await openShapes(page);
  await page.getByTestId(`foot-${foot}`).click();
  if ((await page.getByTestId('op-board').getAttribute('aria-checked')) !== 'true') await page.getByTestId('op-board').click();
  if (foot === 'rect') await page.getByTestId(opts.standing ? 'pose-standing' : 'pose-flat').click();
}

/**
 * The Board tool in one drag (milestone 42; milestone 75: the Shapes tool's
 * rectangle as a board, flat or standing), then drag from one screen point to
 * the other; release makes the board.
 */
export async function drawBoard(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, opts: { standing?: boolean; steps?: number } = {}) {
  await boardTool(page, 'rect', opts);
  await expect(page.getByTestId(opts.standing ? 'pose-standing' : 'pose-flat')).toHaveAttribute('aria-checked', 'true');
  const n = opts.steps ?? 8;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= n; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / n, from.y + ((to.y - from.y) * i) / n);
  await page.mouse.up();
}

/** A shape that works on a board: the Shapes tool's footprint with an operator other than Board (cut, unless one was chosen). */
export async function shapeTool(page: Page, shape: 'rect' | 'roundrect' | 'circle') {
  await openShapes(page);
  await page.getByTestId(`foot-${shape === 'roundrect' ? 'rounded' : shape}`).click();
  const board = page.getByTestId('op-board');
  if ((await board.count()) && (await board.getAttribute('aria-checked')) === 'true') await page.getByTestId('op-cut').click();
}

/** The operation for new shapes: on the shape card, which shows while the Shapes tool is in use. */
export async function opPick(page: Page, op: 'add' | 'cut' | 'engrave' | 'score') {
  if (!(await page.getByTestId(`op-${op}`).isVisible())) await openShapes(page);
  await page.getByTestId(`op-${op}`).click();
}

/** A browser that chose Quick build (a new browser starts in the Workshop). */
export const QUICK_STATE = {
  cookies: [],
  origins: ['http://localhost:5199', 'http://localhost:5299', 'http://127.0.0.1:8787', 'http://localhost:8787'].map((origin) => ({ origin, localStorage: [{ name: 'cutforge.viewPrefs', value: JSON.stringify({ mode: 'quick', settingsOpen: true, edgesOpen: true, partMore: true }) }] })),
};

/**
 * Wait until the 3D camera has stopped moving (after fit-view or setCamera): a projected point stays
 * put over a few frames. Clicks at projected points made before that can miss (BUGFIX_PLAN U4).
 */
export async function settle(page: Page) {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const cf = (window as any).__cutforge;
        if (!cf?.projectWorld) return resolve(false);
        const at = () => JSON.stringify(cf.projectWorld(0, 0, 0));
        const first = at();
        let n = 0;
        const tick = () => {
          if (at() !== first) return resolve(false);
          if (++n >= 6) return resolve(true);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    undefined,
    { polling: 50, timeout: 10_000 },
  );
}

/** Start a preset the welcome screen no longer lists (the organiser, milestone 98), as its card did. */
export async function startTemplate(page: Page, id: string, matId: string) {
  await page.evaluate(([i, m]) => (window as any).__cutforge.startTemplate(i, m), [id, matId]);
  await expect(page.getByTestId('material-dialog')).toHaveCount(0);
  await expect(page.getByTestId('view3d')).toBeVisible();
}

/** Answer the app's own dialog (milestone 143: it replaced the browser's confirm, alert and prompt): type `text` into a
 * prompt, then OK (or Cancel with `ok: false`). Returns the dialog's message. */
export async function answerDialog(page: import('@playwright/test').Page, o: { text?: string; ok?: boolean } = {}): Promise<string> {
  const dlg = page.getByTestId('app-dialog');
  await dlg.waitFor();
  const msg = (await dlg.locator('p').first().textContent()) ?? '';
  if (o.text !== undefined) await page.getByTestId('app-dialog-input').fill(o.text);
  await page.getByTestId(o.ok === false ? 'app-dialog-cancel' : 'app-dialog-ok').click();
  return msg;
}
