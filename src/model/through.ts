// Layer 5 (POLYGONS_AND_CUTS.md §8): through-cuts. A Cut shape with
// `through` on removes material from every other panel in its path: the shape
// extruded along its source panel's normal, both ways, through the whole
// design. A laser cuts square, so a point of a panel is removed when any part
// of the panel's thickness there is in the path:
//
//  - not edge-on: the shape mapped onto the panel's two faces along the cut
//    direction (an affine, oblique projection) and swept between them; for a
//    parallel panel that is the same shape, translated;
//  - edge-on (the cut direction lies in the panel's plane): the shape clipped
//    by the band the panel's thickness makes in the source plane, and its
//    extent along that band, as strips across the panel.
//
// Through-cuts never move a panel or create growable edges on other panels;
// each panel's removed region is derived here and never stored.
import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping';
import type { Design, P2, Panel, V3 } from './types';
import { frameNormal, matDir, toLocal, toWorld } from './frame';
import { instancePolys, ownOutline } from './outline';
import { panelEdges, segLength, type EdgeSeg } from './edges';
import { pointInPolygon, polygonArea } from '../geom/vec';
import { v3add, v3dot, v3mul, v3sub } from '../geom/v3';

export type ThroughHit = {
  /** Regions removed from the panel, panel-local polygons (they may overlap each other). */
  regions: P2[][];
  /** Source cut shapes that reach this panel. */
  sources: string[];
  /** The removed region only approximates a bevel (oblique or edge-on: the laser cuts square). */
  approx: boolean;
};

type Src = { panel: Panel; id: string; polys: P2[][] };

const FAR = 20000;
const ringOf = (pts: P2[]): Ring => {
  const ccw = polygonArea(pts) >= 0 ? pts : [...pts].reverse();
  return ccw.map((p) => [p.x, p.y] as [number, number]);
};
const fromMulti = (mp: MultiPolygon): P2[][] => mp.flatMap((poly) => poly.slice(0, 1).map((r) => r.slice(0, -1).map(([x, y]) => ({ x, y }))));

/** Through-cut shapes in a design, with their flattened polygons. */
function sources(d: Design): Src[] {
  const out: Src[] = [];
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p) continue;
    for (const dt of p.details) if (dt.op === 'cut' && dt.through) out.push({ panel: p, id: dt.id, polys: instancePolys(dt).flatMap((x) => x.polys) });
  }
  return out;
}

/** Panels a through-cut must not touch: its source, and panels grown from edges it made on its source. */
function excluded(d: Design, s: Src, pid: string): boolean {
  if (pid === s.panel.id) return true;
  return Object.values(d.connections).some((c) => c.grown && c.b.panelId === pid && c.a.panelId === s.panel.id && c.a.edge.startsWith(s.id + '.'));
}

