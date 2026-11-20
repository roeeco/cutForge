// Milestone 112 (D3b): shaped flaps on a free edge (plain, tuck, dust, glue, hang), folding in the model.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { addEdgeFlap, addFoldOver, addRootPanel, canFoldOver, createDesign, setEdgeFlap } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { findEdge, segLength } from '../src/model/edges';
import { FLAP_MIN_FAR, edgeFeatures, flapGeom, flapOn, flapOutline, flapSpec } from '../src/model/edgeFeatures';
import { matDir, toWorld } from '../src/model/frame';
import { flapMatrix } from '../src/views/foldView';
import { buildPieces } from '../src/model/pieces';
import { validate } from '../src/model/validate';
import { fixIssue } from '../src/easy/fix';
import { checkDesign } from '../src/model/check';
import { contourArea, polygonContour } from '../src/geom/vec';
import type { Design, FlapShape, P2 } from '../src/model/types';
import { v6CorrFoldover } from './goldenDesigns';

const CARD = MATERIALS[0];
const t = CARD.thickness;

/** A 60 × 40 card board; its top edge (e2) is 60 mm long. */
function board(): { d: Design; id: string } {
  const d = createDesign(CARD);
  const id = addRootPanel(d, 0, 0, 60, 40);
  return { d, id };
}
const area = (poly: P2[]) => Math.abs(contourArea(polygonContour(poly)));
/** Distance of a point from the edge's line (positive outward). */
function outward(e: ReturnType<typeof findEdge>, q: P2): number {
  const dx = e!.b.x - e!.a.x, dy = e!.b.y - e!.a.y, L = Math.hypot(dx, dy);
  // the board lies on the inward side: the outward normal points away from the board's centre (30, 20)
  const nx = dy / L, ny = -dx / L;
  const s = (30 - e!.a.x) * nx + (20 - e!.a.y) * ny > 0 ? -1 : 1;
  return s * ((q.x - e!.a.x) * nx + (q.y - e!.a.y) * ny);
}

