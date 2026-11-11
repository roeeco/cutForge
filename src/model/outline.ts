// Layer 2 and 3 of the outline pipeline (POLYGONS_AND_CUTS.md §3):
//
//   own outline = sketch ∪ the panel's own Add shapes − its own Cut shapes
//
// Cuts always win over Adds, whatever order they were drawn in. A Cut shape
// entirely inside the material stays a hole (and keeps its arcs); one that
// crosses the outline becomes part of it (a notch), flattened at the 0.01 mm
// curve tolerance. Every straight segment of the result is named after where
// it came from: a sketch edge keeps its key (pieces of an edge a cut split are
// `<key>#0`, `<key>#1` … in order along the edge), and a segment from a shape
// is `<detailId>.<i>`.
import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping';
import type { Contour } from '../geom/types';
import { flattenContour, pointInPolygon, polygonArea } from '../geom/vec';
import type { Detail, P2, Panel } from './types';
import { segLength, setOwnRings, sketchRing, type EdgeSeg } from './edges';
import { detailInstances, shapeContours } from './geometry';

type Edged = Pick<Panel, 'w' | 'h'> & { sketch?: Panel['sketch']; details?: Detail[] };

export type OwnOutline = {
  /** Outer rings, CCW, keyed; the largest first. More than one = the panel's own shapes split it. */
  rings: EdgeSeg[][];
  /** Holes the booleans made (an Add ring enclosing empty space), CCW. */
  holes: P2[][];
  /** Shape instances that are part of the outline (`<detailId>#<instance>`): Adds, and Cuts that cross it. */
  consumed: Set<string>;
};

const TOL = 1e-6;
const CURVE = 0.01;

/** Is a cut instance (its flattened contours) strictly inside a simple polygon without touching its edges? */
function insidePoly(polys: P2[][], ring: P2[]): boolean {
  for (const poly of polys) {
    for (const q of poly) if (!pointInPolygon(q, ring) || distToRing(q, ring) <= TOL) return false;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      for (let j = 0; j < ring.length; j++) if (segsCross(a, b, ring[j], ring[(j + 1) % ring.length])) return false;
    }
  }
  return true;
}
function distToRing(q: P2, ring: P2[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2));
    best = Math.min(best, Math.hypot(q.x - a.x - dx * t, q.y - a.y - dy * t));
  }
  return best;
}
function segsCross(p1: P2, p2: P2, q1: P2, q2: P2): boolean {
  const cr = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const d1 = cr(q1, q2, p1), d2 = cr(q1, q2, p2), d3 = cr(p1, p2, q1), d4 = cr(p1, p2, q2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

const toRing = (pts: P2[]): Ring => {
  const ccw = polygonArea(pts) >= 0 ? pts : [...pts].reverse();
  return ccw.map((p) => [p.x, p.y] as [number, number]);
};

/** Flattened polygons of each instance of a shape. */
export function instancePolys(dt: Detail): { inst: number; polys: P2[][] }[] {
  return detailInstances(dt).map((inst, i) => ({ inst: i, polys: shapeContours(inst).map((c: Contour) => flattenContour(c, CURVE)).filter((p) => p.length >= 3) }));
}

type Source = { key: string; a: P2; b: P2; sketch: boolean };

function onSource(a: P2, b: P2, s: Source): boolean {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-12) return false;
  const off = (q: P2) => Math.abs((q.x - s.a.x) * dy - (q.y - s.a.y) * dx) / L;
  const par = (q: P2) => ((q.x - s.a.x) * dx + (q.y - s.a.y) * dy) / L;
  const tol = 1e-5;
  return off(a) < tol && off(b) < tol && par(a) > -tol && par(a) < L + tol && par(b) > -tol && par(b) < L + tol;
}

/** Key each segment of a result ring by its source, merging collinear runs of one source. */
function keyRing(pts: P2[], sources: Source[], snap: P2[]): { key: string; a: P2; b: P2; src?: Source }[] {
  // snap result vertices back onto the exact sketch vertices
  const q = pts.map((p) => snap.find((s) => Math.abs(s.x - p.x) < 1e-7 && Math.abs(s.y - p.y) < 1e-7) ?? p);
  const segs: { key: string; a: P2; b: P2; src?: Source }[] = [];
  for (let i = 0; i < q.length; i++) {
    const a = q[i], b = q[(i + 1) % q.length];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue;
    const src = sources.find((s) => s.sketch && onSource(a, b, s)) ?? sources.find((s) => onSource(a, b, s));
    segs.push({ key: src?.key ?? `x${i}`, a, b, src });
  }
  // merge consecutive segments of the same source (the booleans split edges where other rings touched)
  const out: typeof segs = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && last.key === s.key) last.b = s.b;
    else out.push({ ...s });
  }
  if (out.length > 1 && out[0].key === out[out.length - 1].key) {
    out[0].a = out[out.length - 1].a;
    out.pop();
  }
  return out;
}

const cache = new Map<string, OwnOutline>();

/** The panel's own outline (layer 2), keyed (layer 3). Cached by content. */
export function ownOutline(p: Edged): OwnOutline {
  const ring = sketchRing(p);
  const shaped = (p.details ?? []).filter((dt) => dt.op === 'add' || dt.op === 'cut');
  if (!shaped.length) return { rings: [ring], holes: [], consumed: new Set() };
  const sig = JSON.stringify([p.w, p.h, p.sketch, (p as { ext?: unknown }).ext, shaped.map((dt) => [dt.id, dt.op, dt.shape, dt.cx, dt.cy, dt.w, dt.h, dt.r, dt.text, dt.path, dt.array])]);
  const hit = cache.get(sig);
  if (hit) return hit;
  const res = compute(ring, shaped);
  if (cache.size > 400) cache.clear();
  cache.set(sig, res);
  return res;
}

