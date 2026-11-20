// QA repros: where new things appear (REPORT.md #2, B6). Fixed by milestone 139 (QA_FIX_PLAN.md Q5).
import { beforeAll, describe, expect, it } from 'vitest';
import { kernel } from '../../src/sculpt/kernel';
import { addShape, createWaffleDesign } from '../../src/sculpt/ops';
import { sketchShape, type SketchPlane } from '../../src/sculpt/sketch';
import { writeSketch } from '../../src/sculpt/session';
import { worldBox } from '../../src/sculpt/box';
import type { SketchGraph } from '../../src/model/types';

beforeAll(async () => {
  await kernel();
});

const floor: SketchPlane = { kind: 'floor' };
const square = (s: number): SketchGraph => ({
  pts: { a: { x: -s, y: -s }, b: { x: s, y: -s }, c: { x: s, y: s }, d: { x: -s, y: s } },
  segs: { ab: { a: 'a', b: 'b', k: 'line' }, bc: { a: 'b', b: 'c', k: 'line' }, cd: { a: 'c', b: 'd', k: 'line' }, da: { a: 'd', b: 'a', k: 'line' } },
  order: ['ab', 'bc', 'cd', 'da'],
} as unknown as SketchGraph);

describe('#2: a finished sketch is not made inside another shape', () => {
  it('a small square sketched in the middle of a box lands beside it', () => {
    const d = createWaffleDesign();
    const box = addShape(d, sketchShape(floor, [{ x: -30, y: -30 }, { x: 30, y: -30 }, { x: 30, y: 30 }, { x: -30, y: 30 }], 'extrude', 40));
    const id = writeSketch(d, { shapeId: null, plane: floor, mode: 'extrude', draft: square(5), heights: {}, into: null });
    const a = worldBox(d.sculpt!, box)!, b = worldBox(d.sculpt!, id)!;
    const meets = [0, 1, 2].every((i) => a.min[i] < b.max[i] - 1e-6 && b.min[i] < a.max[i] - 1e-6);
    expect(meets).toBe(false);
    // beside it, 10 mm clear along x
    expect(b.min[0]).toBeCloseTo(a.max[0] + 10, 3);
  });
});
