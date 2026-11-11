// A fold child whose parent edge disappears (a wall's inserted point deleted, or
// a base vertex deleted under a divider) crashes buildPieces / validate, and
// every later solve once the design has a tray (so with a tray present, the
// triggering edit itself throws inside solve).
import { expect, it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { buildPieces } from '../../src/model/pieces';
import { validate } from '../../src/model/validate';

const CARD = MATERIALS[0];
const edit = (d: any, f: () => void) => {
  f();
  ops.solve(d);
  ops.autoConnect(d);
};

it('simplest: a Cut (or Add) band across the whole edge a folded wall stands on', () => {
  for (const op of ['cut', 'add'] as const) {
    const d = ops.createDesign(CARD);
    const b = ops.addRootPanel(d, 0, 0, 120, 80);
    edit(d, () => void ops.growPanel(d, b, 'e0', { height: 40, angle: 90, dir: 'up', kind: 'fold' }));
    // a 140 x 20 rectangle centred on the front edge: edge e0 no longer exists, the wall is flagged broken
    edit(d, () => void ops.addDetail(d, b, 'rect', op, 60, 0, 140, 20));
    expect(Object.values(d.connections)[0].broken).toBe(true);
    expect(() => buildPieces(d)).not.toThrow(); // actual: Error: no edge e0 (pieces.ts foldXform via netFolds)
  }
});

it('roof panel grown off a gable edge, then the gable point deleted', () => {
  const d = ops.createDesign(CARD);
  const b = ops.addRootPanel(d, 0, 0, 200, 150);
  let w = '', ins = '';
  edit(d, () => (w = ops.growPanel(d, b, 'e0', { height: 60, angle: 90, dir: 'up', kind: 'fold' })!.panelId));
  edit(d, () => (ins = ops.addWallInsert(d, w, 'e2', 0.5, 30)!));
  // grow a roof panel off the gable's second slope (edge keyed by the insert id)
  edit(d, () => void ops.growPanel(d, w, ins, { height: 40, angle: 120, dir: 'up', kind: 'fold' }));
  expect(() => buildPieces(d)).not.toThrow();
  edit(d, () => ops.deleteWallInsert(d, w, ins));
  // expected: the roof is kept, flagged (as solve intends); actual: "no edge i_…"
  expect(() => validate(d)).not.toThrow();
  expect(() => buildPieces(d)).not.toThrow();
});

it('afterwards, adding a tray anywhere in the design throws (solve → fixFlatNets → netOverlaps)', () => {
  const d = ops.createDesign(CARD);
  const b = ops.addRootPanel(d, 0, 0, 200, 150);
  const other = ops.addRootPanel(d, 400, 0, 100, 100);
  let w = '', ins = '';
  edit(d, () => (w = ops.growPanel(d, b, 'e0', { height: 60, angle: 90, dir: 'up', kind: 'fold' })!.panelId));
  edit(d, () => (ins = ops.addWallInsert(d, w, 'e2', 0.5, 30)!));
  edit(d, () => void ops.growPanel(d, w, ins, { height: 40, angle: 120, dir: 'up', kind: 'fold' }));
  edit(d, () => ops.deleteWallInsert(d, w, ins));
  expect(() => edit(d, () => void ops.addTray(d, other, 40))).not.toThrow();
});

it('divider turned off 90° (card: becomes a fold), then the base vertex starting its edge deleted', () => {
  const d = ops.createDesign(CARD);
  const b = ops.addRootPanel(d, 0, 0, 224, 230);
  let dv = '';
  edit(d, () => (dv = ops.addDivider(d, b, 'e3', 29, 40)!));
  const c = ops.parentConnection(d, dv)!;
  edit(d, () => ops.setConnection(d, c.id, { angle: 45 }));
  expect(d.connections[c.id].kind).toBe('fold');
  edit(d, () => void ops.deleteVertex(d, b, 3)); // removes edge e3
  expect(() => buildPieces(d)).not.toThrow();
});
