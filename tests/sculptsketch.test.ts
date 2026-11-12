// Milestone 50: sketches, extrude, revolve and the radius tool.
import { beforeAll, describe, expect, it } from 'vitest';
import { kernel, type Kernel } from '../src/sculpt/kernel';
import { buildShape, footprintSection as sketchSection } from '../src/sculpt/build';
import { cornerCut } from '../src/sketch/flatten';
import { addShape, createWaffleDesign } from '../src/sculpt/ops';
import { fillets } from '../src/sculpt/round';
import { deleteSketchPoint, insertSketchPoint, moveSketchPoint, revolveBlocked, revolveSuits, roundCorner, setSketchMode, sketchShape, type SketchPlane } from '../src/sculpt/sketch';
import { nextPolyPoint } from '../src/views/polyDraw';
import type { SculptPt } from '../src/model/types';

let k: Kernel;
beforeAll(async () => {
  k = await kernel();
});

const floor: SketchPlane = { kind: 'floor' };
const upright: SketchPlane = { kind: 'upright', o: [0, 0, 0], ang: 0 };
/** An L, 60 × 50, 20 thick, with its outer corner cut at 30°. */
const L: SculptPt[] = [
  { x: 0, y: 0 },
  { x: 60, y: 0 },
  { x: 60, y: 20 },
  { x: 20, y: 20 },
  { x: 20, y: 50 },
  { x: 0, y: 50 },
];
/** A vase's half profile beside the axis. */
const vase: SculptPt[] = [
  { x: 0, y: 0 },
  { x: 30, y: 0 },
  { x: 40, y: 40, curve: 'auto' },
  { x: 20, y: 90 },
  { x: 25, y: 110 },
  { x: 0, y: 110 },
];

describe('sketch → CrossSection', () => {
  it('Round points stay within 0.02 mm of the true arc', () => {
    const pts: SculptPt[] = [
      { x: 0, y: 0, r: 10 },
      { x: 80, y: 0, r: 6 },
      { x: 80, y: 40 },
      { x: 0, y: 40, r: 15 },
    ];
    const f = fillets(pts);
    const cs = sketchSection(k, pts);
    const poly = cs.toPolygons()[0];
    for (const fl of f.filter(Boolean)) {
      // every section vertex near the corner lies on the arc; every chord's middle within 0.02 mm of it
      const near = poly.filter(([x, y]) => Math.abs(Math.hypot(x - fl!.c.x, y - fl!.c.y) - fl!.r) < 1e-6);
      expect(near.length).toBeGreaterThan(4);
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const on = (p: number[]) => Math.abs(Math.hypot(p[0] - fl!.c.x, p[1] - fl!.c.y) - fl!.r) < 1e-6;
        if (!on(a) || !on(b)) continue;
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        expect(fl!.r - Math.hypot(m[0] - fl!.c.x, m[1] - fl!.c.y)).toBeLessThanOrEqual(0.02 + 1e-9);
      }
    }
    // the area is the rectangle's less the corners' (4 − π) r² / 4 each
    const exp = 80 * 40 - ((4 - Math.PI) / 4) * (100 + 36 + 225);
    // (the flattened arcs' chords take a little more: under 1 mm² here)
    expect(Math.abs(cs.area() - exp)).toBeLessThan(1);
  });
});

describe('extrude and revolve', () => {
  it('an L with a 30° chamfer extrudes on the floor', () => {
    const d = createWaffleDesign();
    // the chamfer: the corner (60, 20) cut back along a 30° line
    const pts = [...L];
    pts.splice(2, 1, { x: 60, y: 20 - 10 * Math.tan(Math.PI / 6) }, { x: 50, y: 20 });
    const id = addShape(d, sketchShape(floor, pts, 'extrude', 30));
    const m = buildShape(k, d.sculpt!, id);
    const area = 60 * 20 + 20 * 30 - (10 * 10 * Math.tan(Math.PI / 6)) / 2;
    expect(m.volume()).toBeCloseTo(area * 30, 3);
    const bb = m.boundingBox();
    // floor sketch: y up, the sketch's y towards −z
    expect(bb.min[1]).toBeCloseTo(0, 6);
    expect(bb.max[1]).toBeCloseTo(30, 6);
    expect(bb.min[2]).toBeCloseTo(-50, 6);
  });
  it('a vase revolves about an upright plane’s axis', () => {
    const d = createWaffleDesign();
    expect(revolveSuits(vase)).toBe(true);
    const id = addShape(d, sketchShape(upright, vase, 'revolve'));
    const m = buildShape(k, d.sculpt!, id);
    const bb = m.boundingBox();
    expect(bb.min[1]).toBeCloseTo(0, 3);
    expect(bb.max[1]).toBeCloseTo(110, 3);
    expect((bb.min[0] + bb.max[0]) / 2).toBeCloseTo(0, 1);
    expect((bb.min[2] + bb.max[2]) / 2).toBeCloseTo(0, 1);
    expect(m.volume()).toBeGreaterThan(Math.PI * 20 * 20 * 110 * 0.9);
  });
  it('a revolve about an edge of its outline', () => {
    const d = createWaffleDesign();
    const sq: SculptPt[] = [
      { x: 50, y: 0 },
      { x: 70, y: 0 },
      { x: 70, y: 30 },
      { x: 50, y: 30 },
    ];
    const id = addShape(d, { ...sketchShape(upright, sq, 'revolve'), axis: { kind: 'seg', id: 'g3' } });
    // a cylinder of radius 20, 30 tall, about the edge x = 50
    const v = buildShape(k, d.sculpt!, id).volume();
    expect(Math.abs(v - Math.PI * 400 * 30) / v).toBeLessThan(0.005);
  });
  it('an outline that crosses its axis is refused', () => {
    const across: SculptPt[] = [
      { x: -10, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 40 },
      { x: -10, y: 40 },
    ];
    expect(revolveSuits(across)).toBe(false);
    const d = createWaffleDesign();
    const id = addShape(d, sketchShape(upright, across, 'revolve'));
    expect(revolveBlocked(d.sculpt!.shapes[id])).toBe(true);
    expect(buildShape(k, d.sculpt!, id).isEmpty()).toBe(true);
    setSketchMode(d, id, 'extrude');
    expect(buildShape(k, d.sculpt!, id).isEmpty()).toBe(false);
  });
});

