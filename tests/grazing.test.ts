// Milestone 25: when the gizmo ring is seen nearly edge-on.
import { describe, expect, it } from 'vitest';
import { GRAZING_DEG, grazingRing } from '../src/views/grazing';

const rad = (d: number) => (d * Math.PI) / 180;
/** A view direction `e` degrees out of the ring's plane (the ring's normal is z). */
const viewAt = (e: number): [number, number, number] => [Math.cos(rad(e)), 0, Math.sin(rad(e))];

describe('grazingRing', () => {
  it('is true within 20° of edge-on and false beyond', () => {
    expect(GRAZING_DEG).toBe(20);
    for (const e of [0, 5, 19.5, -19.5]) expect(grazingRing([0, 0, 1], viewAt(e))).toBe(true);
    for (const e of [25, -25, 60, 90]) expect(grazingRing([0, 0, 1], viewAt(e))).toBe(false);
  });

  it("does not depend on the vectors' lengths or the normal's sign", () => {
    expect(grazingRing([0, 0, -3], viewAt(10).map((x) => x * 7) as [number, number, number])).toBe(true);
    expect(grazingRing({ x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: -1 })).toBe(false);
    expect(grazingRing([0, 0, 0], viewAt(0))).toBe(false);
  });
});
