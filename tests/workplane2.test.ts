// Milestone 132 (Shapes R13): the workplane, second part — chamfers, a loft, line up and
// mirror, the protractor. (Snapping to shapes while moving and Edit group came with the port.)
import { beforeAll, describe, expect, it } from 'vitest';
import { kernel, type Kernel } from '../src/sculpt/kernel';
import { addShape, createWaffleDesign, primitiveShape } from '../src/sculpt/ops';
import { buildShape } from '../src/sculpt/build';
import { solidFaces } from '../src/sculpt/faces';
import { shapePolyhedron } from '../src/sculpt/polyhedron';
import { worldBox } from '../src/sculpt/box';
import { alignShapes, mirrorShapes } from '../src/sculpt/arrange';
import { protractorReading } from '../src/sculpt/protractor';
import { createDesign } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { reassemble } from '../src/model/reassemble';
import { buildPieces, netOverlaps } from '../src/model/pieces';
import { sketchShape } from '../src/sculpt/sketch';

let k: Kernel;
beforeAll(async () => {
  k = await kernel();
});

const foldsInOneClick = (P: ReturnType<typeof shapePolyhedron>) => {
  const d = createDesign(MATERIALS[0]);
  d.id = 'r13';
  reassemble(d, P, { as: 'fold' });
  expect(Object.values(d.connections).every((c) => !c.broken)).toBe(true);
  expect(buildPieces(d).length).toBeGreaterThan(0);
  expect(netOverlaps(d)).toEqual([]);
};

describe('chamfers', () => {
  it('a box with its top edges chamfered: ten flat faces, the chamfers named by their two faces, and it folds in one click', () => {
    const d = createWaffleDesign();
    const id = addShape(d, { ...primitiveShape('box', { x: 0, z: 0, w: 80, d: 60 }, 50), chamfers: ['+z', '+x', '-z', '-x'].map((b) => ({ a: 'top', b, d: 8 })) });
    const fs = solidFaces(k, d.sculpt!);
    expect(fs).toHaveLength(10);
    expect(fs.every((f) => f.kind === 'flat')).toBe(true);
    const P = shapePolyhedron(k, d.sculpt!);
    const roles = Object.keys(P.faces).map((x) => x.slice(id.length + 1)).sort();
    expect(roles).toEqual(['+x', '+z', '-x', '-z', 'bottom', 'ch:top|+x', 'ch:top|+z', 'ch:top|-x', 'ch:top|-z', 'top']);
    // each chamfer takes a 45° triangle of 8 × 8 / 2 along its edge (less the corners' overlap)
    const v = buildShape(k, d.sculpt!, id).volume();
    expect(v).toBeLessThan(80 * 60 * 50 - 2 * 32 * (80 + 60) + 1000);
    expect(v).toBeGreaterThan(80 * 60 * 50 - 2 * 32 * (80 + 60) - 1000);
    foldsInOneClick(P);
  });
  it('a hexagonal prism with chamfered upright edges: 14 faces', () => {
    const d = createWaffleDesign();
    const sides = Array.from({ length: 6 }, (_, i) => `side${i}`);
    addShape(d, { ...primitiveShape('prism', { x: 0, z: 0, w: 80, d: 80 }, 40), chamfers: sides.map((a, i) => ({ a, b: sides[(i + 1) % 6], d: 5 })) });
    expect(solidFaces(k, d.sculpt!)).toHaveLength(14);
  });
});

describe('a loft', () => {
  it('a square to an octagon: straight walls, every face flat, and it folds in one click', () => {
    const d = createWaffleDesign();
    const id = addShape(d, primitiveShape('loft', { x: 0, z: 0, w: 80, d: 80 }, 60));
    const fs = solidFaces(k, d.sculpt!);
    expect(fs.every((f) => f.kind === 'flat')).toBe(true);
    const P = shapePolyhedron(k, d.sculpt!);
    expect(P.faces[`${id}:bottom`].outer).toHaveLength(4);
    expect(P.faces[`${id}:top`].outer).toHaveLength(8);
    expect(P.issues).toEqual([]);
    foldsInOneClick(P);
  });
});

describe('line up and mirror', () => {
  it('lines up to the last shape clicked: min, middle, max on an axis', () => {
    const d = createWaffleDesign();
    const a = addShape(d, primitiveShape('box', { x: 0, z: 0, w: 40, d: 40 }, 20));
    const b = addShape(d, primitiveShape('box', { x: 70, z: 30, w: 20, d: 20 }, 50));
    alignShapes(d, [a, b], a, 0, 'min');
    expect(worldBox(d.sculpt!, b)!.min[0]).toBeCloseTo(worldBox(d.sculpt!, a)!.min[0], 6);
    alignShapes(d, [a, b], a, 2, 'mid');
    const A = worldBox(d.sculpt!, a)!, B = worldBox(d.sculpt!, b)!;
    expect((B.min[2] + B.max[2]) / 2).toBeCloseTo((A.min[2] + A.max[2]) / 2, 6);
    alignShapes(d, [a, b], b, 1, 'max');
    expect(worldBox(d.sculpt!, a)!.max[1]).toBeCloseTo(50, 6);
  });
  it("mirrors across the selection's middle: two boxes swap sides; an L-shaped extrusion turns the other way", () => {
    const d = createWaffleDesign();
    const a = addShape(d, primitiveShape('box', { x: -40, z: 0, w: 20, d: 20 }, 20));
    const b = addShape(d, primitiveShape('box', { x: 40, z: 0, w: 40, d: 20 }, 20));
    mirrorShapes(d, [a, b], 0);
    // together they span −50…60 (middle 5): the small box, −50…−30, comes to 40…60
    expect(worldBox(d.sculpt!, a)!.min[0]).toBeCloseTo(40, 6);
    expect(worldBox(d.sculpt!, b)!.min[0]).toBeCloseTo(-50, 6);
    const L = addShape(d, sketchShape({ kind: 'floor' }, [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 50 }, { x: 0, y: 50 }], 'extrude', 10));
    const before = worldBox(d.sculpt!, L)!;
    mirrorShapes(d, [L], 0);
    const after = worldBox(d.sculpt!, L)!;
    // the same place (a lone shape mirrors about its own middle), its outline turned the other way
    for (let i = 0; i < 3; i++) expect(after.min[i]).toBeCloseTo(before.min[i], 6);
    expect(Math.min(...Object.values(d.sculpt!.shapes[L].sketch!.pts).map((p) => p.x))).toBeCloseTo(-60, 6);
  });
});

describe('the protractor', () => {
  it('reads the angle between two faces and the joint for it', () => {
    expect(protractorReading([0, 1, 0], [1, 0, 0], MATERIALS[3])).toEqual({ deg: 90, kind: 'finger' });
    const r = protractorReading([0, 1, 0], [Math.sin(0.35), Math.cos(0.35), 0], MATERIALS[3]);
    expect(Math.round(r.deg)).toBe(160);
    expect(r.kind).toBe('butt');
    expect(protractorReading([0, 1, 0], [1, 0, 0], MATERIALS[0]).kind).toBe('glue');
  });
});
