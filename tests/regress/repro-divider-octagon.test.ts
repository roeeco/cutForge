// "+ Divider" between two opposite walls of an octagonal (or 12-gon) tray: the divider was grown from the
// base edge running between the walls, and was only as long as that edge, so it reached neither wall and
// neither end was joined. BUGFIX_PLAN B11 refused the plan (`tooShort`). Since milestone 44 a divider's ends
// find the walls, so the plan is ok and both ends are joined.
import { expect, it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { trayWalls } from '../../src/model/trays';

const edit = (d: any, f: () => void) => {
  f();
  ops.solve(d);
  ops.autoConnect(d);
};

for (const n of [8, 12])
  it(`${n}-gon tray, divider between opposite walls`, () => {
    const d = ops.createDesign(MATERIALS[3]);
    const b = ops.addPolygonPanel(d, 0, 0, ops.regularPolygon(n, 80))!;
    let t = '', dv: string | null = null;
    edit(d, () => (t = ops.addTray(d, b, 50)!));
    const walls = trayWalls(d, t);
    const [wa, wb] = [walls[0], walls[n / 2]];
    const plan = ops.planDividerFor(d, wa, wb);
    edit(d, () => (dv = ops.addDividerFor(d, wa, wb)));
    expect(plan.ok).toBe(true);
    expect(dv).not.toBeNull();
    // its ends: every joint but the one with its base (milestone 44: that is an edge on the base's face too)
  const ends = Object.values(d.connections).filter((c) => !c.grown && (c.a.panelId === dv || c.b.panelId === dv) && c.id !== ops.baseJointOf(d, dv!)?.id);
    expect(ends.filter((c) => !c.broken)).toHaveLength(2);
  });

it('a rectangle tray still gets a divider joined at both ends', () => {
  const d = ops.createDesign(MATERIALS[3]);
  const b = ops.addRootPanel(d, 0, 0, 200, 120);
  let t = '', dv: string | null = null;
  edit(d, () => (t = ops.addTray(d, b, 50)!));
  const walls = trayWalls(d, t);
  expect(ops.planDividerFor(d, walls[1], walls[3]).ok).toBe(true);
  edit(d, () => (dv = ops.addDividerFor(d, walls[1], walls[3])));
  // its ends: every joint but the one with its base (milestone 44: that is an edge on the base's face too)
  const ends = Object.values(d.connections).filter((c) => !c.grown && (c.a.panelId === dv || c.b.panelId === dv) && c.id !== ops.baseJointOf(d, dv!)?.id);
  expect(ends.filter((c) => !c.broken)).toHaveLength(2);
});
