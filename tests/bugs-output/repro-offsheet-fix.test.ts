// Ready badge "Fix" for val.offSheet (re-pack: placements = {}) reports success but cannot fix a
// piece that does not fit the sheet. validate's tooBig ignores grain, so a plywood box that only
// fits turned against the grain gets only offSheet, whose fix does nothing.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../../src/model/materials';
import { createDesign } from '../../src/model/ops';
import { boxRecipe } from '../../src/easy/recipes';
import { validate } from '../../src/model/validate';
import { fixIssue } from '../../src/easy/fix';

describe('repro: offSheet fix', () => {
  it('ply-3 Quick build box 300 x 500 (fits the 600 x 400 sheet only turned)', () => {
    const d = createDesign(MATERIALS[3]); // ply-3, sheet 600x400, grain x, allowRotate off
    boxRecipe(d, { kind: 'rect', x0: 0, z0: 0, x1: 300, z1: 500 }, 40);
    const issues = validate(d);
    const off = issues.find((i) => i.key === 'val.offSheet')!;
    expect(off).toBeTruthy();
    expect.soft(issues.some((i) => i.key === "val.tooBig")).toBe(true); // actual: no tooBig (grain ignored)
    const ok = fixIssue(d, off);
    expect(ok).toBe(true);
    expect(validate(d).some((i) => i.key === 'val.offSheet')).toBe(false); // actual: still there
  });
});
