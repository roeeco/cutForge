// Milestone 54: the assembly steps and the waffle's picture.
import { beforeAll, describe, expect, it } from 'vitest';
import { kernel } from '../src/sculpt/kernel';
import { addShape, createWaffleDesign, primitiveShape } from '../src/sculpt/ops';
import { deriveWaffle } from '../src/waffle/derive';
import { waffleParts } from '../src/waffle/pieces';
import { assemblySteps, labelRange } from '../src/waffle/steps';
import { waffleThumbSvg } from '../src/waffle/thumb';

beforeAll(async () => {
  await kernel();
});

function sphere(base: boolean) {
  const d = createWaffleDesign();
  addShape(d, primitiveShape('sphere', { x: 0, z: 0, w: 140, d: 140 }, 140));
  d.waffle = { turn: 0, a: { spacing: { by: 'count', n: 4 } }, b: { spacing: { by: 'count', n: 3 } }, ...(base ? { base: { shape: 'round' as const, margin: 10, flat: 20 } } : {}) };
  return d;
}

describe('assembly steps', () => {
  it('the plate, then the A slices standing, then the B slices dropped over the A slices they cross', async () => {
    const d = sphere(true);
    const k = await kernel();
    const s = assemblySteps(deriveWaffle(k, d), waffleParts(d));
    expect(s.map((x) => (x.kind === 'plate' ? 'plate' : x.label))).toEqual(['plate', 'A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3']);
    const b2 = s.find((x) => x.kind === 'b' && x.label === 'B2');
    expect(b2 && b2.kind === 'b' && b2.over).toBe('A1–A4');
    expect(assemblySteps(deriveWaffle(k, sphere(false)), waffleParts(sphere(false)))[0]).toEqual({ kind: 'a', sliceId: 'a1', label: 'A1' });
  });
  it('label ranges', () => {
    expect(labelRange(['A3', 'A1', 'A2'])).toBe('A1–A3');
    expect(labelRange(['A1', 'A3'])).toBe('A1, A3');
    expect(labelRange(['B2'])).toBe('B2');
  });
});

describe('thumbnail', () => {
  it('draws every part and the plate, back to front', () => {
    const d = sphere(true);
    const svg = waffleThumbSvg(d)!;
    expect(svg.startsWith('<?xml')).toBe(true);
    expect((svg.match(/<path /g) ?? []).length).toBe(waffleParts(d).parts.length + 1);
  });
});
