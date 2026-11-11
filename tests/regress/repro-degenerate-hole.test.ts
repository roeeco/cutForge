// A zero-area hole (3 points within 2.4e-7 mm) is exported as a cut path. Design: fuzz generator
// seed 89 (ply-3 base 195.6 x 223.0 made a tray 91.9 high, two large cut stickers crossing its
// edges, then switched to corr-4). ownOutline's polygon-clipping difference leaves a sliver ring
// that neither outline.ts (pts.length < 3 only) nor pieces.ts ringContours / cleanPolygon
// (1e-9 duplicate tolerance) drops.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadFonts, randomDesign, rng, seedMath } from '../bugs-output/gen';
import { pieceCopies } from '../../src/model/pack';
import { contourArea } from '../../src/geom/vec';

beforeAll(loadFonts);

describe('repro: degenerate hole', () => {
  it('seed 89', () => {
    seedMath(89);
    const { d } = randomDesign(rng(89), { allowHuge: true });
    const tiny = pieceCopies(d).flatMap((c) => c.contours).filter((tc) => tc.op === 'cut' && tc.contour.closed && Math.abs(contourArea(tc.contour)) < 1e-6);
    expect(tiny).toEqual([]); // actual: one hole of area 1.1e-13 mm²
  });
});
