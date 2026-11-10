// Fuzz: teacher batching of random student designs.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadFonts, randomDesign, rng, seedMath } from './gen';
import { batchExport } from '../../src/export/batch';
import { pieceCopies } from '../../src/model/pack';
import { MATERIALS } from '../../src/model/materials';
import { contourBBox } from '../../src/geom/vec';
import { finiteContour, parseDxf, parseSvg } from './check';
import { sheetsToSvg } from '../../src/export/svg';
import { sheetsToDxf } from '../../src/export/dxf';
import { createDesign } from '../../src/model/ops';

const N = Number(process.env.FUZZ_N ?? 60);
beforeAll(loadFonts);

describe('fuzz: batchExport', () => {
  it('empty and mixed', () => {
    expect(batchExport([])).toEqual({ error: 'empty' });
    expect(batchExport([{ id: 'a', label: 'A', design: createDesign(MATERIALS[3]) }, { id: 'b', label: 'B', design: createDesign(MATERIALS[0]) }])).toEqual({ error: 'mixed' });
    // designs with no pieces at all
    const r = batchExport([{ id: 'a', label: 'A', design: createDesign(MATERIALS[3]) }]);
    expect('error' in r ? r.error : r.sheets.length).toBe(1);
  });
  it(`random batches (${N})`, () => {
    const fails: string[] = [];
    for (let s = 1; s <= N; s++) {
      const r = rng(9000 + s);
      seedMath(9000 + s);
      const n = r.int(1, 4);
      const items = [] as { id: string; label: string; design: ReturnType<typeof createDesign> }[];
      const mat = r.pick(MATERIALS);
      for (let k = 0; k < n; k++) {
        let d = randomDesign(r, { maxRoots: 2, materials: r.chance(0.3) }).d;
        if (d.material.id !== mat.id) {
          // keep one working material for the batch
          d = { ...d, material: { ...mat } };
        }
        items.push({ id: `s${k}`, label: r.pick(['Noa Cohen', 'דן', 'A', 'Very Long Student Name Here']), design: d });
      }
      let res;
      try {
        res = batchExport(items, r.chance(0.5) ? 'compensated' : 'nominal');
      } catch (e) {
        fails.push(`seed ${s}: throws ${String(e).slice(0, 200)}`);
        continue;
      }
      if ('error' in res) {
        fails.push(`seed ${s}: error ${res.error}`);
        continue;
      }
      const expectOuter = items.reduce((a, it) => a + pieceCopies(it.design).length, 0);
      const outers = res.sheets.flatMap((x) => x.contours.filter((c) => c.role === 'outer'));
      // fragments: each copy has exactly one outer
      if (outers.length !== expectOuter) fails.push(`seed ${s}: ${outers.length} outlines for ${expectOuter} copies`);
      for (const sh of res.sheets) {
        if (sh.contours.some((c) => !finiteContour(c.contour))) fails.push(`seed ${s}: non-finite`);
        // labels inside their piece
        for (const g of sh.contours.filter((c) => c.op === 'guide')) {
          const piece = sh.contours.find((c) => c.role === 'outer' && c.ref?.pieceKey === g.ref?.pieceKey);
          if (!piece) {
            fails.push(`seed ${s}: label without its piece on the sheet`);
            continue;
          }
          const a = contourBBox(g.contour), b = contourBBox(piece.contour);
          if (a.minX < b.minX - 1e-6 || a.maxX > b.maxX + 1e-6 || a.minY < b.minY - 1e-6 || a.maxY > b.maxY + 1e-6) fails.push(`seed ${s}: label outside its piece: label ${a.w.toFixed(2)}x${a.h.toFixed(2)} piece ${b.w.toFixed(2)}x${b.h.toFixed(2)}`);
        }
      }
      try {
        parseSvg(sheetsToSvg(res.sheets));
        parseDxf(sheetsToDxf(res.sheets));
      } catch (e) {
        fails.push(`seed ${s}: file ${e}`);
      }
    }
    expect(fails.slice(0, 20)).toEqual([]);
  }, 600_000);
});