/** Region one source shape removes from panel P (panel-local), or null when it misses. */
function regionOn(d: Design, s: Src, P: Panel): { polys: P2[][]; approx: boolean } | null {
  const t = d.material.thickness;
  const n = frameNormal(s.panel.frame);
  const mP = matDir(P.frame);
  const k = v3dot(n, mP);
  const world = s.polys.map((poly) => poly.map((q) => toWorld(s.panel.frame, q.x, q.y, 0)));
  const out: P2[][] = [];
  let approx = false;
  if (Math.abs(k) > 1e-6) {
    // project each shape point along n onto P's two faces
    const onFace = (w: V3, z: number): P2 => {
      const lam = (z - v3dot(v3sub(w, P.frame.o), mP)) / k;
      return toLocal(P.frame, v3add(w, v3mul(n, lam)));
    };
    for (const poly of world) {
      const a = poly.map((w) => onFace(w, 0)), b = poly.map((w) => onFace(w, t));
      const dx = b[0].x - a[0].x, dy = b[0].y - a[0].y;
      if (Math.hypot(dx, dy) < 1e-6) {
        out.push(a);
        continue;
      }
      // oblique: the shape swept from one face to the other
      approx = true;
      const parts: Polygon[] = [[ringOf(a)], [ringOf(b)]];
      for (let i = 0; i < a.length; i++) {
        const j = (i + 1) % a.length;
        const quad = [a[i], a[j], b[j], b[i]];
        if (Math.abs(polygonArea(quad)) > 1e-9) parts.push([ringOf(quad)]);
      }
      try {
        out.push(...fromMulti(polygonClipping.union(parts[0], ...parts.slice(1))));
      } catch {
        out.push(a, b);
      }
    }
  } else {
    // edge-on: P's slab meets the source plane in a band; strips across P where the shape crosses the band
    approx = true;
    const S = s.panel;
    // the band in source-local coordinates: points of the source plane at P-depth 0 and t
    const depth = (q: P2) => v3dot(v3sub(toWorld(S.frame, q.x, q.y, 0), P.frame.o), mP);
    const d0 = depth({ x: 0, y: 0 });
    const gx = depth({ x: 1, y: 0 }) - d0, gy = depth({ x: 0, y: 1 }) - d0; // gradient of P-depth in source coords
    const g2 = gx * gx + gy * gy;
    if (g2 < 1e-12) return null; // the planes are parallel and the cut runs within P's plane: nothing to cut
    // a band: d0 + gx x + gy y in [0, t]
    const gl = Math.sqrt(g2);
    const ux = gx / gl, uy = gy / gl; // across the band
    const ax = -uy, ay = ux; // along the band (the line where P meets the source plane)
    const c0 = -d0 / gl, c1 = (t - d0) / gl; // band edges, as positions across
    const band: P2[] = [
      { x: ux * c0 + ax * -FAR, y: uy * c0 + ay * -FAR },
      { x: ux * c0 + ax * FAR, y: uy * c0 + ay * FAR },
      { x: ux * c1 + ax * FAR, y: uy * c1 + ay * FAR },
      { x: ux * c1 + ax * -FAR, y: uy * c1 + ay * -FAR },
    ];
    let clipped: MultiPolygon = [];
    try {
      clipped = polygonClipping.intersection([ringOf(band)], s.polys.map((p) => [ringOf(p)]) as MultiPolygon);
    } catch {
      return null;
    }
    // the band's line in P: each clipped piece's extent along it becomes a strip across P, along the cut direction
    const nP = toLocal(P.frame, v3add(P.frame.o, n)); // the cut direction in P's plane
    const nL = Math.hypot(nP.x, nP.y) || 1;
    const nx = nP.x / nL, ny = nP.y / nL;
    for (const poly of clipped) {
      const ring = poly[0].map(([x, y]) => ({ x, y }));
      const along = ring.map((q) => q.x * ax + q.y * ay);
      const lo = Math.min(...along), hi = Math.max(...along);
      if (hi - lo < 1e-6) continue;
      // two points of the band line, in P-local
      const at = (w: number): P2 => {
        const q = { x: ux * ((c0 + c1) / 2) + ax * w, y: uy * ((c0 + c1) / 2) + ay * w };
        return toLocal(P.frame, toWorld(S.frame, q.x, q.y, 0));
      };
      const p0 = at(lo), p1 = at(hi);
      out.push([
        { x: p0.x - nx * FAR, y: p0.y - ny * FAR },
        { x: p1.x - nx * FAR, y: p1.y - ny * FAR },
        { x: p1.x + nx * FAR, y: p1.y + ny * FAR },
        { x: p0.x + nx * FAR, y: p0.y + ny * FAR },
      ]);
    }
  }
  // keep only what lands on the panel
  const outline: MultiPolygon = ownOutline(P).rings.map((r) => [ringOf(r.map((e) => e.a))]);
  const hit: P2[][] = [];
  for (const poly of out) {
    if (poly.length < 3) continue;
    try {
      const inter = polygonClipping.intersection([ringOf(poly)], outline);
      if (inter.some((pp) => Math.abs(polygonArea(pp[0].slice(0, -1).map(([x, y]) => ({ x, y })))) > 1e-6)) hit.push(poly);
    } catch {
      /* skip a degenerate region */
    }
  }
  return hit.length ? { polys: hit, approx } : null;
}

