// Arcs back from polylines (milestone 45, CURVED_WALLS.md §8): the outline
// pipeline flattens arcs (rounded corners, circles cut across an outline) so
// booleans can work on polygons; at export, runs of vertices that lie on one
// circle become true arcs again, so the laser cuts smooth curves.
//
// The test is strict, so only arcs the app flattened itself come back: at
// least MIN_SEGS segments, each turning at most MAX_STEP, all the same way,
// every vertex within TOL of the circle (the app puts them exactly on it).
// A regular polygon (at most 12 sides: 30° steps) and approximated curves
// (text, imported Béziers) do not pass.
import type { Contour, Seg, Vec2 } from './types';

const TOL = 1e-5;
const MIN_SEGS = 4;
const MAX_STEP = (24 * Math.PI) / 180;
/** Longest arc in one segment (an SVG arc near 180° is ill-defined). */
const MAX_ARC = (170 * Math.PI) / 180;

function circle(p: Vec2, q: Vec2, r: Vec2): { c: Vec2; r: number } | null {
  const d = 2 * (p.x * (q.y - r.y) + q.x * (r.y - p.y) + r.x * (p.y - q.y));
  if (Math.abs(d) < 1e-12) return null;
  const p2 = p.x * p.x + p.y * p.y, q2 = q.x * q.x + q.y * q.y, r2 = r.x * r.x + r.y * r.y;
  const c = { x: (p2 * (q.y - r.y) + q2 * (r.y - p.y) + r2 * (p.y - q.y)) / d, y: (p2 * (r.x - q.x) + q2 * (p.x - r.x) + r2 * (q.x - p.x)) / d };
  return { c, r: Math.hypot(p.x - c.x, p.y - c.y) };
}

const turn = (a: Vec2, b: Vec2, c: Vec2) => (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
const angAt = (c: Vec2, p: Vec2) => Math.atan2(p.y - c.y, p.x - c.x);

/** One arc from a to b about c (a full turn when a is b), split into pieces of at most MAX_ARC. */
function arcSegs(a: Vec2, b: Vec2, c: Vec2, r: number, ccw: boolean): Seg[] {
  let da = angAt(c, b) - angAt(c, a);
  if (ccw) while (da <= 0) da += 2 * Math.PI;
  else while (da >= 0) da -= 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(da) / MAX_ARC));
  const out: Seg[] = [];
  let prev = a;
  for (let k = 1; k <= n; k++) {
    const t = angAt(c, a) + (da * k) / n;
    const q = k === n ? b : { x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) };
    out.push({ k: 'A', a: prev, b: q, c, r, ccw });
    prev = q;
  }
  return out;
}

/**
 * A closed contour of straight segments with its arcs given back. Anything
 * else (open, already with arcs, too few segments) is returned as it is.
 */
export function refitArcs(contour: Contour): Contour {
  const segs = contour.segs;
  const n = segs.length;
  if (!contour.closed || n < MIN_SEGS + 1 || segs.some((s) => s.k !== 'L')) return contour;
  const P = segs.map((s) => s.a);
  const step = (c: Vec2, k: number) => {
    let da = Math.abs(angAt(c, P[(k + 1) % n]) - angAt(c, P[k % n]));
    if (da > Math.PI) da = 2 * Math.PI - da;
    return da;
  };
  // does vertex j continue an arc about c (radius r), turning the way `sense` says?
  const fits = (c: Vec2, r: number, j: number, sense: number) => {
    const b = P[j % n];
    if (Math.abs(Math.hypot(b.x - c.x, b.y - c.y) - r) > TOL) return false;
    if (Math.sign(turn(P[(j - 2 + n) % n], P[(j - 1 + n) % n], b)) !== sense) return false;
    return step(c, j - 1) <= MAX_STEP;
  };
  // the arc run starting at vertex i (its length in segments, at most `limit`), or null
  const runAt = (i: number, limit: number): { len: number; c: Vec2; r: number; ccw: boolean } | null => {
    if (limit < MIN_SEGS) return null;
    const cr = circle(P[i % n], P[(i + 1) % n], P[(i + 2) % n]);
    if (!cr || cr.r < 0.2 || cr.r > 1e4) return null;
    const sense = Math.sign(turn(P[i % n], P[(i + 1) % n], P[(i + 2) % n]));
    if (!sense || step(cr.c, i) > MAX_STEP || step(cr.c, i + 1) > MAX_STEP) return null;
    let len = 2;
    while (len < limit && fits(cr.c, cr.r, i + len + 1, sense)) len++;
    if (len < MIN_SEGS) return null;
    // the circle again through points far apart on the run (its ends and middle, or a third of a whole circle apart): precise
    const whole = len >= n;
    const fine = circle(P[i % n], P[(i + Math.floor(len / (whole ? 3 : 2))) % n], P[(i + (whole ? Math.floor((2 * len) / 3) : len)) % n]);
    return { len, c: fine?.c ?? cr.c, r: fine?.r ?? cr.r, ccw: sense > 0 };
  };
  // a whole circle: in arcs of at most MAX_ARC
  const r0 = runAt(0, n);
  if (r0 && r0.len >= n) return { closed: true, segs: arcSegs(P[0], P[0], r0.c, r0.r, r0.ccw) };
  // start where an arc begins: a vertex a run starts from whose previous vertex starts none (so no arc is cut in two)
  let start = 0;
  for (let k = 0; k < n; k++) {
    if (runAt(k, n) && !runAt((k + n - 1) % n, n)) {
      start = k;
      break;
    }
  }
  const out: Seg[] = [];
  let k = 0;
  while (k < n) {
    const i = (start + k) % n;
    const r = runAt(i, n - k);
    if (r) {
      out.push(...arcSegs(P[i], P[(i + r.len) % n], r.c, r.r, r.ccw));
      k += r.len;
    } else {
      out.push(segs[i]);
      k++;
    }
  }
  return out.length < n ? { closed: true, segs: out } : contour;
}
