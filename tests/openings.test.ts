// Milestone 130 (Shapes R11): openings, and a lid by a cut.
import { beforeAll, describe, expect, it } from 'vitest';
import { kernel, type Kernel } from '../src/sculpt/kernel';
import { addShape, createWaffleDesign, primitiveShape } from '../src/sculpt/ops';
import { shapePolyhedron, splitPolyhedra } from '../src/sculpt/polyhedron';
import { mergePoly, movePoly, polyBounds } from '../src/model/polyhedron';
import { reassemble } from '../src/model/reassemble';
import { buildPieces, netOverlaps } from '../src/model/pieces';
import { MATERIALS } from '../src/model/materials';
import { setMaterial } from '../src/model/ops';
import { toWorld } from '../src/model/frame';
import type { Design } from '../src/model/types';

let k: Kernel;
beforeAll(async () => {
  k = await kernel();
});

function cube(s = 60, m = MATERIALS[0]): { d: Design; id: string } {
  const d = createWaffleDesign(m);
  const id = addShape(d, primitiveShape('box', { x: 0, z: 0, w: s, d: s }, s));
  return { d, id };
}

/** Each board's extent in world y. */
const ys = (d: Design, id: string) => {
  const p = d.panels[id];
  const pts = [[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]].map(([u, v]) => toWorld(p.frame, u, v)[1]);
  return [Math.min(...pts), Math.max(...pts)];
};

describe('openings', () => {
  it('a cube with its top open folds as an open box: five boards, one piece, no flap round the opening', () => {
    const { d, id } = cube();
    const P = shapePolyhedron(k, d.sculpt!);
    reassemble(d, P, { as: 'fold', open: [`${id}:top`] });
    expect(d.order).toHaveLength(5);
    expect(d.panels[`f:${id}:top`]).toBeUndefined();
    expect(buildPieces(d)).toHaveLength(1);
    expect(Object.values(d.connections).filter((c) => c.kind === 'glue' || c.kind === 'lock')).toHaveLength(4);
    expect(netOverlaps(d, 1, undefined, true)).toEqual([]);
  });

  it('in plywood, an open top takes its four corners with it', () => {
    const { d, id } = cube(60, MATERIALS[3]);
    reassemble(d, shapePolyhedron(k, d.sculpt!), { as: 'boards', open: [`${id}:top`] });
    expect(d.order).toHaveLength(5);
    expect(Object.keys(d.connections)).toHaveLength(8);
  });
});

describe('a lid by a cut', () => {
  const lidded = (m = MATERIALS[0], as: 'fold' | 'boards' = 'fold') => {
    const { d } = cube(60, m);
    const P0 = shapePolyhedron(k, d.sculpt!);
    const b = polyBounds(P0);
    const parts = splitPolyhedra(k, d.sculpt!, b.max[1] - 20)!;
    const P = mergePoly(parts.box, movePoly(parts.lid, [b.max[0] - b.min[0] + 20, -(b.max[1] - 20), 0]));
    reassemble(d, P, { as, open: ['cut', 'lid/cut'], lid: 20 });
    return { d, P };
  };

  it('splits a cube 20 mm below its top into a box and a lid, each open at the cut', () => {
    const { P } = lidded();
    expect(P.faces.cut).toBeTruthy();
    expect(P.faces['lid/cut']).toBeTruthy();
    // 5 faces and the cut each
    expect(Object.keys(P.faces).filter((x) => !x.startsWith('lid/'))).toHaveLength(6);
    expect(Object.keys(P.faces).filter((x) => x.startsWith('lid/'))).toHaveLength(6);
  });

  it('card: a 40 mm box and a 20 mm lid beside it, the same outside size (they fit within 0.5 mm), a hem round the lid', () => {
    const { d } = lidded();
    const box = d.order.filter((id) => !id.startsWith('f:lid/')), lid = d.order.filter((id) => id.startsWith('f:lid/'));
    expect(box).toHaveLength(5);
    expect(lid).toHaveLength(5);
    const boxTop = Math.max(...box.map((id) => ys(d, id)[1])), lidTop = Math.max(...lid.map((id) => ys(d, id)[1]));
    expect(boxTop).toBeCloseTo(40, 6);
    expect(lidTop).toBeCloseTo(20, 6);
    // the same outline at the cut
    const w = (ids: string[]) => {
      const xs = ids.flatMap((id) => { const p = d.panels[id]; return [[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]].map(([u, v]) => toWorld(p.frame, u, v)[0]); });
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(Math.abs(w(box) - w(lid))).toBeLessThan(0.5);
    // four hems round the lid's rim
    expect(lid.reduce((n, id) => n + (d.panels[id].edgeFlaps?.length ?? 0), 0)).toBe(4);
    expect(buildPieces(d).length).toBe(2);
  });

  it('plywood: a box and a lid, each with its corners joined', () => {
    const { d } = lidded(MATERIALS[3], 'boards');
    expect(d.order).toHaveLength(10);
    expect(Object.values(d.connections).every((c) => !c.broken)).toBe(true);
    expect(Object.keys(d.connections)).toHaveLength(16);
  });
});
