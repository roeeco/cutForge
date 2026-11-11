// Kerf compensation grows a piece's outline by kerf/2 on every side. On a plywood 9-gon tray of
// radius 13.38 mm (walls 9.15 mm wide with corner joints 4.67 mm deep from both sides, at the same
// heights), compensatePiece reported success but one side of a wall's outline moved *inward*: the
// outline touches itself where the joints meet, and the offset's check only caught strict crossings.
// BUGFIX_PLAN B13: the compensated outline is right (here the meeting joints split each wall, B9) or
// compensation is refused, and either way validate reports the thin wall (val.sliver). (The original repro also asked for no blocking issue; with the refusal
// outcome the plan asks for, an issue is expected instead.)
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../../src/model/materials';
import { addPolygonPanel, addTray, createDesign, regularPolygon } from '../../src/model/ops';
import { pieceCopies } from '../../src/model/pack';
import { compensatePiece } from '../../src/export/prepare';
import { contourBBox } from '../../src/geom/vec';
import { validate } from '../../src/model/validate';

describe('repro: kerf compensation shrinks a narrow finger-jointed wall', () => {
  it('ply-3 9-gon tray, r = 13.38, height 40.70', () => {
    const d = createDesign(MATERIALS[3]); // kerf 0.15
    const base = addPolygonPanel(d, 0, 0, regularPolygon(9, 13.38))!;
    addTray(d, base, 40.7);
    const issues = validate(d);
    const wrong: string[] = [];
    let refused = 0;
    for (const c of pieceCopies(d)) {
      const r = compensatePiece(c.contours, 0.15);
      if (!r.ok) {
        refused++;
        // a refused piece is named by an issue
        expect(issues.some((i) => i.key === 'val.sliver' && c.panels.some((n) => n.panelId === i.target.id)), c.key).toBe(true);
        continue;
      }
      const i = c.contours.findIndex((x) => x.role === 'outer');
      const b0 = contourBBox(c.contours[i].contour), b1 = contourBBox(r.contours[i].contour);
      const grow = [b0.minX - b1.minX, b0.minY - b1.minY, b1.maxX - b0.maxX, b1.maxY - b0.maxY];
      if (grow.some((g) => Math.abs(g - 0.075) > 1e-4)) wrong.push(`${c.key}: ${grow.map((g) => g.toFixed(3))}`);
    }
    expect(wrong).toEqual([]);
    // the joints from both sides meet across the wall: each wall is reported as too thin to cut
    const walls = d.order.filter((id) => id !== base);
    for (const w of walls) expect(issues.some((i) => i.key === 'val.sliver' && i.target.id === w), w).toBe(true);
    expect(refused).toBeGreaterThanOrEqual(0);
  });
  it('a wider 9-gon (r = 40) has no thin walls and compensates every piece outward', () => {
    const d = createDesign(MATERIALS[3]);
    const base = addPolygonPanel(d, 0, 0, regularPolygon(9, 40))!;
    addTray(d, base, 40.7);
    expect(validate(d).filter((i) => i.key === 'val.sliver')).toEqual([]);
    for (const c of pieceCopies(d)) expect(compensatePiece(c.contours, 0.15).ok).toBe(true);
  });
});
