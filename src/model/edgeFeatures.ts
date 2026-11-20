// The edge-feature registry (milestone 111, DIELINE_DNA_PLAN.md D3a): what a
// board adds on one of its free edges, behind one interface. Two kinds today:
// fold-overs (milestone 61) and flaps (milestone 67, shaped in 112). Their
// output feeds `extrasByPanel` in one loop, in the same order as before:
// every fold-over (by `d.order`, then by array), then every flap.
import type { Design, EdgeFlap, Flap3d, FlapShape, FoldOver, Frame, P2, Panel, V3 } from './types';
import type { MsgKey } from '../i18n';
import { findEdge, panelEdges, segDir, segInward, segLength, type EdgeSeg } from './edges';
import { allFoldOvers } from './foldover';
import { memo } from './derived';
import { matDir, toWorld } from './frame';
import { matOf, tOf } from './materials';
import { autoFlap } from './seams';
import { fillets } from '../geom/fillet';
import { v3add, v3cross, v3dot, v3mul, v3norm, v3sub } from '../geom/v3';

/** What one edge feature adds: on its own board, except holes, which may be in another (a fold-over's lock slots are in the base). */
export type EdgeFeatureOut = {
  adds: P2[][];
  scores: { a: P2; b: P2; toward?: 1 | -1 }[];
  holes: { panelId: string; poly: P2[] }[];
  linerHoles: P2[][];
  /** Parts that turn about a crease in 3D (shaped flaps, 112); empty for parts drawn flat or by their own renderer. */
  hinged: Flap3d[];
};

export type EdgeFeatureKindId = 'foldover' | 'flap';

export type EdgeFeatureKind = {
  id: EdgeFeatureKindId;
  /** The features of this kind a board carries: a key, the edge and the stored item. */
  on(p: Panel): { key: string; edge: string; item: unknown }[];
  geom(d: Design, p: Panel, item: unknown): EdgeFeatureOut | null;
  /** Why this kind cannot go on that edge now (112). */
  blocked?(d: Design, p: Panel, edge: string): MsgKey | null;
};

export type EdgeFeatureHit = { panelId: string; kind: EdgeFeatureKindId; key: string; edge: string; out: EdgeFeatureOut };

const empty = (): EdgeFeatureOut => ({ adds: [], scores: [], holes: [], linerHoles: [], hinged: [] });

/** Is this edge of the board joined to another board (a connection on it)? */
export function edgeJoined(d: Design, p: Panel, edge: string): boolean {
  const e = findEdge(p, edge);
  if (!e) return false;
  return Object.values(d.connections).some((c) => (c.a.panelId === p.id && findEdge(p, c.a.edge)?.key === e.key) || (c.b.panelId === p.id && c.b.edge !== 'face' && findEdge(p, c.b.edge)?.key === e.key));
}

/**
 * A plain flap on a free edge (milestone 67): a lip `len` mm out from the
 * edge, its ends tapered 30°, scored where it folds. None on an edge that is
 * gone or joined.
 */
export function edgeFlapGeom(d: Design, p: Panel, f: { edge: string; len: number }): { poly: P2[]; score: { a: P2; b: P2 } } | null {
  const e = findEdge(p, f.edge);
  if (!e) return null;
  if (edgeJoined(d, p, f.edge)) return null;
  return flapOn(e, f.len);
}

/** A flap `len` mm out from an edge, its ends tapered 30°, and its score line (milestone 67; a divider's end on a curved band, milestone 70). */
export function flapOn(e: EdgeSeg, len0: number, scoreIn = 0): { poly: P2[]; score: { a: P2; b: P2 } } {
  const L = segLength(e), dir = segDir(e), inw = segInward(e);
  const len = Math.max(2, len0);
  const taper = Math.min(len * Math.tan(Math.PI / 6), L / 3);
  const at = (s: number, o: number): P2 => ({ x: e.a.x + dir.x * s - inw.x * o, y: e.a.y + dir.y * s - inw.y * o });
  // `scoreIn`: a crease half a thickness inside the edge, where the flap folds against a board (milestone overhaul)
  return { poly: [at(0, -0.01), at(L, -0.01), at(L - taper, len), at(taper, len)], score: { a: at(0, -scoreIn), b: at(L, -scoreIn) } };
}

const foldOverKind: EdgeFeatureKind = {
  id: 'foldover',
  on: (p) => (p.foldOvers ?? []).map((f) => ({ key: f.id, edge: f.edge, item: f })),
  geom: () => null, // fold-over hits come from `allFoldOvers` (its memo), below
  blocked: (d, p, edge) => {
    if (matOf(d, p.id).kind === 'plywood') return 'flap.why.plywood';
    if (edgeJoined(d, p, edge)) return 'flap.why.joined';
    const key = findEdge(p, edge)?.key;
    if ([...(p.foldOvers ?? []), ...(p.edgeFlaps ?? [])].some((f) => findEdge(p, f.edge)?.key === key)) return 'flap.why.taken';
    return null;
  },
};

