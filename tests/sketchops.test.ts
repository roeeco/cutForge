// Milestone 56: sketch edits, and milestone-50 sketches loaded in the new form.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { addPt, addSeg, bounds, degree, emptySketch, segsAt, type Sketch } from '../src/sketch/model';
import { sketchState, openEnds } from '../src/sketch/regions';
import { addArc, addLine, curveThrough, duplicate, eraseSeg, mirror, removePt, rotateSel, scaleSel, setAngle, setCorner, setLength, setLock, setSegKind, setSmooth, splitCrossings, splitSeg, stamp, transform, weld, STAMPS } from '../src/sketch/ops';
import { segPoints, tangentAt } from '../src/sketch/flatten';
import { cornerAngle, segLength } from '../src/sketch/dims';
import { snapPoint, snapTargets } from '../src/sketch/snap';
import { kernel, type Kernel } from '../src/sculpt/kernel';
import { buildShape } from '../src/sculpt/build';
import { checkSculpt } from '../src/sculpt/check';
import type { Design } from '../src/model/types';

const near = (a: { x: number; y: number }, b: { x: number; y: number }, tol = 1e-6) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

describe('crossings and joins', () => {
  it('a line across a circle makes two shared points and four circle arcs', () => {
    const sk = emptySketch();
    stamp(sk, 'circle', { x: 0, y: 0 }, { size: 40 });
    addLine(sk, { x: -5, y: -30 }, { x: -5, y: 30 });
    const arcs = sk.order.filter((g) => sk.segs[g].k === 'arc');
    expect(arcs).toHaveLength(4);
    const lines = sk.order.filter((g) => sk.segs[g].k === 'line');
    expect(lines).toHaveLength(3);
    // the two crossing points are shared by two arcs and two lines each, and lie on the circle
    const shared = Object.keys(sk.pts).filter((p) => degree(sk, p) === 4);
    expect(shared).toHaveLength(2);
    for (const p of shared) expect(Math.hypot(sk.pts[p].x, sk.pts[p].y)).toBeCloseTo(20, 9);
    // every arc still lies on the circle
    for (const g of arcs) for (const p of segPoints(sk, g)) expect(Math.hypot(p.x, p.y)).toBeCloseTo(20, 6);
    expect(sketchState(sk).area).toBeCloseTo(Math.PI * 400, -1);
  });

  it('weld closes a hexagon with one side erased', () => {
    const sk = emptySketch();
    const h = stamp(sk, 'hexagon', { x: 0, y: 0 }, { size: 40 });
    eraseSeg(sk, h.segs[0]);
    // erasing a side leaves its ends (other segments use them); pull one end away and weld it back
    const [a, b] = [h.pts[0], h.pts[1]];
    expect(sketchState(sk).empty).toBe(true);
    expect(openEnds(sk).sort()).toEqual([a, b].sort());
    const c = addLine(sk, a, { x: sk.pts[b].x + 3, y: sk.pts[b].y }).b;
    expect(weld(sk, b, c)).toBe(true);
    expect(sketchState(sk).empty).toBe(false);
    expect(openEnds(sk)).toHaveLength(0);
  });

  it('removePt keeps a closed outline closed', () => {
    const sk = emptySketch();
    const r = stamp(sk, 'rect', { x: 0, y: 0 }, { w: 40, h: 20 });
    const p = splitSeg(sk, r.segs[0], 0.5);
    expect(Object.keys(sk.pts)).toHaveLength(5);
    expect(removePt(sk, p)).toBe(true);
    expect(Object.keys(sk.pts)).toHaveLength(4);
    expect(openEnds(sk)).toHaveLength(0);
    expect(sketchState(sk).area).toBeCloseTo(800, 6);
    // a corner removed: a triangle remains
    expect(removePt(sk, r.pts[0])).toBe(true);
    expect(sketchState(sk).area).toBeCloseTo(400, 6);
  });

  it('construction lines are never cut and never cut others', () => {
    const sk = emptySketch();
    stamp(sk, 'rect', { x: 0, y: 0 }, { size: 20 });
    addLine(sk, { x: -20, y: 0 }, { x: 20, y: 0 }, { cons: true });
    expect(Object.keys(sk.pts)).toHaveLength(6);
    expect(sk.order).toHaveLength(5);
  });

  it('splitting a Bezier keeps its shape', () => {
    const sk = emptySketch();
    const a = addPt(sk, { x: 0, y: 0 }), b = addPt(sk, { x: 60, y: 0 });
    const g = addSeg(sk, { a, b, k: 'bez', ha: { x: 10, y: 40 }, hb: { x: -10, y: 40 } });
    const before = segPoints(sk, g, 0.001);
    const p = splitSeg(sk, g, 0.3);
    const after = segsAt(sk, p).flatMap((x) => segPoints(sk, x, 0.001));
    const dist = (q: { x: number; y: number }) => {
      let d = Infinity;
      for (let i = 0; i + 1 < before.length; i++) {
        const a = before[i], b = before[i + 1], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
        const t = L ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L)) : 0;
        d = Math.min(d, Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy));
      }
      return d;
    };
    for (const q of after) expect(dist(q)).toBeLessThan(0.005);
  });
});

