// Round bases (milestone 45, CURVED_WALLS.md §6.1): a circle, a four-centre
// oval or a stadium, made as a polygon sketch whose points are rounded
// corners (`curve: 'round'`), so everything downstream (outlines, joints,
// exports) treats them like any rounded outline. `Sketch.round` remembers
// which shape it is, so its card edits sizes rather than points.
//
//   circle   a square, every corner rounded to half its side
//   stadium  a rectangle, every corner rounded to half its shorter side
//   oval     the draftsman's four-centre oval: a rhombus whose corners on the
//            long axis are rounded to rEnd and those on the short axis to a
//            larger radius, chosen so the arcs meet tangentially with no
//            straight part. It looks like an ellipse but stays exact arcs; its
//            end radius starts at the draftsman's construction (`defaultEnd`),
//            gentler than an ellipse's tightest bend (b²/a).
import type { P2, RoundShape, SketchPt } from './types';

/** The smallest end radius worth drawing (mm). */
export const MIN_END = 0.5;

/** A four-centre oval's two radii for semi-axes a ≥ b and end radius r1 (clamped below b); r2 is Infinity at a stadium. */
export function ovalRadii(a: number, b: number, rEnd?: number): { r1: number; r2: number } {
  const r1 = Math.max(MIN_END, Math.min(b, rEnd ?? defaultEnd(2 * a, 2 * b)));
  if (b - r1 < 1e-6 || a - b < 1e-6) return { r1: b, r2: Infinity };
  return { r1, r2: ((a - r1) ** 2 + b * b - r1 * r1) / (2 * (b - r1)) };
}

/**
 * The end radius an oval of this size starts with: the draftsman's
 * construction, which fits an ellipse of the same box well all round. Join
 * the ends of the two semi-axes (A on the long axis, C on the short one); take
 * a − b off it from C (to E); the perpendicular bisector of AE crosses the
 * long axis at the end arc's centre. (An ellipse's own end radius, b²/a, is
 * smaller and gives an oval with pointed ends.) 0.1 mm steps.
 */
export const defaultEnd = (w: number, h: number) => {
  const a = Math.max(w, h) / 2, b = Math.min(w, h) / 2;
  if (a - b < 1e-9) return Math.round(b * 10) / 10;
  const L = Math.hypot(a, b);
  const E = { x: ((a - b) * a) / L, y: b - ((a - b) * b) / L };
  const M = { x: (a + E.x) / 2, y: E.y / 2 };
  const n = { x: E.y, y: a - E.x };
  const x = M.x - (M.y / n.y) * n.x;
  return Math.round((a - x) * 10) / 10;
};

/**
 * The sketch points (CCW, edge ids e0…e3) of a round shape filling w × h
 * from (0, 0). A circle uses the smaller of w and h; an oval whose end radius
 * reaches half its short side is a stadium.
 */
export function roundPts(w: number, h: number, r: RoundShape): { pts: SketchPt[]; edgeIds: string[] } {
  const ids = ['e0', 'e1', 'e2', 'e3'];
  const rect = (W: number, H: number, rad: number): SketchPt[] =>
    [
      { x: 0, y: 0 },
      { x: W, y: 0 },
      { x: W, y: H },
      { x: 0, y: H },
    ].map((q) => ({ ...q, curve: 'round' as const, r: rad }));
  if (r.shape === 'circle') {
    const D = Math.min(w, h);
    return { pts: rect(D, D, D / 2), edgeIds: ids };
  }
  const a = Math.max(w, h) / 2, b = Math.min(w, h) / 2;
  const { r1, r2 } = r.shape === 'oval' ? ovalRadii(a, b, r.rEnd) : { r1: b, r2: Infinity };
  if (!Number.isFinite(r2)) return { pts: rect(w, h, b), edgeIds: ids };
  // centred, long axis along x: the end centre C1 and the side centre C2, and where their arcs meet (J)
  const C1 = { x: a - r1, y: 0 }, C2 = { x: 0, y: b - r2 };
  const dx = C1.x - C2.x, dy = C1.y - C2.y, L = Math.hypot(dx, dy);
  const J = { x: C2.x + (r2 * dx) / L, y: C2.y + (r2 * dy) / L };
  // the arcs' common tangent at J meets the axes at the rhombus' corners
  const t = { x: -dy / L, y: dx / L };
  const X = J.x - (J.y * t.x) / t.y, Y = J.y - (J.x * t.y) / t.x;
  const long: P2[] = [
    { x: 0, y: -Y },
    { x: X, y: 0 },
    { x: 0, y: Y },
    { x: -X, y: 0 },
  ];
  const rad = [r2, r1, r2, r1];
  // into place: the oval's box from (0, 0); a taller one turned a quarter (still CCW)
  const pts = long.map((q, i) => ({ ...(w >= h ? { x: q.x + a, y: q.y + b } : { x: -q.y + b, y: q.x + a }), curve: 'round' as const, r: rad[i] }));
  return { pts, edgeIds: ids };
}
