// "+ Divider" between two opposite walls of an octagonal (or 12-gon) tray: the divider is grown from the
// base edge running between the walls, and is only as long as that edge, so it reached neither wall and
// neither end was joined. BUGFIX_PLAN B11: the plan is refused (`tooShort`) instead; never ok with
// unjoined ends. (Changed from the original repro, which asked for ok: the plan allows either outcome.)
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
    if (!plan.ok) {
      expect(plan.reason).toBe('tooShort');
      expect(dv).toBeNull();
      return;
    }
    expect(dv).not.toBeNull();
    const ends = Object.values(d.connections).filter((c) => !c.grown && (c.a.panelId === dv || c.b.panelId === dv));
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
  const ends = Object.values(d.connections).filter((c) => !c.grown && (c.a.panelId === dv || c.b.panelId === dv));
  expect(ends.filter((c) => !c.broken)).toHaveLength(2);
});
