// Slice outlines come from a faceted solid: a sphere's section is a polygon
// whose vertices lie within the 0.02 mm chord error of the true circle, not on
// it. `refitArcs` (src/geom/arcfit.ts, byte-identical from the parked branch)
// only gives back arcs whose vertices lie on one circle within 1e-5 mm. This
// pre-pass finds runs of vertices that fit a circle within CIRCLE_TOL, turning
// one way in small steps, and puts them exactly on it, so the refit then
// writes them as true arcs (WAFFLE_MODE.md §12, milestone 51).
import type { P2 } from '../model/types';

/** How far a vertex may sit from the circle fitted to its run (mm). */
export const CIRCLE_TOL = 0.03;
const MIN_SEGS = 5;
const MAX_TURN = (20 * Math.PI) / 180;
const MAX_R = 5000;

/** Least-squares circle (Kåsa) through points. */
function fitCircle(pts: P2[]): { c: P2; r: number } | null {
  const n = pts.length;
  let sx = 0, sy = 0;
  for (const p of pts) (sx += p.x), (sy += p.y);
  const mx = sx / n, my = sy / n;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const p of pts) {
    const u = p.x - mx, v = p.y - my;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }
  const a = suu, b = suv, c = suv, d = svv;
  const e = 0.5 * (suuu + suvv), f = 0.5 * (svvv + svuu);
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return null;
  const uc = (e * d - b * f) / det, vc = (a * f - c * e) / det;
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  return { c: { x: uc + mx, y: vc + my }, r };
}

const turn = (a: P2, b: P2, c: P2) => {
  const t1 = Math.atan2(b.y - a.y, b.x - a.x), t2 = Math.atan2(c.y - b.y, c.x - b.x);
  let d = t2 - t1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

/** A closed polygon with its near-circular runs moved exactly onto their circles. */
export function snapCircles(pts: P2[]): P2[] {
  const n = pts.length;
  if (n < MIN_SEGS + 1) return pts;
  const out = pts.map((p) => ({ ...p }));
  const at = (i: number) => pts[((i % n) + n) % n];
  const tn = pts.map((_, i) => turn(at(i - 1), at(i), at(i + 1)));
  const ok = (i: number, s: number) => {
    const t = tn[((i % n) + n) % n];
    return Math.sign(t) === s && Math.abs(t) > 1e-7 && Math.abs(t) < MAX_TURN;
  };
  const fits = (from: number, len: number) => {
    const run = Array.from({ length: len + 1 }, (_, k) => at(from + k));
    const c = fitCircle(run);
    if (!c || c.r > MAX_R) return null;
    return run.every((p) => Math.abs(Math.hypot(p.x - c.c.x, p.y - c.c.y) - c.r) <= CIRCLE_TOL) ? c : null;
  };
  // start where a run cannot extend backwards (so a run is not cut in two), else anywhere
  let start = 0;
  for (let i = 0; i < n; i++) if (!ok(i, Math.sign(tn[i]) || 1) || Math.sign(tn[i]) !== Math.sign(tn[(i + n - 1) % n])) { start = i; break; }
  let k = 0;
  while (k < n) {
    const i = start + k;
    const s = Math.sign(tn[((i + 1) % n + n) % n]);
    // a run from vertex i: interior vertices i+1 .. i+len-1 turn the same way in small steps
    let len = 1;
    while (len < n && ok(i + len, s)) len++;
    let best: { len: number; c: { c: P2; r: number } } | null = null;
    if (len >= MIN_SEGS) {
      // the longest prefix that fits one circle
      for (let L = Math.min(len, n); L >= MIN_SEGS; L--) {
        const c = fits(i, L);
        if (c) {
          best = { len: L, c };
          break;
        }
      }
    }
    if (best) {
      for (let j = 0; j <= best.len; j++) {
        const p = at(i + j), dx = p.x - best.c.c.x, dy = p.y - best.c.c.y, l = Math.hypot(dx, dy) || 1;
        out[((i + j) % n + n) % n] = { x: best.c.c.x + (dx / l) * best.c.r, y: best.c.c.y + (dy / l) * best.c.r };
      }
      k += best.len;
    } else k++;
  }
  return out;
}
