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
