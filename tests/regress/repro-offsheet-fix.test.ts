// Ready badge "Fix" for val.offSheet (re-pack: placements = {}) reported success but could not fix a
// piece that does not fit the sheet: validate's tooBig ignored grain and looked at single panels, so a
// plywood box base that only fits turned against the grain got only offSheet, whose fix did nothing.
// BUGFIX_PLAN B15: such a piece is reported as fitting only turned (val.tooBigGrain), whose Fix allows
// turning, and a piece too big either way as val.tooBig, whose Fix shrinks it uniformly; every Fix that
// says it worked removes its issue. (The original repro expected offSheet to be reported here; it now
// expects the issue that names the real problem.)
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../../src/model/materials';
import { addRootPanel, addTray, createDesign } from '../../src/model/ops';
import { boxRecipe } from '../../src/easy/recipes';
import { validate } from '../../src/model/validate';
import { fixIssue } from '../../src/easy/fix';
import { pieceCopies } from '../../src/model/pack';

describe('repro: offSheet fix', () => {
  it('ply-3 Quick build box 300 x 500 (fits the 600 x 400 sheet only turned)', () => {
    const d = createDesign(MATERIALS[3]); // ply-3, sheet 600x400, grain x, allowRotate off
    boxRecipe(d, { kind: 'rect', x0: 0, z0: 0, x1: 300, z1: 500 }, 40);
    const issues = validate(d);
    expect(issues.some((i) => i.key === 'val.offSheet')).toBe(false);
    const grain = issues.find((i) => i.key === 'val.tooBigGrain')!;
    expect(grain).toBeTruthy();
    expect(fixIssue(d, grain)).toBe(true);
    expect(d.allowRotate).toBe(true);
    expect(validate(d).filter((i) => ['val.offSheet', 'val.tooBig', 'val.tooBigGrain'].includes(i.key))).toEqual([]);
  });
  it('a card tray net too big either way shrinks uniformly until it fits', () => {
    const d = createDesign(MATERIALS[0]); // card, sheet 500 x 300
    const b = addRootPanel(d, 0, 0, 400, 300);
    addTray(d, b, 60);
    const big = validate(d).find((i) => i.key === 'val.tooBig')!;
    expect(big).toBeTruthy();
    const ratio = d.panels[b].w / d.panels[b].h;
    expect(fixIssue(d, big)).toBe(true);
    expect(d.panels[b].w / d.panels[b].h).toBeCloseTo(ratio, 3);
    expect(validate(d).filter((i) => ['val.offSheet', 'val.tooBig', 'val.tooBigGrain'].includes(i.key))).toEqual([]);
    const c = pieceCopies(d)[0];
    expect(Math.max(c.w, c.h)).toBeLessThanOrEqual(500 - 10 + 1e-6);
  });
});
