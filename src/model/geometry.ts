// Derived 2D geometry: manufactured panel outlines (joints applied) and details.
import type { Design, Detail, Notch, P2, Panel } from './types';
import type { Contour, Vec2, Xform2 } from '../geom/types';
import { circleContour, polygonContour, rectContour, roundedRectContour, xformContour } from '../geom/vec';
import { outlineText } from '../text/outline';
import type { FontId } from '../text/fonts';
import { findEdge, panelEdges, segDir, segInward, segLength, type EdgeSeg } from './edges';
import { normalizeNotches } from './seams';
// the own outline (Add/Cut shapes) feeds the edge layer
import './outline';
import { edgeFeatures } from './edgeFeatures';
export { edgeFlapGeom, flapOn } from './edgeFeatures';
import { memo } from './derived';
import type { Polygon } from 'polygon-clipping';
import { safeDifference, safeUnion } from '../geom/clip';
import { polygonArea } from '../geom/vec';

export type { Notch };

/** Joint notches on every edge of a panel by edge key, from all its connections (normalised). */
export function panelNotches(d: Design, p: Panel): Record<string, Notch[]> {
  // a frozen design: every panel's notches from one pass over the connections (milestone 61)
  if (Object.isFrozen(d) && d.panels[p.id] === p) {
    const all = memo(d, 'notches', () => {
      const by = new Map<string, { edge: string; notches: Notch[] }[]>();
      for (const c of Object.values(d.connections)) {
        if (!c.geom) continue;
        for (const e of c.geom.edges) {
          if (e.panelId !== c.a.panelId && e.panelId !== c.b.panelId) continue;
          const list = by.get(e.panelId);
          if (list) list.push(e);
          else by.set(e.panelId, [e]);
        }
      }
      return by;
    });
    return notchesFrom(p, all.get(p.id) ?? []);
  }
  const mine: { edge: string; notches: Notch[] }[] = [];
  for (const c of Object.values(d.connections)) {
    if (!c.geom || (c.a.panelId !== p.id && c.b.panelId !== p.id)) continue;
    for (const e of c.geom.edges) if (e.panelId === p.id) mine.push(e);
  }
  return notchesFrom(p, mine);
}

function notchesFrom(p: Panel, list: { edge: string; notches: Notch[] }[]): Record<string, Notch[]> {
  const ring = panelEdges(p);
  const raw: Record<string, Notch[]> = {};
  for (const e of ring) raw[e.key] = [];
  for (const e of list) {
    // a joint kept on an edge a cut split lands on the piece that key now means
    const k = raw[e.edge] ? e.edge : findEdge(p, e.edge)?.key;
    if (k && raw[k]) raw[k].push(...e.notches);
  }
  const out: Record<string, Notch[]> = {};
  for (const e of ring) out[e.key] = normalizeNotches(raw[e.key], segLength(e));
  return out;
}

export type PanelExtras = { holes: P2[][]; adds: P2[][]; scores: { a: P2; b: P2; toward?: 1 | -1 }[]; cuts: P2[][]; linerHoles: P2[][]; lines: { a: P2; b: P2 }[]; paths: { pts: P2[]; closed: boolean }[] };
const noExtras = (): PanelExtras => ({ holes: [], adds: [], scores: [], cuts: [], linerHoles: [], lines: [], paths: [] });

/** Every panel's slots, flaps, scores, cuts and open cut lines, from one pass over the fold-overs and connections. */
export function extrasByPanel(d: Design, only?: string): Map<string, PanelExtras> {
  const out = new Map<string, PanelExtras>();
  const at = (id: string) => {
    let x = out.get(id);
    if (!x) out.set(id, (x = noExtras()));
    return x;
  };
  const want = (id: string) => !only || id === only;
  // edge features (milestone 111): fold-overs (rim and liner on their wall, lock slots in the base), then flaps
  for (const h of edgeFeatures(d, only)) {
    for (const q of h.out.holes) if (want(q.panelId)) at(q.panelId).holes.push(q.poly);
    if (!want(h.panelId)) continue;
    const x = at(h.panelId);
    for (const a of h.out.adds) x.adds.push(a);
    for (const s of h.out.scores) x.scores.push(s);
    x.linerHoles.push(...h.out.linerHoles);
  }
  for (const c of Object.values(d.connections)) {
    if (!c.geom) continue;
    for (const k of c.geom.cuts ?? []) if (want(k.panelId)) at(k.panelId).cuts.push(k.poly);
    for (const h of c.geom.holes) if (want(h.panelId)) at(h.panelId).holes.push(h.poly);
    for (const a of c.geom.adds) if (want(a.panelId)) at(a.panelId).adds.push(a.poly);
    for (const s of c.geom.scores) if (want(s.panelId)) at(s.panelId).scores.push(s);
    for (const l of c.geom.lines ?? []) if (want(l.panelId)) at(l.panelId).lines.push(l);
    for (const q of c.geom.cutPaths ?? []) if (want(q.panelId)) at(q.panelId).paths.push({ pts: q.pts, closed: q.closed });
  }
  return out;
}

