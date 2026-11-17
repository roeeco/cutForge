// Nesting by true shape (milestone 69, PACKAGING_PLAN.md §9.2).
import { describe, expect, it } from 'vitest';
import * as G from './goldenDesigns';
import { MATERIALS } from '../src/model/materials';
import { pack, pieceCopies, placementXform, sheetCount, type PieceCopy } from '../src/model/pack';
import { nest } from '../src/model/nest';
import { addRootPanel, addTray, createDesign, solve } from '../src/model/ops';
import { applyX, flattenContour, segDistPoint } from '../src/geom/vec';
import { validate } from '../src/model/validate';
import type { Design, P2, SheetPlacement } from '../src/model/types';

const CARD = MATERIALS[0];
const CORR = MATERIALS.find((m) => m.kind === 'corrugated')!;

function tray(m: (typeof MATERIALS)[number], w: number, h: number, ht: number, q: number): Design {
  const d = createDesign(m);
  const b = addRootPanel(d, 0, 0, w, h);
  addTray(d, b, ht);
  d.pieces[b].quantity = q;
  solve(d);
  return d;
}

function withCopies(d: Design, q: number): Design {
  const x = structuredClone(d);
  for (const k of Object.keys(x.pieces)) x.pieces[k].quantity = q;
  solve(x);
  return x;
}

/** Twenty designs: the golden ones as a class would cut them (four of each), and card and corrugated trays. */
function designs(): [string, Design][] {
  return [
    ['ply box', withCopies(G.plyBox(), 4)],
    ['card tray', withCopies(G.cardTray(), 4)],
    ['ply lean-to', withCopies(G.plyLean(), 4)],
    ['corrugated dividers', withCopies(G.corrDividers(), 4)],
    ['ply hexagon', withCopies(G.v6PlyHexThrough(), 4)],
    ['corrugated fold-over', withCopies(G.v6CorrFoldover(), 4)],
    ['card gable', withCopies(G.v6CardGable(), 4)],
    ['band lid box', withCopies(G.bandLidBox(CARD), 2)],
    ['rounded tray', withCopies(G.roundedTray(CARD, 15), 4)],
    ['round box', withCopies(G.roundBoxDesign(CARD, 'circle', 80, 80), 4)],
    ['closed box', withCopies(G.closedBox(CARD), 2)],
    ['carton', withCopies(G.cartonDesign(CARD, 'tuck', 'snap'), 2)],
    ['lock tray', withCopies(G.lockTray(), 4)],
    ['square card tray x4', tray(CARD, 60, 60, 50, 4)],
    ['square card tray x8', tray(CARD, 60, 60, 50, 8)],
    ['square card tray x12', tray(CARD, 60, 60, 50, 12)],
    ['card tray x8', tray(CARD, 80, 60, 40, 8)],
    ['long card tray x8', tray(CARD, 100, 50, 30, 8)],
    ['corrugated tray x8', tray(CORR, 80, 60, 40, 8)],
    ['deep corrugated tray x12', tray(CORR, 50, 40, 45, 12)],
  ];
}

function placedPolys(d: Design, copies: PieceCopy[], pl: Record<string, SheetPlacement>) {
  return copies.map((c) => {
    const p = pl[c.key];
    const xf = placementXform(p, c.h, c.w);
    const polys = c.contours.filter((t) => t.role === 'outer').map((t) => flattenContour(t.contour, 0.1).map((q) => applyX(xf, q)));
    return { c, p, polys };
  });
}

function segSeg(a: P2, b: P2, c: P2, e: P2): number {
  const cross = (o: P2, p: P2, q: P2) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, e, a), d2 = cross(c, e, b), d3 = cross(a, b, c), d4 = cross(a, b, e);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(segDistPoint(a, c, e), segDistPoint(b, c, e), segDistPoint(c, a, b), segDistPoint(e, a, b));
}

function inside(q: P2, poly: P2[]): boolean {
  let n = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) n = !n;
  }
  return n;
}

function gapBetween(A: P2[][], B: P2[][]): number {
  let g = Infinity;
  for (const a of A)
    for (const b of B) {
      if (inside(a[0], b) || inside(b[0], a)) return 0;
      for (let i = 0; i < a.length; i++)
        for (let j = 0; j < b.length; j++) g = Math.min(g, segSeg(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length]));
    }
  return g;
}

describe('nesting', () => {
  const set = designs();

  it('on twenty designs: never more sheets than the bounding-box packer, fewer on a quarter of them', { timeout: 60_000 }, () => {
    let fewer = 0;
    const rows: string[] = [];
    for (const [name, d] of set) {
      const copies = pieceCopies(d);
      const a = sheetCount(pack({ ...d, placements: {} }, copies)), b = sheetCount(nest(d, copies));
      expect(b, name).toBeLessThanOrEqual(a);
      if (b < a) fewer++;
      rows.push(`${name}: ${a} → ${b}`);
    }
    expect(fewer, rows.join('\n')).toBeGreaterThanOrEqual(5);
  });

  it('pieces keep the spacing between them, stay inside the margin, and turn only as the grain allows', { timeout: 60_000 }, () => {
    for (const [name, d] of set) {
      const copies = pieceCopies(d);
      const pl = nest(d, copies);
      const placed = placedPolys(d, copies, pl);
      const turn = d.material.grain === 'none' || !!d.allowRotate;
      const W = d.material.sheetW - 2 * d.sheetMargin, H = d.material.sheetH - 2 * d.sheetMargin;
      // a piece too big for any sheet (reported by the check) sits at the margin
      const fits = (c: PieceCopy) => (c.w <= W && c.h <= H) || (turn && c.h <= W && c.w <= H);
      for (const x of placed.filter((y) => fits(y.c))) {
        if (!turn) expect([0, 180], name).toContain(x.p.rot);
        for (const poly of x.polys)
          for (const q of poly) {
            expect(q.x, name).toBeGreaterThanOrEqual(d.sheetMargin - 1e-6);
            expect(q.y, name).toBeGreaterThanOrEqual(d.sheetMargin - 1e-6);
            expect(q.x, name).toBeLessThanOrEqual(d.material.sheetW - d.sheetMargin + 1e-6);
            expect(q.y, name).toBeLessThanOrEqual(d.material.sheetH - d.sheetMargin + 1e-6);
          }
      }
      for (let i = 0; i < placed.length; i++)
        for (let j = i + 1; j < placed.length; j++) {
          if (placed[i].p.sheet !== placed[j].p.sheet || (placed[i].p.mat ?? '') !== (placed[j].p.mat ?? '')) continue;
          expect(gapBetween(placed[i].polys, placed[j].polys), `${name}: ${placed[i].c.key} / ${placed[j].c.key}`).toBeGreaterThanOrEqual(d.sheetSpacing - 0.01);
        }
    }
  });

  it('a nested layout is kept, checks clean, and a piece that changes size goes back to the packer', () => {
    const d = tray(CARD, 60, 60, 50, 4);
    d.placements = nest(d);
    solve(d);
    expect(sheetCount(pack(d))).toBe(1);
    expect(validate(d).filter((i) => i.key === 'val.piecesOverlap' || i.key === 'val.offSheet')).toEqual([]);
    const tid = Object.keys(d.trays)[0];
    d.trays[tid].height = 30;
    solve(d);
    const copies = pieceCopies(d);
    const pl = pack(d, copies);
    for (const c of copies) expect(pl[c.key].nested).toBeUndefined();
    expect(validate(d).filter((i) => i.key === 'val.piecesOverlap' || i.key === 'val.offSheet')).toEqual([]);
  });
});
