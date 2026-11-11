// A corrugated 7-gon tray whose net lies flat by hinging a wall: the joined
// piece outline gets a degenerate (zero-area) hole ring ~1 mm long, which is
// exported as a cut.
import { expect, it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { buildPieces } from '../../src/model/pieces';
import { flattenContour, polygonArea } from '../../src/geom/vec';

it('no zero-area cut contours in a hinged corrugated tray net', () => {
  const d = ops.createDesign(MATERIALS[1]);
  const b = ops.addPolygonPanel(d, 0, 0, [{ x: 47, y: 0 }, { x: 32, y: 40 }, { x: -13, y: 56 }, { x: -72, y: 35 }, { x: -78, y: -38 }, { x: -24, y: -105 }, { x: 37, y: -47 }])!;
  const t = ops.addTray(d, b, 42)!;
  ops.solve(d);
  ops.autoConnect(d);
  expect(d.trays[t].fixes).toEqual({ e0: 'hinge' });
  const bad = buildPieces(d).flatMap((p) => p.contours).filter((c) => c.contour.closed && Math.abs(polygonArea(flattenContour(c.contour, 0.05))) < 1e-3);
  expect(bad.map((c) => [c.role, c.op, flattenContour(c.contour, 0.05).length])).toEqual([]);
});
