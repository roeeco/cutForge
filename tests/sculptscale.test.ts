// Milestone 55: scaling shapes, placing them, and the heights new shapes start at.
import { beforeAll, describe, expect, it } from 'vitest';
import { kernel, type Kernel } from '../src/sculpt/kernel';
import { buildShape, buildSolid } from '../src/sculpt/build';
import { addShape, createWaffleDesign, defaultPrimitive, freeSpot, groupShapes, moveShapes, primitiveShape, startHeight, turnShapes, ungroupShape, worldPose, PRIMITIVES, type Primitive } from '../src/sculpt/ops';
import { canStretch, scaleShape, scaleShapes, shapeSize } from '../src/sculpt/scale';
import { sketchShape } from '../src/sculpt/sketch';
import { worldBox } from '../src/sculpt/box';
import { checkSculpt } from '../src/sculpt/check';
import { parseProject, serializeProject } from '../src/model/serialize';
import { qAxis } from '../src/sculpt/xform';
import type { Design, Shape3, V3 } from '../src/model/types';
import { evalNumber } from '../src/ui/NumField';

let k: Kernel;
beforeAll(async () => {
  k = await kernel();
});

type Box = { min: V3; max: V3 };
const bodyBox = (d: Design, id: string): Box => {
  const bb = buildShape(k, d.sculpt!, id).boundingBox();
  return { min: [...bb.min] as V3, max: [...bb.max] as V3 };
};
const vol = (d: Design, id: string) => buildShape(k, d.sculpt!, id).volume();

function shapeOf(kind: Primitive | 'extrude' | 'revolve' | 'upExtrude'): { d: Design; id: string } {
  const d = createWaffleDesign();
  let id: string;
  if (kind === 'extrude') id = addShape(d, sketchShape({ kind: 'floor' }, [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }, { x: 10, y: 25 }], 'extrude', 15));
  else if (kind === 'upExtrude') id = addShape(d, sketchShape({ kind: 'upright', o: [5, 0, 3], ang: 0 }, [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 25, y: 20 }], 'extrude', 12));
  else if (kind === 'revolve') id = addShape(d, sketchShape({ kind: 'upright', o: [0, 0, 0], ang: 0 }, [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 12, y: 30 }, { x: 0, y: 30 }], 'revolve'));
  else id = addShape(d, primitiveShape(kind, { x: 7, z: -4, w: 40, d: 30 }, kind === 'torus' ? 8 : 24));
  return { d, id };
}

/** The box after scaling `b` by f about `a` (all in the shape's own axes, which here are the world's). */
const scaledBox = (b: Box, f: V3, a: V3): Box => ({
  min: [0, 1, 2].map((i) => Math.min(a[i] + (b.min[i] - a[i]) * f[i], a[i] + (b.max[i] - a[i]) * f[i])) as V3,
  max: [0, 1, 2].map((i) => Math.max(a[i] + (b.min[i] - a[i]) * f[i], a[i] + (b.max[i] - a[i]) * f[i])) as V3,
});

const FACTORS: V3[] = [
  [2, 1, 1],
  [1, 3, 1],
  [1, 1, 0.5],
  [2, 2, 2],
];

