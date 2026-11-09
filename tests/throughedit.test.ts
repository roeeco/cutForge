// Milestone 20: snapping to real outlines and, for through-cuts, to the panels in their path.
import { describe, expect, it } from 'vitest';
import { addDetail, addDivider, addRootPanel, addWallInsert, autoConnect, createDesign, growPanel } from '../src/model/ops';
import { snapContext, snapPoint, throughTargets } from '../src/model/snap';
import { MATERIALS } from '../src/model/materials';
import { panelsCutBy } from '../src/model/through';

const PLY = MATERIALS[3];

function box() {
  const d = createDesign(PLY);
  const base = addRootPanel(d, 0, 0, 120, 80);
  const walls = [0, 1, 2, 3].map((e) => growPanel(d, base, e, { height: 50, angle: 90, dir: 'up', kind: 'finger' })!.panelId);
  autoConnect(d);
  return { d, base, walls };
}

describe('snapping to the real outline', () => {
  it('a shape on a gable wall snaps to its apex', () => {
    const { d, walls } = box();
    const front = walls[0];
    addWallInsert(d, front, 'e2', 0.5, 30); // apex at (60, 80)
    const ctx = snapContext(d, front, new Set())!;
    expect(ctx.points.some((q) => q.x === 60 && q.y === 80)).toBe(true);
    const sn = snapPoint(ctx, { x: 60.6, y: 79.3 }, 1);
    expect(sn.dx).toBeCloseTo(-0.6, 9);
    expect(sn.dy).toBeCloseTo(0.7, 9);
  });

  it('a rectangle gives the same nine targets as before (corners, edge midpoints, centre)', () => {
    const d = createDesign(PLY);
    const p = addRootPanel(d, 0, 0, 100, 60);
    const pts = snapContext(d, p, new Set())!.points.map((q) => `${q.x},${q.y}`);
    expect(new Set(pts)).toEqual(new Set(['0,0', '100,0', '100,60', '0,60', '50,0', '100,30', '50,60', '0,30', '50,30']));
  });
});

describe('through-cut snapping', () => {
  it("a through-cut's corner snaps to an edge of a panel it passes through (a divider's top)", () => {
    const { d, base, walls } = box();
    const front = walls[0];
    // a divider parallel to the front wall, 30 high: its top is at y = 3 + 30 on the front wall
    addDivider(d, base, 0, 40, 30);
    autoConnect(d);
    const cut = addDetail(d, front, 'rect', 'cut', 60, 25, 20, 10, undefined, true)!;
    expect(panelsCutBy(d, cut).length).toBeGreaterThanOrEqual(2);
    const ts = throughTargets(d, front, cut);
    expect(ts.some((q) => Math.abs(q.y - 33) < 1e-6)).toBe(true);
    // with the through-cut excluded (it is the one being dragged), a corner near y = 33 snaps there
    const ctx = snapContext(d, front, new Set([cut]))!;
    const sn = snapPoint(ctx, { x: 71.3, y: 33.4 }, 1);
    expect(sn.dy).toBeCloseTo(-0.4, 9);
    // a plain cut on the same wall does not see the divider
    const plain = snapContext(d, front, new Set())!;
    expect(snapPoint(plain, { x: 71.3, y: 33.4 }, 1).dy).toBe(0);
  });
});
