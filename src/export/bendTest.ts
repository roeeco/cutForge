// The bend test (milestone 63, PACKAGING_PLAN.md §5.4): a strip with five
// zones, each a quarter turn of the material's bend pattern at a radius
// around the tightest it is set to reach (0.7–1.6 times), with plain
// stretches between them and each zone's radius on the GUIDE layer. Wrap it
// round cans or bottles and enter the tightest radius that held in the
// material drawer, as with the kerf test cut.
import type { MaterialProfile, PatternId } from '../model/types';
import type { TaggedContour } from '../geom/types';
import { L, polygonContour, xformContour } from '../geom/vec';
import { bendOf } from '../model/materials';
import { bandPattern, patternReach, patternsFor } from '../model/bendPatterns';
import { pieceLabel } from './label';
import type { PreparedSheet } from './prepare';

/** The strip's height: how long each pattern line is (mm). */
const H = 40;

/** The pattern a material's bend test uses: its first that has lines (smooth when it has none). */
export const testPattern = (m: MaterialProfile): PatternId => patternsFor(m.kind).find((p) => p !== 'smooth') ?? 'smooth';

/** The radii a material's bend test tries: around the tightest its pattern reaches on the strip. */
export function testRadii(m: MaterialProfile, pattern = testPattern(m)): number[] {
  const reach = patternReach(pattern, { m, r: 0, len: H, width: 1, turn: Math.PI / 2 });
  const R = Number.isFinite(reach) && reach > 0 ? reach : bendOf(m).patternR;
  return [0.7, 0.85, 1, 1.25, 1.6].map((k) => Math.max(1, Math.round(R * k * 2) / 2));
}

/** The bend test strip as one sheet, ready for the SVG or DXF writer. `label(r)` names a zone. */
export function bendTestSheet(m: MaterialProfile, label: (r: number) => string, pattern = testPattern(m)): PreparedSheet {
  const gap = 15, margin = 10;
  const contours: TaggedContour[] = [];
  const k = bendOf(m).k;
  let x = gap;
  for (const r of testRadii(m, pattern)) {
    const width = (Math.PI / 2) * (r + k * m.thickness);
    const p = bandPattern({ m, r, len: H, width, turn: Math.PI / 2 }, pattern);
    const at = (q: { x: number; y: number }) => ({ x: x + q.x, y: q.y });
    for (const s of p.lines.scores) contours.push({ op: 'score', role: 'line', contour: { closed: false, segs: [L(at(s.a), at(s.b))] } });
    for (const s of p.lines.cuts) contours.push({ op: 'cut', role: 'line', contour: { closed: false, segs: [L(at(s.a), at(s.b))] } });
    for (const q of p.lines.paths) {
      const pts = q.pts.map(at);
      contours.push({ op: 'cut', role: q.closed ? 'hole' : 'line', contour: { closed: q.closed, segs: pts.slice(0, q.closed ? pts.length : pts.length - 1).map((a, i) => L(a, pts[(i + 1) % pts.length])) } });
    }
    // the zone's radius above it
    const lw = Math.max(12, width);
    for (const g of pieceLabel(label(r), lw, 8)) contours.push({ ...g, contour: xformContour({ tx: x + width / 2 - lw / 2, ty: H + 1, rot: 0 }, g.contour) });
    x += width + gap;
  }
  contours.unshift({ op: 'cut', role: 'outer', contour: polygonContour([{ x: 0, y: 0 }, { x, y: 0 }, { x, y: H }, { x: 0, y: H }]) });
  // on a sheet with a margin round it
  const shift = (c: TaggedContour): TaggedContour => ({ ...c, contour: xformContour({ tx: margin, ty: margin, rot: 0 }, c.contour) });
  return { index: 0, w: x + 2 * margin, h: H + 10 + 2 * margin, contours: contours.map(shift) };
}
