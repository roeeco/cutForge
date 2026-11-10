// Moving a panel sticks to other panels' planes (flush faces, edges in line).
import { describe, expect, it } from 'vitest';
import { addPlacedPanel, addRootPanel, addTray, createDesign, setMaterial, solve } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { FLOOR_FRAME } from '../src/model/place';
import { moverSet, planeLines, snapFlush } from '../src/model/planeSnap';

const PLY = MATERIALS.find((m) => m.id === 'ply-3')!;

describe('flush snapping', () => {
  it('a box moved towards another stops flush against its wall, and in line with it', () => {
    const d = createDesign();
    setMaterial(d, PLY);
    const a = addRootPanel(d, 0, 100, 100, 100);
    addTray(d, a, 40);
    const b = addRootPanel(d, 103, 100, 60, 100);
    solve(d);
    const movers = moverSet(d, [b]);
    expect(movers.has(b)).toBe(true);
    expect(movers.has(a)).toBe(false);
    const moving = planeLines(d, FLOOR_FRAME, (id) => movers.has(id)), targets = planeLines(d, FLOOR_FRAME, (id) => !movers.has(id));
    // 3 mm right of the box; dragged 2 mm towards it (and 1.2 mm off its front line): it lands touching, its front edge in line
    const s = snapFlush(moving, targets, -2, 1.2, 4)!;
    expect(s).toBeTruthy();
    expect(s.dx).toBeCloseTo(-3, 6);
    expect(s.dy).toBeCloseTo(0, 6);
    expect(s.lines).toHaveLength(2);
    // out of reach: nothing
    expect(snapFlush(moving, targets, 20, 30, 4)).toBeNull();
  });

  it('a panel standing on a base slides flush against a wall', () => {
    const d = createDesign();
    setMaterial(d, PLY);
    const base = addRootPanel(d, 0, 100, 150, 100);
    addTray(d, base, 40);
    const st = addPlacedPanel(d, { host: base, face: 1, x: 60, y: 20, rot: 90, pose: 'standing', side: 1 }, 40, 30)!;
    solve(d);
    const H = d.panels[base].frame;
    const movers = moverSet(d, [st]);
    const moving = planeLines(d, H, (id) => movers.has(id)), targets = planeLines(d, H, (id) => !movers.has(id) && id !== base);
    // the left wall's inside face is at x = 3; the panel's faces at 60 and 63: dragged to 4.5 mm away it lands on 3
    const s = snapFlush(moving, targets, -55.5, 0, 3)!;
    expect(s.dx).toBeCloseTo(-57, 6);
  });
});
