// Kerf compensation grows a piece's outline by kerf/2 on every side. On a plywood 9-gon tray of
// radius 13.38 mm (walls 9.15 mm wide with corner fingers from both sides), compensatePiece reports
// success but one side of a wall's outline moves *inward*: the compensated cut leaves that wall
// kerf (0.15 mm) short. validate reports nothing blocking for it. The outline touches itself where
// the fingers from both sides meet; offsetContour's self-intersection test (strict crossings
// only, offset.ts selfIntersects/segsCross) does not catch the overlap.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../../src/model/materials';
import { addPolygonPanel, addTray, createDesign, regularPolygon } from '../../src/model/ops';
import { pieceCopies } from '../../src/model/pack';
import { compensatePiece } from '../../src/export/prepare';
import { contourBBox } from '../../src/geom/vec';
import { validate } from '../../src/model/validate';
import { blocking } from '../../src/easy/fix';

describe('repro: kerf compensation shrinks a narrow finger-jointed wall', () => {
  it('ply-3 9-gon tray, r = 13.38, height 40.70', () => {
    const d = createDesign(MATERIALS[3]); // kerf 0.15
    const base = addPolygonPanel(d, 0, 0, regularPolygon(9, 13.38))!;
    addTray(d, base, 40.7);
    const blockers = validate(d).filter(blocking).map((i) => i.key);
    const wrong: string[] = [];
    for (const c of pieceCopies(d)) {
      const r = compensatePiece(c.contours, 0.15);
      if (!r.ok) continue; // refused: export blocked, that is fine
      const i = c.contours.findIndex((x) => x.role === 'outer');
      const b0 = contourBBox(c.contours[i].contour), b1 = contourBBox(r.contours[i].contour);
      const grow = [b0.minX - b1.minX, b0.minY - b1.minY, b1.maxX - b0.maxX, b1.maxY - b0.maxY];
      if (grow.some((g) => Math.abs(g - 0.075) > 1e-4)) wrong.push(`${c.key}: ${grow.map((g) => g.toFixed(3))}`);
    }
    expect({ blockers, wrong }).toEqual({ blockers: [], wrong: [] }); // actual: walls with a side at -0.075
  });
});
