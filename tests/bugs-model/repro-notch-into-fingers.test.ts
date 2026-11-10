// A Cut notch from a plywood tray wall's top edge that reaches into the
// finger-joint zone of its bottom edge (within t of the bottom): the wall's
// outline crosses itself (the joint notches are applied to edges the cut no
// longer leaves whole) and is exported that way; validate() reports nothing.
import { expect, it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { buildPieces } from '../../src/model/pieces';
import { validate } from '../../src/model/validate';
import { flattenContour } from '../../src/geom/vec';
import { selfCrossing } from './fuzz';

const edit = (d: any, f: () => void) => {
  f();
  ops.solve(d);
  ops.autoConnect(d);
};

it('handle notch 27.5 mm deep in a 30 mm finger-jointed wall', () => {
  const d = ops.createDesign(MATERIALS[3]);
  const b = ops.addRootPanel(d, 0, 0, 200, 150);
  let t = '';
  edit(d, () => (t = ops.addTray(d, b, 30)!));
  const w = `${t}/e0`;
  // notch from above the top down to y = 2.5 (the bottom fingers are 3 mm deep)
  edit(d, () => void ops.addDetail(d, w, 'rect', 'cut', 100, 18.75, 40, 32.5));
  const outer = buildPieces(d).filter((p) => p.panels.some((n) => n.panelId === w)).flatMap((p) => p.contours.filter((c) => c.role === 'outer'));
  const crossing = outer.map((c) => selfCrossing(flattenContour(c.contour, 0.05))).filter(Boolean);
  console.log('validate:', validate(d).map((i) => i.key));
  expect(crossing).toEqual([]); // actual: the wall's outer contour crosses itself
});
