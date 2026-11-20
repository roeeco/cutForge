// The transform frame's maths (milestone 103, DIELINE_DNA_PLAN.md D0c, after
// claude/guided-mode's scale frame): a shape's new box from a handle dragged
// to a point. Pure, so it is tested without a browser.
//
// Corner handles change both directions, side handles one. *Keep
// proportions* (or Shift) scales both alike by the factor of the direction
// moved furthest; Alt scales about the middle. A turned shape is measured in
// its own axes. A circle always keeps its proportions.
import type { P2 } from '../model/types';

export type FrameBox = { cx: number; cy: number; w: number; h: number; rot?: number };
export type FrameHandle = { kind: 'corner' | 'side'; /** The handle, in the shape's own frame (its centre at 0, 0): ±w/2, ±h/2 or 0 on a side's middle. */ at: P2 };

const MIN = 0.5;

/** The shape's own frame: a board point relative to its centre, turned back by its rotation. */
export function toOwn(b: FrameBox, p: P2): P2 {
  const a = ((b.rot ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const x = p.x - b.cx, y = p.y - b.cy;
  return { x: x * c + y * s, y: -x * s + y * c };
}
/** Back to board coordinates. */
export function fromOwn(b: FrameBox, q: P2): P2 {
  const a = ((b.rot ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return { x: b.cx + q.x * c - q.y * s, y: b.cy + q.x * s + q.y * c };
}

/**
 * The box after dragging `h` (of the box `b` at the drag's start) to the board
 * point `p`. Always from the start box, so a drag never accumulates.
 */
export function frameDrag(b: FrameBox, h: FrameHandle, p: P2, o: { keep?: boolean; alt?: boolean; circle?: boolean }): FrameBox {
  const q = toOwn(b, p);
  const keep = !!o.keep || !!o.circle;
  // which directions this handle moves, and the side each moves towards
  const ux = h.kind === 'corner' || Math.abs(h.at.y) < 1e-9 ? Math.sign(h.at.x) : 0;
  const uy = h.kind === 'corner' || Math.abs(h.at.x) < 1e-9 ? Math.sign(h.at.y) : 0;
  // the fixed point: the opposite corner or side (the middle with Alt)
  const fx = o.alt ? 0 : -ux * (b.w / 2), fy = o.alt ? 0 : -uy * (b.h / 2);
  const span = (v: number, f: number, u: number) => (o.alt ? 2 * Math.abs(v) : Math.max(0, (v - f) * u));
  let w = ux ? span(q.x, fx, ux) : b.w;
  let h2 = uy ? span(q.y, fy, uy) : b.h;
  if (keep) {
    const kx = ux ? w / b.w : 0, ky = uy ? h2 / b.h : 0;
    // the direction moved furthest leads (a side handle has only its own)
    const k = ux && uy ? (Math.abs(kx - 1) >= Math.abs(ky - 1) ? kx : ky) : ux ? kx : ky;
    w = b.w * k;
    h2 = b.h * k;
  }
  w = Math.max(MIN, w);
  h2 = Math.max(MIN, h2);
  // the new centre: from the fixed point by half the new size in each moved direction (sides kept centred across)
  const ncx = o.alt ? 0 : ux ? fx + (ux * w) / 2 : 0;
  const ncy = o.alt ? 0 : uy ? fy + (uy * h2) / 2 : 0;
  const c = fromOwn(b, { x: ncx, y: ncy });
  return { cx: c.x, cy: c.y, w, h: h2, rot: b.rot };
}

/** A typed size for one direction (a size, a sum or a percent already worked out), the other following with *Keep proportions*. */
export function typedSize(b: FrameBox, dir: 'w' | 'h', v: number, keep: boolean): FrameBox {
  const n = Math.max(MIN, v);
  if (dir === 'w') return { ...b, w: n, h: keep ? b.h * (n / b.w) : b.h };
  return { ...b, h: n, w: keep ? b.w * (n / b.h) : b.w };
}
