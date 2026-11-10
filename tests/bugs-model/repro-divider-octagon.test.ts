// "+ Divider" between two opposite walls of an octagonal tray: the plan says
// ok and a divider is made, but it is only as long as the base edge it is grown
// from (the short edge square to the walls), so it floats in the middle,
// reaching neither wall, and neither end is joined.
import { expect, it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { trayWalls } from '../../src/model/trays';
import { validate } from '../../src/model/validate';

const edit = (d: any, f: () => void) => {
  f();
  ops.solve(d);
  ops.autoConnect(d);
};

it('octagon tray, divider between walls 0 and 4', () => {
  const d = ops.createDesign(MATERIALS[3]);
  const b = ops.addPolygonPanel(d, 0, 0, ops.regularPolygon(8, 80))!;
  let t = '', dv: string | null = null;
  edit(d, () => (t = ops.addTray(d, b, 50)!));
  const [w0, , , , w4] = trayWalls(d, t);
  expect(ops.planDividerFor(d, w0, w4).ok).toBe(true);
  edit(d, () => (dv = ops.addDividerFor(d, w0, w4)));
  expect(dv).not.toBeNull();
  const ends = Object.values(d.connections).filter((c) => !c.grown && (c.a.panelId === dv || c.b.panelId === dv));
  console.log('divider w', d.panels[dv!].w.toFixed(1), 'joints', ends.map((c) => `${c.kind}${c.broken ? '(broken)' : ''}`), 'validate', validate(d).map((i) => i.key));
  // expected: the divider runs from wall 0 to wall 4 (~142 mm) with both ends joined; actual: 61 mm, no joints
  expect(d.panels[dv!].w).toBeGreaterThan(130);
  expect(ends.filter((c) => !c.broken)).toHaveLength(2);
});
