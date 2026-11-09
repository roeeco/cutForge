// Edge identity (schema v6). Every panel edge is named by a key instead of an
// index, so it keeps its name when the outline changes:
//
//   e<n>            a sketch edge: a base polygon's stored edge id, or a
//                   wall's e0 bottom (attached), e1 right, e2 top, e3 left
//   <insertId>      the part of a wall edge after an inserted point
//   <detailId>.<i>  segment i of an Add/Cut shape that became outline
//   <key>#<n>       piece n of an edge a cut split into several pieces
//   <key>~<n>       segment n of an edge flattened into a curve (next to an
//                   auto-curve point): not growable, not joined
//   face            the panel's face (edge-on-face and crossing seams)
//
// This module derives the keyed outline of a panel: layer 1 (its sketch) and
// layer 3 (the straight edges of its own outline, see POLYGONS_AND_CUTS.md §3).
import type { P2, Panel, Sketch, WallSketch } from './types';

export const FACE = 'face';
export type EdgeArg = string | number;

/** Normalise an edge argument: a number n means sketch edge `e<n>`, -1 the face. */
export function ek(e: EdgeArg): string {
  if (typeof e === 'number') return e < 0 ? FACE : `e${e}`;
  return e;
}

/** A straight edge of a panel outline, CCW: the material is on its left. */
export type EdgeSeg = { key: string; a: P2; b: P2 };

const z = (x: number) => x + 0; // -0 → 0

export function segLength(s: EdgeSeg): number {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
  if (dx === 0) return Math.abs(dy);
  if (dy === 0) return Math.abs(dx);
  return Math.hypot(dx, dy);
}
/** Unit direction a → b. */
export function segDir(s: EdgeSeg): P2 {
  const l = segLength(s);
  return { x: z((s.b.x - s.a.x) / l), y: z((s.b.y - s.a.y) / l) };
}
/** Unit vector from the edge into the panel (left of a CCW edge). */
export function segInward(s: EdgeSeg): P2 {
  const d = segDir(s);
  return { x: z(-d.y), y: z(d.x) };
}
/** Point at distance `s` along the edge and `depth` inward from it. */
export function segPoint(e: EdgeSeg, s: number, depth: number): P2 {
  const d = segDir(e), i = segInward(e);
  return { x: e.a.x + d.x * s + i.x * depth, y: e.a.y + d.y * s + i.y * depth };
}

export function rectSketch(w: number, h: number): Sketch {
  return { kind: 'poly', pts: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], edgeIds: ['e0', 'e1', 'e2', 'e3'] };
}

/** The panel's sketch (older in-memory panels without one are plain rectangles). */
export function sketchOf(p: Pick<Panel, 'w' | 'h'> & { sketch?: Sketch }): Sketch {
  return p.sketch ?? { kind: 'wall' };
}

/** Wall sketch corners after their offsets, CCW from bottom left. */
export function wallCorners(w: number, h: number, s: WallSketch): P2[] {
  const c = s.corners ?? {};
  return [
    { x: 0 + (c.bl?.dx ?? 0), y: 0 },
    { x: w + (c.br?.dx ?? 0), y: 0 },
    { x: w + (c.tr?.dx ?? 0), y: h + (c.tr?.dy ?? 0) },
    { x: 0 + (c.tl?.dx ?? 0), y: h + (c.tl?.dy ?? 0) },
  ];
}

/** True when an edge key is a segment of a curve (next to an auto-curve point). */
export const isCurveKey = (key: string) => /~\d+/.test(key);

/** Curve flattening tolerance (mm): the chord's largest distance from the curve. */
const FLAT_TOL = 0.02;

/**
 * Layer 1 with curves: every straight edge next to an auto-curve point
 * becomes a cubic through its ends, flattened into segments `<key>~<n>`.
 * At a curve point the tangent is parallel to the line between its
 * neighbours and the handle a third of the side's length; at a corner end the
 * handle points along the edge, so the curve leaves a corner as straight as it
 * can.
 */
