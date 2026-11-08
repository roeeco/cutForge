// Edge identity (schema v6). Every panel edge is named by a key instead of an
// index, so it keeps its name when the outline changes:
//
//   e<n>            a sketch edge: a base polygon's stored edge id, or a
//                   wall's e0 bottom (attached), e1 right, e2 top, e3 left
//   <insertId>      the part of a wall edge after an inserted point
//   <detailId>.<i>  segment i of an Add/Cut shape that became outline
//   <key>#<n>       piece n of an edge a cut split into several pieces
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

/** Layer 1: the sketch outline as keyed CCW edges. */
export function sketchRing(p: Pick<Panel, 'w' | 'h'> & { sketch?: Sketch }): EdgeSeg[] {
  const s = sketchOf(p);
  if (s.kind === 'poly') {
    const n = s.pts.length;
    return s.pts.map((a, i) => ({ key: s.edgeIds[i] ?? `e${i}`, a, b: s.pts[(i + 1) % n] }));
  }
  const c = wallCorners(p.w, p.h, s);
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
 * Layer 3: the straight, growable edges of a panel's own outline. For now
 * the own outline is the sketch; Add/Cut shapes extend it (geometry.ts).
 */
export function panelEdges(p: Pick<Panel, 'w' | 'h'> & { sketch?: Sketch }): EdgeSeg[] {
  return ownRing(p);
}

// own-outline hook, replaced by geometry.ts once shapes change outlines
let ownRing: (p: Pick<Panel, 'w' | 'h'> & { sketch?: Sketch }) => EdgeSeg[] = sketchRing;
export function setOwnRing(f: typeof ownRing) {
  ownRing = f;
}

export function findEdge(p: Pick<Panel, 'w' | 'h'> & { sketch?: Sketch }, key: EdgeArg): EdgeSeg | undefined {
  const k = ek(key);
  return panelEdges(p).find((e) => e.key === k);
}

/** The edges before and after `key` around the outline (its corner neighbours). */
export function edgeNeighbours(p: Pick<Panel, 'w' | 'h'> & { sketch?: Sketch }, key: EdgeArg): [EdgeSeg, EdgeSeg] | null {
  const ring = panelEdges(p);
  const i = ring.findIndex((e) => e.key === ek(key));
  if (i < 0) return null;
  const n = ring.length;
  return [ring[(i + n - 1) % n], ring[(i + 1) % n]];
}

/** Rectangle-sketch edge index (0–3) of a key, when the panel is a plain rectangle: for names. */
export function rectEdgeIndex(key: string): number | null {
  const m = /^e([0-3])$/.exec(key);
  return m ? Number(m[1]) : null;
}

/** An axis-aligned rectangle sketch (0,0)–(w,h) with the four plain edge ids. */
export function isRectSketch(p: Pick<Panel, 'w' | 'h'> & { sketch?: Sketch }): boolean {
  const s = sketchOf(p);
  if (s.kind === 'wall') return !s.inserts?.length && !Object.values(s.corners ?? {}).some((c) => c && (c.dx || c.dy));
  const r = rectSketch(p.w, p.h) as Extract<Sketch, { kind: 'poly' }>;
  return s.pts.length === 4 && s.pts.every((q, i) => q.x === r.pts[i].x && q.y === r.pts[i].y) && s.edgeIds.every((k, i) => k === `e${i}`);
}
