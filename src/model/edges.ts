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
//   <key>^~<n>      segment n of the arc of a rounded corner (milestone 45),
//                   the corner at the start of edge <key>: a curve key too
//   face            the panel's face (edge-on-face and crossing seams)
//
// This module derives the keyed outline of a panel: layer 1 (its sketch) and
// layer 3 (the straight edges of its own outline, see POLYGONS_AND_CUTS.md §3).
import type { P2, Panel, Sketch, SketchPt, WallSketch } from './types';

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

/** Arc flattening tolerance (mm): the chord's largest distance from the arc. */
const ARC_TOL = 0.02;

/** A rounded corner as built: its tangent points, centre and radius (after clamping). */
export type Fillet = { i: number; t1: P2; t2: P2; c: P2; r: number };

/**
 * Rounded corners (milestone 45): at each point with `curve: 'round'` a
 * tangent circular arc of radius r replaces the corner. Where the arcs at the
 * two ends of an edge would overlap, both are scaled down so they meet.
 */
export function fillets(pts: SketchPt[]): (Fillet | null)[] {
  const n = pts.length;
  const out: (Fillet | null)[] = pts.map(() => null);
  if (n < 3) return out;
  const L = new Array<number>(n).fill(0), half = new Array<number>(n).fill(0);
  const unit = (x: number, y: number) => {
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l };
  };
  const u1s: P2[] = [], u2s: P2[] = [];
  for (let i = 0; i < n; i++) {
    const V = pts[i], P = pts[(i + n - 1) % n], N = pts[(i + 1) % n];
    const u1 = unit(P.x - V.x, P.y - V.y), u2 = unit(N.x - V.x, N.y - V.y);
    u1s.push(u1);
    u2s.push(u2);
    if (V.curve !== 'round' || !(V.r && V.r > 0)) continue;
    const th = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y)));
    // a straight-through point or a spike has no corner to round
    if (th < 1e-6 || Math.PI - th < 1e-6) continue;
    half[i] = th / 2;
    L[i] = V.r / Math.tan(th / 2);
  }
  const scale = new Array<number>(n).fill(1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const len = Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
    if (L[i] + L[j] > len + 1e-12) {
      const k = len / (L[i] + L[j]);
      scale[i] = Math.min(scale[i], k);
      scale[j] = Math.min(scale[j], k);
    }
  }
  for (let i = 0; i < n; i++) {
    if (!L[i]) continue;
    const V = pts[i], u1 = u1s[i], u2 = u2s[i];
    const l = L[i] * scale[i], r = l * Math.tan(half[i]);
    const b = unit(u1.x + u2.x, u1.y + u2.y), dist = r / Math.sin(half[i]);
    out[i] = { i, t1: { x: V.x + u1.x * l, y: V.y + u1.y * l }, t2: { x: V.x + u2.x * l, y: V.y + u2.y * l }, c: { x: V.x + b.x * dist, y: V.y + b.y * dist }, r };
  }
  return out;
}

/** An arc from t1 to t2 about c (the short way round), flattened within ARC_TOL; every point lies on the circle. */
function arcPoints(f: Fillet): P2[] {
  const a1 = Math.atan2(f.t1.y - f.c.y, f.t1.x - f.c.x), a2 = Math.atan2(f.t2.y - f.c.y, f.t2.x - f.c.x);
  let da = a2 - a1;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da <= -Math.PI) da += 2 * Math.PI;
  const step = 2 * Math.acos(Math.max(-1, 1 - ARC_TOL / Math.max(f.r, ARC_TOL)));
  // an even count puts a point at the arc's middle: an oval's or a circle's extreme lies exactly on the outline
  const k = 2 * Math.max(1, Math.min(256, Math.ceil(Math.abs(da) / step / 2)));
  const out: P2[] = [];
  for (let j = 1; j < k; j++) out.push({ x: f.c.x + f.r * Math.cos(a1 + (da * j) / k), y: f.c.y + f.r * Math.sin(a1 + (da * j) / k) });
  return [f.t1, ...out, f.t2];
}

/** Points of a circular arc from a to b bulging `rise` mm to the left of a → b (outward on a CCW ring's top edge). */
function archPoints(a: P2, b: P2, rise: number): P2[] {
  const c = Math.hypot(b.x - a.x, b.y - a.y);
  if (c < 1e-9) return [a, b];
  const r = Math.min(rise, c / 2 - 1e-6);
  const R = (c * c / 4 + r * r) / (2 * r);
  const ux = (b.x - a.x) / c, uy = (b.y - a.y) / c;
  // the outward side: right of a → b on a CCW ring (the top runs right to left, so outward is up)
  const nx = uy, ny = -ux;
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const ctr = { x: m.x - nx * (R - r), y: m.y - ny * (R - r) };
  return arcPoints({ i: 0, t1: a, t2: b, c: ctr, r: R });
}