function curveRing(ring: EdgeSeg[], smooth: (e: EdgeSeg) => boolean): EdgeSeg[] {
  const n = ring.length;
  const sm = ring.map(smooth);
  if (n < 3 || !sm.some(Boolean)) return ring;
  const out: EdgeSeg[] = [];
  const unit = (x: number, y: number) => {
    const L = Math.hypot(x, y) || 1;
    return { x: x / L, y: y / L };
  };
  for (let i = 0; i < n; i++) {
    const e = ring[i], A = e.a, B = e.b;
    const sA = sm[i], sB = sm[(i + 1) % n];
    if (!sA && !sB) {
      out.push(e);
      continue;
    }
    const L = Math.hypot(B.x - A.x, B.y - A.y);
    const prev = ring[(i + n - 1) % n].a, next = ring[(i + 1) % n].b;
    const tA = sA ? unit(B.x - prev.x, B.y - prev.y) : unit(B.x - A.x, B.y - A.y);
    const tB = sB ? unit(next.x - A.x, next.y - A.y) : unit(B.x - A.x, B.y - A.y);
    const P1 = { x: A.x + (tA.x * L) / 3, y: A.y + (tA.y * L) / 3 }, P2 = { x: B.x - (tB.x * L) / 3, y: B.y - (tB.y * L) / 3 };
    const M = Math.max(Math.hypot(A.x - 2 * P1.x + P2.x, A.y - 2 * P1.y + P2.y), Math.hypot(P1.x - 2 * P2.x + B.x, P1.y - 2 * P2.y + B.y));
    const k = Math.max(2, Math.min(64, Math.ceil(Math.sqrt((0.75 * M) / FLAT_TOL))));
    let q = A;
    for (let j = 1; j <= k; j++) {
      const t = j / k, u = 1 - t;
      const r = j === k ? B : { x: u * u * u * A.x + 3 * u * u * t * P1.x + 3 * u * t * t * P2.x + t * t * t * B.x, y: u * u * u * A.y + 3 * u * u * t * P1.y + 3 * u * t * t * P2.y + t * t * t * B.y };
      out.push({ key: `${e.key}~${j - 1}`, a: q, b: r });
      q = r;
    }
  }
  return out;
}

/** Layer 1: the sketch outline as keyed CCW edges (curves flattened). */
export function sketchRing(p: Pick<Panel, 'w' | 'h'> & { sketch?: Sketch; ext?: Panel['ext'] }): EdgeSeg[] {
  const ring = straightRing(p);
  const s = sketchOf(p);
  if (s.kind === 'poly') {
    if (!s.pts.some((q) => q.curve)) return ring;
    const at = new Map(s.edgeIds.map((k, i) => [k, !!s.pts[i]?.curve]));
    return curveRing(ring, (e) => !!at.get(e.key));
  }
  const ins = new Map((s.inserts ?? []).map((x) => [x.id, !!x.curve]));
  if (!s.corners?.tr?.curve && !s.corners?.tl?.curve && ![...ins.values()].some(Boolean)) return ring;
  // the point an edge starts at: e2 at the top right corner, e3 at the top left, an insert's piece at the insert
  return curveRing(ring, (e) => (e.key === 'e2' ? !!s.corners?.tr?.curve : e.key === 'e3' ? !!s.corners?.tl?.curve : !!ins.get(e.key)));
}

/** Layer 1 without curves: the sketch's straight edges between its points. */
export function straightRing(p: Pick<Panel, 'w' | 'h'> & { sketch?: Sketch; ext?: Panel['ext'] }): EdgeSeg[] {
  const s = sketchOf(p);
  if (s.kind === 'poly') {
    const n = s.pts.length;
    // plain copies: results are cached, and the sketch may be a draft that is revoked later
    const pts = s.pts.map((q) => ({ x: q.x, y: q.y }));
    return pts.map((a, i) => ({ key: s.edgeIds[i] ?? `e${i}`, a, b: pts[(i + 1) % n] }));
  }
  const c = wallCorners(p.w, p.h, s);
  const ext = (p as { ext?: { s: number; e: number } }).ext;
  if (ext) {
    c[0] = { x: c[0].x - ext.s, y: c[0].y };
    c[3] = { x: c[3].x - ext.s, y: c[3].y };
    c[1] = { x: c[1].x + ext.e, y: c[1].y };
    c[2] = { x: c[2].x + ext.e, y: c[2].y };
  }
  const out: EdgeSeg[] = [];
  for (let i = 0; i < 4; i++) {
    const a = c[i], b = c[(i + 1) % 4];
    const key = `e${i}`;
    const ins = i === 0 ? [] : (s.inserts ?? []).filter((x) => x.edge === key).sort((x, y) => x.t - y.t);
    if (!ins.length) {
      out.push({ key, a, b });
      continue;
    }
    const base: EdgeSeg = { key, a, b };
    const L = segLength(base), inw = segInward(base);
    let prev = a, prevKey = key;
    for (const k of ins) {
      const q = segPoint(base, Math.max(0, Math.min(1, k.t)) * L, 0);
      const pt = { x: q.x - inw.x * k.off, y: q.y - inw.y * k.off };
      out.push({ key: prevKey, a: prev, b: pt });
      prev = pt;
      prevKey = k.id;
    }
    out.push({ key: prevKey, a: prev, b });
  }
  return out.filter((e) => segLength(e) > 1e-9);
}

