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

/** A browser that has used CutForge before: it opens in the Workshop (milestone 37). */
export const WORKSHOP_STATE = {
  cookies: [],
  origins: ['http://localhost:5199', 'http://localhost:5299', 'http://127.0.0.1:8787', 'http://localhost:8787'].map((origin) => ({ origin, localStorage: [{ name: 'cutforge.viewPrefs', value: JSON.stringify({ mode: 'workshop' }) }] })),
};

/**
 * The Board tool in one drag (milestone 42): choose Board or Standing board
 * on the rail, then drag from one screen point to the other; release makes the board.
 */
export async function drawBoard(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, opts: { standing?: boolean; steps?: number } = {}) {
  const tool = page.getByTestId(opts.standing ? 'tool-panel-standing' : 'tool-panel');
  if ((await tool.getAttribute('aria-pressed')) !== 'true') await tool.click();
  await expect(tool).toHaveAttribute('aria-pressed', 'true');
  const n = opts.steps ?? 8;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= n; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / n, from.y + ((to.y - from.y) * i) / n);
  await page.mouse.up();
}

/** Workshop's rectangle, rounded rectangle and circle sit under one Shapes button (the card shows them). */
export async function shapeTool(page: Page, shape: 'rect' | 'roundrect' | 'circle') {
  if (!(await page.getByTestId(`tool-${shape}`).isVisible())) await page.getByTestId('tool-shapes').click();
  await page.getByTestId(`tool-${shape}`).click();
}

/** The operation for new shapes: on the shape card, which shows while a shape tool is in use (Shapes opens it). */
export async function opPick(page: Page, op: 'add' | 'cut' | 'engrave' | 'score') {
  if (!(await page.getByTestId(`op-${op}`).isVisible())) await page.getByTestId('tool-shapes').click();
  await page.getByTestId(`op-${op}`).click();
}

/** A browser that chose Quick build (a new browser starts in the Workshop). */
export const QUICK_STATE = {
  cookies: [],
  origins: ['http://localhost:5199', 'http://localhost:5299', 'http://127.0.0.1:8787', 'http://localhost:8787'].map((origin) => ({ origin, localStorage: [{ name: 'cutforge.viewPrefs', value: JSON.stringify({ mode: 'quick' }) }] })),
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
