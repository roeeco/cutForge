// The 2D sketch model (SKETCH_OVERHAUL.md §5): a graph of points and segments.
// Pure code: no shapes, no waffle, no React, no kernel, so box designs can use it.
import type { P2, SketchGraph, SkPt, SkSeg } from '../model/types';
import { newId } from '../model/ops';

export type Sketch = SketchGraph;
export type { SkPt, SkSeg };
/** A selection in a sketch: points and segments by id. */
export type SkSel = { pts: string[]; segs: string[]; handle?: { seg: string; end: 'a' | 'b' } };

export function emptySketch(): Sketch {
  return { pts: {}, segs: {}, order: [] };
}

export function addPt(sk: Sketch, p: SkPt): string {
  const id = newId('p');
  sk.pts[id] = { ...p };
  return id;
}

/** Add a segment (its ends must exist); returns its id. */
export function addSeg(sk: Sketch, seg: SkSeg): string {
  const id = newId('g');
  sk.segs[id] = seg;
  sk.order.push(id);
  return id;
}

/** Remove a segment (its points stay). */
export function dropSeg(sk: Sketch, id: string) {
  delete sk.segs[id];
  const i = sk.order.indexOf(id);
  if (i >= 0) sk.order.splice(i, 1);
}

/** Segments that end at a point (in drawing order). */
export function segsAt(sk: Sketch, ptId: string, opts?: { cons?: boolean }): string[] {
  return sk.order.filter((g) => {
    const s = sk.segs[g];
    if (!s || (s.a !== ptId && s.b !== ptId)) return false;
    if (opts?.cons === false && s.cons) return false;
    return true;
  });
}

export function degree(sk: Sketch, ptId: string, opts?: { cons?: boolean }): number {
  let n = 0;
  for (const g of segsAt(sk, ptId, opts)) n += sk.segs[g].a === sk.segs[g].b ? 2 : 1;
  return n;
}

export function otherEnd(sk: Sketch, segId: string, ptId: string): string {
  const s = sk.segs[segId];
  return s.a === ptId ? s.b : s.a;
}

export function cloneSketch(sk: Sketch): Sketch {
  return JSON.parse(JSON.stringify(sk));
}

/** The points a selection touches: its points and its segments' ends. */
export function selPts(sk: Sketch, sel: Partial<SkSel>): string[] {
  const out = new Set(sel.pts ?? []);
  for (const g of sel.segs ?? []) {
    const s = sk.segs[g];
    if (s) out.add(s.a).add(s.b);
  }
  return [...out].filter((p) => sk.pts[p]);
}

/** The box of some points (all of them by default), with curve handles' ends inside it. */
export function bounds(sk: Sketch, ids?: string[]): { min: P2; max: P2 } | null {
  const list = ids ?? Object.keys(sk.pts);
  if (!list.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const id of list) {
    const p = sk.pts[id];
    if (!p) continue;
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  if (x0 > x1) return null;
  return { min: { x: x0, y: y0 }, max: { x: x1, y: y1 } };
}

/** A chain: segments in order, each oriented by `rev` (true: walked from b to a), and its points in order. */
export type Chain = { segs: string[]; rev: boolean[]; pts: string[]; closed: boolean };

/**
 * Maximal runs of segments through points of degree 2 (construction segments
 * left out when `cons` is false). Each segment is in exactly one chain.
 */
export function chains(sk: Sketch, opts: { cons?: boolean } = { cons: false }): Chain[] {
  const live = sk.order.filter((g) => sk.segs[g] && (opts.cons !== false || !sk.segs[g].cons));
  const used = new Set<string>();
  const deg = (p: string) => degree(sk, p, opts);
  const at = (p: string) => segsAt(sk, p, opts).filter((g) => live.includes(g));
  const out: Chain[] = [];
  const walk = (start: string, g0: string): Chain => {
    const c: Chain = { segs: [], rev: [], pts: [start], closed: false };
    let p = start, g: string | undefined = g0;
    while (g && !used.has(g)) {
      used.add(g);
      const s = sk.segs[g];
      const rev = s.a !== p;
      c.segs.push(g);
      c.rev.push(rev);
      p = rev ? s.a : s.b;
      if (p === start) {
        c.closed = true;
        break;
      }
      c.pts.push(p);
      if (deg(p) !== 2) break;
      g = at(p).find((x) => !used.has(x));
    }
    return c;
  };
  // open runs start at a point whose degree is not 2
  for (const g of live) {
    if (used.has(g)) continue;
    const s = sk.segs[g];
    for (const end of [s.a, s.b]) {
      if (used.has(g) || deg(end) === 2) continue;
      out.push(walk(end, g));
    }
  }
  // what is left are closed loops through degree-2 points
  for (const g of live) if (!used.has(g)) out.push(walk(sk.segs[g].a, g));
  return out;
}
