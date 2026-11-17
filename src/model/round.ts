// Round bases (milestone 62, PACKAGING_PLAN.md §6.2): a circle, a four-centre
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
import { fillets } from '../geom/fillet';

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
  const plain = plainRoundPts(w, h, r);
  return r.seam && r.shape !== 'stadium' ? withSeam(plain, r.seam) : plain;
}

function plainRoundPts(w: number, h: number, r: RoundShape): { pts: SketchPt[]; edgeIds: string[] } {
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

/** The seam flat a round base gets when it is walled (milestone 65): where (the back left) and how wide, by material: room for the strip's glue lip or key. */
export function defaultSeam(kind: 'card' | 'corrugated' | 'plywood'): { at: number; w: number } {
  return { at: (3 * Math.PI) / 4, w: kind === 'card' ? 12 : kind === 'corrugated' ? 16 : 20 };
}

/**
 * A round outline with a seam flat (milestone 65, PACKAGING_PLAN.md §6.2): the
 * rounded corner whose arc faces `at` is split so a chord `w` wide replaces
 * the middle of its arc. The corner point becomes two rounded corners (where
 * the arc's tangents at its ends meet those at the chord's ends) with the
 * chord's two ends between them, sharp: the chord is the edge `seam`, the
 * outline stays on the same circle either side, so everything downstream sees
 * rounded corners and one straight edge.
 */
export function withSeam(sk: { pts: SketchPt[]; edgeIds: string[] }, seam: { at: number; w: number }): { pts: SketchPt[]; edgeIds: string[] } {
  const fs = fillets(sk.pts, 0);
  const n = sk.pts.length;
  const norm = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  for (let k = 0; k < n; k++) {
    const f = fs[k];
    if (!f) continue;
    const a1 = Math.atan2(f.t1.y - f.c.y, f.t1.x - f.c.x), a2 = Math.atan2(f.t2.y - f.c.y, f.t2.x - f.c.x);
    const span = norm(a2 - a1);
    const rel = norm(seam.at - a1);
    if (span <= 1e-6 || rel < -1e-9 || rel > span + 1e-9) continue;
    // the chord's half angle, kept clear of the arc's ends so a little arc is left either side
    const margin = Math.min(0.08, span / 4);
    const delta = Math.min(Math.asin(Math.min(0.99, seam.w / 2 / f.r)), span / 2 - margin);
    if (delta <= 1e-3) return sk;
    const mid = a1 + Math.min(span - margin - delta, Math.max(margin + delta, rel));
    const p = (a: number) => ({ x: f.c.x + f.r * Math.cos(a), y: f.c.y + f.r * Math.sin(a) });
    // where the tangents at angles a and b meet
    const meet = (a: number, b: number) => {
      const m = (a + b) / 2, h = Math.abs(b - a) / 2;
      return { x: f.c.x + (f.r / Math.cos(h)) * Math.cos(m), y: f.c.y + (f.r / Math.cos(h)) * Math.sin(m) };
    };
    const P1 = p(mid - delta), P2 = p(mid + delta);
    const Va = meet(a1, mid - delta), Vb = meet(mid + delta, a1 + span);
    const r = f.r;
    const pts: SketchPt[] = [...sk.pts.slice(0, k), { ...Va, curve: 'round', r }, { ...P1 }, { ...P2 }, { ...Vb, curve: 'round', r }, ...sk.pts.slice(k + 1)];
    const edgeIds = [...sk.edgeIds.slice(0, k), 'sa', 'seam', 'sb', ...sk.edgeIds.slice(k)];
    return { pts, edgeIds };
  }
  return sk;
}
