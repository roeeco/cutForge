// BUGFIX_PLAN B25 (written for the fix): after a material change, a tray's wall and corner kinds must
// be ones the new material allows, the walls must be sized for them on the first solve (no second
// solve changes anything), and a wall-set member's own material must survive the wall set merging.
import { describe, expect, it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { connectionsFor } from '../../src/model/materials';
import { seamKinds } from '../../src/model/seams';
import { diff } from '../fuzz/fuzz';

const [CARD, CORR16, CORR4, PLY] = MATERIALS;
const snap = (d: any) => JSON.parse(JSON.stringify(d));

describe('tray kinds after a material change', () => {
  for (const [from, to] of [[CARD, PLY], [PLY, CARD], [CORR16, PLY], [PLY, CORR4], [CARD, CORR16]] as const)
    it(`${from.id} -> ${to.id}`, () => {
      const d = ops.createDesign(from);
      const b = ops.addRootPanel(d, 0, 0, 120, 80);
      const t = ops.addTray(d, b, 40)!;
      ops.solve(d);
      ops.autoConnect(d);
      ops.setMaterial(d, to);
      ops.autoConnect(d);
      const tray = d.trays[t];
      expect(connectionsFor(to, 90)).toContain(tray.wallKind);
      expect(seamKinds(to, 'corner')).toContain(tray.cornerKind);
      const once = snap(d);
      ops.solve(d);
      expect(diff(once, snap(d))).toBeNull();
    });
  it('a construction base under a tray: kinds valid after the change too', () => {
    const d = ops.createDesign(CARD);
    const b = ops.addRootPanel(d, 0, 0, 120, 80);
    const t = ops.addTray(d, b, 40)!;
    d.panels[b].construction = true;
    ops.solve(d);
    ops.setMaterial(d, PLY);
    expect(connectionsFor(PLY, 90)).toContain(d.trays[t].wallKind);
    const once = snap(d);
    ops.solve(d);
    expect(diff(once, snap(d))).toBeNull();
  });
});
