// Probe: zero-area / near-zero cut contours in the pieces of random designs.
import { beforeAll, describe, expect, it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { loadFonts, randomDesign, rng, seedMath } from './gen';
import { pieceCopies } from '../../src/model/pack';
import { contourArea, contourBBox } from '../../src/geom/vec';
beforeAll(loadFonts);
const N = Number(process.env.FUZZ_N ?? 20);
describe('probe', () => {
  it('degenerate cut contours', () => {
    const hits: string[] = [];
    let total = 0;
    for (let s = 1; s <= N; s++) {
      const r = rng(s);
      seedMath(s);
      const { d, log } = randomDesign(r, { allowHuge: true });
      for (const c of pieceCopies(d)) {
        if (c.copy) continue;
        for (const tc of c.contours) {
          if (tc.op !== 'cut' || !tc.contour.closed) continue;
          total++;
          const a = Math.abs(contourArea(tc.contour)), b = contourBBox(tc.contour);
          if (a < 1e-3 || Math.min(b.w, b.h) < 1e-3) hits.push(`seed ${s} ${c.key} ${tc.role} area=${a.toExponential(2)} bbox=${b.w.toExponential(2)}x${b.h.toExponential(2)} segs=${tc.contour.segs.length} detail=${tc.ref?.detailId ?? '-'}`);
        }
      }
    }
    if (process.env.OUT) appendFileSync(process.env.OUT, `${hits.length}/${total}\n` + hits.join('\n') + '\n');
    expect(hits).toEqual([]);
  }, 900_000);
});
