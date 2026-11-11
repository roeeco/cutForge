// A folded wall whose parent edge a cut removes completely crashes the export: buildPieces ->
// netFolds -> foldXform -> edgeLocal(parent, edge) throws "no edge e2" (pieces.ts:51 / frame.ts).
// prepareExport, validate (sheetIssues) and the Quick build sheet meter all go through it.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../../src/model/materials';
import { addDetail, addPolygonPanel, addRootPanel, createDesign, growPanel, regularPolygon, solve } from '../../src/model/ops';
import { prepareExport } from '../../src/export/prepare';
import { validate } from '../../src/model/validate';

describe('repro: fold wall on an edge that a cut removes', () => {
  it('corrugated heptagon, fold wall on e2, a cut over the whole edge', () => {
    const d = createDesign(MATERIALS[1]); // corr-1.6
    const base = addPolygonPanel(d, 0, 0, regularPolygon(7, 92.81))!;
    growPanel(d, base, 2, { height: 110, angle: 90, dir: 'up', kind: 'fold' });
    addDetail(d, base, 'rect', 'cut', 65.02, -2.3, 113.23, 110.45);
    addDetail(d, base, 'rect', 'cut', 160.28, 99.13, 86.04, 94.76);
    solve(d);
    expect(() => validate(d)).not.toThrow();
    expect(() => prepareExport(d)).not.toThrow(); // actual: Error: no edge e2
  });
  it('card rectangle, fold wall on e0, a cut across the whole bottom edge', () => {
    const d = createDesign(MATERIALS[0]);
    const base = addRootPanel(d, 0, 0, 100, 80);
    growPanel(d, base, 0, { height: 30, angle: 90, dir: 'up', kind: 'fold' });
    addDetail(d, base, 'rect', 'cut', 50, 0, 120, 10); // wider than the panel, centred on e0
    solve(d);
    expect(() => prepareExport(d)).not.toThrow();
  });
});