/** Slots, glue flaps and flap score lines that connections add to a panel (and open cut lines, milestone 63). */
export function panelExtras(d: Design, p: Panel): PanelExtras {
  const x = Object.isFrozen(d) ? memo(d, 'extras', () => extrasByPanel(d)).get(p.id) : extrasByPanel(d, p.id).get(p.id);
  // fresh arrays: callers may add to them
  return x ? { holes: [...x.holes], adds: [...x.adds], scores: [...x.scores], cuts: [...x.cuts], linerHoles: [...x.linerHoles], lines: [...x.lines], paths: [...x.paths] } : noExtras();
}

const EPS = 1e-7;

/**
 * Manufactured outline (nominal size, joint notches applied, no kerf) as a CCW
 * polygon (the largest part, when a cut into a joint band splits it; see
 * `panelOutlines`): each keyed edge of the ring carries its notches (positive depth cuts
 * back, negative protrudes), and corners meet where the offset edges cross.
 */
export function panelOutline(p: Pick<Panel, 'w' | 'h'> & { sketch?: Panel['sketch'] }, notches: Record<string, Notch[]>, ring: EdgeSeg[] = panelEdges(p)): Vec2[] {
  return panelOutlines(p, notches, ring)[0];
}

/** `panelOutline` as each edge's notches give it, which can cross itself when a cut reaches a joint band. */
function notchedOutline(p: Pick<Panel, 'w' | 'h'> & { sketch?: Panel['sketch'] }, notches: Record<string, Notch[]>, ring: EdgeSeg[]): Vec2[] {
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

/** Does a closed polygon cross or touch itself (other than at neighbouring segments)? */
export function crossesItself(pts: Vec2[]): boolean {
  const n = pts.length;
  if (n < 4) return false;
  const cr = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const E = 1e-9;
  const xs = pts.map((q, i) => {
    const r = pts[(i + 1) % n];
    return [Math.min(q.x, r.x), Math.max(q.x, r.x), Math.min(q.y, r.y), Math.max(q.y, r.y)];
  });
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const A = xs[i], B = xs[j];
      if (A[0] > B[1] + E || B[0] > A[1] + E || A[2] > B[3] + E || B[2] > A[3] + E) continue;
      const p1 = pts[i], p2 = pts[(i + 1) % n], q1 = pts[j], q2 = pts[(j + 1) % n];
      const d1 = cr(q1, q2, p1), d2 = cr(q1, q2, p2), d3 = cr(p1, p2, q1), d4 = cr(p1, p2, q2);
      if (((d1 > E && d2 < -E) || (d1 < -E && d2 > E)) && ((d3 > E && d4 < -E) || (d3 < -E && d4 > E))) return true;
      const on = (a: Vec2, b: Vec2, c: Vec2, dd: number) => Math.abs(dd) <= E && Math.min(a.x, b.x) - E <= c.x && c.x <= Math.max(a.x, b.x) + E && Math.min(a.y, b.y) - E <= c.y && c.y <= Math.max(a.y, b.y) + E;
      if (on(q1, q2, p1, d1) || on(q1, q2, p2, d2) || on(p1, p2, q1, d3) || on(p1, p2, q2, d4)) return true;
    }
  return false;
}

/**
 * The manufactured outline of one own ring as one or more polygons. Normally
 * `panelOutline`; when that crosses itself (a cut came into an edge's joint
 * band, BUGFIX_PLAN B9), the ring is built as a boolean instead: the plain
 * ring, joined with every protrusion and less every cut-back, which may leave
 * it in several parts (validate reports the cut).
 */
