// Findings of the exploratory test report (22 November 2026) that the model can show.
import { beforeAll, describe, expect, it } from 'vitest';
import { kernel, type Kernel } from '../src/sculpt/kernel';
import { addShape, createWaffleDesign, groupShapes, primitiveShape } from '../src/sculpt/ops';
import { shapePolyhedron } from '../src/sculpt/polyhedron';
import { reassemble } from '../src/model/reassemble';
import { nest } from '../src/model/nest';
import { pack, pieceCopies, placedRect } from '../src/model/pack';
import { MATERIALS } from '../src/model/materials';
import type { Design } from '../src/model/types';

const PLY = MATERIALS[3];
let k: Kernel;
beforeAll(async () => {
  k = await kernel();
});

/** Pairs of copies whose boxes overlap on a sheet. */
function overlaps(d: Design): string[] {
  const copies = pieceCopies(d);
  const P = pack(d, copies);
  const rects = copies.map((c) => ({ key: c.key, r: placedRect(P[c.key], c.w, c.h) }));
  const out: string[] = [];
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i].r, b = rects[j].r;
      if (a.sheet === b.sheet && a.x0 < b.x1 - 0.01 && b.x0 < a.x1 - 0.01 && a.y0 < b.y1 - 0.01 && b.y0 < a.y1 - 0.01) out.push(`${rects[i].key}×${rects[j].key}`);
    }
  return out;
}

describe('finding 2: boards made again are laid out again', () => {
  it('a Nest, then Build from boards again with fewer faces: no board keeps a place from before', () => {
    const d = createWaffleDesign(PLY);
    d.id = 'exploratory-2';
    const ids = [addShape(d, primitiveShape('box', { x: 0, z: 0, w: 120, d: 90 }, 60)), addShape(d, { ...primitiveShape('cylinder', { x: 0, z: 0, w: 40, d: 40 }, 60), hole: true })];
    groupShapes(d, ids);
    reassemble(d, shapePolyhedron(k, d.sculpt!, 8), { as: 'boards' });
    d.placements = nest(d);
    expect(Object.keys(d.placements).length).toBeGreaterThan(0);
    reassemble(d, shapePolyhedron(k, d.sculpt!, 4), { as: 'boards' });
    expect(Object.values(d.placements).filter((p) => p.nested)).toEqual([]);
    expect(overlaps(d)).toEqual([]);
  });
});
