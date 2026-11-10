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
  origins: ['http://localhost:5199', 'http://127.0.0.1:8787', 'http://localhost:8787'].map((origin) => ({ origin, localStorage: [{ name: 'cutforge.viewPrefs', value: JSON.stringify({ mode: 'workshop' }) }] })),
};

/** The Panel tool's first two clicks: the face (or floor) at a screen point, then flat or standing. The drag that follows draws. */
export async function pickPlane(page: Page, at: { x: number; y: number }, pose: 'flat' | 'standing') {
  await page.mouse.click(at.x, at.y);
  await page.getByTestId(`pick-${pose}`).click();
}
