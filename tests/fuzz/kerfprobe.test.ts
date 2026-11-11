// Probe: which cut contours fail kerf compensation in random designs, and why.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadFonts, randomDesign, rng, seedMath } from './gen';
import { pieceCopies } from '../../src/model/pack';
import { offsetContour } from '../../src/export/offset';
import { contourArea, contourBBox, flattenContour, pointInPolygon } from '../../src/geom/vec';
import { profileOf } from '../../src/model/materials';

beforeAll(loadFonts);

const N = Number(process.env.FUZZ_N ?? 20);

/** Smallest distance between two non-adjacent edges of a polygon (a crude local feature size). */
function minFeature(pts: { x: number; y: number }[]): number {
  const n = pts.length;
  let best = Infinity;
  const segDist = (p: any, a: any, b: any) => {
    const vx = b.x - a.x, vy = b.y - a.y;
    const l2 = vx * vx + vy * vy || 1e-30;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
    return Math.hypot(p.x - a.x - vx * t, p.y - a.y - vy * t);
  };
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (Math.abs(i - j) <= 2 || Math.abs(i - j) >= n - 2) continue;
      best = Math.min(best, segDist(pts[i], pts[j], pts[(j + 1) % n]));
    }
  }
  return best;
}

describe('probe kerf failures', () => {
  it('classifies', () => {
    const rows: string[] = [];
    let fails = 0, total = 0, suspicious = 0;
    for (let s = 1; s <= N; s++) {
      const r = rng(s);
      seedMath(s);
      const { d } = randomDesign(r, { allowHuge: true });
      for (const c of pieceCopies(d)) {
        if (c.copy) continue;
        const kerf = profileOf(d, c.mat).kerf;
        const cuts = c.contours.filter((x) => x.op === 'cut' && x.contour.closed);
        const polys = cuts.map((x) => flattenContour(x.contour, 0.05));
        cuts.forEach((tc, i) => {
          total++;
          const depth = polys.filter((p, j) => j !== i && pointInPolygon(polys[i][0], p)).length;
          const grow = depth % 2 === 0;
          const res = offsetContour(tc.contour, grow ? kerf / 2 : -kerf / 2);
          if (res) return;
          fails++;
          const pts = flattenContour(tc.contour, 0.05);
          const bb = contourBBox(tc.contour);
          const mf = minFeature(flattenContour(tc.contour, 0.5));
          const sus = Math.min(bb.w, bb.h) > 4 * kerf && mf > 2 * kerf;
          if (sus) suspicious++;
          if (rows.length < 40 && sus) rows.push(`seed ${s} ${c.key} ${tc.role} grow=${grow} segs=${tc.contour.segs.length} bb=${bb.w.toFixed(2)}x${bb.h.toFixed(2)} minFeature=${mf.toFixed(3)} kerf=${kerf} detail=${tc.ref?.detailId ?? '-'} area=${contourArea(tc.contour).toFixed(2)} pts=${pts.length}`);
        });
      }
    }
    console.log(`kerf: ${fails}/${total} cut contours fail; ${suspicious} with feature size > kerf\n` + rows.join('\n'));
    expect(true).toBe(true);
  }, 600_000);
});
