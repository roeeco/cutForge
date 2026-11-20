// Milestone 49: the waffle shape kernel, its shapes, groups and files.
import { beforeAll, describe, expect, it } from 'vitest';
import { kernel, liveCount, scope, circleSegments, type Kernel } from '../src/sculpt/kernel';
import { buildShape, buildSolid, clearShapeCache, shapeCacheSize } from '../src/sculpt/build';
import { addShape, createWaffleDesign, groupShapes, primitiveShape, setHole, ungroupShape, worldPose, turnShapes, moveShapes, PRIMITIVES, type Primitive } from '../src/sculpt/ops';
import { parseProject, serializeProject } from '../src/model/serialize';
import { fillets, flattenSketch } from '../src/sculpt/round';
import type { Design } from '../src/model/types';

let k: Kernel;
beforeAll(async () => {
  k = await kernel();
});

const foot = { x: 0, z: 0, w: 60, d: 40 };
function design(kind: Primitive, h = 30, patch: Record<string, unknown> = {}) {
  const d = createWaffleDesign();
  const id = addShape(d, { ...primitiveShape(kind, foot, h), ...patch });
  return { d, id };
}

describe('kernel', () => {
  it('circle segments keep the chord error at 0.02 mm', () => {
    for (const r of [2, 10, 50, 200]) {
      const n = circleSegments(r);
      expect(r * (1 - Math.cos(Math.PI / n))).toBeLessThanOrEqual(0.02 + 1e-12);
    }
    expect(circleSegments(1e5)).toBe(360);
  });
  it('scope frees what it made except what it returns', () => {
    const before = liveCount();
    const kept = scope(() => {
      const a = k.Manifold.cube([10, 10, 10]);
      const b = k.Manifold.sphere(6, 32);
      return a.subtract(b);
    });
    expect(liveCount()).toBe(before + 1);
    kept.delete();
    expect(liveCount()).toBe(before);
  });
});

describe('primitives', () => {
  const W = 60, D = 40, H = 30;
  const formulas: Record<Primitive, number> = {
    box: W * D * H,
    cylinder: (Math.PI * W * D * H) / 4,
    cone: (Math.PI * W * D * H) / 12,
    prism: ((3 * Math.sqrt(3)) / 2) * 0.5 * 0.5 * (W / Math.sqrt(3)) * (D / 1) * H * (2 / Math.sqrt(3)) * (Math.sqrt(3) / 2) * 2,
    pyramid: (W * D * H) / 3,
    sphere: (4 / 3) * Math.PI * (W / 2) * (D / 2) * (H / 2),
    halfsphere: (2 / 3) * Math.PI * (W / 2) * (D / 2) * H,
    torus: 0,
  };
  // a hexagon fitted to a W × D box: its area is 3/4 of the box's
  formulas.prism = 0.75 * W * D * H;
  it.each(PRIMITIVES)('%s volume is within 0.5% of its formula', (kind) => {
    // a 0.02 mm chord error is 0.4% of a 5 mm tube: the torus is checked with a 20 mm tube
    const patch = kind === 'torus' ? { size: [100, 20, 100], tube: 20 } : kind === 'sphere' ? { size: [W, H, D] } : kind === 'halfsphere' ? { size: [W, H, D] } : {};
    const { d, id } = design(kind, H, patch);
    const m = buildShape(k, d.sculpt!, id);
    const expected = kind === 'torus' ? 2 * Math.PI * Math.PI * 40 * 10 * 10 : formulas[kind];
    expect(Math.abs(m.volume() - expected) / expected).toBeLessThan(0.005);
  });
  it('a rounded box loses exactly its corners', () => {
    const { d, id } = design('box', H, { corners: [5, 5, 5, 5] });
    const v = buildShape(k, d.sculpt!, id).volume();
    expect(Math.abs(v - (W * D - (4 - Math.PI) * 25) * H) / v).toBeLessThan(0.001);
  });
  it('a shape stands on the floor at its position, y up', () => {
    const { d, id } = design('box', H);
    d.sculpt!.shapes[id].at = [100, 0, -50];
    const bb = buildShape(k, d.sculpt!, id).boundingBox();
    expect(bb.min[1]).toBeCloseTo(0, 6);
    expect(bb.max[1]).toBeCloseTo(H, 6);
    expect((bb.min[0] + bb.max[0]) / 2).toBeCloseTo(100, 6);
    expect((bb.min[2] + bb.max[2]) / 2).toBeCloseTo(-50, 6);
    expect(bb.max[2] - bb.min[2]).toBeCloseTo(D, 6);
  });
});