describe('transforms', () => {
  it('a non-uniform scale turns a circle into Beziers whose bounds are the scaled box', () => {
    const sk = emptySketch();
    const c = stamp(sk, 'circle', { x: 10, y: 5 }, { size: 20 });
    expect(scaleSel(sk, c, { x: 10, y: 5 }, 2, 0.5)).toBe(true);
    expect(sk.order.every((g) => sk.segs[g].k === 'bez')).toBe(true);
    expect(sk.order).toHaveLength(4);
    const pts = sk.order.flatMap((g) => segPoints(sk, g, 0.001));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    expect(Math.abs(Math.min(...xs) - -10)).toBeLessThan(0.05);
    expect(Math.abs(Math.max(...xs) - 30)).toBeLessThan(0.05);
    expect(Math.abs(Math.min(...ys) - 0)).toBeLessThan(0.05);
    expect(Math.abs(Math.max(...ys) - 10)).toBeLessThan(0.05);
  });

  it('a uniform scale keeps arcs, and corner radii follow it', () => {
    const sk = emptySketch();
    const c = stamp(sk, 'circle', { x: 0, y: 0 }, { size: 20 });
    scaleSel(sk, c, { x: 0, y: 0 }, 1.5, 1.5);
    expect(sk.order.every((g) => sk.segs[g].k === 'arc')).toBe(true);
    // the flattened circle's chords take a little (0.02 mm each)
    expect(Math.abs(sketchState(sk).area - Math.PI * 225) / (Math.PI * 225)).toBeLessThan(0.003);
    const r = stamp(sk, 'rect', { x: 100, y: 0 }, { size: 20 });
    sk.pts[r.pts[0]].r = 4;
    rotateSel(sk, r, { x: 100, y: 0 }, 30);
    scaleSel(sk, r, { x: 100, y: 0 }, 2, 2);
    expect(sk.pts[r.pts[0]].r).toBeCloseTo(8, 9);
  });

  it('a mirror flips arcs and Bezier handles', () => {
    const sk = emptySketch();
    const a = addPt(sk, { x: 0, y: 0 }), b = addPt(sk, { x: 10, y: 0 });
    addSeg(sk, { a, b, k: 'arc', bulge: 0.5 });
    transform(sk, { pts: [a, b] }, [-1, 0, 0, 1, 0, 0]);
    const g = sk.segs[sk.order[0]];
    expect(g.k === 'arc' ? g.bulge : null).toBe(-0.5);
  });

  it('mirror of a half outline whose ends are on the axis gives one closed outline', () => {
    const sk = emptySketch();
    const p0 = addPt(sk, { x: 0, y: 0 }), p1 = addPt(sk, { x: 20, y: 0 }), p2 = addPt(sk, { x: 25, y: 30 }), p3 = addPt(sk, { x: 0, y: 40 });
    const segs = [addSeg(sk, { a: p0, b: p1, k: 'line' }), addSeg(sk, { a: p1, b: p2, k: 'line' }), addSeg(sk, { a: p2, b: p3, k: 'arc', bulge: 0.3 })];
    expect(openEnds(sk)).toHaveLength(2);
    mirror(sk, { segs }, { a: { x: 0, y: -10 }, b: { x: 0, y: 10 } });
    expect(openEnds(sk)).toHaveLength(0);
    expect(Object.keys(sk.pts)).toHaveLength(6);
    expect(sketchState(sk).empty).toBe(false);
    const bb = bounds(sk)!;
    expect(bb.min.x).toBeCloseTo(-25, 9);
  });

  it('duplicate copies points and segments, moved', () => {
    const sk = emptySketch();
    const r = stamp(sk, 'triangle', { x: 0, y: 0 });
    const c = duplicate(sk, r, 30, 0);
    expect(c.pts).toHaveLength(3);
    expect(c.segs).toHaveLength(3);
    expect(sketchState(sk).area).toBeCloseTo(2 * sketchState({ ...sk, order: r.segs }).area, 6);
  });
});