/**
 * Each shape's defaults (milestone 112). t: the board's thickness. A field a
 * flap does not store takes these. `scoreIn`: how far inside the edge the
 * crease lies (half a thickness where the flap folds against something).
 */
export const FLAP_DEFAULTS: Record<FlapShape, { taper: [number, number]; inset: (t: number) => [number, number]; r: (len: number) => number; angle: number; dir: 'in' | 'out' }> = {
  plain: { taper: [30, 30], inset: () => [0, 0], r: () => 0, angle: 0, dir: 'in' },
  tuck: { taper: [0, 0], inset: (t) => [t + 0.5, t + 0.5], r: (len) => Math.min(4, len / 2), angle: 90, dir: 'in' },
  dust: { taper: [15, 8], inset: () => [0, 0], r: () => 0, angle: 90, dir: 'in' },
  glue: { taper: [30, 30], inset: () => [0, 0], r: () => 0, angle: 90, dir: 'in' },
  hang: { taper: [0, 0], inset: () => [0, 0], r: (len) => Math.min(4, len / 2), angle: 0, dir: 'in' },
};

/** The narrowest a flap's far edge may be (mm): tapers are clamped to keep it. */
export const FLAP_MIN_FAR = 4;
/** A hang tab's hole (starting values, milestone 112): round 6 mm, or a 32 × 6 mm euro slot, centred 10 mm from the far edge. */
export const HANG_HOLE = { round: 6, euroW: 32, euroH: 6, from: 10 };

/** How far a board reaches inward from one of its edges (mm): a tuck's length is measured on it. */
export function boardDepthFrom(p: Panel, e: EdgeSeg): number {
  const inw = segInward(e);
  return Math.max(0, ...panelEdges(p).map((q) => (q.a.x - e.a.x) * inw.x + (q.a.y - e.a.y) * inw.y));
}

/** The length a new flap of this shape starts at on this edge (mm). */
export function flapDefaultLen(d: Design, p: Panel, e: EdgeSeg, shape: FlapShape): number {
  const m = matOf(d, p.id);
  const L = segLength(e);
  if (shape === 'tuck') return Math.min(22, Math.max(12, 0.3 * boardDepthFrom(p, e)));
  if (shape === 'dust') return Math.max(12, Math.min(0.45 * L, 40));
  if (shape === 'glue') return autoFlap(m);
  if (shape === 'hang') return 25;
  return Math.max(12, autoFlap(m));
}

/** A flap's values with its shape's defaults filled in. */
export function flapSpec(f: EdgeFlap, t: number) {
  const shape = f.shape ?? 'plain';
  const D = FLAP_DEFAULTS[shape];
  const len = Math.max(2, f.len);
  return {
    shape,
    len,
    taper: f.taper ?? D.taper,
    inset: f.inset ?? D.inset(t),
    r: f.r ?? D.r(len),
    angle: shape === 'plain' ? 0 : (f.angle ?? D.angle),
    dir: f.dir ?? D.dir,
    hole: shape === 'hang' ? (f.hole ?? 'round') : undefined,
  };
}

/** Is it a plain flap as milestone 67 made it (drawn by `flapOn`, byte for byte)? */
const isPlain = (f: EdgeFlap) => (f.shape ?? 'plain') === 'plain' && f.taper === undefined && f.inset === undefined && f.r === undefined;

/** The width a flap's far edge would have with its tapers as asked (before clamping), mm. */
export function flapFarWidth(e: EdgeSeg, f: EdgeFlap, t: number): number {
  const s = flapSpec(f, t);
  const rad = (a: number) => (a * Math.PI) / 180;
  return segLength(e) - s.inset[0] - s.inset[1] - s.len * (Math.tan(rad(s.taper[0])) + Math.tan(rad(s.taper[1])));
}

function arcPts(t1: P2, t2: P2, c: P2, r: number): P2[] {
  const a1 = Math.atan2(t1.y - c.y, t1.x - c.x);
  let da = Math.atan2(t2.y - c.y, t2.x - c.x) - a1;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  const step = 2 * Math.acos(Math.max(-1, 1 - 0.05 / Math.max(r, 0.05)));
  const n = Math.max(2, Math.ceil(Math.abs(da) / Math.max(step, 1e-3)));
  return Array.from({ length: n + 1 }, (_, k) => ({ x: c.x + r * Math.cos(a1 + (da * k) / n), y: c.y + r * Math.sin(a1 + (da * k) / n) }));
}

