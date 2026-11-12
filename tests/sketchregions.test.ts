// Milestone 56: the area a sketch fills.
import { describe, expect, it } from 'vitest';
import { addPt, addSeg, emptySketch, type Sketch } from '../src/sketch/model';
import { openEnds, sketchRegion, sketchState, ringArea } from '../src/sketch/regions';
import { addLine, setCons, stamp } from '../src/sketch/ops';
import type { P2 } from '../src/model/types';

const area = (sk: Sketch) => sketchState(sk).area;
const rect = (sk: Sketch, x0: number, y0: number, x1: number, y1: number) => stamp(sk, 'rect', { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, { w: x1 - x0, h: y1 - y0 });
/** Rectangles drawn as plain points and lines, without crossing points (as a file might hold them). */
function rawRect(sk: Sketch, x0: number, y0: number, x1: number, y1: number) {
  const ps: P2[] = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const ids = ps.map((p) => addPt(sk, p));
  ids.forEach((id, i) => addSeg(sk, { a: id, b: ids[(i + 1) % 4], k: 'line' }));
}

describe('regions', () => {
  it('a square', () => {
    const sk = emptySketch();
    rect(sk, 0, 0, 40, 30);
    expect(area(sk)).toBeCloseTo(1200, 6);
    const r = sketchRegion(sk);
    expect(r).toHaveLength(1);
    expect(ringArea(r[0][0])).toBeGreaterThan(0);
  });

  it('a square with a circle inside: the circle is a hole', () => {
    const sk = emptySketch();
    rect(sk, -30, -30, 30, 30);
    stamp(sk, 'circle', { x: 0, y: 0 }, { size: 20 });
    const a = area(sk);
    expect(Math.abs(a - (3600 - Math.PI * 100)) / a).toBeLessThan(0.001);
    const r = sketchRegion(sk);
    expect(r).toHaveLength(1);
    expect(r[0]).toHaveLength(2);
    // holes run clockwise
    expect(ringArea(r[0][1])).toBeLessThan(0);
  });

  it('two overlapping squares: the area of their union', () => {
    const sk = emptySketch();
    rawRect(sk, 0, 0, 20, 20);
    rawRect(sk, 10, 10, 30, 30);
    expect(area(sk)).toBeCloseTo(700, 6);
  });

  it('a square inside a hole inside a square is solid again', () => {
    const sk = emptySketch();
    rawRect(sk, 0, 0, 100, 100);
    rawRect(sk, 20, 20, 80, 80);
    rawRect(sk, 40, 40, 60, 60);
    expect(area(sk)).toBeCloseTo(10000 - 3600 + 400, 6);
  });

  it('a rectangle with a line across it fills the rectangle', () => {
    const sk = emptySketch();
    rect(sk, 0, 0, 50, 20);
    addLine(sk, { x: 25, y: -10 }, { x: 25, y: 30 });
    expect(area(sk)).toBeCloseTo(1000, 6);
  });

  it('an open chain has no area and two open ends', () => {
    const sk = emptySketch();
    const a = addLine(sk, { x: 0, y: 0 }, { x: 10, y: 0 });
    addLine(sk, a.b, { x: 10, y: 10 });
    const st = sketchState(sk);
    expect(st.empty).toBe(true);
    expect(st.area).toBe(0);
    expect(openEnds(sk)).toHaveLength(2);
  });

  it('a construction line through a square is ignored', () => {
    const sk = emptySketch();
    rect(sk, 0, 0, 10, 10);
    const l = addLine(sk, { x: -5, y: 5 }, { x: 15, y: 5 }, { cons: true });
    expect(area(sk)).toBeCloseTo(100, 6);
    expect(openEnds(sk)).toHaveLength(0);
    // made a real line, it is cut where it crosses and its tails dangle
    setCons(sk, [l.seg], false);
    expect(area(sk)).toBeCloseTo(100, 6);
    expect(openEnds(sk)).toHaveLength(2);
  });

  it('a rounded corner takes its arc out of the area', () => {
    const sk = emptySketch();
    const s = rect(sk, 0, 0, 40, 40);
    sk.pts[s.pts[0]].r = 10;
    expect(area(sk)).toBeCloseTo(1600 - (4 - Math.PI) * 25, 0);
    sk.pts[s.pts[0]].r = undefined as never;
    delete sk.pts[s.pts[0]].r;
    sk.pts[s.pts[1]].ch = 10;
    expect(area(sk)).toBeCloseTo(1600 - 50, 6);
  });
});