describe('edit sketch and radius', () => {
  it('points move, are added and removed; an edit that leaves no area is refused', () => {
    const d = createWaffleDesign();
    const id = addShape(d, sketchShape(floor, L, 'extrude'));
    const sk = () => d.sculpt!.shapes[id].sketch!;
    expect(moveSketchPoint(d, id, 'p1', { x: 70, y: 0 })).toBe(true);
    expect(sk().pts.p1.x).toBe(70);
    expect(insertSketchPoint(d, id, 'g0', 0.5)).toBe(true);
    expect(Object.keys(sk().pts).length).toBe(7);
    // an outline that crosses itself still fills an area (milestone 56): allowed
    expect(moveSketchPoint(d, id, 'p4', { x: 30, y: -20 })).toBe(true);
    expect(buildShape(k, d.sculpt!, id).volume()).toBeGreaterThan(0);
    expect(deleteSketchPoint(d, id, 'p1')).toBe(true);
    expect(Object.keys(sk().pts).length).toBe(6);
    // down to a triangle, then one more point would leave nothing
    for (const p of ['p2', 'p3', 'p4']) expect(deleteSketchPoint(d, id, p)).toBe(true);
    const left = Object.keys(sk().pts);
    expect(left.length).toBe(3);
    expect(deleteSketchPoint(d, id, left[0])).toBe(false);
    expect(Object.keys(sk().pts).length).toBe(3);
  });
  it('the radius clamp keeps neighbouring arcs from overlapping', () => {
    const d = createWaffleDesign();
    const id = addShape(d, sketchShape(floor, L, 'extrude'));
    // the L's 40 mm inner edge with two 25 mm corners: each may take 45 % of it, so both clamp to 18 mm
    expect(roundCorner(d, id, 'p2', 25)).toBe(true);
    expect(roundCorner(d, id, 'p3', 25)).toBe(true);
    const sk = d.sculpt!.shapes[id].sketch!;
    const c2 = cornerCut(sk, 'p2')!, c3 = cornerCut(sk, 'p3')!;
    expect(c2.r).toBeCloseTo(18, 9);
    expect(c3.r).toBeCloseTo(18, 9);
    expect(Math.hypot(c2.t2.x - c3.t1.x, c2.t2.y - c3.t1.y)).toBeCloseTo(4, 6);
    expect(buildShape(k, d.sculpt!, id).volume()).toBeGreaterThan(0);
    // a box's footprint corners round too (by index)
    const b = addShape(d, { kind: 'box', at: [0, 0, 0], q: [0, 0, 0, 1], size: [40, 10, 20] });
    roundCorner(d, b, 0, 30);
    expect(buildShape(k, d.sculpt!, b).volume()).toBeLessThan(40 * 20 * 10);
  });
  it('sketch lines snap to 30° steps; Alt draws freely', () => {
    const o = { angle: Math.PI / 6, grid: (x: number) => Math.round(x), closeTol: 2 };
    const p = nextPolyPoint([{ x: 0, y: 0 }], { x: 50, y: 24 }, o);
    expect((Math.atan2(p.y, p.x) * 180) / Math.PI).toBeCloseTo(30, 9);
    const free = nextPolyPoint([{ x: 0, y: 0 }], { x: 50.3, y: 24.2 }, { ...o, angle: null });
    expect(free).toEqual({ x: 50, y: 24 });
  });
});
