import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FONTS, registerFont } from '../src/text/fonts';
import { batchExport } from '../src/export/batch';
import { addRootPanel, createDesign, growPanel } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { sheetsToSvg } from '../src/export/svg';
import { sheetsToDxf } from '../src/export/dxf';
import { contourBBox } from '../src/geom/vec';

beforeAll(() => {
  const buf = (f: string) => {
    const b = readFileSync(`public/fonts/${f}`);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  };
  for (const f of FONTS) registerFont(f.id, buf(`${f.file}-hebrew-400-normal.woff`), buf(`${f.file}-latin-400-normal.woff`));
});

function box(m = MATERIALS[3], q = 1) {
  const d = createDesign(m);
  const b = addRootPanel(d, 0, 0, 90, 60);
  growPanel(d, b, 0, { height: 40, angle: 90, dir: 'up', kind: m.kind === 'plywood' ? 'finger' : 'fold' });
  d.pieces[b].quantity = q;
  return d;
}

describe('teacher batching', () => {
  it('packs two students’ pieces onto shared sheets with name labels on the guide layer', () => {
    const r = batchExport([
      { id: 's1', label: 'נועה כהן', design: box(MATERIALS[3], 2) },
      { id: 's2', label: 'Dan', design: box() },
    ]);
    if ('error' in r) throw new Error(r.error);
    const outers = r.sheets.flatMap((s) => s.contours.filter((c) => c.role === 'outer'));
    expect(outers).toHaveLength(3 + 2); // base ×2 + wall, and base + wall
    const guides = r.sheets.flatMap((s) => s.contours.filter((c) => c.op === 'guide'));
    expect(guides.length).toBeGreaterThan(6);
    // every label lies inside its piece
    for (const s of r.sheets)
      for (const g of s.contours.filter((c) => c.op === 'guide')) {
        const piece = s.contours.find((c) => c.role === 'outer' && c.ref?.pieceKey === g.ref?.pieceKey)!;
        const a = contourBBox(g.contour), b = contourBBox(piece.contour);
        expect(a.minX).toBeGreaterThanOrEqual(b.minX);
        expect(a.maxX).toBeLessThanOrEqual(b.maxX);
      }
    expect(sheetsToSvg(r.sheets)).toContain('id="GUIDE"');
    expect(sheetsToDxf(r.sheets)).toContain('\nGUIDE\n');
  });
  it('refuses mixed materials', () => {
    expect(batchExport([
      { id: 's1', label: 'A', design: box(MATERIALS[3]) },
      { id: 's2', label: 'B', design: box(MATERIALS[1]) },
    ])).toEqual({ error: 'mixed' });
  });
});
