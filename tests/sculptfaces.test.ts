// Milestone 60: face provenance and the Faces count.
import { beforeAll, describe, expect, it } from 'vitest';
import { kernel, type Kernel } from '../src/sculpt/kernel';
import { buildShape } from '../src/sculpt/build';
import { addShape, createWaffleDesign, groupShapes, primitiveShape, setHole } from '../src/sculpt/ops';
import { sketchShape } from '../src/sculpt/sketch';
import { foldable, solidFaces } from '../src/sculpt/faces';
import { checkSculpt } from '../src/sculpt/check';
import type { Design } from '../src/model/types';

let k: Kernel;
beforeAll(async () => {
  k = await kernel();
});

describe('faces', () => {
  it('a box gives six flat faces naming the box', () => {
    const d = createWaffleDesign();
    const b = addShape(d, primitiveShape('box', { x: 5, z: 3, w: 40, d: 30 }, 20));
    const fs = solidFaces(k, d.sculpt!);
    expect(fs).toHaveLength(6);
    expect(fs.every((f) => f.kind === 'flat' && f.shapeId === b)).toBe(true);
    expect(fs.reduce((n, f) => n + f.tris.length, 0)).toBe(12);
  });

  it('a box with a cylinder Hole grouped in it: flat faces plus one ruled face naming the cylinder', () => {
    const d = createWaffleDesign();
    const b = addShape(d, primitiveShape('box', { x: 0, z: 0, w: 40, d: 40 }, 20));
    const c = addShape(d, primitiveShape('cylinder', { x: 0, z: 0, w: 16, d: 16 }, 40));
    setHole(d, [c], true);
    groupShapes(d, [b, c]);
    const fs = solidFaces(k, d.sculpt!);
    const ruled = fs.filter((f) => f.kind === 'ruled');
    expect(ruled).toHaveLength(1);
    expect(ruled[0].shapeId).toBe(c);
    expect(fs.filter((f) => f.kind === 'flat').every((f) => f.shapeId === b)).toBe(true);
    expect(fs.filter((f) => f.kind === 'flat')).toHaveLength(6);
    expect(fs.some((f) => f.kind === 'curved')).toBe(false);
  });

  it('a sphere gives a curved face and foldable lists it', () => {
    const d = createWaffleDesign();
    const sp = addShape(d, primitiveShape('sphere', { x: 0, z: 0, w: 30, d: 30 }, 30));
    addShape(d, primitiveShape('box', { x: 60, z: 0, w: 20, d: 20 }, 20));
    const fs = solidFaces(k, d.sculpt!);
    const curved = fs.filter((f) => f.kind === 'curved');
    expect(curved).toHaveLength(1);
    expect(curved[0].shapeId).toBe(sp);
    expect(foldable(d.sculpt!)).toEqual({ ok: false, curved: [sp] });
  });

  it("an extrusion's straight walls are flat, its arc's wall ruled; a revolve of straight lines is ruled", () => {
    const d = createWaffleDesign();
    // a D: a straight side and a half circle
    const ex = addShape(d, sketchShape({ kind: 'floor' }, { pts: { a: { x: 0, y: -20 }, b: { x: 0, y: 20 } }, segs: { s: { a: 'a', b: 'b', k: 'line' }, r: { a: 'b', b: 'a', k: 'arc', bulge: 1 } }, order: ['s', 'r'] }, 'extrude', 10));
    const fs = solidFaces(k, d.sculpt!).filter((f) => f.shapeId === ex);
    expect(fs.filter((f) => f.kind === 'flat')).toHaveLength(3);
    expect(fs.filter((f) => f.kind === 'ruled')).toHaveLength(1);
    const d2 = createWaffleDesign();
    addShape(d2, sketchShape({ kind: 'upright', o: [0, 0, 0], ang: 0 }, [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 30 }, { x: 0, y: 30 }], 'revolve'));
    expect(foldable(d2.sculpt!).ok).toBe(true);
  });
});

describe('the Faces count', () => {
  it('facets: 12 on a cylinder gives a 12-sided prism whose volume matches the formula', () => {
    const d = createWaffleDesign();
    const c = addShape(d, { ...primitiveShape('cylinder', { x: 0, z: 0, w: 30, d: 30 }, 25), facets: 12 });
    const m = buildShape(k, d.sculpt!, c);
    const r = 15, n = 12;
    expect(m.volume()).toBeCloseTo((n / 2) * r * r * Math.sin((2 * Math.PI) / n) * 25, 6);
    expect(m.numVert()).toBe(24);
  });

  it("an extrusion's arcs are cut into that many pieces per quarter turn; the field is checked on load", () => {
    const d = createWaffleDesign();
    const sk = { pts: { a: { x: -10, y: 0 }, b: { x: 10, y: 0 } }, segs: { u: { a: 'a', b: 'b', k: 'arc' as const, bulge: 1 }, v: { a: 'b', b: 'a', k: 'arc' as const, bulge: 1 } }, order: ['u', 'v'] };
    const e = addShape(d, { ...sketchShape({ kind: 'floor' }, sk, 'extrude', 10), facets: 3 });
    // a circle in 3 pieces per quarter: a 12-gon
    expect(buildShape(k, d.sculpt!, e).numVert()).toBe(24);
    const bad = JSON.parse(JSON.stringify(d)) as Design;
    bad.sculpt!.shapes[e].facets = 200;
    (bad as unknown as { outcome: string }).outcome = 'paper';
    checkSculpt(bad);
    expect(bad.sculpt!.shapes[e].facets).toBeUndefined();
    expect(bad.outcome).toBeUndefined();
  });
});