describe('scaleShape', () => {
  const kinds = [...PRIMITIVES, 'extrude', 'upExtrude', 'revolve'] as const;
  for (const kind of kinds)
    for (const f of FACTORS)
      it(`${kind} by ${f.join('×')}: the box scales about the anchor, the volume by the product`, () => {
        const { d, id } = shapeOf(kind);
        const s = d.sculpt!.shapes[id];
        const b0 = bodyBox(d, id), v0 = vol(d, id);
        // anchor: a corner of the body's box, in the shape's own frame (at, unturned)
        const anchorW: V3 = [b0.min[0], b0.min[1], b0.max[2]];
        const anchor: V3 = [anchorW[0] - s.at[0], anchorW[1] - s.at[1], anchorW[2] - s.at[2]];
        scaleShape(d, id, f, anchor);
        const b1 = bodyBox(d, id);
        const want = scaledBox(b0, f, anchorW);
        for (let i = 0; i < 3; i++) {
          expect(b1.min[i]).toBeCloseTo(want.min[i], 1);
          expect(b1.max[i]).toBeCloseTo(want.max[i], 1);
          expect(Math.abs(b1.min[i] - want.min[i])).toBeLessThan(0.05);
          expect(Math.abs(b1.max[i] - want.max[i])).toBeLessThan(0.05);
        }
        // a ring's tube stays round, so its volume follows the product only when scaled alike
        const uniform = f[0] === f[1] && f[1] === f[2];
        if (kind !== 'torus' || uniform) expect(Math.abs(vol(d, id) / v0 - f[0] * f[1] * f[2])).toBeLessThan(0.005 * f[0] * f[1] * f[2]);
      });

  it('no size goes below 1 mm', () => {
    const { d, id } = shapeOf('box');
    scaleShape(d, id, [0.001, 1, 1], [0, 0, 0]);
    expect(d.sculpt!.shapes[id].size![0]).toBeCloseTo(1, 6);
  });

  it('box corner radii follow a uniform scale and stay otherwise', () => {
    const { d, id } = shapeOf('box');
    d.sculpt!.shapes[id].corners = [4, 4, 4, 4];
    scaleShape(d, id, [2, 2, 2], [0, 0, 0]);
    expect(d.sculpt!.shapes[id].corners).toEqual([8, 8, 8, 8]);
    scaleShape(d, id, [2, 1, 1], [0, 0, 0]);
    expect(d.sculpt!.shapes[id].corners).toEqual([8, 8, 8, 8]);
  });

  it('a revolve stretched radially by different factors keeps its axis and gets a stretch; alike, none', () => {
    const { d, id } = shapeOf('revolve');
    const v0 = vol(d, id);
    scaleShape(d, id, [2, 1, 2], [0, 0, 0]);
    expect(d.sculpt!.shapes[id].stretch).toBeUndefined();
    expect(d.sculpt!.shapes[id].sketch!.pts.p1.x).toBeCloseTo(40, 6);
    scaleShape(d, id, [1.5, 1, 1], [0, 0, 0]);
    const s = d.sculpt!.shapes[id];
    expect(s.stretch).toEqual([1.5, 1, 1]);
    expect(s.axis).toEqual({ kind: 'plane' });
    expect(vol(d, id) / v0).toBeCloseTo(4 * 1.5, 1);
  });

  it('a group gets a stretch and its members are not touched', () => {
    const d = createWaffleDesign();
    const a = addShape(d, primitiveShape('box', { x: 0, z: 0, w: 20, d: 20 }, 10));
    const b = addShape(d, primitiveShape('cylinder', { x: 30, z: 0, w: 20, d: 20 }, 10));
    const g = groupShapes(d, [a, b])!;
    const before = JSON.stringify([d.sculpt!.shapes[a], d.sculpt!.shapes[b]]);
    scaleShape(d, g, [2, 1, 1], [0, 0, 0]);
    expect(d.sculpt!.shapes[g].stretch).toEqual([2, 1, 1]);
    expect(JSON.stringify([d.sculpt!.shapes[a], d.sculpt!.shapes[b]])).toBe(before);
  });
});

