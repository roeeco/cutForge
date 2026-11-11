// Typing a width for a wall that stands on a polygon base's edge (setPanelSize
// on the wall → setEdgeLength on the base) moves the edge's end vertex with no
// check, so the base polygon can cross itself. moveVertex / addPolygonPanel
// refuse such outlines (isSimplePolygon); setEdgeLength does not. validate() is silent.
import { expect, it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { panelEdges } from '../../src/model/edges';
import { validate } from '../../src/model/validate';

const edit = (d: any, f: () => void) => {
  f();
  ops.solve(d);
  ops.autoConnect(d);
};
const L = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }, { x: 40, y: 40 }, { x: 40, y: 100 }, { x: 0, y: 100 }];

it('L-shaped tray: the inner wall (on e2, 60 mm) set to 150 mm wide', () => {
  const d = ops.createDesign(MATERIALS[3]);
  const b = ops.addPolygonPanel(d, 0, 0, L)!;
  let t = '';
  edit(d, () => (t = ops.addTray(d, b, 30)!));
  edit(d, () => ops.setPanelSize(d, `${t}/e2`, 150, undefined));
  const pts = panelEdges(d.panels[b]).map((e) => e.a);
  console.log('base now', JSON.stringify(pts), 'validate', validate(d).map((i) => i.key));
  expect(ops.isSimplePolygon(pts)).toBe(true); // actual: the base crosses itself
});

it('directly: setEdgeLength', () => {
  const d = ops.createDesign(MATERIALS[3]);
  const b = ops.addPolygonPanel(d, 0, 0, L)!;
  edit(d, () => ops.setEdgeLength(d, b, 'e2', 150));
  expect(ops.isSimplePolygon(panelEdges(d.panels[b]).map((e) => e.a))).toBe(true);
});
