// Where an edge's grow target leaves room for the push-pull arrows (milestone 15).
import type { Panel } from '../model/types';
import { panelEdges, segLength, type EdgeSeg } from '../model/edges';

/** Half-width of the gap left in an edge's hit target around a push-pull arrow: the arrow's 14 px grab sphere plus a margin. */
export const EDGE_GAP_PX = 22;
/** A hit piece shorter than this on screen is dropped (the arrow wins; grow from the card instead). */
export const EDGE_MIN_HIT_PX = 12;

/**
 * Places along a free edge (mm from its start) that belong to other handles:
 * the edge's midpoint (the push-pull arrows sit at the right and top
 * midpoints of a rectangle) and any push-pull anchor lying on the edge (a
 * gable's apex).
 */
/**
 * Where the selected panel's push-pull arrows sit, in its own coordinates:
 * the width arrow on the outline's right side at half height, the height
 * arrow on its top at half width (a gable's apex). On a rectangle these are
 * the right and top midpoints.
 */
export function pushPullAnchors(p: Panel): { width: { x: number; y: number }; height: { x: number; y: number } } {
  const segs = panelEdges(p);
  let right = -Infinity, top = -Infinity;
  for (const { a, b } of segs) {
    const yh = p.h / 2, xm = p.w / 2;
    if ((a.y - yh) * (b.y - yh) <= 0 && a.y !== b.y) right = Math.max(right, a.x + ((yh - a.y) / (b.y - a.y)) * (b.x - a.x));
    if ((a.x - xm) * (b.x - xm) <= 0 && a.x !== b.x) top = Math.max(top, a.y + ((xm - a.x) / (b.x - a.x)) * (b.y - a.y));
  }
  return { width: { x: Number.isFinite(right) ? right : p.w, y: p.h / 2 }, height: { x: p.w / 2, y: Number.isFinite(top) ? top : p.h } };
}

export function edgeGaps(p: Panel, seg: EdgeSeg): number[] {
  const L = segLength(seg);
  const dx = (seg.b.x - seg.a.x) / (L || 1), dy = (seg.b.y - seg.a.y) / (L || 1);
  const out = [L / 2];
  const pp = pushPullAnchors(p);
  for (const q of [pp.width, pp.height]) {
    const rx = q.x - seg.a.x, ry = q.y - seg.a.y;
    const s = rx * dx + ry * dy, dist = Math.abs(rx * dy - ry * dx);
    if (dist < 0.5 && s > -1 && s < L + 1 && Math.abs(s - L / 2) > 1e-6) out.push(Math.max(0, Math.min(L, s)));
  }
  return out;
}

/** The parts of [0, L] left for an edge's hit target once every gap of half-width g is taken out. */
export function edgeHitRanges(L: number, gaps: number[], g: number, minLen: number): [number, number][] {
  const cut = gaps.map((c) => [c - g, c + g] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let s = 0;
  for (const [a, b] of cut) {
    if (a > s) out.push([s, Math.min(a, L)]);
    s = Math.max(s, b);
  }
  if (s < L) out.push([s, L]);
  return out.filter(([a, b]) => b - a >= minLen);
}

/** The nearest point to s inside one of the hit ranges (the pill stays on a part of the edge that can be grown from). */
export function clampToRanges(s: number, ranges: [number, number][]): number | null {
  let best: number | null = null;
  for (const [a, b] of ranges) {
    const c = Math.max(a, Math.min(b, s));
    if (best === null || Math.abs(c - s) < Math.abs(best - s)) best = c;
  }
  return best;
}