const cache = new Map<string, Map<string, ThroughHit>>();

/** Every panel's through-cut regions (panels no through-cut reaches are absent). Cached by content. */
export function throughHits(d: Design): Map<string, ThroughHit> {
  const srcs = sources(d);
  if (!srcs.length) return new Map();
  const sig = JSON.stringify([
    d.material.thickness,
    srcs.map((s) => [s.panel.id, s.id, s.polys, s.panel.frame]),
    d.order.map((id) => {
      const p = d.panels[id];
      return p ? [id, p.frame, p.w, p.h, p.sketch, (p as { ext?: unknown }).ext, p.details.filter((x) => x.op === 'add' || x.op === 'cut').map((x) => [x.id, x.cx, x.cy, x.w, x.h, x.op])] : null;
    }),
    Object.values(d.connections).filter((c) => c.grown).map((c) => [c.a.panelId, c.a.edge, c.b.panelId]),
  ]);
  const hit = cache.get(sig);
  if (hit) return hit;
  const res = new Map<string, ThroughHit>();
  for (const id of d.order) {
    const P = d.panels[id];
    if (!P) continue;
    for (const s of srcs) {
      if (excluded(d, s, id)) continue;
      const r = regionOn(d, s, P);
      if (!r) continue;
      const h = res.get(id) ?? { regions: [], sources: [], approx: false };
      h.regions.push(...r.polys);
      h.sources.push(s.id);
      h.approx ||= r.approx;
      res.set(id, h);
    }
  }
  if (cache.size > 100) cache.clear();
  cache.set(sig, res);
  return res;
}

/** Regions through-cuts remove from one panel (panel-local). */
export function throughRegions(d: Design, panelId: string): P2[][] {
  return throughHits(d).get(panelId)?.regions ?? [];
}

/** Panels a through-cut shape reaches (for the live preview count and highlight). */
export function panelsCutBy(d: Design, detailId: string): string[] {
  const out: string[] = [];
  for (const [id, h] of throughHits(d)) if (h.sources.includes(detailId)) out.push(id);
  return out;
}

/**
 * Parts of an edge (as [s0, s1] along it) that a through-cut removed: sampled
 * a hair inside the panel, every 0.25 mm. Empty when nothing touches it.
 */
export function edgeMask(d: Design, P: Panel, e: EdgeSeg): [number, number][] {
  const regions = throughRegions(d, P.id);
  if (!regions.length) return [];
  const L = segLength(e);
  const dx = (e.b.x - e.a.x) / L, dy = (e.b.y - e.a.y) / L;
  const ix = -dy * 0.05, iy = dx * 0.05;
  const step = 0.25;
  const out: [number, number][] = [];
  let start: number | null = null;
  for (let s = 0; s <= L + 1e-9; s += step) {
    const q = { x: e.a.x + dx * s + ix, y: e.a.y + dy * s + iy };
    const gone = regions.some((r) => pointInPolygon(q, r));
    if (gone && start === null) start = Math.max(0, s - step / 2);
    if (!gone && start !== null) {
      out.push([start, s - step / 2]);
      start = null;
    }
  }
  if (start !== null) out.push([start, L]);
  return out;
}

/** Is a panel entirely removed by through-cuts? */
export function removedByCut(d: Design, panelId: string): boolean {
  const P = d.panels[panelId];
  const regions = throughRegions(d, panelId);
  if (!P || !regions.length) return false;
  try {
    const own: MultiPolygon = ownOutline(P).rings.map((r) => [ringOf(r.map((e) => e.a))]);
    const left = polygonClipping.difference(own, ...regions.map((r) => [ringOf(r)] as Polygon));
    return left.every((pp) => Math.abs(polygonArea(pp[0].slice(0, -1).map(([x, y]) => ({ x, y })))) < 0.5);
  } catch {
    return false;
  }
}

export { panelEdges };
