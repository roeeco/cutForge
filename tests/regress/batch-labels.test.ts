// BUGFIX_PLAN B21: teacher batch name labels fit their piece both ways, or are left out.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadFonts } from '../fuzz/gen';
import { MATERIALS } from '../../src/model/materials';
import { addRootPanel, createDesign } from '../../src/model/ops';
import { batchExport } from '../../src/export/batch';
import { contourBBox } from '../../src/geom/vec';

beforeAll(loadFonts, 60_000);

const one = (w: number, h: number, label: string) => {
  const d = createDesign(MATERIALS[3]);
  addRootPanel(d, 0, 0, w, h);
  const r = batchExport([{ id: 's', label, design: d }]);
  if ('error' in r) throw new Error(r.error);
  const cs = r.sheets.flatMap((s) => s.contours);
  const outer = cs.find((c) => c.role === 'outer')!;
  return { piece: contourBBox(outer.contour), labels: cs.filter((c) => c.op === 'guide').map((c) => contourBBox(c.contour)) };
};
const inside = (a: ReturnType<typeof contourBBox>, b: ReturnType<typeof contourBBox>) => a.minX >= b.minX - 1e-6 && a.maxX <= b.maxX + 1e-6 && a.minY >= b.minY - 1e-6 && a.maxY <= b.maxY + 1e-6;

describe('batch labels', () => {
  it('a 1.68 x 1.22 mm piece gets no label (or one inside it)', () => {
    const { piece, labels } = one(1.68, 1.22, 'Noa Cohen');
    for (const l of labels) expect(inside(l, piece)).toBe(true);
  });
  it('a 12 x 6 mm piece with a long name: the label stays inside it', () => {
    const { piece, labels } = one(12, 6, 'Very Long Student Name Here');
    for (const l of labels) expect(inside(l, piece)).toBe(true);
  });
  it('a 100 x 60 piece is labelled inside', () => {
    const { piece, labels } = one(100, 60, 'דן');
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) expect(inside(l, piece)).toBe(true);
  });
});
