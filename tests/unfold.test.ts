// Milestone 124 (Shapes R5): the unfolder.
import { beforeAll, describe, expect, it } from 'vitest';
import { unfold, islandOrder, ringsOverlap, fitsSheet, type Unfolding } from '../src/model/unfold';
import { ringOf, type PEdge, type Polyhedron } from '../src/model/polyhedron';
import { boxSolid, diamondSolid, houseSolid, lSolid, prismSolid, pyramidSolid } from './solids';
import { createDesign, solve } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { addSeamNet } from '../src/model/seamNet';
import { buildPieces, netOverlaps } from '../src/model/pieces';
import { applyX } from '../src/geom/vec';
import type { P2 } from '../src/model/types';

// A4 less 5 mm margins
const A4 = { w: 287, h: 200 };
const flap10 = (e: PEdge) => Math.min(10, e.len / 3);

/** Every face and flap of every island, placed: none overlap, each island fits. */
function check(P: Polyhedron, u: Unfolding, sheet = A4) {
  for (const I of u.islands) {
    const rings: P2[][] = I.map((k) => P.faces[k].outer.map((p) => applyX(u.place[k], p)));
    for (const [ek, on] of Object.entries(u.flapOn)) {
      if (!I.includes(on)) continue;
      const e = P.edges[ek];
      const ref = on === e.a ? e.ea : e.eb;
      const ring = ringOf(P.faces[on], ref.ring);
      const a = ring[ref.i], b = ring[(ref.i + 1) % ring.length];
      const L = Math.hypot(b.x - a.x, b.y - a.y), dx = (b.x - a.x) / L, dy = (b.y - a.y) / L, D = u.flapDepth[ek], tp = Math.min(u.flapTaper[ek], L / 3);
      const q = (s: number, w: number) => applyX(u.place[on], { x: a.x + dx * s + dy * w, y: a.y + dy * s - dx * w });
      rings.push([q(0, 0), q(tp, D), q(L - tp, D), q(L, 0)]);
    }
    expect(fitsSheet(rings, sheet.w, sheet.h)).toBe(true);
    for (let i = 0; i < rings.length; i++) for (let j = i + 1; j < rings.length; j++) expect(ringsOverlap(rings[i], rings[j], 0.05), `${I.join(',')} ${i} × ${j}`).toBe(false);
  }
}

const FIXTURES: [string, () => Polyhedron][] = [
  ['cube 50', () => boxSolid(50, 50, 50)],
  ['hexagonal prism', () => prismSolid(6, 30, 50)],
  ['square pyramid', () => pyramidSolid(4, 40, 50)],
  ['diamond, 8 sides', () => diamondSolid(8, 35, 12, 30)],
  ['L-prism', () => lSolid()],
  ['house', () => houseSolid()],
  ['12-sided tube', () => prismSolid(12, 30, 50)],
];

describe('the unfolder', () => {
  it.each(FIXTURES)('%s: no overlap (flaps included), fits A4', (_n, make) => {
    const P = make();
    const u = unfold(P, { sheet: A4, flap: flap10, seed: 'd1' });
    check(P, u);
    expect(u.issues.filter((i) => i.kind === 'flapDropped')).toEqual([]);
    // every face is in exactly one island; folds join each island into a tree
    expect(u.islands.flat().sort()).toEqual(Object.keys(P.faces).sort());
    expect(u.folds.size).toBe(Object.keys(P.faces).length - u.islands.length);
  });

  it('a cube gives one piece', () => {
    const u = unfold(boxSolid(50, 50, 50), { sheet: A4, flap: flap10, seed: 'x' });
    expect(u.islands).toHaveLength(1);
    expect(Object.keys(u.flapOn)).toHaveLength(7);
  });

  it('the same seed gives the same net twice; another seed may differ but is as good', () => {
    const P = diamondSolid(8, 35, 12, 30);
    const a = unfold(P, { sheet: A4, flap: flap10, seed: 'design-1' }), b = unfold(P, { sheet: A4, flap: flap10, seed: 'design-1' });
    expect([...a.folds].sort()).toEqual([...b.folds].sort());
    expect(a.flapOn).toEqual(b.flapOn);
    const c = unfold(P, { sheet: A4, flap: flap10, seed: 'design-2' });
    expect(c.islands.length).toBeLessThanOrEqual(a.islands.length + 1);
  });

  it('a fixed cut is never folded, and a fixed fold is kept', () => {
    const P = boxSolid(50, 50, 50);
    const first = unfold(P, { sheet: A4, flap: flap10, seed: 's' });
    const fold = [...first.folds][0];
    const cut = Object.keys(P.edges).find((k) => !first.folds.has(k))!;
    // cut where it folded, fold where it cut
    const u = unfold(P, { sheet: A4, flap: flap10, seed: 's', fixed: { [fold]: 'cut', [cut]: 'fold' } });
    expect(u.folds.has(fold)).toBe(false);
    expect(u.folds.has(cut)).toBe(true);
    check(P, u);
  });

  it('a form that cannot lie in one piece on the sheet is split into pieces that do, saying why', () => {
    const P = boxSolid(270, 30, 150);
    const u = unfold(P, { sheet: A4, flap: flap10, seed: 's' });
    expect(u.islands.length).toBeGreaterThan(1);
    check(P, u);
    expect(u.issues).toContainEqual(expect.objectContaining({ kind: 'split', why: 'sheet' }));
    // a face larger than the sheet is named
    const big = unfold(boxSolid(300, 20, 250), { sheet: A4, flap: flap10, seed: 's' });
    expect(big.issues.some((i) => i.kind === 'faceTooBig')).toBe(true);
  });

  it('open faces are left out', () => {
    const P = boxSolid(50, 50, 50);
    const top = Object.keys(P.faces).find((k) => k.endsWith(':top'))!;
    const u = unfold(P, { sheet: A4, flap: flap10, seed: 's', open: [top] });
    expect(u.islands.flat()).not.toContain(top);
    expect(Object.keys(u.flapOn).every((k) => !k.includes(top))).toBe(true);
  });

  it('Fewer cuts keeps the long edges folded', () => {
    const P = prismSolid(6, 20, 120);
    const sheet = { w: 400, h: 300 };
    const cutLen = (u: Unfolding) => Object.values(P.edges).filter((e) => !u.folds.has(e.key)).reduce((s, e) => s + e.len, 0);
    const pieces = unfold(P, { sheet, flap: flap10, seed: 's' }), cuts = unfold(P, { sheet, flap: flap10, seed: 's', prefer: 'cuts' });
    expect(cutLen(cuts)).toBeLessThanOrEqual(cutLen(pieces) + 1e-6);
  });
});

describe('the unfolder through the engine', () => {
  it.each(FIXTURES)('%s: boards and seams from the unfolding cut as many pieces as islands, none overlapping', (_n, make) => {
    const P = make();
    const u = unfold(P, { sheet: A4, flap: flap10, seed: 'e' });
    const d = createDesign({ ...MATERIALS[0], sheetW: 297, sheetH: 210 });
    addSeamNet(d, P, { folds: u.folds, flapOn: u.flapOn, flapDepth: u.flapDepth, flapTaper: u.flapTaper, order: islandOrder(P, u) });
    solve(d);
    expect(Object.values(d.connections).every((c) => !c.broken)).toBe(true);
    expect(buildPieces(d).length).toBe(u.islands.length);
    expect(netOverlaps(d, 1, undefined, true)).toEqual([]);
  });
});
