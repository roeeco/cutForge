// Smart snapping in a panel's own coordinates. Targets: the panel's corners,
// edge midpoints and centre; other shapes' corners, edge midpoints, centres
// (array copies included); alignment with any of those; equal spacing between
// neighbouring shapes. The geometry being manipulated is excluded. The
// tolerance comes from the view (a fixed number of screen pixels).
// Snapping creates no relationship: it only adjusts the value being dragged.
import type { Design, P2 } from './types';
import { detailInstances } from './geometry';

export type Guide = { a: P2; b: P2; kind: 'align' | 'gap' };
export type SnapResult = { dx: number; dy: number; guides: Guide[]; targets: P2[] };
type Box = { minX: number; maxX: number; minY: number; maxY: number };

export type SnapContext = { points: P2[]; boxes: Box[]; panel: Box };

export function snapContext(d: Design, panelId: string, exclude: Set<string>): SnapContext | null {
  const p = d.panels[panelId];
  if (!p) return null;
  const points: P2[] = [];
  const boxPts = (b: Box) => {
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    points.push(
      { x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY },
      { x: cx, y: b.minY }, { x: b.maxX, y: cy }, { x: cx, y: b.maxY }, { x: b.minX, y: cy },
      { x: cx, y: cy },
    );
  };
  const panel = { minX: 0, minY: 0, maxX: p.w, maxY: p.h };
  boxPts(panel);
  const boxes: Box[] = [];
  for (const dt of p.details) {
    if (exclude.has(dt.id)) continue;
    for (const i of detailInstances(dt)) {
      const b = { minX: i.cx - i.w / 2, maxX: i.cx + i.w / 2, minY: i.cy - i.h / 2, maxY: i.cy + i.h / 2 };
      boxes.push(b);
      boxPts(b);
    }
  }
  return { points, boxes, panel };
}

type Cand = { delta: number; guides: Guide[]; target?: P2 };

function best(cands: Cand[], tol: number): Cand | null {
  let b: Cand | null = null;
  for (const c of cands) if (Math.abs(c.delta) <= tol && (!b || Math.abs(c.delta) < Math.abs(b.delta) - 1e-9)) b = c;
  if (!b) return null;
  // merge guides of other candidates giving the same delta (several alignments at once)
  const same = cands.filter((c) => c !== b && Math.abs(c.delta - b!.delta) < 1e-6);
  return { ...b, guides: [...b.guides, ...same.flatMap((c) => c.guides)] };
}

/** Candidates along one axis for anchors (values of the moving thing). */
function axisCands(ctx: SnapContext, anchors: { v: number; other: number }[], axis: 'x' | 'y'): Cand[] {
  const out: Cand[] = [];
  for (const a of anchors)
    for (const p of ctx.points) {
      const tv = axis === 'x' ? p.x : p.y, to = axis === 'x' ? p.y : p.x;
      const delta = tv - a.v;
      const g: Guide = axis === 'x' ? { a: { x: tv, y: to }, b: { x: tv, y: a.other }, kind: 'align' } : { a: { x: to, y: tv }, b: { x: a.other, y: tv }, kind: 'align' };
      out.push({ delta, guides: [g], target: p });
    }
  return out;
}

/** Equal-spacing candidates for a box moving along one axis among neighbours in its row/column. */
function gapCands(ctx: SnapContext, box: Box, axis: 'x' | 'y'): Cand[] {
  const lo = (b: Box) => (axis === 'x' ? b.minX : b.minY), hi = (b: Box) => (axis === 'x' ? b.maxX : b.maxY);
  const olo = (b: Box) => (axis === 'x' ? b.minY : b.minX), ohi = (b: Box) => (axis === 'x' ? b.maxY : b.maxX);
  const row = ctx.boxes.filter((b) => ohi(b) > olo(box) && olo(b) < ohi(box));
  const c = (lo(box) + hi(box)) / 2, size = hi(box) - lo(box);
  const left = row.filter((b) => hi(b) <= c).sort((a, b) => hi(b) - hi(a));
  const right = row.filter((b) => lo(b) >= c).sort((a, b) => lo(a) - lo(b));
  const mid = (olo(box) + ohi(box)) / 2;
  const seg = (a: number, b: number): Guide => (axis === 'x' ? { a: { x: a, y: mid }, b: { x: b, y: mid }, kind: 'gap' } : { a: { x: mid, y: a }, b: { x: mid, y: b }, kind: 'gap' });
  const out: Cand[] = [];
  const L = left[0], R = right[0];
  if (L && R) {
    const start = (hi(L) + lo(R) - size) / 2;
    if (start >= hi(L)) out.push({ delta: start - lo(box), guides: [seg(hi(L), start), seg(start + size, lo(R))] });
  }
  if (L && left[1]) {
    const g = lo(L) - hi(left[1]);
    if (g > 0) out.push({ delta: hi(L) + g - lo(box), guides: [seg(hi(left[1]), lo(L)), seg(hi(L), hi(L) + g)] });
  }
  if (R && right[1]) {
    const g = lo(right[1]) - hi(R);
    if (g > 0) out.push({ delta: lo(R) - g - size - lo(box), guides: [seg(hi(R), lo(right[1])), seg(lo(R) - g, lo(R))] });
  }
  return out;
}

/** Snap a moving box (shape being moved). */
export function snapBox(ctx: SnapContext, box: Box, tol: number): SnapResult {
  const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2;
  const bx = best([...axisCands(ctx, [{ v: box.minX, other: cy }, { v: cx, other: cy }, { v: box.maxX, other: cy }], 'x'), ...gapCands(ctx, box, 'x')], tol);
  const by = best([...axisCands(ctx, [{ v: box.minY, other: cx }, { v: cy, other: cx }, { v: box.maxY, other: cx }], 'y'), ...gapCands(ctx, box, 'y')], tol);
  return finish(bx, by);
}

/** Snap a single point (drawing, resizing a corner). */
export function snapPoint(ctx: SnapContext, p: P2, tol: number): SnapResult {
  const bx = best(axisCands(ctx, [{ v: p.x, other: p.y }], 'x'), tol);
  const by = best(axisCands(ctx, [{ v: p.y, other: p.x }], 'y'), tol);
  return finish(bx, by);
}

function finish(bx: Cand | null, by: Cand | null): SnapResult {
  const dx = bx?.delta ?? 0, dy = by?.delta ?? 0;
  // guides are drawn after the move: shift the moving end of x-guides by dy and y-guides by dx
  const guides = [
    ...(bx?.guides ?? []).map((g) => (g.kind === 'align' ? { ...g, b: { x: g.b.x, y: g.b.y + dy } } : { a: { x: g.a.x, y: g.a.y + dy }, b: { x: g.b.x, y: g.b.y + dy }, kind: g.kind })),
    ...(by?.guides ?? []).map((g) => (g.kind === 'align' ? { ...g, b: { x: g.b.x + dx, y: g.b.y } } : { a: { x: g.a.x + dx, y: g.a.y }, b: { x: g.b.x + dx, y: g.b.y }, kind: g.kind })),
  ];
  const targets = [bx?.target, by?.target].filter((x): x is P2 => !!x);
  return { dx, dy, guides, targets };
}