/**
 * Layer 3: the straight, growable edges of a panel's own outline (sketch ∪
 * its Add shapes − its Cut shapes, src/model/outline.ts), all rings in turn.
 */
export function panelEdges(p: Edged): EdgeSeg[] {
  const r = ownRings(p);
  return r.length === 1 ? r[0] : r.flat();
}

type Edged = Pick<Panel, 'w' | 'h'> & { sketch?: Sketch; details?: Panel['details'] };
// own-outline hook, set by outline.ts (which needs the shape geometry)
let ownRings: (p: Edged) => EdgeSeg[][] = (p) => [sketchRing(p)];
export function setOwnRings(f: typeof ownRings) {
  ownRings = f;
}

/**
 * An edge by key. A key whose edge a cut split into pieces finds its first
 * piece (`<key>#0`): a wall on that edge stays on the first piece.
 */
export function findEdge(p: Edged, key: EdgeArg): EdgeSeg | undefined {
  const k = ek(key);
  const all = panelEdges(p);
  return all.find((e) => e.key === k) ?? (k.includes('#') ? undefined : all.find((e) => e.key === `${k}#0`));
}

/** Pieces an edge key was split into (just the edge itself when whole), in order. */
export function edgePieces(p: Edged, key: string): EdgeSeg[] {
  const all = panelEdges(p);
  const whole = all.find((e) => e.key === key);
  if (whole) return [whole];
  return all.filter((e) => e.key.startsWith(key + '#') && /^\d+$/.test(e.key.slice(key.length + 1))).sort((a, b) => Number(a.key.split('#').pop()) - Number(b.key.split('#').pop()));
}

/** The edges before and after `key` around its ring (its corner neighbours). */
export function edgeNeighbours(p: Edged, key: EdgeArg): [EdgeSeg, EdgeSeg] | null {
  const e = findEdge(p, key);
  if (!e) return null;
  for (const ring of ownRings(p)) {
    const i = ring.findIndex((x) => x.key === e.key);
    if (i < 0) continue;
    const n = ring.length;
    return [ring[(i + n - 1) % n], ring[(i + 1) % n]];
  }
  return null;
}

/** Rectangle-sketch edge index (0–3) of a key, when the panel is a plain rectangle: for names. */
export function rectEdgeIndex(key: string): number | null {
  const m = /^e([0-3])$/.exec(key);
  return m ? Number(m[1]) : null;
}

/** An axis-aligned rectangle sketch (0,0)–(w,h) with the four plain edge ids. */
export function isRectSketch(p: Pick<Panel, 'w' | 'h'> & { sketch?: Sketch }): boolean {
  const s = sketchOf(p);
  if (s.kind === 'wall') return !s.inserts?.length && !Object.values(s.corners ?? {}).some((c) => c && (c.dx || c.dy || c.curve));
  const r = rectSketch(p.w, p.h) as Extract<Sketch, { kind: 'poly' }>;
  return s.pts.length === 4 && !s.pts.some((q) => q.curve) && s.pts.every((q, i) => q.x === r.pts[i].x && q.y === r.pts[i].y) && s.edgeIds.every((k, i) => k === `e${i}`);
}
