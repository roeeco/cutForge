// Derived 2D geometry: joint profiles, manufactured panel outlines and pieces.
import type { Connection, Design, Detail, Panel } from './types';
import type { Contour, TaggedContour, Vec2 } from '../geom/types';
import { circleContour, polygonContour, rectContour, roundedRectContour } from '../geom/vec';
import { edgeInwardLocal, edgeLength, panelCorners } from './frame';

export type Notch = { s0: number; s1: number; depth: number };

/** Odd finger count for an edge: explicit or automatic (target ≈ max(3t, 10 mm)). */
export function fingerCount(c: Connection, length: number, t: number): number {
  if (c.fingers && c.fingers >= 3) return c.fingers % 2 ? c.fingers : c.fingers + 1;
  const target = Math.max(3 * t, 10);
  let n = Math.max(3, Math.round(length / target));
  if (n % 2 === 0) n += n * target < length ? 1 : -1;
  return Math.max(3, n);
}

/**
 * Finger joint layout along an edge of length L, split into n equal segments.
 * Even segments belong to the parent (it keeps full material there), odd
 * segments to the child. Each side is notched to depth t where the other
 * owns the segment. Fit clearance is applied once per connection: the
 * parent's notches (the slots) are widened by clearance/2 at each interior end.
 */
export function fingerNotches(L: number, n: number, t: number, clearance: number) {
  const parent: Notch[] = [];
  const child: Notch[] = [];
  const seg = L / n;
  for (let k = 0; k < n; k++) {
    const s0 = k * seg, s1 = (k + 1) * seg;
    if (k % 2 === 1) {
      parent.push({ s0: Math.max(0, s0 - clearance / 2), s1: Math.min(L, s1 + clearance / 2), depth: t });
    } else {
      child.push({ s0, s1, depth: t });
    }
  }
  return { parent, child };
}

/** Notches on every edge of a panel, from all its connections. */
export function panelNotches(d: Design, p: Panel): Notch[][] {
  const out: Notch[][] = [[], [], [], []];
  const t = d.material.thickness;
  for (const c of Object.values(d.connections)) {
    if (c.kind !== 'finger') continue;
    const isA = c.a.panelId === p.id, isB = c.b.panelId === p.id;
    if (!isA && !isB) continue;
    const parent = d.panels[c.a.panelId];
    if (!parent) continue;
    const L = edgeLength(parent, c.a.edge);
    const n = fingerCount(c, L, t);
    const fn = fingerNotches(L, n, t, d.material.clearance);
    if (isA) out[c.a.edge].push(...fn.parent);
    if (isB) out[c.b.edge].push(...fn.child);
  }
  for (const e of out) e.sort((a, b) => a.s0 - b.s0);
  return out;
}

const EPS = 1e-7;

/** Manufactured outline (nominal size, joints applied, no kerf) as a CCW polygon. */
export function panelOutline(p: { w: number; h: number }, notches: Notch[][]): Vec2[] {
  const c = panelCorners(p);
  const dirs: Vec2[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
  const at = (e: number, s: number, dd: number): Vec2 => {
    const inn = edgeInwardLocal(e);
    return { x: c[e].x + dirs[e].x * s + inn.x * dd, y: c[e].y + dirs[e].y * s + inn.y * dd };
  };
  const L = (e: number) => edgeLength(p, e);
  const startDepth = (e: number) => notches[e].find((n) => n.s0 <= EPS)?.depth ?? 0;
  const endDepth = (e: number) => notches[e].find((n) => n.s1 >= L(e) - EPS)?.depth ?? 0;
  const pts: Vec2[] = [];
  for (let e = 0; e < 4; e++) {
    const prev = (e + 3) % 4;
    const de = endDepth(prev), ds = startDepth(e);
    const ip = edgeInwardLocal(prev), ie = edgeInwardLocal(e);
    pts.push({ x: c[e].x + ip.x * de + ie.x * ds, y: c[e].y + ip.y * de + ie.y * ds });
    for (const n of notches[e]) {
      if (n.s0 > EPS) pts.push(at(e, n.s0, 0), at(e, n.s0, n.depth));
      if (n.s1 < L(e) - EPS) pts.push(at(e, n.s1, n.depth), at(e, n.s1, 0));
    }
  }
  return cleanPolygon(pts);
}

/** Remove duplicate and collinear vertices. */
export function cleanPolygon(pts: Vec2[]): Vec2[] {
  let out = pts.filter((p, i) => {
    const q = pts[(i + pts.length - 1) % pts.length];
    return Math.abs(p.x - q.x) > 1e-9 || Math.abs(p.y - q.y) > 1e-9;
  });
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length], b = out[i], cc = out[(i + 1) % out.length];
      const cr = (b.x - a.x) * (cc.y - b.y) - (b.y - a.y) * (cc.x - b.x);
      if (Math.abs(cr) < 1e-9) {
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

export function detailContour(dt: Detail): Contour {
  const x0 = dt.cx - dt.w / 2, y0 = dt.cy - dt.h / 2, x1 = dt.cx + dt.w / 2, y1 = dt.cy + dt.h / 2;
  if (dt.shape === 'circle') return circleContour(dt.cx, dt.cy, dt.w / 2);
  if (dt.shape === 'roundrect') return roundedRectContour(x0, y0, x1, y1, dt.r ?? 0);
  return rectContour(x0, y0, x1, y1);
}

/** All contours of one panel's flat piece, in panel-local coordinates. */
export function pieceContours(d: Design, p: Panel): TaggedContour[] {
  const out: TaggedContour[] = [
    { op: 'cut', role: 'outer', contour: polygonContour(panelOutline(p, panelNotches(d, p))), ref: { panelId: p.id } },
  ];
  for (const dt of p.details) {
    const contour = detailContour(dt);
    if (dt.op === 'cut') out.push({ op: 'cut', role: 'hole', contour, ref: { panelId: p.id, detailId: dt.id } });
    else if (dt.op === 'engrave') out.push({ op: 'engrave', role: 'fill', contour, ref: { panelId: p.id, detailId: dt.id } });
    else out.push({ op: 'score', role: 'line', contour, ref: { panelId: p.id, detailId: dt.id } });
  }
  return out;
}

/** Milestone 1: every panel is its own piece (folds that join panels arrive in milestone 2). */
export function pieceKeys(d: Design): string[] {
  return d.order.filter((id) => d.panels[id]);
}