describe('a stretched group', () => {
  function turnedGroup() {
    const d = createWaffleDesign();
    const a = addShape(d, primitiveShape('box', { x: 0, z: 0, w: 30, d: 20 }, 15));
    const c = addShape(d, primitiveShape('cylinder', { x: 40, z: 5, w: 16, d: 16 }, 30));
    turnShapes(d, [c], [0, 0, 1], 25, [40, 0, 5]);
    const g = groupShapes(d, [a, c])!;
    return { d, a, c, g };
  }

  it('stretched (2, 1, 1): the box doubles in x; ungroup keeps volume and box, the cylinder in a group of one', () => {
    const { d, c, g } = turnedGroup();
    const b0 = bodyBox(d, g);
    scaleShapes(d, [g], [2, 1, 1], [b0.min[0], 0, 0]);
    const b1 = bodyBox(d, g);
    expect(b1.max[0] - b1.min[0]).toBeCloseTo(2 * (b0.max[0] - b0.min[0]), 1);
    expect(b1.max[1] - b1.min[1]).toBeCloseTo(b0.max[1] - b0.min[1], 1);
    const v = buildSolid(k, d.sculpt).volume();
    const box = buildSolid(k, d.sculpt).boundingBox();
    const out = ungroupShape(d, g);
    expect(out).toHaveLength(2);
    const v2 = buildSolid(k, d.sculpt).volume(), box2 = buildSolid(k, d.sculpt).boundingBox();
    expect(Math.abs(v2 - v) / v).toBeLessThan(1e-4);
    for (let i = 0; i < 3; i++) {
      expect(box2.min[i]).toBeCloseTo(box.min[i], 3);
      expect(box2.max[i]).toBeCloseTo(box.max[i], 3);
    }
    // the turned cylinder is wrapped: a group of one carrying the stretch
    const wrap = out.find((id) => d.sculpt!.shapes[id].kind === 'group')!;
    expect(d.sculpt!.shapes[wrap].children).toEqual([c]);
    expect(d.sculpt!.shapes[wrap].stretch).toEqual([2, 1, 1]);
    // the box was baked in
    const boxId = out.find((id) => d.sculpt!.shapes[id].kind === 'box')!;
    expect(d.sculpt!.shapes[boxId].size![0]).toBeCloseTo(60, 6);
  });

  it('a uniform stretch is baked into every member on ungroup', () => {
    const { d, g } = turnedGroup();
    scaleShape(d, g, [1.5, 1.5, 1.5], [0, 0, 0]);
    const v = buildSolid(k, d.sculpt).volume();
    const out = ungroupShape(d, g);
    expect(out.every((id) => d.sculpt!.shapes[id].kind !== 'group')).toBe(true);
    // a larger cylinder is cut into more facets: the same shape within 0.1 %
    expect(Math.abs(buildSolid(k, d.sculpt).volume() - v) / v).toBeLessThan(1e-3);
  });

  it('moving and turning a stretched group, and a member inside it', () => {
    const { d, a, g } = turnedGroup();
    scaleShape(d, g, [2, 1, 1], [0, 0, 0]);
    const wb = worldBox(d.sculpt!, a)!;
    moveShapes(d, [a], [10, 0, 0]);
    const wb2 = worldBox(d.sculpt!, a)!;
    expect(wb2.min[0] - wb.min[0]).toBeCloseTo(10, 6);
    const p0 = worldPose(d.sculpt!, g).at;
    turnShapes(d, [g], [0, 1, 0], 90, p0);
    expect(worldPose(d.sculpt!, g).at[0]).toBeCloseTo(p0[0], 6);
    // the group's stretch is along its own axes, so it turns with it
    const b = bodyBox(d, g);
    expect(b.max[2] - b.min[2]).toBeGreaterThan(b.max[0] - b.min[0]);
  });

  it('a shape added into a stretched group keeps the size it was made at', () => {
    const { d, g } = turnedGroup();
    scaleShape(d, g, [2, 1, 1], [0, 0, 0]);
    const n = addShape(d, primitiveShape('box', { x: 100, z: 0, w: 10, d: 10 }, 10), g);
    const wb = worldBox(d.sculpt!, n)!;
    expect(wb.max[0] - wb.min[0]).toBeCloseTo(10, 5);
    expect(wb.min[0]).toBeCloseTo(95, 5);
  });
});

describe('scaleShapes', () => {
  it('refuses a non-uniform factor on a 25°-turned shape and changes nothing', () => {
    const d = createWaffleDesign();
    const id = addShape(d, primitiveShape('box', { x: 0, z: 0, w: 30, d: 20 }, 10));
    d.sculpt!.shapes[id].q = qAxis([0, 1, 0], 25);
    const before = JSON.stringify(d);
    expect(canStretch(d.sculpt!, [id])).toBe(false);
    expect(scaleShapes(d, [id], [2, 1, 1], [0, 0, 0])).toBe(false);
    expect(JSON.stringify(d)).toBe(before);
    expect(scaleShapes(d, [id], [2, 2, 2], [0, 0, 0])).toBe(true);
    expect(d.sculpt!.shapes[id].size).toEqual([60, 20, 40]);
  });

  it('a shape turned 90° takes the factors in its own order', () => {
    const d = createWaffleDesign();
    const id = addShape(d, primitiveShape('box', { x: 0, z: 0, w: 30, d: 20 }, 10));
    turnShapes(d, [id], [0, 1, 0], 90, [0, 0, 0]);
    expect(scaleShapes(d, [id], [2, 1, 1], [0, 0, 0])).toBe(true);
    // world x is its own z
    expect(d.sculpt!.shapes[id].size).toEqual([30, 10, 40]);
  });

  it('several shapes scale about a shared anchor: their positions too', () => {
    const d = createWaffleDesign();
    const a = addShape(d, primitiveShape('box', { x: 0, z: 0, w: 10, d: 10 }, 10));
    const b = addShape(d, primitiveShape('box', { x: 40, z: 0, w: 10, d: 10 }, 10));
    scaleShapes(d, [a, b], [2, 1, 1], [-5, 0, 0]);
    expect(worldBox(d.sculpt!, b)!.max[0]).toBeCloseTo(95, 6);
    expect(worldBox(d.sculpt!, a)!.min[0]).toBeCloseTo(-5, 6);
  });

  it('shapeSize is the body box in the shape\'s own axes, even when turned', () => {
    const d = createWaffleDesign();
    const id = addShape(d, primitiveShape('box', { x: 10, z: 0, w: 30, d: 20 }, 10));
    d.sculpt!.shapes[id].q = qAxis([0, 1, 0], 25);
    const sz = shapeSize(d.sculpt!, id)!;
    expect(sz.max[0] - sz.min[0]).toBeCloseTo(30, 4);
    expect(sz.max[2] - sz.min[2]).toBeCloseTo(20, 4);
  });
});

