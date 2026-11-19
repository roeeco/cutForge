// What is under the pointer in a sketch: a point, or a segment and where along it.
import type { P2 } from '../model/types';
import { arcOf, bezPts, bezCtl, segPoints } from './flatten';
import type { Sketch } from './model';

export type Hit = { kind: 'pt'; id: string } | { kind: 'seg'; id: string; t: number; p: P2 } | null;

/** The parameter along a segment nearest to p, and the distance to it. */
export function nearestOnSeg(sk: Sketch, g: string, p: P2): { t: number; d: number; q: P2 } {
  const s = sk.segs[g];
  const a = sk.pts[s.a], b = sk.pts[s.b];
  if (s.k === 'line') {
    const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
    const q = { x: a.x + dx * t, y: a.y + dy * t };
    return { t, d: Math.hypot(p.x - q.x, p.y - q.y), q };
  }
  if (s.k === 'arc') {
    const f = arcOf(a, b, s.bulge);
    if (Number.isFinite(f.r)) {
      // the angle of p from the arc's start, measured the way the arc turns
      const sw = Math.abs(f.sweep), dir = Math.sign(f.sweep), TAU = 2 * Math.PI;
      let da = (Math.atan2(p.y - f.c.y, p.x - f.c.x) - f.a0) * dir;
      da = ((da % TAU) + TAU) % TAU;
      let t = da / sw;
      // beyond the arc: whichever end is nearer round the circle
      if (t > 1) t = da - sw < TAU - da ? 1 : 0;
      const ang = f.a0 + f.sweep * t;
      const q = { x: f.c.x + f.r * Math.cos(ang), y: f.c.y + f.r * Math.sin(ang) };
      return { t, d: Math.hypot(p.x - q.x, p.y - q.y), q };
    }
  }
  const { pts, ts } = s.k === 'bez' ? bezPts(bezCtl(sk, g)!, 0.01) : { pts: segPoints(sk, g), ts: [0, 1] };
  let best = { t: 0, d: Infinity, q: pts[0] };
  for (let i = 0; i + 1 < pts.length; i++) {
    const u = pts[i], v = pts[i + 1], dx = v.x - u.x, dy = v.y - u.y, L = dx * dx + dy * dy;
    const k = L ? Math.max(0, Math.min(1, ((p.x - u.x) * dx + (p.y - u.y) * dy) / L)) : 0;
    const q = { x: u.x + dx * k, y: u.y + dy * k };
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < best.d) best = { t: ts[i] + (ts[i + 1] - ts[i]) * k, d, q };
  }
  return best;
}

/** The point within `tol` of p (nearest), else the segment within `tol` (nearest); points win. */
export function hitTest(sk: Sketch, p: P2, tol: number, o: { skipPts?: string[] } = {}): Hit {
  let best: string | null = null, bd = tol;
  for (const [id, q] of Object.entries(sk.pts)) {
    if (o.skipPts?.includes(id)) continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= bd) (best = id), (bd = d);
  }
  if (best) return { kind: 'pt', id: best };
  let seg: { id: string; t: number; d: number; q: P2 } | null = null;
  for (const g of sk.order) {
    if (!sk.segs[g]) continue;
    const r = nearestOnSeg(sk, g, p);
    if (r.d <= tol && (!seg || r.d < seg.d)) seg = { id: g, t: r.t, d: r.d, q: r.q };
  }
  return seg ? { kind: 'seg', id: seg.id, t: seg.t, p: seg.q } : null;
}

/** Points inside a box, and segments with both ends inside. */
export function inBox(sk: Sketch, a: P2, b: P2): { pts: string[]; segs: string[] } {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  const pts = Object.keys(sk.pts).filter((id) => {
    const p = sk.pts[id];
    return p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
  });
  const set = new Set(pts);
  return { pts, segs: sk.order.filter((g) => set.has(sk.segs[g].a) && set.has(sk.segs[g].b)) };
}
