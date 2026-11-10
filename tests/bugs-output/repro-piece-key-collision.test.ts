// Piece keys are not unique: a wall set member is named `<wall>~n` (ops.ts reconcileWallSets/derivedOf)
// and a fragment of a split piece is named `<key>~n` too (pieces.ts groupPieces). When both exist, two
// different pieces share a key: pack() keeps one placement for both copy keys, so prepareExport draws
// both pieces at the same spot on the sheet (overlapping cut paths), and compensated mode reuses one
// piece's contours for the other. pieceRoot() (split on '~') also sends wall-set members' quantity
// and material lookups to the base wall.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../../src/model/materials';
import { buildPieces, pieceKeyOf } from '../../src/model/pieces';
import { pack, pieceCopies, placedRect } from '../../src/model/pack';
import { prepareExport } from '../../src/export/prepare';
import { addDetail, addRootPanel, addTray, createDesign, setPanelMaterial, solve } from '../../src/model/ops';

function box() {
  const d = createDesign(MATERIALS[3]); // ply-3
  const b = addRootPanel(d, 0, 0, 200, 100);
  addTray(d, b, 40);
  // two notches across edge e1 split it in three: walls W, W~1, W~2
  addDetail(d, b, 'rect', 'cut', 200, 30, 20, 10);
  addDetail(d, b, 'rect', 'cut', 200, 70, 20, 10);
  solve(d);
  const W = d.order.find((k) => k.endsWith('/e1'))!;
  return { d, W };
}

describe('repro: piece key collision', () => {
  it('a cut splitting wall W makes fragment W~2, colliding with wall-set member W~2', () => {
    const { d, W } = box();
    const wp = d.panels[W];
    addDetail(d, W, 'rect', 'cut', wp.w / 2, wp.h / 2, 3, wp.h * 3); // slot top to bottom: W in two fragments
    solve(d);
    const keys = buildPieces(d).map((p) => p.key);
    expect.soft(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]); // actual: `${W}~2` twice
    const copies = pieceCopies(d);
    const pl = pack(d, copies);
    expect.soft(Object.keys(pl).length).toBe(copies.length); // actual: 13 placements for 14 copies
    // in the cut file, the two pieces lie on top of each other
    const prep = prepareExport(d);
    const outers = prep.sheets[0].contours.filter((c) => c.role === 'outer' && c.ref?.pieceKey === `${W}~2#0`);
    expect(outers.length).toBe(1); // actual: 2 outlines at the same placement
  });
  it('copies set on a wall-set member (as the Inspector does) are ignored', () => {
    const { d, W } = box();
    const member = `${W}~1`;
    // Inspector.tsx: x.pieces[pieceKeyOf(x, id)] = { quantity }
    d.pieces[pieceKeyOf(d, member)] = { quantity: 3 };
    const n = pieceCopies(d).filter((c) => c.pieceKey === member).length;
    expect(n).toBe(3); // actual: 1 (quantity read from d.pieces[W])
  });
  it('a wall-set member with its own material is packed on the base wall material', () => {
    const { d, W } = box();
    const member = `${W}~1`;
    setPanelMaterial(d, [member], MATERIALS[1]);
    const c = pieceCopies(d).find((x) => x.pieceKey === member)!;
    expect(c.mat).toBe(MATERIALS[1].id); // actual: ply-3 (material looked up on W)
  });
});
