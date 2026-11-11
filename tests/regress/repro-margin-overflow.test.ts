// A piece that fits the sheet but not the sheet minus its margin is placed at (margin, margin) on a
// sheet of its own (pack.ts fallback) and runs into the far margin; validate's offSheet check
// (validate.ts sheetIssues) compares with the bare sheet, tooBig looks at single panels, so nothing
// is reported and the export puts the piece inside the margin.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../../src/model/materials';
import { addRootPanel, addTray, createDesign } from '../../src/model/ops';
import { pack, pieceCopies, placedRect } from '../../src/model/pack';
import { validate } from '../../src/model/validate';

describe('repro: piece placed in the sheet margin', () => {
  it('card tray net 311 x 291 on a 500 x 300 sheet with a 5 mm margin', () => {
    const d = createDesign(MATERIALS[0]); // card-0.5, sheet 500x300, margin 5
    const b = addRootPanel(d, 0, 0, 200, 180);
    addTray(d, b, 55);
    const c = pieceCopies(d)[0];
    expect(c.h).toBeGreaterThan(300 - 2 * d.sheetMargin);
    expect(c.h).toBeLessThanOrEqual(300);
    const r = placedRect(pack(d)[c.key], c.w, c.h);
    const inMargin = r.y1 > 300 - d.sheetMargin + 1e-9 || r.x1 > 500 - d.sheetMargin + 1e-9;
    const reported = validate(d).some((i) => i.key === 'val.offSheet' || i.key === 'val.tooBig');
    expect({ inMargin, reported }).not.toEqual({ inMargin: true, reported: false }); // actual: in the margin, not reported
  });
});

describe('one piece too big for any sheet', () => {
  it('a 2000 x 60 board goes on sheet 0, the export has one sheet, and tooBig is reported', async () => {
    const { prepareExport } = await import('../../src/export/prepare');
    const d = createDesign(MATERIALS[3]);
    addRootPanel(d, 0, 0, 2000, 60);
    const c = pieceCopies(d)[0];
    expect(pack(d)[c.key].sheet).toBe(0);
    expect(prepareExport(d).sheets).toHaveLength(1);
    expect(validate(d).some((i) => i.key === 'val.tooBig')).toBe(true);
  });
});
