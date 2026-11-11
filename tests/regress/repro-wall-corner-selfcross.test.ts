// Dragging a wall's top corner below its bottom (or past the other top corner)
// is accepted: the wall's outline crosses itself and is cut that way. Root
// polygons refuse this (moveVertex checks isSimplePolygon); setWallCorner does not.
import { expect, it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { buildPieces } from '../../src/model/pieces';
import { validate } from '../../src/model/validate';
import { flattenContour } from '../../src/geom/vec';
import { panelEdges } from '../../src/model/edges';
import { selfCrossing } from '../bugs-model/fuzz';

const edit = (d: any, f: () => void) => {
  f();
  ops.solve(d);
  ops.autoConnect(d);
};

it('a wall corner dragged below the bottom edge', () => {
  const d = ops.createDesign(MATERIALS[0]);
  const b = ops.addRootPanel(d, 0, 0, 120, 80);
  let w = '';
  edit(d, () => (w = ops.growPanel(d, b, 'e0', { height: 40, angle: 90, dir: 'up', kind: 'fold' })!.panelId));
  // top-right corner (120, 40) dragged to (100, -10): below the wall's bottom line
  edit(d, () => ops.setWallCorner(d, w, 'tr', { dx: -20, dy: -50 }));
  const ring = panelEdges(d.panels[w]).map((e) => e.a);
  console.log('wall sketch', JSON.stringify(d.panels[w].sketch), 'validate', validate(d).map((i) => i.key));
  expect(ops.isSimplePolygon(ring)).toBe(true); // or the edit refused, as moveVertex does
  const outer = buildPieces(d).flatMap((p) => p.contours.filter((c) => c.role === 'outer'));
  for (const c of outer) expect(selfCrossing(flattenContour(c.contour, 0.05))).toBeNull();
});

it('the edit is refused and the wall keeps its last outline; a crossing wall from a file is reported', () => {
  const d = ops.createDesign(MATERIALS[0]);
  const b = ops.addRootPanel(d, 0, 0, 120, 80);
  let w = '';
  edit(d, () => (w = ops.growPanel(d, b, 'e0', { height: 40, angle: 90, dir: 'up', kind: 'fold' })!.panelId));
  expect(ops.setWallCorner(d, w, 'tr', { dx: -10, dy: 5 })).toBe(true);
  expect(ops.setWallCorner(d, w, 'tr', { dx: -20, dy: -50 })).toBe(false);
  expect((d.panels[w].sketch as any).corners).toEqual({ tr: { dx: -10, dy: 5 } });
  expect(validate(d).some((i) => i.key === 'val.selfCross')).toBe(false);
  (d.panels[w].sketch as any).corners = { tr: { dx: -20, dy: -50 } };
  ops.solve(d);
  expect(validate(d).some((i) => i.key === 'val.selfCross' && i.target.id === w)).toBe(true);
});
