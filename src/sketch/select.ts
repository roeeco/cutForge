// Selecting and editing in the sketch (SKETCH_OVERHAUL.md §8): the outline
// under a point, the selection frame's scale and turn, typed sizes, the
// clipboard. Pure code; the view and the bar call it through the session.
import type { P2 } from '../model/types';
import { addPt, addSeg, bounds, chains, selPts, type Sketch, type SkSel } from './model';
import { allCuts, flatChain } from './flatten';
import { ringArea } from './regions';
import { movePts, rotateSel, scaleSel } from './ops';

/** Is p inside the polygon? */
function inside(p: P2, poly: P2[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** The smallest closed outline around p (inside a hole: the hole), as a selection; null when p is in none. */
export function outlineAt(sk: Sketch, p: P2): SkSel | null {
  const cuts = allCuts(sk);
  let best: { sel: SkSel; area: number } | null = null;
  for (const c of chains(sk, { cons: false })) {
    if (!c.closed) continue;
    const poly = flatChain(sk, c, 0.1, cuts);
    if (poly.length < 3 || !inside(p, poly)) continue;
    const a = Math.abs(ringArea(poly));
    if (!best || a < best.area) best = { sel: { pts: [...c.pts], segs: [...c.segs] }, area: a };
  }
  return best?.sel ?? null;
}

/** The closed outlines a selection covers (each as its point ids), for Align. */
export function outlinesIn(sk: Sketch, sel: SkSel): string[][] {
  const pts = new Set(selPts(sk, sel));
  return chains(sk, { cons: false })
    .filter((c) => c.closed && c.pts.every((p) => pts.has(p)))
    .map((c) => c.pts);
}

/** Toggle or set items in a selection. */
export function mergeSel(a: SkSel, b: SkSel, mode: 'replace' | 'add' | 'toggle'): SkSel {
  if (mode === 'replace') return { pts: [...b.pts], segs: [...b.segs] };
  const tog = (x: string[], y: string[]) => {
    const s = new Set(x);
    const all = y.every((v) => s.has(v));
    for (const v of y) if (mode === 'add' || !all) s.add(v);
    else s.delete(v);
    return [...s];
  };
  return { pts: tog(a.pts, b.pts), segs: tog(a.segs, b.segs) };
}

export type Box2 = { min: P2; max: P2 };

/** The box of a selection's points. */
export const selBox = (sk: Sketch, sel: SkSel): Box2 | null => bounds(sk, selPts(sk, sel));

/**
 * A frame handle dragged to p: the scale factors and the point that stays put.
 * `dir` is the handle's side in x and y (−1, 0 or 1; 0 for a side handle's other
 * direction). Shift or Keep proportions scales both directions alike; Alt about the middle.
 */
export function frameScale(b: Box2, dir: { x: -1 | 0 | 1; y: -1 | 0 | 1 }, p: P2, o: { ratio: boolean; centre: boolean; snap?: (x: number) => number }): { sx: number; sy: number; anchor: P2 } {
  const snap = o.snap ?? ((x: number) => x);
  const mid = { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 };
  const anchor = { ...mid };
  let sx = 1, sy = 1;
  const axis = (k: 'x' | 'y', d: -1 | 0 | 1) => {
    if (!d) return 1;
    const L = b.max[k] - b.min[k];
    if (!(L > 1e-9)) return 1;
    const fixed = o.centre ? mid[k] : d > 0 ? b.min[k] : b.max[k];
    anchor[k] = fixed;
    const raw = o.centre ? 2 * Math.abs(p[k] - fixed) : d * (p[k] - fixed);
    return Math.max(0.1, snap(raw)) / L;
  };
  sx = axis('x', dir.x);
  sy = axis('y', dir.y);
  if (o.ratio) {
    const k = dir.x && dir.y ? (Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy) : dir.x ? sx : sy;
    sx = sy = k;
    // a side handle with proportions kept: the other direction grows about the middle
    if (!dir.x) anchor.x = mid.x;
    if (!dir.y) anchor.y = mid.y;
  }
  return { sx, sy, anchor };
}

/** A typed width or height: the factors (both alike with proportions kept), about the box's middle. */
export function typedSize(b: Box2, axis: 'w' | 'h', value: number, keep: boolean): { sx: number; sy: number; anchor: P2 } {
  const L = axis === 'w' ? b.max.x - b.min.x : b.max.y - b.min.y;
  const k = L > 1e-9 ? Math.max(0.1, value) / L : 1;
  const anchor = { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 };
  if (keep) return { sx: k, sy: k, anchor };
  return axis === 'w' ? { sx: k, sy: 1, anchor } : { sx: 1, sy: k, anchor };
}

/** The turn for a rotate drag: inside the ring 22.5° steps, outside it whole degrees, Shift 15°. */
export function snapTurn(deg: number, o: { insideRing: boolean; shift: boolean }): number {
  const step = o.shift ? 15 : o.insideRing ? 22.5 : 1;
  return Math.round(deg / step) * step;
}

/** Scale and turn a selection (helpers the frame and the bar share). */
export const scaleSelection = (sk: Sketch, sel: SkSel, f: { sx: number; sy: number; anchor: P2 }) => scaleSel(sk, sel, f.anchor, f.sx, f.sy);
export const turnSelection = (sk: Sketch, sel: SkSel, centre: P2, deg: number) => rotateSel(sk, sel, centre, deg);

// ---- clipboard ------------------------------------------------------------------

/** A copy of a selection: its points and the segments between them, ids kept for the paste to remap. */
export type Clip = { pts: Record<string, Sketch['pts'][string]>; segs: Sketch['segs'][string][] };

export function copySel(sk: Sketch, sel: SkSel): Clip | null {
  const ids = new Set(selPts(sk, sel));
  if (!ids.size) return null;
  const pts: Clip['pts'] = {};
  for (const id of ids) {
    const { lock: _l, ...p } = sk.pts[id];
    pts[id] = JSON.parse(JSON.stringify(p));
  }
  const segs = sk.order
    .filter((g) => ids.has(sk.segs[g].a) && ids.has(sk.segs[g].b) && (sel.segs.includes(g) || (sel.pts.includes(sk.segs[g].a) && sel.pts.includes(sk.segs[g].b))))
    .map((g) => JSON.parse(JSON.stringify(sk.segs[g])));
  return { pts, segs };
}

const clipBox = (c: Clip): Box2 => {
  const ps = Object.values(c.pts);
  return { min: { x: Math.min(...ps.map((p) => p.x)), y: Math.min(...ps.map((p) => p.y)) }, max: { x: Math.max(...ps.map((p) => p.x)), y: Math.max(...ps.map((p) => p.y)) } };
};
const overlap = (a: Box2, b: Box2, gap: number) => a.min.x <= b.max.x + gap && b.min.x <= a.max.x + gap && a.min.y <= b.max.y + gap && b.min.y <= a.max.y + gap;

/** Where a paste goes: 10 mm away, then further in 10 mm steps until its box touches no existing outline's box. */
export function pasteOffset(sk: Sketch, c: Clip): P2 {
  const cb = clipBox(c);
  const boxes = chains(sk, { cons: true }).map((ch) => bounds(sk, ch.pts)).filter((b): b is Box2 => !!b);
  for (let k = 1; k <= 60; k++) {
    const d = { x: 10 * k, y: -10 * k };
    const moved = { min: { x: cb.min.x + d.x, y: cb.min.y + d.y }, max: { x: cb.max.x + d.x, y: cb.max.y + d.y } };
    if (!boxes.some((b) => overlap(moved, b, 0.5))) return d;
  }
  return { x: 10, y: -10 };
}

/** Paste a clip, moved by d; returns the new items (selected after the paste). */
export function pasteClip(sk: Sketch, c: Clip, d: P2): SkSel {
  const map = new Map<string, string>();
  for (const [id, p] of Object.entries(c.pts)) map.set(id, addPt(sk, { ...p, x: Math.round((p.x + d.x) * 1e9) / 1e9, y: Math.round((p.y + d.y) * 1e9) / 1e9 }));
  const segs = c.segs.map((s) => addSeg(sk, { ...JSON.parse(JSON.stringify(s)), a: map.get(s.a)!, b: map.get(s.b)! }));
  return { pts: [...map.values()], segs };
}

/** Delete a selection: its segments, then its points with whatever still uses them. */
export function deleteSel(sk: Sketch, sel: SkSel): boolean {
  let any = false;
  const ends = new Set<string>();
  const drop = (g: string) => {
    const s = sk.segs[g];
    if (!s) return;
    ends.add(s.a).add(s.b);
    delete sk.segs[g];
    any = true;
  };
  for (const g of sel.segs) drop(g);
  for (const p of sel.pts) {
    if (!sk.pts[p]) continue;
    for (const g of sk.order) if (sk.segs[g] && (sk.segs[g].a === p || sk.segs[g].b === p)) drop(g);
    delete sk.pts[p];
    any = true;
  }
  sk.order = sk.order.filter((g) => sk.segs[g]);
  // ends of what went that nothing uses any more go too
  for (const id of ends) if (sk.pts[id] && !sk.order.some((g) => sk.segs[g].a === id || sk.segs[g].b === id)) delete sk.pts[id];
  return any;
}

/** Move a selection by a step (arrow keys); refused when it holds a locked point. */
export const nudge = (sk: Sketch, sel: SkSel, dx: number, dy: number) => movePts(sk, selPts(sk, sel), dx, dy);
