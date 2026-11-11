// The bend test (milestone 47, CURVED_WALLS.md §5.5): a strip with five
// zones patterned for radii around the material's calibrated limit, each a
// quarter turn long, with plain stretches between them and each zone's radius
// on the GUIDE layer. Wrap it round cans or bottles and enter the tightest
// radius that held in the material drawer, as with the kerf test cut.
import type { MaterialProfile } from '../model/types';
import type { TaggedContour } from '../geom/types';
import { L, polygonContour, xformContour } from '../geom/vec';
import { bendOf } from '../model/materials';
import { testStyle, zoneLines } from '../model/bendPattern';
import { pieceLabel } from './label';
import type { PreparedSheet } from './prepare';

/** The radii a material's bend test tries: around its limit with its pattern. */
export function testRadii(m: MaterialProfile): number[] {
  const R = bendOf(m).patternR;
  return [0.7, 0.85, 1, 1.25, 1.6].map((k) => Math.max(1, Math.round(R * k * 2) / 2));
}

/** The bend test strip as one sheet, ready for the SVG or DXF writer. `label(r)` names a zone. */
export function bendTestSheet(m: MaterialProfile, label: (r: number) => string): PreparedSheet {
  const H = 40, gap = 15, margin = 10;
  const radii = testRadii(m);
  const style = testStyle(m);
  const contours: TaggedContour[] = [];
  let x = gap;
  for (const r of radii) {
    const len = (Math.PI / 2) * r;
    const z = zoneLines(m, style, r, x, len, H);
    for (const s of z.scores) contours.push({ op: 'score', role: 'line', contour: { closed: false, segs: [L(s.a, s.b)] } });
    for (const s of z.cuts) contours.push({ op: 'cut', role: 'line', contour: { closed: false, segs: [L(s.a, s.b)] } });
    // the zone's radius above it
    const lw = Math.max(12, len);
    for (const g of pieceLabel(label(r), lw, 8)) contours.push({ ...g, contour: xformContour({ tx: x + len / 2 - lw / 2, ty: H + 1, rot: 0 }, g.contour) });
    x += len + gap;
  }
  contours.unshift({ op: 'cut', role: 'outer', contour: polygonContour([{ x: 0, y: 0 }, { x, y: 0 }, { x, y: H }, { x: 0, y: H }]) });
  // on a sheet with a margin round it
  const shift = (c: TaggedContour): TaggedContour => ({ ...c, contour: xformContour({ tx: margin, ty: margin, rot: 0 }, c.contour) });
  return { index: 0, w: x + 2 * margin, h: H + 10 + 2 * margin, contours: contours.map(shift) };
}