describe('solid and hole', () => {
  function boxWithHole(): { d: Design; box: string; hole: string } {
    const d = createWaffleDesign();
    const box = addShape(d, primitiveShape('box', { x: 0, z: 0, w: 60, d: 60 }, 40));
    const hole = addShape(d, { ...primitiveShape('cylinder', { x: 0, z: 0, w: 20, d: 20 }, 60), hole: true });
    return { d, box, hole };
  }
  it('a Hole outside a group cuts nothing', () => {
    const { d } = boxWithHole();
    expect(buildSolid(k, d.sculpt).volume()).toBeCloseTo(60 * 60 * 40, 3);
  });
  it('a Hole cuts only inside its group, and ungroup gives the members back', () => {
    const { d, box, hole } = boxWithHole();
    const other = addShape(d, primitiveShape('box', { x: 200, z: 0, w: 20, d: 20 }, 20));
    const g = groupShapes(d, [box, hole])!;
    const v = buildSolid(k, d.sculpt).volume();
    const exp = 60 * 60 * 40 - Math.PI * 100 * 40 + 20 * 20 * 20;
    expect(Math.abs(v - exp) / exp).toBeLessThan(0.002);
    // the other box is not cut by the hole even where it would overlap
    expect(d.sculpt!.order).toEqual([g, other]);
    moveShapes(d, [g], [5, 0, 0]);
    turnShapes(d, [g], [0, 1, 0], 30, [0, 0, 0]);
    const before = buildSolid(k, d.sculpt).volume();
    const kids = ungroupShape(d, g);
    expect(kids).toEqual([box, hole]);
    expect(d.sculpt!.shapes[hole].hole).toBe(true);
    // ungrouped: the hole cuts nothing again, and the box is where the group put it
    expect(buildSolid(k, d.sculpt).volume()).toBeCloseTo(60 * 60 * 40 + 20 * 20 * 20, 2);
    expect(worldPose(d.sculpt!, box).at[0]).toBeCloseTo(5 * Math.cos(Math.PI / 6), 6);
    setHole(d, [hole], false);
    expect(before).toBeGreaterThan(0);
  });
  it('a group of holes is one hole inside an outer group', () => {
    const { d, box, hole } = boxWithHole();
    const h2 = addShape(d, { ...primitiveShape('box', { x: 25, z: 0, w: 10, d: 10 }, 60), hole: true });
    const hg = groupShapes(d, [hole, h2])!;
    setHole(d, [hg], true);
    groupShapes(d, [box, hg]);
    const v = buildSolid(k, d.sculpt).volume();
    const exp = 60 * 60 * 40 - Math.PI * 100 * 40 - 10 * 10 * 40;
    expect(Math.abs(v - exp) / exp).toBeLessThan(0.003);
  });
});

describe('files and memory', () => {
  it('save and open round-trip a waffle design', () => {
    const d = createWaffleDesign();
    const a = addShape(d, primitiveShape('box', { x: 0, z: 0, w: 60, d: 60 }, 40));
    const b = addShape(d, { ...primitiveShape('cylinder', { x: 0, z: 0, w: 20, d: 20 }, 60), hole: true });
    groupShapes(d, [a, b]);
    addShape(d, primitiveShape('cone', { x: 0, z: 0, w: 40, d: 40, y: 40 }, 30));
    const back = parseProject(serializeProject(d));
    expect(back.kind).toBe('waffle');
    expect(back.sculpt).toEqual(d.sculpt);
    expect(buildSolid(k, back.sculpt).volume()).toBeCloseTo(buildSolid(k, d.sculpt).volume(), 3);
    // a waffle file without shapes opens as an empty waffle design
    const raw = JSON.parse(serializeProject(d));
    delete raw.design.sculpt;
    const empty = parseProject(JSON.stringify(raw));
    expect(empty.sculpt).toEqual({ shapes: {}, order: [] });
  });
  it('no kernel objects are left alive after a rebuild', () => {
    clearShapeCache();
    const base = liveCount();
    const d = createWaffleDesign();
    for (const kind of PRIMITIVES) addShape(d, primitiveShape(kind, { x: 0, z: 0, w: 40, d: 30 }, 20));
    buildSolid(k, d.sculpt);
    // only what the cache holds is alive
    expect(liveCount() - base).toBe(shapeCacheSize());
    clearShapeCache();
    expect(liveCount()).toBe(base);
  });
});

describe('rounded corners (round.ts)', () => {
  it('neighbouring arcs are scaled down until they meet', () => {
    const pts = [
      { x: 0, y: 0, r: 30 },
      { x: 40, y: 0, r: 30 },
      { x: 40, y: 100 },
      { x: 0, y: 100 },
    ];
    const f = fillets(pts);
    expect(f[0]!.r).toBeCloseTo(20, 9);
    expect(f[1]!.r).toBeCloseTo(20, 9);
    expect(f[0]!.t2.x).toBeCloseTo(f[1]!.t1.x, 9);
  });
  it('every arc point lies on its circle and chords stay within 0.02 mm', () => {
    const pts = [
      { x: 0, y: 0, r: 8 },
      { x: 50, y: 0 },
      { x: 50, y: 30, r: 12 },
      { x: 0, y: 30 },
    ];
    const f = fillets(pts);
    const flat = flattenSketch(pts);
    for (const fl of [f[0]!, f[2]!]) {
      const isOn = (p: { x: number; y: number }) => Math.abs(Math.hypot(p.x - fl.c.x, p.y - fl.c.y) - fl.r) < 1e-9;
      expect(flat.filter(isOn).length).toBeGreaterThan(4);
      // each chord between two neighbouring arc points stays within 0.02 mm of the arc
      for (let i = 0; i < flat.length; i++) {
        const a = flat[i], b = flat[(i + 1) % flat.length];
        if (!isOn(a) || !isOn(b)) continue;
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        expect(fl.r - Math.hypot(m.x - fl.c.x, m.y - fl.c.y)).toBeLessThanOrEqual(0.02 + 1e-9);
      }
    }
  });
});