/** A circle or a slot with round ends as a polygon (a hang tab's hole). */
function slotPoly(cx: P2, dir: P2, w: number, h: number): P2[] {
  const r = h / 2, half = Math.max(0, w / 2 - r);
  const n = { x: -dir.y, y: dir.x };
  const out: P2[] = [];
  for (const [sx, a0] of [[1, -Math.PI / 2], [-1, Math.PI / 2]] as const) {
    const c = { x: cx.x + dir.x * half * sx, y: cx.y + dir.y * half * sx };
    for (let k = 0; k <= 12; k++) {
      const a = a0 + (Math.PI * k) / 12;
      out.push({ x: c.x + (dir.x * Math.cos(a) + n.x * Math.sin(a)) * r, y: c.y + (dir.y * Math.cos(a) + n.y * Math.sin(a)) * r });
    }
  }
  return out;
}

/**
 * A flap's outline on its edge (milestone 112), in the board's coordinates: its
 * polygon, its crease (null: a hang tab lying flat has none) and its holes.
 * A plain flap is milestone 67's `flapOn`, unchanged.
 */
export function flapOutline(e: EdgeSeg, f: EdgeFlap, t: number): { poly: P2[]; score: { a: P2; b: P2; toward?: 1 | -1 } | null; holes: P2[][] } | null {
  if (isPlain(f)) {
    const g = flapOn(e, f.len);
    return { poly: g.poly, score: g.score, holes: [] };
  }
  const s = flapSpec(f, t);
  const L = segLength(e), dir = segDir(e), inw = segInward(e);
  const [i0, i1] = s.inset;
  const room = L - i0 - i1;
  if (room <= 0.5) return null;
  const rad = (a: number) => (a * Math.PI) / 180;
  let k0 = Math.tan(rad(s.taper[0])), k1 = Math.tan(rad(s.taper[1]));
  // tapers clamped so the far edge keeps FLAP_MIN_FAR (or what the edge allows)
  const far = Math.min(FLAP_MIN_FAR, room / 2);
  if (room - s.len * (k0 + k1) < far && k0 + k1 > 0) {
    const f2 = Math.max(0, (room - far) / s.len / (k0 + k1));
    k0 *= f2;
    k1 *= f2;
  }
  const at = (x: number, o: number): P2 => ({ x: e.a.x + dir.x * x - inw.x * o, y: e.a.y + dir.y * x - inw.y * o });
  const corners = [at(i0, -0.01), at(L - i1, -0.01), at(L - i1 - s.len * k1, s.len), at(i0 + s.len * k0, s.len)];
  let poly: P2[] = corners;
  if (s.r > 0) {
    const pts = corners.map((q, i) => (i >= 2 ? { ...q, curve: 'round', r: s.r } : q));
    const fs = fillets(pts, 0);
    poly = [];
    corners.forEach((q, i) => {
      const fl = fs[i];
      if (fl) poly.push(...arcPts(fl.t1, fl.t2, fl.c, fl.r));
      else poly.push(q);
    });
  }
  const scoreIn = s.angle > 0 ? t / 2 : 0;
  const score = s.shape === 'hang' && s.angle === 0 ? null : { a: at(i0, -scoreIn), b: at(L - i1, -scoreIn), toward: (s.dir === 'out' ? -1 : 1) as 1 | -1 };
  const holes: P2[][] = [];
  if (s.hole) {
    const c = at((i0 + L - i1) / 2, s.len >= 2 * HANG_HOLE.from ? s.len - HANG_HOLE.from : s.len / 2);
    const farW = room - s.len * (k0 + k1);
    if (s.hole === 'round') holes.push(slotPoly(c, dir, HANG_HOLE.round, HANG_HOLE.round));
    else holes.push(slotPoly(c, dir, Math.max(HANG_HOLE.euroH, Math.min(HANG_HOLE.euroW, farW - 4)), HANG_HOLE.euroH));
  }
  return { poly, score, holes };
}

/** A flap turned `angle` degrees about its crease, in or out (milestone 112): a slab the 3D view folds with the fold slider. */
function hingedFlap(p: Panel, poly: P2[], a: P2, b: P2, e: EdgeSeg, angle: number, dir: 'in' | 'out', t: number): Flap3d {
  const a0 = toWorld(p.frame, a.x, a.y, t / 2), a1 = toWorld(p.frame, b.x, b.y, t / 2);
  const ax = v3norm(v3sub(a1, a0));
  const inw = segInward(e);
  const W = v3norm(v3add(v3mul(p.frame.u, -inw.x), v3mul(p.frame.v, -inw.y)));
  const N = matDir(p.frame);
  // the turn that takes the flap's outward direction towards the material side (in) or away from it (out)
  const towardN = v3dot(v3cross(ax, W), N) >= 0;
  const A = towardN === (dir === 'in') ? ax : v3mul(ax, -1);
  const th = (angle * Math.PI) / 180, c = Math.cos(th), sn = Math.sin(th);
  const rot = (x: V3): V3 => v3add(v3add(v3mul(x, c), v3mul(v3cross(A, x), sn)), v3mul(A, v3dot(A, x) * (1 - c)));
  const turn = (x: V3): V3 => v3add(a0, rot(v3sub(x, a0)));
  const frame: Frame = { o: turn(p.frame.o), u: rot(p.frame.u), v: rot(p.frame.v), side: p.frame.side };
  const h0: V3 = [a.x, a.y, t / 2], h1: V3 = [b.x, b.y, t / 2];
  return { panelId: p.id, owner: p.id, poly, z0: 0, z1: t, frame, hinge: A === ax ? [h0, h1] : [h1, h0], angle };
}

