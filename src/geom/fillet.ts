// Rounded corners: tangent circular arcs in place of a polygon's corners
// (milestone 62, PACKAGING_PLAN.md §6.2). Pure geometry on points that may
// carry `curve: 'round'` and a radius `r`, so other kinds of outline (the
// waffle branch's shape sketches) can share it.

type P2 = { x: number; y: number };
type RoundPt = P2 & { curve?: string; r?: number };

/** Arc flattening tolerance (mm): the chord's largest distance from the arc. */
export const ARC_TOL = 0.02;

/**
 * Straight length an edge keeps when its corners are rounded (mm), when it was
 * at least this long before: a wall needs 5 mm of straight edge to stand on
 * (trays' `MIN_EDGE`), so rounding never takes a wall away (§4.6 rule 2).
 */
export const KEEP_STRAIGHT = 5;

/** A rounded corner as built: its tangent points, centre and radius (after clamping). */
export type Fillet = { i: number; t1: P2; t2: P2; c: P2; r: number };

const unit = (x: number, y: number) => {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
};

/**
 * At each point with `curve: 'round'` a tangent arc of radius r replaces the
 * corner. Where the arcs at the two ends of an edge would leave it less than
 * `keep` mm of straight edge (or overlap, for an edge shorter than `keep`),
 * both are scaled down by the same factor. `keep` 0: arcs may meet (a round
 * base's circle or stadium).
 */
export function fillets(pts: RoundPt[], keep = KEEP_STRAIGHT): (Fillet | null)[] {
  const n = pts.length;
  const out: (Fillet | null)[] = pts.map(() => null);
  if (n < 3) return out;
  const L = new Array<number>(n).fill(0), half = new Array<number>(n).fill(0);
  const u1s: P2[] = [], u2s: P2[] = [];
  for (let i = 0; i < n; i++) {
    const V = pts[i], P = pts[(i + n - 1) % n], N = pts[(i + 1) % n];
    const u1 = unit(P.x - V.x, P.y - V.y), u2 = unit(N.x - V.x, N.y - V.y);
    u1s.push(u1);
    u2s.push(u2);
    if (V.curve !== 'round' || !(V.r && V.r > 0)) continue;
    const th = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y)));
    // a straight-through point or a spike has no corner to round
    if (th < 1e-6 || Math.PI - th < 1e-6) continue;
    half[i] = th / 2;
    L[i] = V.r / Math.tan(th / 2);
  }
  const scale = new Array<number>(n).fill(1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const len = Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
    const room = len >= keep ? len - keep : len;
    if (L[i] + L[j] > room + 1e-12) {
      const k = Math.max(0, room) / (L[i] + L[j]);
      scale[i] = Math.min(scale[i], k);
      scale[j] = Math.min(scale[j], k);
    }
  }
  for (let i = 0; i < n; i++) {
    if (!L[i] || scale[i] <= 1e-9) continue;
    const V = pts[i], u1 = u1s[i], u2 = u2s[i];
    const l = L[i] * scale[i], r = l * Math.tan(half[i]);
    const b = unit(u1.x + u2.x, u1.y + u2.y), dist = r / Math.sin(half[i]);
    out[i] = { i, t1: { x: V.x + u1.x * l, y: V.y + u1.y * l }, t2: { x: V.x + u2.x * l, y: V.y + u2.y * l }, c: { x: V.x + b.x * dist, y: V.y + b.y * dist }, r };
  }
  return out;
}

/**
 * The largest radius point i can have before it is clamped (mm), with the
 * other corners as they are built; Infinity for a point that is not a corner.
 */
export function maxFillet(pts: RoundPt[], i: number, keep = KEEP_STRAIGHT): number {
  const n = pts.length;
  if (n < 3) return Infinity;
  const V = pts[i], P = pts[(i + n - 1) % n], N = pts[(i + 1) % n];
  const u1 = unit(P.x - V.x, P.y - V.y), u2 = unit(N.x - V.x, N.y - V.y);
  const th = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y)));
  if (th < 1e-6 || Math.PI - th < 1e-6) return Infinity;
  const built = fillets(pts, keep);
  // the tangent length each neighbour's arc takes from the shared edge, as built
  const taken = (k: number) => {
    const f = built[k];
    return f ? Math.hypot(f.t1.x - pts[k].x, f.t1.y - pts[k].y) : 0;
  };
  const room = (len: number) => (len >= keep ? len - keep : len);
  const before = room(Math.hypot(V.x - P.x, V.y - P.y)) - taken((i + n - 1) % n);
  const after = room(Math.hypot(N.x - V.x, N.y - V.y)) - taken((i + 1) % n);
  return Math.max(0, Math.min(before, after)) * Math.tan(th / 2);
}

/** An arc from t1 to t2 about c (the short way round), flattened within ARC_TOL; every point lies on the circle. */
export function arcPoints(f: Fillet): P2[] {
  const a1 = Math.atan2(f.t1.y - f.c.y, f.t1.x - f.c.x), a2 = Math.atan2(f.t2.y - f.c.y, f.t2.x - f.c.x);
  let da = a2 - a1;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da <= -Math.PI) da += 2 * Math.PI;
  const step = 2 * Math.acos(Math.max(-1, 1 - ARC_TOL / Math.max(f.r, ARC_TOL)));
  // an even count puts a point at the arc's middle: an oval's or a circle's extreme lies exactly on the outline
  const k = 2 * Math.max(1, Math.min(256, Math.ceil(Math.abs(da) / step / 2)));
  const out: P2[] = [];
  for (let j = 1; j < k; j++) out.push({ x: f.c.x + f.r * Math.cos(a1 + (da * j) / k), y: f.c.y + f.r * Math.sin(a1 + (da * j) / k) });
  return [f.t1, ...out, f.t2];
}