describe('placing', () => {
  it('freeSpot avoids an occupied spot', () => {
    const d = createWaffleDesign();
    addShape(d, primitiveShape('box', { x: 0, z: 0, w: 40, d: 40 }, 10));
    const p = freeSpot(d.sculpt!, 40, 40, { x: 0, z: 0 });
    expect(p.x).toBeGreaterThanOrEqual(40);
    expect(p.z).toBe(0);
    expect(freeSpot(createWaffleDesign().sculpt!, 40, 40, { x: 3.4, z: -2.2 })).toEqual({ x: 3, z: -2 });
  });

  it('a ring then a box: the box starts at its own height', () => {
    // a ring's 10 mm tube is never remembered
    const heights = {} as Record<string, number>;
    const ring = defaultPrimitive('torus', [0, 0, 0], heights);
    expect(ring.tube).toBe(10);
    const box = defaultPrimitive('box', [0, 0, 0], heights);
    expect(box.size).toEqual([40, 40, 40]);
    expect(defaultPrimitive('box', [0, 0, 0], { box: 12 }).size).toEqual([40, 12, 40]);
    expect(defaultPrimitive('cylinder', [0, 0, 0], { box: 12 }).size).toEqual([40, 40, 40]);
    expect(startHeight('sphere', { box: 12 } as never)).toBe(40);
    expect(startHeight('extrude', {})).toBe(20);
    expect(startHeight('extrude', { extrude: 7 })).toBe(7);
  });
});

describe('files', () => {
  it('save and open round-trips stretch; a bad stretch is dropped', () => {
    const d = createWaffleDesign();
    const a = addShape(d, primitiveShape('box', { x: 0, z: 0, w: 10, d: 10 }, 10));
    const b = addShape(d, primitiveShape('box', { x: 20, z: 0, w: 10, d: 10 }, 10));
    const g = groupShapes(d, [a, b])!;
    d.sculpt!.shapes[g].stretch = [2, 1, 0.5];
    const back = parseProject(serializeProject(d));
    expect(back.sculpt!.shapes[g].stretch).toEqual([2, 1, 0.5]);
    const bad = JSON.parse(JSON.stringify(d)) as Design;
    (bad.sculpt!.shapes[g] as Shape3 & { stretch: unknown }).stretch = [2, -1, 1];
    checkSculpt(bad);
    expect(bad.sculpt!.shapes[g].stretch).toBeUndefined();
  });
});

describe('typed sizes', () => {
  it('percent of the current value, and sums', () => {
    expect(evalNumber('150%', 40)).toBeCloseTo(60, 9);
    expect(evalNumber('60+12.5')).toBe(72.5);
    expect(evalNumber('50%+5', 20)).toBeCloseTo(15, 9);
    expect(evalNumber('150%')).toBeNull();
  });
});

describe('the frame drag', () => {
  // imported lazily: the component file pulls in three.js and React
  it('a corner changes two directions, Shift all three; a side one; Alt about the middle', async () => {
    const { dragScale } = await import('../src/sculpt/ui/ScaleFrame');
    const b = { min: [-20, 0, -10] as V3, max: [20, 30, 10] as V3 };
    const snap = (x: number) => Math.round(x);
    const corner = { axes: [{ i: 0, side: 1 as const }, { i: 2, side: 1 as const }] };
    let r = dragScale(b, corner, [60, 0, 30], { ratio: false, centre: false, snap });
    expect(r.f).toEqual([2, 1, 2]);
    expect(r.anchor).toEqual([-20, 0, -10]);
    r = dragScale(b, corner, [60, 0, 10], { ratio: true, centre: false, snap });
    expect(r.f).toEqual([2, 2, 2]);
    const side = { axes: [{ i: 0, side: -1 as const }] };
    r = dragScale(b, side, [-40, 0, 0], { ratio: false, centre: false, snap });
    expect(r.f).toEqual([1.5, 1, 1]);
    expect(r.anchor[0]).toBe(20);
    r = dragScale(b, side, [-40, 0, 0], { ratio: false, centre: true, snap });
    expect(r.f).toEqual([2, 1, 1]);
    expect(r.anchor[0]).toBe(0);
  });
});
