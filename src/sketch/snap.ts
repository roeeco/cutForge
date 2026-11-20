// Snapping in the sketch (SKETCH_OVERHAUL.md §5.3): the chain's first point, any
// point, middles, centres, crossings, the corners of the bodies underneath, 15°
// steps with Shift, then the grid.
import type { P2 } from '../model/types';
import { arcOf, cornerCut } from './flatten';
import type { Sketch } from './model';

export type Target = P2 & { id?: string };
export type Targets = { ends: Target[]; mids: P2[]; centres: P2[]; crossings: P2[]; body: P2[] };
export type SnapKind = 'close' | 'end' | 'mid' | 'centre' | 'cross' | 'body' | 'angle' | 'grid' | 'free';
export type Snap = { p: P2; kind: SnapKind; ptId?: string };

/** Where two straight pieces cross (inside both). */
function lineCross(a: P2, b: P2, c: P2, d: P2): P2 | null {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-12) return null;
  const q = { x: c.x - a.x, y: c.y - a.y };
  const t = (q.x * s.y - q.y * s.x) / den, u = (q.x * r.y - q.y * r.x) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { x: a.x + r.x * t, y: a.y + r.y * t };
}

/** Everything a point can snap to, leaving out `exclude` points (and their segments' middles). */
export function snapTargets(sk: Sketch, o: { exclude?: string[]; underlay?: P2[][] } = {}): Targets {
  const ex = new Set(o.exclude ?? []);
  const t: Targets = { ends: [], mids: [], centres: [], crossings: [], body: [] };
  for (const [id, p] of Object.entries(sk.pts)) if (!ex.has(id)) t.ends.push({ x: p.x, y: p.y, id });
  for (const g of sk.order) {
    const s = sk.segs[g];
    const a = sk.pts[s.a], b = sk.pts[s.b];
    if (!a || !b) continue;
    if (s.k === 'line' && !ex.has(s.a) && !ex.has(s.b)) t.mids.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    if (s.k === 'arc' && !ex.has(s.a) && !ex.has(s.b)) {
      const f = arcOf(a, b, s.bulge);
      if (Number.isFinite(f.r)) t.centres.push(f.c);
    }
  }
  for (const id of Object.keys(sk.pts)) {
    const c = cornerCut(sk, id);
    if (c?.c) t.centres.push(c.c);
  }
  // construction lines crossing anything straight
  const lines = sk.order.filter((g) => sk.segs[g].k === 'line');
  for (const g of lines) {
    if (!sk.segs[g].cons) continue;
    const s = sk.segs[g];
    for (const h of lines) {
      if (h === g) continue;
      const u = sk.segs[h];
      if (u.cons && h < g) continue;
      const x = lineCross(sk.pts[s.a], sk.pts[s.b], sk.pts[u.a], sk.pts[u.b]);
      if (x) t.crossings.push(x);
    }
  }
  for (const ring of o.underlay ?? []) for (const p of ring) t.body.push(p);
  return t;
}

export type SnapCtx = {
  /** mm per screen pixel. */
  mmPerPx: number;
  targets: Targets;
  /** The chain being drawn: its first point (to close on) and its last (for Shift's angle steps). */
  first?: { id: string; p: P2 } | null;
  /** The chain's first point may be closed on (it has two segments or more). */
  canClose?: boolean;
  last?: P2 | null;
  shift?: boolean;
  /** Alt, or smart snapping off: only the grid. */
  noSmart?: boolean;
  /** Round to the grid (the settings' step; under Alt to 0.01 mm). */
  grid: (x: number) => number;
  /** Alt is held: the grid is not used either. */
  free?: boolean;
};

const near = (a: P2, b: P2) => Math.hypot(a.x - b.x, a.y - b.y);

export function snapPoint(raw: P2, c: SnapCtx): Snap {
  if (!c.noSmart) {
    if (c.first && c.canClose && near(raw, c.first.p) <= 12 * c.mmPerPx) return { p: { ...c.first.p }, kind: 'close', ptId: c.first.id };
    let best: Target | null = null, bd = 10 * c.mmPerPx;
    for (const e of c.targets.ends) {
      const d = near(raw, e);
      if (d <= bd) (best = e), (bd = d);
    }
    if (best) return { p: { x: best.x, y: best.y }, kind: 'end', ptId: best.id };
    const lists: [P2[], SnapKind][] = [
      [c.targets.mids, 'mid'],
      [c.targets.centres, 'centre'],
      [c.targets.crossings, 'cross'],
      [c.targets.body, 'body'],
    ];
    let hit: Snap | null = null, hd = 8 * c.mmPerPx;
    for (const [list, kind] of lists)
      for (const p of list) {
        const d = near(raw, p);
        if (d <= hd) (hit = { p: { x: p.x, y: p.y }, kind }), (hd = d);
      }
    if (hit) return hit;
  }
  if (c.shift && c.last) {
    const dx = raw.x - c.last.x, dy = raw.y - c.last.y;
    const step = Math.PI / 12;
    const a = Math.round(Math.atan2(dy, dx) / step) * step;
    const L = c.grid(Math.hypot(dx, dy));
    return { p: { x: c.last.x + L * Math.cos(a), y: c.last.y + L * Math.sin(a) }, kind: 'angle' };
  }
  return { p: { x: c.grid(raw.x), y: c.grid(raw.y) }, kind: c.free ? 'free' : 'grid' };
}