describe('shaped flaps', () => {
  it('each shape: an outline outside its edge, its far edge and its crease', () => {
    for (const shape of ['tuck', 'dust', 'glue', 'hang'] as FlapShape[]) {
      const { d, id } = board();
      expect(addEdgeFlap(d, id, 'e2', { shape })).toBeTruthy();
      const p = d.panels[id];
      const f = p.edgeFlaps![0];
      const e = findEdge(p, 'e2')!;
      const g = flapOutline(e, f, t)!;
      expect(area(g.poly)).toBeGreaterThan(50);
      // every point outside the edge (up to the 0.01 overlap), the farthest at the flap's length
      const outs = g.poly.map((q) => outward(e, q));
      expect(Math.min(...outs)).toBeGreaterThan(-0.02);
      expect(Math.max(...outs)).toBeCloseTo(f.len, 6);
      if (shape === 'hang') expect(g.score).toBeNull();
      else {
        // folding shapes crease half a thickness inside the edge, between the insets
        expect(outward(e, g.score!.a)).toBeCloseTo(-t / 2, 9);
        const s = flapSpec(f, t);
        expect(Math.hypot(g.score!.b.x - g.score!.a.x, g.score!.b.y - g.score!.a.y)).toBeCloseTo(segLength(e) - s.inset[0] - s.inset[1], 9);
      }
    }
  });

  it('a tuck is inset t + 0.5 at both ends, rounded, and as long as 30 % of the board (12 to 22 mm)', () => {
    const { d, id } = board();
    addEdgeFlap(d, id, 'e2', { shape: 'tuck' });
    const f = d.panels[id].edgeFlaps![0];
    expect(f.len).toBeCloseTo(12, 9); // 0.3 × 40 = 12
    const s = flapSpec(f, t);
    expect(s.inset).toEqual([t + 0.5, t + 0.5]);
    expect(s.r).toBe(4);
    const g = flapOutline(findEdge(d.panels[id], 'e2')!, f, t)!;
    expect(g.poly.length).toBeGreaterThan(6); // the far corners are arcs
  });

  it('a hang tab lies flat with one hole in its own board and no crease', () => {
    const { d, id } = board();
    addEdgeFlap(d, id, 'e2', { shape: 'hang' });
    const [h] = edgeFeatures(d);
    expect(h.out.scores).toEqual([]);
    expect(h.out.hinged).toEqual([]);
    expect(h.out.holes).toHaveLength(1);
    expect(h.out.holes[0].panelId).toBe(id);
    // the euro slot is wider than the round hole
    const round = area(h.out.holes[0].poly);
    setEdgeFlap(d, id, 'e2', { hole: 'euro' });
    expect(area(edgeFeatures(d)[0].out.holes[0].poly)).toBeGreaterThan(round * 3);
    // and both are cut as holes in the piece
    const piece = buildPieces(d)[0];
    expect(piece.contours.filter((c) => c.role === 'hole')).toHaveLength(1);
  });

  it('a flap with no shape is milestone 67 plain flap, byte for byte (crease on the edge)', () => {
    const { d, id } = board();
    addEdgeFlap(d, id, 'e2', 15);
    const p = d.panels[id];
    expect(p.edgeFlaps![0]).toEqual({ id: p.edgeFlaps![0].id, edge: 'e2', len: 15 });
    const g = flapGeom(d, p, p.edgeFlaps![0])!;
    const ref = flapOn(findEdge(p, 'e2')!, 15);
    expect(g.adds).toEqual([ref.poly]);
    expect(g.scores).toEqual([ref.score]);
    expect(g.hinged).toEqual([]);
  });

  it('steep tapers are clamped so the far edge keeps 4 mm, and the check says so', () => {
    const { d, id } = board();
    addEdgeFlap(d, id, 'e2', { shape: 'dust', len: 40 });
    setEdgeFlap(d, id, 'e2', { taper: [60, 60] });
    const p = d.panels[id];
    const e = findEdge(p, 'e2')!;
    const g = flapOutline(e, p.edgeFlaps![0], t)!;
    const far = g.poly.filter((q) => Math.abs(outward(e, q) - 40) < 1e-6);
    expect(Math.abs(far[0].x - far[far.length - 1].x)).toBeCloseTo(FLAP_MIN_FAR, 6);
    const iss = validate(d).find((i) => i.key === 'val.flapNarrow')!;
    expect(iss).toBeTruthy();
    expect(fixIssue(d, iss)).toBe(true);
    expect(d.panels[id].edgeFlaps![0].shape).toBeUndefined();
    expect(validate(d).some((i) => i.key === 'val.flapNarrow')).toBe(false);
  });

  it('folded in the model: flat at foldT 0 on the net, turned 90° towards the material at 1 (out: away)', () => {
    for (const dir of ['in', 'out'] as const) {
      const { d, id } = board();
      addEdgeFlap(d, id, 'e2', { shape: 'glue', len: 15 });
      if (dir === 'out') setEdgeFlap(d, id, 'e2', { dir: 'out' });
      const p = d.panels[id];
      const [h] = edgeFeatures(d);
      expect(h.out.hinged).toHaveLength(1);
      const f = h.out.hinged[0];
      const ident = new Map<string, THREE.Matrix4>();
      const corners = (m: THREE.Matrix4) => f.poly.flatMap((q) => [f.z0, f.z1].map((z) => new THREE.Vector3(q.x, q.y, p.frame.side === 1 ? z : -z).applyMatrix4(m)));
      // flat: the net's outline through the board's thickness
      const flat = corners(flapMatrix(d, f, ident, 0));
      const net = h.out.adds[0].flatMap((q) => [0, t].map((z) => new THREE.Vector3(...toWorld(p.frame, q.x, q.y, z))));
      flat.forEach((v, i) => expect(v.distanceTo(net[i])).toBeLessThan(1e-6));
      // folded: the far edge stands its length off the board, on the material side (in) or the other (out)
      const folded = corners(flapMatrix(d, f, ident, 1));
      const N = new THREE.Vector3(...matDir(p.frame));
      const O = new THREE.Vector3(...p.frame.o);
      const reach = Math.max(...folded.map((v) => v.clone().sub(O).dot(N) * (dir === 'in' ? 1 : -1)));
      expect(reach).toBeGreaterThan(14);
      // and the area folds with it
      expect(area(f.poly)).toBeCloseTo(area(h.out.adds[0]), 9);
    }
  });

  it('a flap folding out is cut as a perforation; one folding in is scored', () => {
    const count = (dir: 'in' | 'out') => {
      const { d, id } = board();
      addEdgeFlap(d, id, 'e2', { shape: 'glue' });
      if (dir === 'out') setEdgeFlap(d, id, 'e2', { dir: 'out' });
      const cs = buildPieces(d)[0].contours;
      return { scores: cs.filter((c) => c.op === 'score').length, cuts: cs.filter((c) => c.op === 'cut' && c.role === 'line').length };
    };
    const a = count('in'), b = count('out');
    expect([a.scores, b.scores].sort()).toEqual([0, 1]);
    expect(b.scores === 0 ? b.cuts : a.cuts).toBeGreaterThan(2);
  });

  it('one feature per edge: a fold-over refuses a flap, a flap refuses a fold-over', () => {
    const d = v6CorrFoldover();
    const front = d.order.find((id) => d.panels[id].foldOvers?.length)!;
    const edge = d.panels[front].foldOvers![0].edge;
    expect(addEdgeFlap(d, front, edge, { shape: 'tuck' })).toBeNull();
    const other = d.order.find((id) => id !== front && canFoldOver(d, id, 'e2'))!;
    expect(addEdgeFlap(d, other, 'e2')).toBeTruthy();
    expect(canFoldOver(d, other, 'e2')).toBe(false);
    expect(addFoldOver(d, other, 'e2')).toBeNull();
  });

  it('plywood refuses a flap', () => {
    const d = createDesign(MATERIALS[3]);
    const id = addRootPanel(d, 0, 0, 60, 40);
    expect(addEdgeFlap(d, id, 'e2', { shape: 'hang' })).toBeNull();
  });

  it('a changed shape starts from its defaults; a file with a bad field keeps the flap', () => {
    const { d, id } = board();
    addEdgeFlap(d, id, 'e2', { shape: 'dust' });
    setEdgeFlap(d, id, 'e2', { taper: [5, 5], r: 2 });
    setEdgeFlap(d, id, 'e2', { shape: 'glue' });
    const f = d.panels[id].edgeFlaps![0];
    expect(f.shape).toBe('glue');
    expect(f.taper).toBeUndefined();
    expect(f.r).toBeUndefined();
    const raw = JSON.parse(JSON.stringify(d));
    const rf = raw.panels[id].edgeFlaps[0] as Record<string, unknown>;
    rf.taper = [5, 'x'];
    rf.angle = 400;
    rf.shape = 'bogus';
    checkDesign(raw);
    const kept = (raw as any).panels[id].edgeFlaps[0];
    expect(kept.id).toBe(f.id);
    expect(kept.taper).toBeUndefined();
    expect(kept.angle).toBeUndefined();
    expect(kept.shape).toBeUndefined();
  });
});