/** A polygon sketch's ring with its rounded corners: trimmed straight edges and arcs keyed `<outgoing edge>^~<n>`. */
function roundRing(pts: SketchPt[], keys: string[]): EdgeSeg[] {
  const n = pts.length;
  const fs = fillets(pts);
  const out: EdgeSeg[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = fs[i]?.t2 ?? { x: pts[i].x, y: pts[i].y }, b = fs[j]?.t1 ?? { x: pts[j].x, y: pts[j].y };
    // a straight part shorter than a micron is where two arcs meet (an oval's, a circle's): none
    if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-6) out.push({ key: keys[i] ?? `e${i}`, a, b });
    const f = fs[j];
    if (f) {
      const q = arcPoints(f);
      for (let m = 0; m + 1 < q.length; m++) out.push({ key: `${keys[j] ?? `e${j}`}^~${m}`, a: q[m], b: q[m + 1] });
    }
  }
  // close exactly: each segment starts where the one before it ends
  for (let m = 0; m < out.length; m++) out[(m + 1) % out.length].a = out[m].b;
  return out;
}

/** Layer 1: the sketch outline as keyed CCW edges (curves flattened). */
export function sketchRing(p: Pick<Panel, 'w' | 'h'> & { sketch?: Sketch; ext?: Panel['ext'] }): EdgeSeg[] {
  const s = sketchOf(p);
  if (s.kind === 'poly') {
    if (!s.pts.some((q) => q.curve)) return straightRing(p);
    // rounded corners first, then auto curves on the straight edges left
    const ring = s.pts.some((q) => q.curve === 'round') ? roundRing(s.pts, s.edgeIds) : straightRing(p);
    if (!s.pts.some((q) => q.curve === 'auto')) return ring;
    const at = new Map(s.edgeIds.map((k, i) => [k, s.pts[i]?.curve === 'auto']));
    return curveRing(ring, (e) => !!at.get(e.key));
  }
  const ring = straightRing(p);
  // an arched top (milestone 48): a circular arc from the top right corner to the top left, keyed e2~n
  if (s.arch && s.arch > 1e-6) {
    const i = ring.findIndex((e) => e.key === 'e2');
    if (i >= 0) {
      const e = ring[i];
      // the top's other points belong to the arch's chord
      let j = i + 1;
      while (j < ring.length && ring[j].key !== 'e3') j++;
      const a = e.a, b = (ring[j - 1] ?? e).b;
      const arc = archPoints(a, b, s.arch);
      const segs: EdgeSeg[] = arc.slice(1).map((q, k) => ({ key: `e2~${k}`, a: arc[k], b: q }));
      return [...ring.slice(0, i), ...segs, ...ring.slice(j)];
    }
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

// ---------------------------------------------------------------------------
// Curve runs (milestone 46, CURVED_WALLS.md §3.1): the maximal chains of
// curve segments (`~`) between straight edges or sharp corners. A bent wall
// stands on a run, named by the run's key: its first segment's key without the
// segment number (`e2^~` for a rounded corner's arc, `e2~` for an auto curve).
// A closed run (a circle, an oval) is named by the smallest of its segments'
// prefixes and starts at the back left of the outline (its point furthest
// towards local (−1, 1)), where its closing seam is.

/** A run of curve segments: `prev` / `next` are the straight edges either side (absent on a closed run). */
export type CurveRun = {
  key: string;
  segs: EdgeSeg[];
  closed: boolean;
  prev?: string;
  next?: string;
  /** The run leaves its neighbour edge without a corner (a rounded corner always does). */
  tanStart: boolean;
  tanEnd: boolean;
  /** Length along the outline. */
  length: number;
  /** Tightest radius along the run (mm), from its flattened segments. */
  minR: number;
};

/** A run key ends in `~` (a segment key ends in `~<n>`). */
export const isRunKey = (key: string) => /~$/.test(key);
/** The run prefix of a curve segment key: `e1^~3` → `e1^~`. */
export const runPrefix = (key: string) => key.replace(/~\d+(#\d+)?$/, '~');

const turnOf = (a: EdgeSeg, b: EdgeSeg) => {
  const da = segDir(a), db = segDir(b);
  return Math.atan2(da.x * db.y - da.y * db.x, da.x * db.x + da.y * db.y);
};

/** The curve runs of a panel's outline (all its rings). */
export function curveRuns(p: Edged): CurveRun[] {
  const out: CurveRun[] = [];
  for (const ring of ownRings(p)) out.push(...ringRuns(ring));
  return out;
}

function ringRuns(ring: EdgeSeg[]): CurveRun[] {
  const n = ring.length;
  const cv = ring.map((e) => isCurveKey(e.key));
  if (!cv.some(Boolean) || n < 2) return [];
  // turn at the start of each segment (from the one before it)
  const turn = ring.map((e, i) => turnOf(ring[(i + n - 1) % n], e));
  // a junction between curve segments of different curves breaks the run when it turns far more than the segments around it
  const brk = ring.map((e, i) => {
    const pv = ring[(i + n - 1) % n];
    if (!cv[i] || !cv[(i + n - 1) % n]) return true;
    if (Math.hypot(pv.b.x - e.a.x, pv.b.y - e.a.y) > 1e-6) return true;
    if (runPrefix(pv.key) === runPrefix(e.key)) return false;
    const inner = Math.max(Math.abs(turn[(i + n - 1) % n]), Math.abs(turn[(i + 1) % n]));
    return Math.abs(turn[i]) > 1.5 * inner + 1e-3;
  });
  const runs: CurveRun[] = [];
  const make = (idx: number[], closed: boolean): CurveRun => {
    const segs = idx.map((i) => ring[i]);
    let minR = Infinity;
    for (let j = 1; j < segs.length; j++) {
      const th = Math.abs(turnOf(segs[j - 1], segs[j]));
      if (th < 1e-9) continue;
      const c = (segLength(segs[j - 1]) + segLength(segs[j])) / 2;
      minR = Math.min(minR, c / (2 * Math.sin(th / 2)));
    }
    const length = segs.reduce((s, e) => s + segLength(e), 0);
    if (closed) {
      const key = [...new Set(segs.map((e) => runPrefix(e.key)))].sort()[0];
      return { key, segs, closed, tanStart: true, tanEnd: true, length, minR };
    }
    const first = idx[0], last = idx[idx.length - 1];
    const pv = ring[(first + n - 1) % n], nx = ring[(last + 1) % n];
    const innerS = segs.length > 1 ? Math.abs(turnOf(segs[0], segs[1])) : 0, innerE = segs.length > 1 ? Math.abs(turnOf(segs[segs.length - 2], segs[segs.length - 1])) : 0;
    const joinedS = Math.hypot(pv.b.x - segs[0].a.x, pv.b.y - segs[0].a.y) < 1e-6, joinedE = Math.hypot(nx.a.x - segs[segs.length - 1].b.x, nx.a.y - segs[segs.length - 1].b.y) < 1e-6;
    return {
      key: runPrefix(segs[0].key),
      segs,
      closed,
      ...(cv[(first + n - 1) % n] ? {} : { prev: pv.key }),
      ...(cv[(last + 1) % n] ? {} : { next: nx.key }),
      tanStart: joinedS && Math.abs(turn[first]) <= 0.75 * innerS + 1e-3,
      tanEnd: joinedE && Math.abs(turn[(last + 1) % n]) <= 0.75 * innerE + 1e-3,
      length,
      minR,
    };
  };
  if (!brk.some(Boolean)) {
    // one closed run: start at the back left (furthest towards local (−1, 1)), where no divider drawn
    // on the box's grid or in 30° steps through its middle meets the closing seam
    let s = 0;
    const k = (q: P2) => q.y - q.x;
    for (let i = 1; i < n; i++) if (k(ring[i].a) > k(ring[s].a) + 1e-9) s = i;
    return [make(Array.from({ length: n }, (_, j) => (s + j) % n), true)];
  }
  // start at a break, then cut the ring at every break
  const s = brk.findIndex(Boolean);
  let cur: number[] = [];
  for (let j = 0; j < n; j++) {
    const i = (s + j) % n;
    if (brk[i] && cur.length) {
      runs.push(make(cur, false));
      cur = [];
    }
    if (cv[i]) cur.push(i);
  }
  if (cur.length) runs.push(make(cur, false));
  return runs;
}

/** A run by key. */
export function findRun(p: Edged, key: string): CurveRun | undefined {
  return curveRuns(p).find((r) => r.key === key);
}
