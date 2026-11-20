// Milestone 129 (Shapes R10): linked to the shape. What the student did on a made model is
// carried across a remake by key; what has no face or edge left is listed; Detach unlinks.
import { describe, expect, it } from 'vitest';
import { createDesign, solve, setConnection } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { detach, reassemble } from '../src/model/reassemble';
import { houseSolid } from './solids';
import type { Design } from '../src/model/types';

const CARD = MATERIALS[0];

function madeHouse(): Design {
  const d = createDesign(CARD);
  d.id = 'linked';
  d.kind = 'waffle';
  d.sculpt = { shapes: {}, order: [] };
  reassemble(d, houseSolid(), { as: 'fold' });
  return d;
}

describe('linked to the shape', () => {
  it('a slit lock, a cut edge and a text on the house are kept when it grows 20 mm taller', () => {
    const d = madeHouse();
    const cs = Object.values(d.connections);
    // a seam the student made a slit lock (on the joint card), a fold they cut, a text on the front wall
    const glue = cs.find((c) => c.kind === 'glue' && c.src!.includes('house:+z'))!;
    setConnection(d, glue.id, { kind: 'lock' });
    expect(d.connections[glue.id].picked).toBe(true);
    const fold = cs.find((c) => c.kind === 'fold' && c.src)!;
    d.connections[fold.id].cut = 'cut';
    const front = d.panels['f:house:+z'];
    front.details.push({ id: 't1', shape: 'text', op: 'engrave', cx: 40, cy: 20, w: 30, h: 8, text: { value: 'HOME', font: 'sans', size: 8 } });
    solve(d);
    const lockEdge = glue.src!, cutEdge = fold.src!;
    const r = reassemble(d, houseSolid('house', 70), { ...d.make!, as: 'fold' });
    expect(r.lost).toEqual({ faces: [], edges: [] });
    const after = Object.values(d.connections);
    expect(after.find((c) => c.src === lockEdge)!.kind).toBe('lock');
    expect(after.find((c) => c.src === cutEdge)!.kind).not.toBe('fold');
    expect(d.panels['f:house:+z'].details.map((x) => x.text?.value)).toEqual(['HOME']);
    // the walls really are taller
    expect(d.panels['f:house:+z'].h).toBeGreaterThan(front.h + 15);
  });

  it('deleting the roof keeps everything still there and lists the rest', () => {
    const d = madeHouse();
    d.panels['f:house:roofFront'].details.push({ id: 'r1', shape: 'rect', op: 'engrave', cx: 20, cy: 10, w: 10, h: 5 });
    d.panels['f:house:+z'].details.push({ id: 'w1', shape: 'circle', op: 'cut', cx: 40, cy: 25, w: 10, h: 10 });
    const roofSeam = Object.values(d.connections).find((c) => c.src?.includes('roofFront') && c.kind !== 'fold')!;
    setConnection(d, roofSeam.id, { kind: 'lock' });
    const r = reassemble(d, houseSolid('house', 50, 0), { ...d.make!, as: 'fold' });
    expect(r.lost!.faces).toEqual(['house:roofFront']);
    expect(r.lost!.edges).toEqual([roofSeam.src]);
    expect(d.panels['f:house:+z'].details.map((x) => x.id)).toEqual(['w1']);
    expect(d.make!.joints?.[roofSeam.src!]).toBeUndefined();
  });

  it('Detach leaves a plain box design; the boards and seams stay', () => {
    const d = madeHouse();
    const before = JSON.stringify(Object.values(d.connections).map((c) => [c.kind, c.seam]));
    detach(d);
    expect(d.kind).toBeUndefined();
    expect(d.make).toBeUndefined();
    expect(d.sculpt).toBeUndefined();
    expect(d.order.every((id) => !d.panels[id].src)).toBe(true);
    solve(d);
    expect(JSON.stringify(Object.values(d.connections).map((c) => [c.kind, c.seam]))).toBe(before);
    expect(Object.values(d.connections).every((c) => !c.broken)).toBe(true);
  });
});
