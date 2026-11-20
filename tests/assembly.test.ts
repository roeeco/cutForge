// Milestone 131 (Shapes R12): assembly — the order a made model's seams close, their
// numbers on the plan (each flap and its partner edge), and the spec sheet's list.
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { reassemble } from '../src/model/reassemble';
import { assemblySteps } from '../src/model/assembly';
import { annotations } from '../src/export/annotate';
import { pieceCopies } from '../src/model/pack';
import { specPages, type SpecText } from '../src/export/spec';
import { boxSolid, houseSolid } from './solids';
import type { Design } from '../src/model/types';

function made(P = houseSolid(), m = MATERIALS[0], as: 'fold' | 'boards' = 'fold', open?: string[]): Design {
  const d = createDesign(m);
  d.id = 'steps';
  d.kind = 'waffle';
  d.sculpt = { shapes: {}, order: [] };
  reassemble(d, P, { as, ...(open ? { open } : {}) });
  return d;
}

describe('assembly steps', () => {
  it('the house: every cut seam once, numbered 1…n, the roof that closes last at the end', () => {
    const d = made();
    const steps = assemblySteps(d);
    const seams = Object.values(d.connections).filter((c) => c.src && c.kind !== 'fold');
    expect(steps).toHaveLength(seams.length);
    expect(steps.map((s) => s.n)).toEqual(steps.map((_, i) => i + 1));
    expect(new Set(steps.map((s) => s.conn)).size).toBe(steps.length);
    // the face that closes last (the largest facing up: a roof slope) has its seams at the end
    const touches = steps.map((s) => [s.a, s.b].some((id) => id.includes('roof')));
    const firstRoof = touches.indexOf(true);
    expect(firstRoof).toBeGreaterThanOrEqual(0);
    expect(touches.slice(firstRoof).every(Boolean)).toBe(true);
  });

  it('an open box closes round its opening last', () => {
    const P = boxSolid(60, 60, 60);
    const d = made(P, MATERIALS[0], 'fold', ['box:top']);
    const steps = assemblySteps(d);
    expect(steps.length).toBe(4);
  });

  it('a plywood box: its corners in order, the lid board last', () => {
    const d = made(boxSolid(80, 60, 70), MATERIALS[3], 'boards');
    const steps = assemblySteps(d);
    expect(steps).toHaveLength(12);
    expect(steps.slice(-4).every((s) => s.a.endsWith(':top') || s.b.endsWith(':top'))).toBe(true);
  });

  it('each seam number is on the plan twice: on its flap and at its partner edge', () => {
    const d = made();
    const n = assemblySteps(d).length;
    const nums = pieceCopies(d).flatMap((c) => annotations(d, c, (id) => id).filter((a) => a.kind === 'seam').map((a) => a.text));
    for (let k = 1; k <= n; k++) expect(nums.filter((x) => x === String(k))).toHaveLength(2);
  });

  it('the printed plan lists the seams in order', () => {
    const d = made();
    const tx: SpecText = { title: 't', date: 'd', material: 'm', blank: 'b', pieces: 'p', glue: 'g', kerf: 'k', scale: '1:{n}', legend: { cut: 'c', score: 's', engrave: 'e', guide: 'g' }, glueWord: 'glue', unit: 'mm', name: (id) => id, seams: () => `Seams: ${assemblySteps(d).map((s) => s.n).join(' · ')}` };
    const pages = specPages(d, 'A4', tx);
    expect(pages[0].svg).toContain(`Seams: 1 · 2`);
  });
});
