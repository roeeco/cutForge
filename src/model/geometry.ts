// Derived 2D geometry: manufactured panel outlines (joints applied) and details.
import type { Design, Detail, Notch, P2, Panel } from './types';
import type { Contour, Vec2 } from '../geom/types';
import { circleContour, polygonContour, rectContour, roundedRectContour } from '../geom/vec';
import { outlineText } from '../text/outline';
import type { FontId } from '../text/fonts';
import { findEdge, panelEdges, segDir, segInward, segLength, type EdgeSeg } from './edges';
import { normalizeNotches } from './seams';
// the own outline (Add/Cut shapes) feeds the edge layer
import './outline';

export type { Notch };

/** Joint notches on every edge of a panel by edge key, from all its connections (normalised). */
export function panelNotches(d: Design, p: Panel): Record<string, Notch[]> {
  const ring = panelEdges(p);
  const raw: Record<string, Notch[]> = {};
  for (const e of ring) raw[e.key] = [];
  for (const c of Object.values(d.connections)) {
    if (!c.geom || (c.a.panelId !== p.id && c.b.panelId !== p.id)) continue;
    for (const e of c.geom.edges) {
      if (e.panelId !== p.id) continue;
      // a joint kept on an edge a cut split lands on the piece that key now means
      const k = raw[e.edge] ? e.edge : findEdge(p, e.edge)?.key;
      if (k && raw[k]) raw[k].push(...e.notches);
    }
  }
  const out: Record<string, Notch[]> = {};
  for (const e of ring) out[e.key] = normalizeNotches(raw[e.key], segLength(e));
  return out;
}

/** Slots, glue flaps and flap score lines that connections add to a panel. */
export function panelExtras(d: Design, p: Panel) {
  const holes: P2[][] = [], adds: P2[][] = [], scores: { a: P2; b: P2 }[] = [];
  for (const c of Object.values(d.connections)) {
    if (!c.geom) continue;
    for (const h of c.geom.holes) if (h.panelId === p.id) holes.push(h.poly);
    for (const a of c.geom.adds) if (a.panelId === p.id) adds.push(a.poly);
    for (const s of c.geom.scores) if (s.panelId === p.id) scores.push(s);
  }
  return { holes, adds, scores };
}

const EPS = 1e-7;

/**
 * Manufactured outline (nominal size, joint notches applied, no kerf) as a CCW
 * polygon: each keyed edge of the ring carries its notches (positive depth cuts
 * back, negative protrudes), and corners meet where the offset edges cross.
 */
