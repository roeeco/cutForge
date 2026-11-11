// Kerf-compensated export is refused for any card/corrugated piece with a fold on a sloped edge:
// the fold strip's 1e-5 overlap (pieces.ts) leaves micro-segments (~2e-8 .. 6e-6 mm) in the outline,
// and offsetContour rejects a segment that vanishes at a concave corner instead of dropping it.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../../src/model/materials';
import { addPolygonPanel, createDesign, growPanel, regularPolygon } from '../../src/model/ops';
import { prepareExport } from '../../src/export/prepare';
import { pieceCopies } from '../../src/model/pack';
import { MISSIONS, startMission } from '../../src/easy/missions';

describe('repro: kerf compensation on folded polygon walls', () => {
  it('a card triangle with one folded wall exports compensated', () => {
    const d = createDesign(MATERIALS[0]); // card-0.5, kerf 0.1
    const base = addPolygonPanel(d, 0, 0, regularPolygon(3, 40))!;
    growPanel(d, base, 1, { height: 30, angle: 90, dir: 'up', kind: 'fold' });
    const outer = pieceCopies(d)[0].contours.find((c) => c.role === 'outer')!;
    const shortest = Math.min(...outer.contour.segs.map((s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)));
    expect.soft(shortest).toBeGreaterThan(1e-3); // actual: ~2e-8 mm
    expect(prepareExport(d, 'compensated').errors).toEqual([]); // actual: one error, export blocked
  });
  it('the Dice tray mission exports compensated in card', () => {
    const d = startMission(MISSIONS.find((m) => m.id === 'dice-tray')!, MATERIALS[0]);
    expect(prepareExport(d, 'compensated').errors).toEqual([]);
  });
});