function compute(ring: EdgeSeg[], shaped: Detail[]): OwnOutline {
  const sk = ring.map((e) => e.a);
  const adds: { id: string; inst: number; polys: P2[][] }[] = [];
  const cuts: { id: string; inst: number; polys: P2[][] }[] = [];
  for (const dt of shaped) for (const ip of instancePolys(dt)) (dt.op === 'add' ? adds : cuts).push({ id: dt.id, ...ip });
  const consumed = new Set<string>(adds.map((a) => `${a.id}#${a.inst}`));
  // a cut entirely inside the sketch (with no Adds around) stays a hole
  const crossing = cuts.filter((c) => adds.length > 0 || !insidePoly(c.polys, sk));
  if (!adds.length && !crossing.length) return { rings: [ring], holes: [], consumed };
  let mat: MultiPolygon = [[toRing(sk)]];
  try {
    const addPolys: Polygon[] = adds.flatMap((a) => a.polys.map((p) => [toRing(p)] as Polygon));
    if (addPolys.length) mat = polygonClipping.union(mat, ...addPolys);
    // with Adds, a cut that lies inside the material without touching it is still a hole
    const realCross = adds.length
      ? crossing.filter((c) => {
          const cp: MultiPolygon = c.polys.map((p) => [toRing(p)]);
          const outside = polygonClipping.difference(cp, mat);
          const touches = c.polys.some((poly) => poly.some((q) => mat.some((mp) => mp.some((r) => distToRing(q, r.map(([x, y]) => ({ x, y }))) <= TOL))));
          return outside.length > 0 || touches;
        })
      : crossing;
    for (const c of realCross) consumed.add(`${c.id}#${c.inst}`);
    const cutPolys: Polygon[] = realCross.flatMap((c) => c.polys.map((p) => [toRing(p)] as Polygon));
    if (cutPolys.length) mat = polygonClipping.difference(mat, ...cutPolys);
  } catch {
    return { rings: [ring], holes: [], consumed: new Set() };
  }
  // sources for naming the result's segments
  const sources: Source[] = ring.map((e) => ({ key: e.key, a: e.a, b: e.b, sketch: true }));
  for (const s of [...adds, ...cuts]) {
    if (!consumed.has(`${s.id}#${s.inst}`)) continue;
    let k = 0;
    for (const poly of s.polys)
      for (let i = 0; i < poly.length; i++, k++) sources.push({ key: s.inst ? `${s.id}.${s.inst}_${k}` : `${s.id}.${k}`, a: poly[i], b: poly[(i + 1) % poly.length], sketch: false });
  }
  const rings: { segs: ReturnType<typeof keyRing>; area: number }[] = [];
  const holes: P2[][] = [];
  for (const poly of mat) {
    poly.forEach((r, ri) => {
      let pts = r.slice(0, r.length - 1).map(([x, y]) => ({ x, y }));
      if (pts.length < 3) return;
      const area = polygonArea(pts);
      // a ring of no area is clipping noise, not material or a hole (BUGFIX_PLAN B14)
      if (Math.abs(area) < 1e-6) return;
      if (ri === 0) {
        if (area < 0) pts = pts.reverse();
        rings.push({ segs: keyRing(pts, sources, sk), area: Math.abs(area) });
      } else holes.push(area < 0 ? pts.reverse() : pts);
    });
  }
  rings.sort((a, b) => b.area - a.area);
  // number the pieces of an edge that was split, in order along the source edge
  const all = rings.flatMap((r) => r.segs);
  const count = new Map<string, number>();
  for (const s of all) count.set(s.key, (count.get(s.key) ?? 0) + 1);
  for (const [key, n] of count) {
    if (n < 2) continue;
    const pieces = all.filter((s) => s.key === key);
    const src = pieces[0].src;
    const along = (s: (typeof pieces)[number]) => (src ? (s.a.x - src.a.x) * (src.b.x - src.a.x) + (s.a.y - src.a.y) * (src.b.y - src.a.y) : 0);
    pieces.sort((x, y) => along(x) - along(y)).forEach((s, i) => (s.key = `${key}#${i}`));
  }
  return { rings: rings.map((r) => r.segs.map(({ key, a, b }) => ({ key, a, b }))), holes, consumed };
}

setOwnRings((p) => ownOutline(p).rings);

/** The rings of a panel's own outline (each a closed CCW list of keyed edges). */
export function panelRings(p: Edged): EdgeSeg[][] {
  return ownOutline(p).rings;
}

/** Cut shape instances that stay holes (inside the material), with their contours (arcs kept). */
export function holeCuts(p: Edged & { details: Detail[] }): { dt: Detail; contours: Contour[] }[] {
  const o = ownOutline(p);
  const out: { dt: Detail; contours: Contour[] }[] = [];
  for (const dt of p.details) {
    if (dt.op !== 'cut') continue;
    const inst = detailInstances(dt);
    const contours = inst.flatMap((x, i) => (o.consumed.has(`${dt.id}#${i}`) ? [] : shapeContours(x)));
    if (contours.length) out.push({ dt, contours });
  }
  return out;
}

/** Is any instance of this shape part of the outline (an Add, or a Cut across the edge)? */
export function isOutlineShape(p: Edged, detailId: string): boolean {
  for (const k of ownOutline(p).consumed) if (k.startsWith(detailId + '#')) return true;
  return false;
}

export const ringLength = (r: EdgeSeg[]) => r.reduce((s, e) => s + segLength(e), 0);