export function panelOutlines(p: Pick<Panel, 'w' | 'h'> & { sketch?: Panel['sketch'] }, notches: Record<string, Notch[]>, ring: EdgeSeg[] = panelEdges(p)): Vec2[][] {
  const pts = notchedOutline(p, notches, ring);
  if (!crossesItself(pts)) return [pts];
  const toR = (q: Vec2[]): [number, number][] => (polygonArea(q) >= 0 ? q : [...q].reverse()).map((v) => [v.x, v.y]);
  const adds: Polygon[] = [[toR(ring.map((e) => e.a))]], cuts: Polygon[] = [];
  for (const e of ring) {
    const dir = segDir(e), ie = segInward(e);
    const at = (s: number, dd: number): Vec2 => ({ x: e.a.x + dir.x * s + ie.x * dd, y: e.a.y + dir.y * s + ie.y * dd });
    for (const x of notches[e.key] ?? []) {
      if (Math.abs(x.depth) < 1e-9) continue;
      // a cut-back reaches a hair past the edge so it clears it; a protrusion overlaps the ring a hair so it joins
      const q = x.depth > 0 ? [at(x.s0, -1e-4), at(x.s1, -1e-4), at(x.s1, x.depth), at(x.s0, x.depth)] : [at(x.s0, 1e-4), at(x.s1, 1e-4), at(x.s1, x.depth), at(x.s0, x.depth)];
      (x.depth > 0 ? cuts : adds).push([toR(q)]);
    }
  }
  const out = safeDifference(safeUnion(adds), cuts)
    .map((poly) => cleanPolygon(poly[0].slice(0, -1).map(([x, y]) => ({ x, y }))))
    .filter((q) => q.length >= 3 && Math.abs(polygonArea(q)) > 1e-6)
    .sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
  return out.length ? out : [pts];
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

/** Turn a shape's contours by its `rot` about its centre (circles are unchanged; arcs stay arcs). */
function rotated(dt: Detail, cs: Contour[]): Contour[] {
  if (!dt.rot || dt.shape === 'circle') return cs;
  const a = (dt.rot * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  // rotation about (cx, cy) as a rigid transform: rotate, then translate
  const x: Xform2 = { rot: a, tx: dt.cx - (dt.cx * c - dt.cy * s), ty: dt.cy - (dt.cx * s + dt.cy * c) };
  return cs.map((k) => xformContour(x, k));
}

/** Corners of a shape's (rotated) w × h box, CCW from bottom-left. */
export function detailCorners(dt: Pick<Detail, 'cx' | 'cy' | 'w' | 'h' | 'rot'>): P2[] {
  const a = ((dt.rot ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([i, j]) => {
    const x = (i * dt.w) / 2, y = (j * dt.h) / 2;
    return { x: dt.cx + x * c - y * s, y: dt.cy + x * s + y * c };
  });
}

/** Closed contours of one shape (text and imported shapes give several). */
export function shapeContours(dt: Detail): Contour[] {
  return rotated(dt, shapeContoursUpright(dt));
}

function shapeContoursUpright(dt: Detail): Contour[] {
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
  // a turned array turns as a group about its centre
  const r = ((dt.rot ?? 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const mx = dt.cx + ((Math.max(1, a.nx) - 1) * a.dx) / 2, my = dt.cy + ((Math.max(1, a.ny) - 1) * a.dy) / 2;
  for (let j = 0; j < Math.max(1, a.ny); j++)
    for (let i = 0; i < Math.max(1, a.nx); i++) {
      let cx = dt.cx + i * a.dx, cy = dt.cy + j * a.dy;
      if (r) [cx, cy] = [mx + (cx - mx) * c - (cy - my) * s, my + (cx - mx) * s + (cy - my) * c];
      out.push({ ...base, array: undefined, cx, cy });
    }
  return out;
}
export function detailContours(dt: Detail): Contour[] {
  return detailInstances(dt).flatMap(shapeContours);
}
/** Bounding box of a detail including all array copies. */
export function detailBBox(dt: Detail) {
  const inst = detailInstances(dt);
  if (dt.rot && dt.shape !== 'circle') {
    const pts = inst.flatMap(detailCorners);
    return { minX: Math.min(...pts.map((q) => q.x)), maxX: Math.max(...pts.map((q) => q.x)), minY: Math.min(...pts.map((q) => q.y)), maxY: Math.max(...pts.map((q) => q.y)) };
  }
  return {
    minX: Math.min(...inst.map((x) => x.cx - x.w / 2)),
    maxX: Math.max(...inst.map((x) => x.cx + x.w / 2)),
    minY: Math.min(...inst.map((x) => x.cy - x.h / 2)),
    maxY: Math.max(...inst.map((x) => x.cy + x.h / 2)),
  };
}

