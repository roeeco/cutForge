// Milestone 121 (Shapes R2): flat-faced shapes (wedge, roof, diamond, taper, hull) and the workplane.
import { beforeAll, describe, expect, it } from 'vitest';
import { kernel, type Kernel } from '../src/sculpt/kernel';
import { addShape, createWaffleDesign, hullShapes, primitiveShape, type Primitive } from '../src/sculpt/ops';
import { solidFaces } from '../src/sculpt/faces';
import { shapePolyhedron } from '../src/sculpt/polyhedron';
import { dropOffset, upTo } from '../src/sculpt/workplane';
import { planeAxes } from '../src/sculpt/ui/commands';
import { qRot } from '../src/sculpt/xform';
import { parseProject, serializeProject } from '../src/model/serialize';
import { createDesign } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { reassemble } from '../src/model/reassemble';
import { buildPieces } from '../src/model/pieces';
import type { V3 } from '../src/model/types';

let k: Kernel;
beforeAll(async () => {
  k = await kernel();
});

const one = (kind: Primitive, w = 60, h = 40, d = 50, patch = {}) => {
  const d0 = createWaffleDesign();
  const id = addShape(d0, { ...primitiveShape(kind, { x: 0, z: 0, w, d }, h), ...patch });
  return { d: d0, id };
};

describe('faces of the new shapes (faces.ts)', () => {
  it.each([['wedge', 5], ['roof', 5], ['gem', 17]] as const)('a %s: every face flat, all its own', (kind, n) => {
    const { d, id } = one(kind);
    const fs = solidFaces(k, d.sculpt!);
    expect(fs).toHaveLength(n);
    expect(fs.every((f) => f.kind === 'flat' && f.shapeId === id)).toBe(true);
  });
  it('a tapered box (a frustum): 6 flat faces', () => {
    const { d } = one('box', 60, 40, 60, { taper: [0.6, 0.6] });
    const fs = solidFaces(k, d.sculpt!);
    expect(fs).toHaveLength(6);
    expect(fs.every((f) => f.kind === 'flat')).toBe(true);
  });
});

describe('their face graphs', () => {
  it('an 8-sided diamond: 17 faces, a table, 8 crown and 8 pavilion faces', () => {
    const { d, id } = one('gem', 60, 45, 60);
    const P = shapePolyhedron(k, d.sculpt!);
    const keys = Object.keys(P.faces).map((x) => x.slice(id.length + 1)).sort();
    expect(keys).toHaveLength(17);
    expect(keys).toContain('table');
    expect(keys.filter((x) => x.startsWith('crown'))).toHaveLength(8);
    expect(keys.filter((x) => x.startsWith('pavilion'))).toHaveLength(8);
    expect(new Set(keys).size).toBe(17);
  });
  it('a wedge and a roof name their slopes', () => {
    const w = one('wedge');
    expect(Object.keys(shapePolyhedron(k, w.d.sculpt!).faces).map((x) => x.slice(w.id.length + 1)).sort()).toEqual(['+x', '-x', '-z', 'bottom', 'slope']);
    const r = one('roof');
    expect(Object.keys(shapePolyhedron(k, r.d.sculpt!).faces).map((x) => x.slice(r.id.length + 1)).sort()).toEqual(['+x', '-x', 'bottom', 'slopeBack', 'slopeFront']);
  });
  it('a gem as the hull of a prism and a pyramid under it: one flat-faced body, keyed by the hull', () => {
    const d = createWaffleDesign();
    const a = addShape(d, primitiveShape('prism', { x: 0, z: 0, w: 60, d: 60, y: 30 }, 10));
    const b = addShape(d, { ...primitiveShape('pyramid', { x: 0, z: 0, w: 60, d: 60 }, 30), q: [1, 0, 0, 0], at: [0, 30, 0] });
    const g = hullShapes(d, [a, b])!;
    const P = shapePolyhedron(k, d.sculpt!);
    expect(Object.keys(P.faces).length).toBeGreaterThan(8);
    expect(Object.keys(P.faces).every((x) => x.startsWith(`${g}:h`))).toBe(true);
    expect(P.issues).toEqual([]);
  });
  it('a tapered planter keeps its keys and folds from card in one click', () => {
    const { d } = one('prism', 80, 60, 80, { taper: [1.3, 1.3] });
    const P = shapePolyhedron(k, d.sculpt!);
    expect(Object.keys(P.faces)).toHaveLength(8);
    const dd = createDesign(MATERIALS[0]);
    reassemble(dd, P, { as: 'fold' });
    expect(Object.values(dd.connections).every((c) => !c.broken)).toBe(true);
    expect(buildPieces(dd).length).toBeGreaterThan(0);
  });
  it('new fields survive a save and load; a bad one is dropped', () => {
    const { d, id } = one('gem', 60, 45, 60);
    d.sculpt!.shapes[id].taper = [5, -1];
    const back = parseProject(serializeProject(d));
    expect(back.sculpt!.shapes[id].crown).toBe(d.sculpt!.shapes[id].crown);
    expect(back.sculpt!.shapes[id].table).toBe(0.55);
    expect(back.sculpt!.shapes[id].taper).toBeUndefined();
  });
});

describe('the workplane', () => {
  it('a shape placed on it stands on it: its up turned onto the normal', () => {
    for (const n of [[0, 1, 0], [1, 0, 0], [0, 0, -1], [0, -1, 0], [0.6, 0.8, 0]] as V3[]) {
      const up = qRot(upTo(n), [0, 1, 0]);
      for (let i = 0; i < 3; i++) expect(up[i]).toBeCloseTo(n[i], 9);
    }
  });
  it('D drops a raised box onto it', () => {
    const { d, id } = one('box', 40, 20, 40);
    d.sculpt!.shapes[id].at = [0, 35, 0];
    expect(dropOffset(d, [id], { o: [0, 10, 0], n: [0, 1, 0] })).toEqual([-0, -25, -0]);
    // a sloped plane: the box's lowest corner comes to it
    const off = dropOffset(d, [id], { o: [0, 0, 0], n: [Math.SQRT1_2, Math.SQRT1_2, 0] })!;
    expect(off[0]).toBeCloseTo(off[1], 9);
  });
  it('its axes lie in it', () => {
    const [u, v] = planeAxes([0, 0, 1]);
    expect(u[2]).toBeCloseTo(0, 9);
    expect(v[2]).toBeCloseTo(0, 9);
    expect(Math.abs(u[0] * v[0] + u[1] * v[1] + u[2] * v[2])).toBeLessThan(1e-9);
  });
});