describe('lengths and angles', () => {
  /** An open L: a — b — c, with a tail d hanging on c. */
  function chain() {
    const sk = emptySketch();
    const a = addPt(sk, { x: 0, y: 0 }), b = addPt(sk, { x: 30, y: 0 }), c = addPt(sk, { x: 30, y: 20 }), d = addPt(sk, { x: 40, y: 20 });
    const ab = addSeg(sk, { a, b, k: 'line' }), bc = addSeg(sk, { a: b, b: c, k: 'line' });
    addSeg(sk, { a: c, b: d, k: 'line' });
    return { sk, a, b, c, d, ab, bc };
  }

  it('setLength moves the far end and what hangs on it, and is refused when that end is locked', () => {
    const { sk, a, b, c, d, ab } = chain();
    expect(setLength(sk, ab, 50, { fixed: a })).toBe(true);
    expect(sk.pts[b]).toMatchObject({ x: 50, y: 0 });
    expect(sk.pts[c]).toMatchObject({ x: 50, y: 20 });
    expect(sk.pts[d]).toMatchObject({ x: 60, y: 20 });
    expect(segLength(sk, ab)).toBeCloseTo(50, 9);
    setLock(sk, [b], true);
    expect(setLength(sk, ab, 20, { fixed: a })).toBe(false);
    expect(sk.pts[b].x).toBe(50);
    // a locked point further on is worked around: it stays, the line to it stretches
    setLock(sk, [b], false);
    setLock(sk, [c], true);
    expect(setLength(sk, ab, 40, { fixed: a })).toBe(true);
    expect(sk.pts[b].x).toBe(40);
    expect(sk.pts[c].x).toBe(50);
    // grown both ways from the middle
    setLock(sk, [c], false);
    expect(setLength(sk, ab, 60, { fixed: a, both: true })).toBe(true);
    expect(sk.pts[a].x).toBeCloseTo(-10, 9);
    expect(sk.pts[b].x).toBeCloseTo(50, 9);
  });

  it("setAngle keeps the turned line's length", () => {
    const sk = emptySketch();
    const t = stamp(sk, 'rect', { x: 20, y: 10 }, { w: 40, h: 20 });
    const corner = t.pts[0];
    expect(cornerAngle(sk, corner)).toBeCloseTo(90, 9);
    // turn the left side (it ends on the corner) so the inside angle is 60°
    const left = segsAt(sk, corner).find((g) => g !== t.segs[0])!;
    const L = segLength(sk, left);
    expect(setAngle(sk, corner, 60, left)).toBe(true);
    expect(segLength(sk, left)).toBeCloseTo(L, 9);
    expect(cornerAngle(sk, corner)).toBeCloseTo(60, 6);
  });

  it('cornerAngle: inside angles on a closed outline; null where a curve meets', () => {
    const sk = emptySketch();
    const s = stamp(sk, 'star', { x: 0, y: 0 }, { n: 5, inner: 0.4, size: 40 });
    const angs = s.pts.map((p) => cornerAngle(sk, p)!);
    expect(angs.filter((a) => a > 180)).toHaveLength(5);
    // a pentagram's inside angles sum to (n − 2) 180 for its ten corners
    expect(angs.reduce((x, y) => x + y, 0)).toBeCloseTo(8 * 180, 6);
    const c = stamp(sk, 'circle', { x: 100, y: 0 });
    expect(cornerAngle(sk, c.pts[0])).toBeNull();
  });
});

describe('corners and curves', () => {
  it('setCorner skips a point where a curve meets and reports it', () => {
    const sk = emptySketch();
    const r = stamp(sk, 'rect', { x: 0, y: 0 }, { size: 40 });
    setSegKind(sk, [r.segs[0]], 'bez');
    // r.pts[0] and r.pts[1] touch the curve
    expect(setCorner(sk, r.pts, { r: 5 })).toBe(2);
    expect(sk.pts[r.pts[2]].r).toBe(5);
    expect(sk.pts[r.pts[0]].r).toBeUndefined();
    expect(setCorner(sk, [r.pts[2]], { ch: 3 })).toBe(0);
    expect(sk.pts[r.pts[2]]).toMatchObject({ ch: 3 });
    expect(sk.pts[r.pts[2]].r).toBeUndefined();
  });

  it('a smooth point has its handles in line; curve through points is smooth everywhere when closed', () => {
    const sk = emptySketch();
    const r = stamp(sk, 'rect', { x: 0, y: 0 }, { w: 40, h: 20 });
    setSmooth(sk, [r.pts[1]], true);
    const [g1, g2] = segsAt(sk, r.pts[1]);
    const t1 = tangentAt(sk, g1, r.pts[1]), t2 = tangentAt(sk, g2, r.pts[1]);
    expect(t1.x * t2.x + t1.y * t2.y).toBeCloseTo(-1, 9);
    const sk2 = emptySketch();
    const s = stamp(sk2, 'rect', { x: 0, y: 0 }, { w: 40, h: 20 });
    expect(curveThrough(sk2, s.pts)).toBe(true);
    for (const p of s.pts) {
      const [a, b] = segsAt(sk2, p);
      const u = tangentAt(sk2, a, p), v = tangentAt(sk2, b, p);
      expect(u.x * v.x + u.y * v.y).toBeCloseTo(-1, 9);
    }
  });

  it('every stamp is a closed outline with an area', () => {
    for (const k of STAMPS) {
      const sk = emptySketch();
      stamp(sk, k, { x: 0, y: 0 });
      expect(openEnds(sk)).toEqual([]);
      expect(sketchState(sk).area).toBeGreaterThan(50);
    }
  });

  it('an arc closing an outline', () => {
    const sk = emptySketch();
    const a = addLine(sk, { x: 0, y: 0 }, { x: 20, y: 0 });
    addArc(sk, a.b, a.a, 1);
    expect(sketchState(sk).area).toBeCloseTo((Math.PI * 100) / 2, 0);
    splitCrossings(sk, sk.order[0]);
  });
});

