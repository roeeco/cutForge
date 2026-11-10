// A Cut shape bigger than its panel (it covers the whole board) leaves the
// panel with no outline ring; safeUnion([]) then returns [undefined] and
// buildPieces / validate / netOverlaps crash. With a tray, every solve throws.
import { expect, it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { buildPieces } from '../../src/model/pieces';
import { validate } from '../../src/model/validate';
import { ownOutline } from '../../src/model/outline';
import { safeUnion } from '../../src/geom/clip';

const [CARD, , CORR4, PLY] = MATERIALS;
const edit = (d: any, f: () => void) => {
  f();
  ops.solve(d);
  ops.autoConnect(d);
};

it('safeUnion of nothing returns [undefined]', () => {
  expect(safeUnion([])).toEqual([]);
});

it('a hole resized past the panel: buildPieces and validate throw', () => {
  const d = ops.createDesign(PLY);
  const p = ops.addRootPanel(d, 0, 0, 160, 80);
  let x = '';
  edit(d, () => (x = ops.addDetail(d, p, 'circle', 'cut', 80, 40, 20, 20)!));
  edit(d, () => ops.updateDetail(d, x, { w: 500 }));
  expect(ownOutline(d.panels[p]).rings).toHaveLength(0);
  expect(() => buildPieces(d)).not.toThrow(); // TypeError: Cannot read properties of undefined (reading 'forEach')
  expect(() => validate(d)).not.toThrow();
});

it('the same on a card tray wall: the edit itself throws inside solve (fixFlatNets → flatPanel)', () => {
  const d = ops.createDesign(CARD);
  const p = ops.addRootPanel(d, 0, 0, 120, 80);
  let x = '', t = '';
  edit(d, () => void (t = ops.addTray(d, p, 40)!));
  const wall = `${t}/e2`;
  edit(d, () => (x = ops.addDetail(d, wall, 'rect', 'cut', 60, 20, 20, 10)!));
  expect(() => edit(d, () => ops.updateDetail(d, x, { w: 300, h: 300 }))).not.toThrow();
});
