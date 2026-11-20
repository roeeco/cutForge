// Milestone 92 (GUIDED_MODE.md G1 item 2): template sizes keep the dividers where the student put them.
import { describe, expect, it } from 'vitest';
import { defaults, generate, regenerate, templateById } from '../../src/templates/registry';
import { MATERIALS } from '../../src/model/materials';
import { dividerRow, MIN_COMPARTMENT } from '../../src/model/dividers';
import { setDividerOffset } from '../../src/model/ops';
import { produce } from 'immer';
import type { Design } from '../../src/model/types';

const org = templateById('organiser')!;
const at = (d: Design, id: string) => {
  const r = dividerRow(d, id)!;
  return { pos: r.pos, share: (r.pos + r.t / 2 - r.lo) / (r.hi - r.lo), lo: r.lo, hi: r.hi };
};

describe.each([MATERIALS[3], MATERIALS[1]])('organiser dividers in $id', (m) => {
  const start = generate(org, m, defaults(org));
  const moved = produce(start, (x) => void setDividerOffset(x, 't:divX1', at(start, 't:divX1').pos + 9));

  it('a height change leaves a moved divider where it is', () => {
    const r = regenerate(moved, { ...moved.template!.params, height: Number(moved.template!.params.height) + 2 }).design;
    expect(at(r, 't:divX1').pos).toBeCloseTo(at(moved, 't:divX1').pos, 6);
    expect(at(r, 't:divX2').pos).toBeCloseTo(at(moved, 't:divX2').pos, 6);
  });

  it('a width change keeps its share of the row', () => {
    const r = regenerate(moved, { ...moved.template!.params, width: Number(moved.template!.params.width) + 40 }).design;
    expect(at(r, 't:divX1').share).toBeCloseTo(at(moved, 't:divX1').share, 6);
  });

  it('one more divider keeps the first two and fills the widest space', () => {
    const r = regenerate(moved, { ...moved.template!.params, dividersX: 3 }).design;
    expect(at(r, 't:divX1').pos).toBeCloseTo(at(moved, 't:divX1').pos, 6);
    expect(at(r, 't:divX2').pos).toBeCloseTo(at(moved, 't:divX2').pos, 6);
    const c = [1, 2, 3].map((k) => at(r, `t:divX${k}`).pos).sort((a, b) => a - b);
    const t = dividerRow(r, 't:divX1')!.t, lo = at(r, 't:divX1').lo, hi = at(r, 't:divX1').hi;
    const gaps = [c[0] - lo, c[1] - c[0] - t, c[2] - c[1] - t, hi - c[2] - t];
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(MIN_COMPARTMENT - 1e-6);
  });

  it('a row no one moved keeps the even spacing', () => {
    const r = regenerate(start, { ...start.template!.params, dividersX: 3 }).design;
    const fresh = generate(org, m, { ...start.template!.params, dividersX: 3 });
    for (const k of [1, 2, 3]) expect(at(r, `t:divX${k}`).pos).toBeCloseTo(at(fresh, `t:divX${k}`).pos, 6);
  });
});

describe('the too-big fix on a template (milestone 92, G1 item 3)', () => {
  it('shrinks the template sizes, so the next size change does not grow it back', async () => {
    const { fixIssue } = await import('../../src/easy/fix');
    const { validate } = await import('../../src/model/validate');
    // a template's sizes respect the classroom sheets, so take a small custom sheet
    const small = { ...MATERIALS[3], id: 'ply-small', sheetW: 300, sheetH: 200 };
    const big = generate(org, small, { ...defaults(org), width: 290, depth: 150, height: 45 });
    const issue = validate(big).find((i) => i.key === 'val.tooBig');
    expect(issue).toBeTruthy();
    const fixed = produce(big, (x) => void fixIssue(x, issue!));
    expect(validate(fixed).some((i) => i.key === 'val.tooBig')).toBe(false);
    expect(Number(fixed.template!.params.width)).toBeLessThan(580);
    const again = regenerate(fixed, { ...fixed.template!.params, height: Number(fixed.template!.params.height) - 1 }).design;
    expect(validate(again).some((i) => i.key === 'val.tooBig')).toBe(false);
  });

  it('a fix that cannot end clean leaves the design unchanged and says so', async () => {
    const { fixIssue } = await import('../../src/easy/fix');
    const { createDesign, addRootPanel } = await import('../../src/model/ops');
    const d = produce(createDesign(MATERIALS[3]), (x) => void addRootPanel(x, 0, 0, 100, 60));
    const fake = { key: 'val.tooBig' as const, vars: {}, target: { kind: 'panel' as const, id: 'nope' } };
    let ok = true;
    const after = produce(d, (x) => void (ok = fixIssue(x, fake)));
    expect(after).toBe(d);
    expect(ok).toBe(false);
  });
});