describe('snapping', () => {
  it('the first point closes, then points, middles and the grid; Shift 15° steps', () => {
    const sk = emptySketch();
    const r = stamp(sk, 'rect', { x: 0, y: 0 }, { size: 20 });
    const targets = snapTargets(sk);
    const grid = (x: number) => Math.round(x);
    let s = snapPoint({ x: 10.3, y: 10.2 }, { mmPerPx: 0.1, targets, grid });
    expect(s.kind).toBe('end');
    expect(s.ptId).toBe(r.pts[2]);
    s = snapPoint({ x: 0.3, y: -10.2 }, { mmPerPx: 0.1, targets, grid });
    expect(s.kind).toBe('mid');
    s = snapPoint({ x: 30.4, y: 4.6 }, { mmPerPx: 0.1, targets, grid });
    expect(s).toEqual({ p: { x: 30, y: 5 }, kind: 'grid' });
    s = snapPoint({ x: 30.4, y: 4.6 }, { mmPerPx: 0.1, targets, grid, noSmart: true, free: true });
    expect(s.kind).toBe('free');
    s = snapPoint({ x: 50, y: 24 }, { mmPerPx: 0.1, targets, grid, shift: true, last: { x: 30, y: 0 } });
    expect(s.kind).toBe('angle');
    const ang = (Math.atan2(s.p.y, s.p.x - 30) * 180) / Math.PI;
    expect(Math.abs(ang / 15 - Math.round(ang / 15))).toBeLessThan(1e-9);
    s = snapPoint({ x: -10.5, y: -10.5 }, { mmPerPx: 0.1, targets, grid, first: { id: r.pts[0], p: sk.pts[r.pts[0]] }, canClose: true });
    expect(s.kind).toBe('close');
  });
});

let k: Kernel;
beforeAll(async () => {
  k = await kernel();
});

describe('loading milestone-50 sketches', () => {
  it('corner, curve and round points and an edge axis build the same bodies (within 0.1 %)', () => {
    const fx = JSON.parse(readFileSync('tests/fixtures/m50-sketch.json', 'utf8')) as { design: Design; volumes: Record<string, number> };
    const d = fx.design;
    checkSculpt(d);
    for (const [id, v] of Object.entries(fx.volumes)) {
      const s = d.sculpt!.shapes[id];
      expect(s.sketch!.v).toBe(2);
      expect(Object.keys(s.sketch!.segs).length).toBeGreaterThan(3);
      const v2 = buildShape(k, d.sculpt!, id).volume();
      expect(Math.abs(v2 - v) / v).toBeLessThan(0.001);
    }
    // the edge axis became the segment it named
    const rv = Object.values(d.sculpt!.shapes).find((s) => s.axis && s.axis.kind !== 'plane')!;
    expect(rv.axis).toEqual({ kind: 'seg', id: 'g4' });
  });

  it('a bad segment is dropped; a sketch with none fails its shape', () => {
    const d = JSON.parse(readFileSync('tests/fixtures/m50-sketch.json', 'utf8')).design as Design;
    checkSculpt(d);
    const ids = Object.keys(d.sculpt!.shapes);
    const s0 = d.sculpt!.shapes[ids[0]].sketch as Sketch & { segs: Record<string, any> };
    s0.segs.bad = { a: 'nope', b: 'p0', k: 'line' };
    s0.segs.g1.bulge = 1;
    (s0.segs.g1 as any).k = 'arc';
    (s0.segs.g1 as any).bulge = 999;
    const s1 = d.sculpt!.shapes[ids[1]].sketch as any;
    s1.segs = {};
    checkSculpt(d);
    expect(d.sculpt!.shapes[ids[0]].sketch!.segs.bad).toBeUndefined();
    expect(d.sculpt!.shapes[ids[0]].sketch!.segs.g1).toBeUndefined();
    expect(d.sculpt!.shapes[ids[0]].sketch!.order).not.toContain('g1');
    expect(d.sculpt!.shapes[ids[1]]).toBeUndefined();
  });
});
