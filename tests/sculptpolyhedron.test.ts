// Milestone 122 (Shapes R3): the face graph from shapes, with stable keys.
import { beforeAll, describe, expect, it } from 'vitest';
import { kernel, type Kernel } from '../src/sculpt/kernel';
import { addShape, createWaffleDesign, groupShapes, primitiveShape, setHole } from '../src/sculpt/ops';
import { sketchShape } from '../src/sculpt/sketch';
import { shapePolyhedron } from '../src/sculpt/polyhedron';
import { polyIssues } from '../src/model/polyhedron';
import type { Design, P2 } from '../src/model/types';

let k: Kernel;
beforeAll(async () => {
  k = await kernel();
});

const keys = (d: Design, facets = 12) => Object.keys(shapePolyhedron(k, d.sculpt!, facets).faces).sort();
const angles = (d: Design) => Object.values(shapePolyhedron(k, d.sculpt!).edges).map((e) => Math.round(e.dihedral));

function lExtrusion(at: P2[] = [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 30 }, { x: 30, y: 30 }, { x: 30, y: 70 }, { x: 0, y: 70 }]) {
  const d = createWaffleDesign();
  const id = addShape(d, sketchShape({ kind: 'floor' }, at, 'extrude', 50));
  return { d, id };
}

describe('the face graph from shapes', () => {
  it('a box: 6 faces, 12 edges at 90°, keyed by role', () => {
    const d = createWaffleDesign();
    const b = addShape(d, primitiveShape('box', { x: 5, z: 3, w: 40, d: 30 }, 20));
    const P = shapePolyhedron(k, d.sculpt!);
    expect(Object.keys(P.faces).sort()).toEqual(['+x', '+z', '-x', '-z', 'bottom', 'top'].map((r) => `${b}:${r}`).sort());
    expect(Object.keys(P.edges)).toHaveLength(12);
    expect(Object.values(P.edges).every((e) => Math.abs(e.dihedral - 90) < 1e-6)).toBe(true);
    expect(P.issues).toEqual([]);
    expect(Object.values(P.faces).every((f) => f.outer.length === 4 && f.holes.length === 0)).toBe(true);
  });

  it('an L-extrusion: 8 faces, one edge at 270°', () => {
    const { d, id } = lExtrusion();
    const P = shapePolyhedron(k, d.sculpt!);
    expect(Object.keys(P.faces)).toHaveLength(8);
    expect(Object.keys(P.faces).filter((x) => x.startsWith(`${id}:seg:`))).toHaveLength(6);
    expect(angles(d).filter((a) => a === 270)).toHaveLength(1);
  });

  it('two boxes flush side by side: their coplanar faces merge, keyed by both', () => {
    const d = createWaffleDesign();
    const a = addShape(d, primitiveShape('box', { x: -20, z: 0, w: 40, d: 40 }, 30));
    const b = addShape(d, primitiveShape('box', { x: 20, z: 0, w: 40, d: 40 }, 30));
    const P = shapePolyhedron(k, d.sculpt!);
    expect(Object.keys(P.faces)).toHaveLength(6);
    expect(P.faces[`${a}:top+${b}:top`] ?? P.faces[`${b}:top+${a}:top`]).toBeTruthy();
    expect(Object.values(P.faces).filter((f) => f.src.length === 2)).toHaveLength(4);
  });

  it('a box with a through-hole: a top and a bottom with holes, the hole walls as hole: faces', () => {
    const d = createWaffleDesign();
    const b = addShape(d, primitiveShape('box', { x: 0, z: 0, w: 60, d: 60 }, 30));
    const c = addShape(d, primitiveShape('cylinder', { x: 0, z: 0, w: 20, d: 20 }, 60));
    // the hole reaches through: from below the box to above it
    d.sculpt!.shapes[c].at[1] = -10;
    setHole(d, [c], true);
    groupShapes(d, [b, c]);
    const P = shapePolyhedron(k, d.sculpt!, 12);
    expect(P.faces[`${b}:top`].holes).toHaveLength(1);
    expect(P.faces[`${b}:bottom`].holes).toHaveLength(1);
    const walls = Object.keys(P.faces).filter((x) => x.startsWith(`hole:${c}:`));
    expect(walls).toHaveLength(12);
    expect(walls.every((x) => P.faces[x].facetOf === 'ruled')).toBe(true);
    // the hole's rim is a convex edge: its walls meet the top and bottom at 90°
    const rims = Object.values(P.edges).filter((e) => e.a.startsWith('hole:') !== e.b.startsWith('hole:'));
    expect(rims).toHaveLength(24);
    expect(rims.every((e) => Math.abs(e.dihedral - 90) < 1e-6)).toBe(true);
  });

  it('a cylinder cut into 12 facets: two caps and twelve ruled faces at 150°', () => {
    const d = createWaffleDesign();
    const c = addShape(d, primitiveShape('cylinder', { x: 0, z: 0, w: 60, d: 60 }, 40));
    const P = shapePolyhedron(k, d.sculpt!, 12);
    expect(Object.keys(P.faces)).toHaveLength(14);
    expect(P.faces[`${c}:cap0`]).toBeTruthy();
    expect(P.faces[`${c}:cap1`]).toBeTruthy();
    expect(Object.values(P.edges).filter((e) => Math.abs(e.dihedral - 150) < 0.01)).toHaveLength(12);
    // the shape itself keeps its smooth look
    expect(d.sculpt!.shapes[c].facets).toBeUndefined();
  });

  it('resizing a box or moving a sketch point keeps every key', () => {
    const d = createWaffleDesign();
    const b = addShape(d, primitiveShape('box', { x: 0, z: 0, w: 40, d: 30 }, 20));
    const before = keys(d);
    d.sculpt!.shapes[b].size = [70, 25, 55];
    d.sculpt!.shapes[b].at = [10, 0, -5];
    expect(keys(d)).toEqual(before);
    const { d: L } = lExtrusion();
    const k0 = keys(L);
    const { d: L2 } = lExtrusion([{ x: 0, y: 0 }, { x: 90, y: 0 }, { x: 90, y: 25 }, { x: 35, y: 25 }, { x: 35, y: 75 }, { x: 0, y: 75 }]);
    // the same sketch with its points moved: the same ids, so the same keys (the shape id aside)
    const strip = (xs: string[]) => xs.map((x) => x.replace(/^[^:]+:/, ''));
    expect(strip(keys(L2))).toEqual(strip(k0));
  });

  it('changing the facet count keeps every key except the facets', () => {
    const d = createWaffleDesign();
    const b = addShape(d, primitiveShape('box', { x: -50, z: 0, w: 40, d: 40 }, 30));
    const c = addShape(d, primitiveShape('cylinder', { x: 50, z: 0, w: 40, d: 40 }, 30));
    const at8 = keys(d, 8), at12 = keys(d, 12);
    const fixed = (xs: string[]) => xs.filter((x) => !/:f\d/.test(x));
    expect(fixed(at8)).toEqual(fixed(at12));
    expect(fixed(at12)).toEqual([...['+x', '+z', '-x', '-z', 'bottom', 'top'].map((r) => `${b}:${r}`), `${c}:cap0`, `${c}:cap1`].sort());
    expect(at8.length).toBe(16);
    expect(at12.length).toBe(20);
  });

  it('the checks: slivers, tiny faces and too many faces', () => {
    const d = createWaffleDesign();
    addShape(d, primitiveShape('box', { x: 0, z: 0, w: 60, d: 60 }, 1));
    const P = shapePolyhedron(k, d.sculpt!);
    expect(polyIssues(P, 3).some((i) => i.kind === 'sliver')).toBe(true);
    const d2 = createWaffleDesign();
    addShape(d2, primitiveShape('sphere', { x: 0, z: 0, w: 60, d: 60 }, 60));
    expect(polyIssues(shapePolyhedron(k, d2.sculpt!, 32), 0.5).some((i) => i.kind === 'tooMany')).toBe(true);
  });
});