/** A flap's whole output on its board: none on an edge that is gone or joined. */
export function flapGeom(d: Design, p: Panel, f: EdgeFlap): EdgeFeatureOut | null {
  const e = findEdge(p, f.edge);
  if (!e || edgeJoined(d, p, f.edge)) return null;
  if (isPlain(f)) {
    const g = flapOn(e, f.len);
    return { ...empty(), adds: [g.poly], scores: [g.score] };
  }
  const t = tOf(d, p.id);
  const g = flapOutline(e, f, t);
  if (!g) return null;
  const s = flapSpec(f, t);
  const out: EdgeFeatureOut = { ...empty(), adds: [g.poly], scores: g.score ? [g.score] : [], holes: g.holes.map((poly) => ({ panelId: p.id, poly })) };
  if (s.angle > 0 && g.score) out.hinged.push(hingedFlap(p, g.poly, g.score.a, g.score.b, e, s.angle, s.dir, t));
  return out;
}

/** Does a flap lie flat in the board's plane in the model (plain flaps and hang tabs at 0°)? */
export function flapIsFlat(d: Design, p: Panel, f: EdgeFlap): boolean {
  return flapSpec(f, tOf(d, p.id)).angle === 0;
}

const flapKind: EdgeFeatureKind = {
  id: 'flap',
  on: (p) => (p.edgeFlaps ?? []).map((f) => ({ key: f.id, edge: f.edge, item: f })),
  geom: (d, p, item) => flapGeom(d, p, item as EdgeFlap),
  blocked: (d, p, edge) => {
    if (matOf(d, p.id).kind === 'plywood') return 'flap.why.plywood';
    if (edgeJoined(d, p, edge)) return 'flap.why.joined';
    const key = findEdge(p, edge)?.key;
    if ((p.foldOvers ?? []).some((f) => findEdge(p, f.edge)?.key === key)) return 'flap.why.taken';
    return null;
  },
};

export const EDGE_FEATURES: EdgeFeatureKind[] = [foldOverKind, flapKind];
export const edgeFeatureKind = (id: EdgeFeatureKindId) => EDGE_FEATURES.find((k) => k.id === id)!;

function foldOverHit(panelId: string, f: FoldOver, g: ReturnType<typeof allFoldOvers>[number]['g']): EdgeFeatureHit {
  return {
    panelId,
    kind: 'foldover',
    key: f.id,
    edge: f.edge,
    out: { adds: g.adds.map((a) => a.poly), scores: g.scores, holes: g.holes, linerHoles: g.linerHoles, hinged: [] },
  };
}

function flapHits(d: Design, only?: string): EdgeFeatureHit[] {
  const out: EdgeFeatureHit[] = [];
  for (const id of d.order) {
    const p = d.panels[id];
    // a flap's output is all on its own board: skip the others before working out geometry
    if (!p?.edgeFlaps?.length || (only && id !== only)) continue;
    for (const it of flapKind.on(p)) {
      const g = flapKind.geom(d, p, it.item);
      if (g) out.push({ panelId: id, kind: 'flap', key: it.key, edge: it.edge, out: g });
    }
  }
  return out;
}

function computeEdgeFeatures(d: Design, only?: string): EdgeFeatureHit[] {
  return [...allFoldOvers(d).map((x) => foldOverHit(x.panelId, x.f, x.g)), ...flapHits(d, only)];
}

/** Every edge feature in a design, fold-overs first (milestone 111). `only`: flaps of that board only (fold-overs are all kept: their slots may be in it). */
export function edgeFeatures(d: Design, only?: string): EdgeFeatureHit[] {
  if (only === undefined && Object.isFrozen(d)) return memo(d, 'edgeFeatures', () => computeEdgeFeatures(d));
  return computeEdgeFeatures(d, only);
}

/** The edge features on one edge of a board. */
export function featuresOnEdge(d: Design, panelId: string, edge: string): EdgeFeatureHit[] {
  const p = d.panels[panelId];
  const key = p && findEdge(p, edge)?.key;
  if (!key) return [];
  return edgeFeatures(d, panelId).filter((h) => h.panelId === panelId && findEdge(p, h.edge)?.key === key);
}
