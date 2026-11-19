// Milestone 56: the sketch model's graph and flattening.
import { describe, expect, it } from 'vitest';
import { addPt, addSeg, chains, emptySketch, type Sketch } from '../src/sketch/model';
import { arcOf, arcPts, bezAt, bezPts, bulgeThrough, segPoints } from '../src/sketch/flatten';
import { parsePolar, polarPoint, segLength } from '../src/sketch/dims';
import type { P2 } from '../src/model/types';

const distToSeg = (p: P2, a: P2, b: P2) => {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};

describe('flatten', () => {
  it('arc points lie on the circle and chords stay within 0.02 mm', () => {
    for (const bulge of [0.2, 1, -0.7, 3]) {
      const a = { x: 3, y: -2 }, b = { x: 40, y: 15 };
      const f = arcOf(a, b, bulge);
      const pts = arcPts(a, b, bulge);
      for (const p of pts) expect(Math.abs(Math.hypot(p.x - f.c.x, p.y - f.c.y) - f.r)).toBeLessThan(1e-9);
      for (let i = 0; i + 1 < pts.length; i++) {
        const m = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
        expect(f.r - Math.hypot(m.x - f.c.x, m.y - f.c.y)).toBeLessThanOrEqual(0.02 + 1e-9);
      }
      // the sweep is 4 atan(bulge): positive counter-clockwise
      expect(f.sweep).toBeCloseTo(4 * Math.atan(bulge), 12);
    }
  });

  it('bulgeThrough round-trips', () => {
    for (const bulge of [0.3, 1, -0.5, 2.5, -4]) {
      const a = { x: 0, y: 0 }, b = { x: 30, y: 10 };
      const f = arcOf(a, b, bulge);
      const mid = { x: f.c.x + f.r * Math.cos(f.a0 + f.sweep / 2), y: f.c.y + f.r * Math.sin(f.a0 + f.sweep / 2) };
      expect(bulgeThrough(a, b, mid)).toBeCloseTo(bulge, 9);
    }
    expect(bulgeThrough({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 })).toBe(0);
  });

  it("a Bezier's flattening stays within 0.02 mm of the curve at 200 samples", () => {
    const P: [P2, P2, P2, P2] = [{ x: 0, y: 0 }, { x: 10, y: 60 }, { x: 70, y: -40 }, { x: 80, y: 20 }];
    const { pts } = bezPts(P);
    for (let i = 0; i <= 200; i++) {
      const q = bezAt(P, i / 200);
      let d = Infinity;
      for (let j = 0; j + 1 < pts.length; j++) d = Math.min(d, distToSeg(q, pts[j], pts[j + 1]));
      expect(d).toBeLessThanOrEqual(0.02);
    }
  });

  it('segments flatten from their a end; lengths follow the curve', () => {
    const sk: Sketch = emptySketch();
    const a = addPt(sk, { x: 0, y: 0 }), b = addPt(sk, { x: 20, y: 0 });
    const g = addSeg(sk, { a, b, k: 'arc', bulge: 1 });
    const pts = segPoints(sk, g);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 20, y: 0 });
    // a counter-clockwise half circle from (0, 0) to (20, 0) passes below
    expect(Math.abs(Math.min(...pts.map((p) => p.y)) + 10)).toBeLessThanOrEqual(0.02);
    expect(segLength(sk, g)).toBeCloseTo(Math.PI * 10, 2);
  });
});

describe('graph', () => {
  it('chains: a closed loop and an open run through a branch point', () => {
    const sk = emptySketch();
    const p = [0, 1, 2, 3].map((i) => addPt(sk, { x: i * 10, y: (i % 2) * 10 }));
    for (let i = 0; i < 4; i++) addSeg(sk, { a: p[i], b: p[(i + 1) % 4], k: 'line' });
    const q = addPt(sk, { x: 50, y: 50 });
    addSeg(sk, { a: p[2], b: q, k: 'line' });
    const cs = chains(sk);
    // p2 has three segments: the square is one run from p2 round to p2 (closed), and the tail another
    expect(cs.map((c) => c.segs.length).sort()).toEqual([1, 4]);
    expect(cs.find((c) => c.segs.length === 4)!.closed).toBe(true);
    const sq = emptySketch();
    const s = [0, 1, 2].map((i) => addPt(sq, { x: i, y: i * i }));
    for (let i = 0; i < 3; i++) addSeg(sq, { a: s[i], b: s[(i + 1) % 3], k: 'line' });
    expect(chains(sq)).toHaveLength(1);
    expect(chains(sq)[0].closed).toBe(true);
  });
});

describe('dims', () => {
  it('typed length and angle', () => {
    expect(parsePolar('50<30')).toEqual({ len: 50, angle: 30 });
    expect(parsePolar('40+10')).toEqual({ len: 50, angle: null });
    expect(parsePolar('x<3')).toBeNull();
    const p = polarPoint({ x: 0, y: 0 }, 50, 30);
    expect(p.x).toBeCloseTo(43.3, 2);
    expect(p.y).toBeCloseTo(25, 9);
  });
});