export function panelOutline(p: Pick<Panel, 'w' | 'h'> & { sketch?: Panel['sketch'] }, notches: Record<string, Notch[]>, ring: EdgeSeg[] = panelEdges(p)): Vec2[] {
  const n = ring.length;
  const N = (e: EdgeSeg) => notches[e.key] ?? [];
  const startDepth = (e: EdgeSeg) => N(e).find((x) => x.s0 <= EPS)?.depth ?? 0;
  const endDepth = (e: EdgeSeg) => N(e).find((x) => x.s1 >= segLength(e) - EPS)?.depth ?? 0;
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const e = ring[i], prev = ring[(i + n - 1) % n];
    const de = endDepth(prev), ds = startDepth(e);
    const ip = segInward(prev), ie = segInward(e), dp = segDir(prev), dir = segDir(e);
    const c = e.a;
    const along = dp.x * dir.x + dp.y * dir.y;
    if ((de === 0 && ds === 0) || Math.abs(along) < 1e-9) pts.push({ x: c.x + ip.x * de + ie.x * ds, y: c.y + ip.y * de + ie.y * ds });
    else {
      // where the edge lines, each moved inward by its depth, cross
      const k = dp.x * ie.x + dp.y * ie.y;
      if (Math.abs(k) < 1e-9) pts.push({ x: c.x + ip.x * de, y: c.y + ip.y * de }, { x: c.x + ie.x * ds, y: c.y + ie.y * ds });
      else {
        const tt = (ds - de * (ip.x * ie.x + ip.y * ie.y)) / k;
        pts.push({ x: c.x + ip.x * de + dp.x * tt, y: c.y + ip.y * de + dp.y * tt });
      }
    }
    const L = segLength(e);
    const at = (s: number, dd: number): Vec2 => ({ x: c.x + dir.x * s + ie.x * dd, y: c.y + dir.y * s + ie.y * dd });
    for (const x of N(e)) {
      if (x.s0 > EPS) pts.push(at(x.s0, 0), at(x.s0, x.depth));
      if (x.s1 < L - EPS) pts.push(at(x.s1, x.depth), at(x.s1, 0));
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

/** Text outline box (centred) or an estimate while fonts load. */
export function textBox(dt: Detail): { w: number; h: number; ok: boolean } {
  const t = dt.text;
  if (!t) return { w: dt.w, h: dt.h, ok: false };
  const o = outlineText(t.value, t.font as FontId, t.size);
  if (!o || !o.polys.length) return { w: Math.max(1, t.size * 0.55 * [...t.value].length), h: t.size, ok: false };
  return { w: o.maxX - o.minX, h: o.maxY - o.minY, ok: !o.missing.length };
}

/** Closed contours of one shape (text and imported shapes give several). */
export function shapeContours(dt: Detail): Contour[] {
  if (dt.shape === 'text' && dt.text) {
    const o = outlineText(dt.text.value, dt.text.font as FontId, dt.text.size);
    if (!o) return [];
    return o.polys.map((p) => polygonContour(p.map((q) => ({ x: q.x + dt.cx, y: q.y + dt.cy }))));
  }
  if ((dt.shape === 'path' || dt.shape === 'polygon') && dt.path) return dt.path.polys.map((p) => polygonContour(p.map((q) => ({ x: dt.cx + q.x * dt.w, y: dt.cy + q.y * dt.h }))));
  return [detailContour(dt)];
}

export function detailContour(dt: Detail): Contour {
  const x0 = dt.cx - dt.w / 2, y0 = dt.cy - dt.h / 2, x1 = dt.cx + dt.w / 2, y1 = dt.cy + dt.h / 2;
  if (dt.shape === 'circle') return circleContour(dt.cx, dt.cy, dt.w / 2);
  if (dt.shape === 'roundrect') return roundedRectContour(x0, y0, x1, y1, dt.r ?? 0);
  return rectContour(x0, y0, x1, y1);
}

/** The shapes a detail stands for: itself, or every copy of its live array. */
export function detailInstances(dt: Detail): Detail[] {
  const a = dt.array;
  // text measures itself from its outline
  const tb = dt.shape === 'text' ? textBox(dt) : null;
  const base = tb ? { ...dt, w: tb.w, h: tb.h } : dt;
  if (!a || (a.nx <= 1 && a.ny <= 1)) return [base];
  const out: Detail[] = [];
  for (let j = 0; j < Math.max(1, a.ny); j++)
    for (let i = 0; i < Math.max(1, a.nx); i++) out.push({ ...base, array: undefined, cx: dt.cx + i * a.dx, cy: dt.cy + j * a.dy });
  return out;
}
export function detailContours(dt: Detail): Contour[] {
  return detailInstances(dt).flatMap(shapeContours);
}
/** Bounding box of a detail including all array copies. */
export function detailBBox(dt: Detail) {
  const inst = detailInstances(dt);
  return {
    minX: Math.min(...inst.map((x) => x.cx - x.w / 2)),
    maxX: Math.max(...inst.map((x) => x.cx + x.w / 2)),
    minY: Math.min(...inst.map((x) => x.cy - x.h / 2)),
    maxY: Math.max(...inst.map((x) => x.cy + x.h / 2)),
  };
}
