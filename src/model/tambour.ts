// A living-hinge strip on a path (milestone 174, BOXES_PLYWOOD_PLAN.md §4 E2): a tambour door, and the curved boards
// that guide it. The strip is a chain of boards joined by folds with a radius (milestone 63's bands): one board per
// straight run of the path and a band at every corner, so its 3D, its flat net, its bend pattern and the export
// check are the engine's own. A door slides, so it must bend anywhere along its length: its straight boards get the
// same slits as its bands (cut lines on the board, `lines`), at the bands' spacing, columns staggered in turn across
// the joins. A pose is where along the path the strip lies: the design is built in one; shut and open are the same
// strip built further along.
//
// The path lies in a plane (s, y) of the design: its outer face's sharp corners (as a fold with a radius keeps its
// boards' frames where a sharp fold puts them) and one outer radius for every corner. Every corner turns 90° the same
// way (its inside is the box's), and the material lies on the inside of the turns.
import type { Design, P2, V3 } from './types';
import { addFreePanel, addLine, connectSeams, growPanel, solve } from './ops';
import { matDir, toWorld } from './frame';
import { bandOf } from './bands';
import { bendOf } from './materials';
import { hingeBridge, patternReach, slitLayout } from './bendPatterns';
import { v3add, v3cross, v3mul, v3norm, v3sub } from '../geom/v3';

/** The plane a path lies in: the world point of (s, y) = (0, 0) and the world directions of s and y. */
export type FlexPlane = { O: V3; S: V3; Y: V3 };

export type FlexPath = {
  /** The outer face's sharp polyline: its start, each corner, its end (s, y). */
  pts: P2[];
  /** The outer face's radius at every corner (mm). */
  Ro: number;
  /** The strip's thickness and neutral-line factor. */
  t: number;
  k: number;
  /** 1: the path turns left (counter-clockwise in (s, y)) at every corner, -1 right. */
  turn: 1 | -1;
};

const sub2 = (a: P2, b: P2): P2 => ({ x: a.x - b.x, y: a.y - b.y });
const len2 = (a: P2) => Math.hypot(a.x, a.y);
const unit2 = (a: P2): P2 => {
  const l = len2(a) || 1;
  return { x: a.x / l, y: a.y / l };
};

/** Leg i's direction and its inward normal (towards the inside of the turns). */
export function legAxes(p: FlexPath, i: number): { dir: P2; n: P2; L: number } {
  const v = sub2(p.pts[i + 1], p.pts[i]);
  const dir = unit2(v);
  return { dir, n: { x: -dir.y * p.turn, y: dir.x * p.turn }, L: len2(v) };
}

/** The neutral line's length round one corner. */
export const arcLength = (p: FlexPath) => (Math.PI / 2) * (p.Ro - (1 - p.k) * p.t);

/** Each leg's straight part, as distances from its start point along the outer face (a corner's band takes Ro each side), and where it starts along the neutral line. */
export function legSpans(p: FlexPath): { lo: number; hi: number; u0: number }[] {
  const n = p.pts.length - 1;
  const out: { lo: number; hi: number; u0: number }[] = [];
  let u = 0;
  for (let i = 0; i < n; i++) {
    const { L } = legAxes(p, i);
    const lo = i > 0 ? p.Ro : 0, hi = L - (i < n - 1 ? p.Ro : 0);
    out.push({ lo, hi, u0: u });
    u += hi - lo + arcLength(p);
  }
  return out;
}

/** The path's whole length along the neutral line. */
export function pathLength(p: FlexPath): number {
  const sp = legSpans(p);
  const last = sp[sp.length - 1];
  return last.u0 + last.hi - last.lo;
}

/** Where a point along the neutral line is: its leg and its distance from the leg's start point (null inside a corner's band). */
export function legAt(p: FlexPath, u: number): { leg: number; x: number } | null {
  const sp = legSpans(p);
  for (let i = 0; i < sp.length; i++) {
    const { lo, hi, u0 } = sp[i];
    if (u >= u0 - 1e-9 && u <= u0 + hi - lo + 1e-9) return { leg: i, x: lo + (u - u0) };
  }
  return null;
}

/** The neutral position of a point on leg i at distance x from its start point. */
export const uAt = (p: FlexPath, leg: number, x: number) => {
  const sp = legSpans(p)[leg];
  return sp.u0 + x - sp.lo;
};

/** How much straight a strip from u0 to u1 has at its start and at its end (negative: an end lies in a band). */
export function endRooms(p: FlexPath, u0: number, u1: number): [number, number] {
  const a = legAt(p, u0), b = legAt(p, u1);
  if (!a || !b) return [-1, -1];
  const sp = legSpans(p);
  return a.leg === b.leg ? [b.x - a.x, b.x - a.x] : [sp[a.leg].hi - a.x, b.x - sp[b.leg].lo];
}

/** The less of a strip's two ends' straight runs (negative: an end lies in a band). */
export const endRoom = (p: FlexPath, u0: number, u1: number) => Math.min(...endRooms(p, u0, u1));

/**
 * A line beside the path, `off` mm outward of its outer face (negative: inward), from u0 to u1 along the neutral line:
 * straight along the legs, round the corners in steps of at most `step` degrees. Its points in (s, y).
 */
export function pathOffset(p: FlexPath, off: number, u0: number, u1: number, step = 5): P2[] {
  const sp = legSpans(p);
  const A = arcLength(p);
  const out: P2[] = [];
  const push = (q: P2) => {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.x - q.x, last.y - q.y) > 1e-6) out.push(q);
  };
  const onLeg = (i: number, x: number): P2 => {
    const { dir, n } = legAxes(p, i);
    const P = p.pts[i];
    return { x: P.x + dir.x * x - n.x * off, y: P.y + dir.y * x - n.y * off };
  };
  const onArc = (i: number, f: number): P2 => {
    // the corner after leg i: its centre Ro in from both faces; the radius vector turns from -n(i) to -n(i+1)
    const a = legAxes(p, i), b = legAxes(p, i + 1);
    const K = p.pts[i + 1];
    const C = { x: K.x + p.Ro * (a.n.x + b.n.x), y: K.y + p.Ro * (a.n.y + b.n.y) };
    const th = (f * Math.PI) / 2;
    const r = { x: -a.n.x * Math.cos(th) - b.n.x * Math.sin(th), y: -a.n.y * Math.cos(th) - b.n.y * Math.sin(th) };
    const R = p.Ro + off;
    return { x: C.x + r.x * R, y: C.y + r.y * R };
  };
  for (let i = 0; i < sp.length; i++) {
    const { lo, hi, u0: s0 } = sp[i];
    const a = Math.max(u0, s0), b = Math.min(u1, s0 + hi - lo);
    if (b >= a - 1e-9) {
      push(onLeg(i, lo + a - s0));
      push(onLeg(i, lo + b - s0));
    }
    if (i < sp.length - 1) {
      const c0 = s0 + hi - lo, c1 = c0 + A;
      const ca = Math.max(u0, c0), cb = Math.min(u1, c1);
      if (cb > ca + 1e-9) {
        const fa = (ca - c0) / A, fb = (cb - c0) / A;
        const k = Math.max(1, Math.ceil(((fb - fa) * 90) / step));
        for (let j = 0; j <= k; j++) push(onArc(i, fa + ((fb - fa) * j) / k));
      }
    }
  }
  return out;
}

/** A strip of the path between two offsets (mm outward of its outer face), from u0 to u1: a closed outline in (s, y). */
export function pathBand(p: FlexPath, off0: number, off1: number, u0: number, u1: number): P2[] {
  const a = pathOffset(p, off0, u0, u1), b = pathOffset(p, off1, u0, u1);
  return [...a, ...b.reverse()];
}

/** The path moved `d` mm inward (a strip inside another): its corners along their bisectors, its radius less. */
export function insetPath(p: FlexPath, d: number): FlexPath {
  const n = p.pts.length - 1;
  const pts = p.pts.map((P, i) => {
    const a = legAxes(p, Math.min(i, n - 1)), b = legAxes(p, Math.max(0, i - 1));
    const m = i === 0 ? a.n : i === n ? b.n : { x: a.n.x + b.n.x, y: a.n.y + b.n.y };
    return { x: P.x + m.x * d, y: P.y + m.y * d };
  });
  return { ...p, pts, Ro: p.Ro - d };
}

const w3 = (pl: FlexPlane, q: P2): V3 => v3add(pl.O, v3add(v3mul(pl.S, q.x), v3mul(pl.Y, q.y)));
const d3 = (pl: FlexPlane, q: P2): V3 => v3norm(v3add(v3mul(pl.S, q.x), v3mul(pl.Y, q.y)));

/** A board of a strip: its id, the leg it lies on, and its straight part in its own coordinates (y along the path). */
export type StripBoard = { id: string; leg: number; y0: number; y1: number };

/**
 * A strip of boards `width` wide (centred on the plane, across it) on a path from u0 to u1 along its neutral line,
 * each corner a band of the path's radius: one board a free board (the first, or the one on leg `rootLeg`: milestone
 * 175, so both ends of a wrap are boards grown off others and can swing), each other grown off its neighbour towards
 * the root. Its boards in path order, or null when an end lies in a band (or too near one).
 */
export function addFlexStrip(d: Design, pl: FlexPlane, p: FlexPath, width: number, u0: number, u1: number, rootLeg?: number): StripBoard[] | null {
  const a = legAt(p, u0), b = legAt(p, u1);
  if (!a || !b || endRoom(p, u0, u1) < 2) return null;
  const sp = legSpans(p);
  const t = p.t;
  const r = rootLeg !== undefined && rootLeg >= a.leg && rootLeg <= b.leg ? rootLeg : a.leg;
  // the root: on its leg from u0 (or the leg's start corner) to u1 (or its end corner), sharp corners as a fold keeps them
  const ax = legAxes(p, r);
  const dir = d3(pl, ax.dir), nIn = d3(pl, ax.n);
  const u = v3cross(dir, nIn);
  const x0 = r === a.leg ? a.x : 0, x1 = r === b.leg ? b.x : ax.L;
  const L0 = x1 - x0;
  const start = v3sub(w3(pl, { x: p.pts[r].x + ax.dir.x * x0, y: p.pts[r].y + ax.dir.y * x0 }), v3mul(u, width / 2));
  const root = addFreePanel(d, { frame: { o: start, u, v: dir }, side: 1, outer: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: L0 }, { x: 0, y: L0 }] });
  if (!root) return null;
  solve(d);
  const rootBoard: StripBoard = { id: root, leg: r, y0: (r === a.leg ? a.x : sp[r].lo) - x0, y1: (r === b.leg ? b.x : sp[r].hi) - x0 };
  const grow = (from: string, edge: 'e0' | 'e2', h: number): string | null => {
    const g = growPanel(d, from, edge, { height: h, angle: 90, dir: 'up', kind: 'fold' });
    if (!g) return null;
    d.connections[g.connectionId].radius = p.Ro - t;
    solve(d);
    return g.panelId;
  };
  // forward: each board from its leg's start corner, its own y from t past it
  const after: StripBoard[] = [];
  let prev = root;
  for (let i = r + 1; i <= b.leg; i++) {
    const last = i === b.leg;
    const id = grow(prev, 'e2', (last ? b.x : legAxes(p, i).L) - t);
    if (!id) return null;
    after.push({ id, leg: i, y0: p.Ro - t, y1: (last ? b.x : sp[i].hi) - t });
    prev = id;
  }
  // backward (milestone 175): each board from its leg's end corner back along it, off the root's start edge
  const before: StripBoard[] = [];
  prev = root;
  for (let i = r - 1; i >= a.leg; i--) {
    const last = i === a.leg;
    const L = legAxes(p, i).L;
    const id = grow(prev, i === r - 1 ? 'e0' : 'e2', L - (last ? a.x : 0) - t);
    if (!id) return null;
    before.push({ id, leg: i, y0: p.Ro - t, y1: L - (last ? a.x : sp[i].lo) - t });
    prev = id;
  }
  solve(d);
  return [...before.reverse(), rootBoard, ...after];
}

/** The spacing of a strip's bands' slits (the closest), and their columns, in order along it; null when it has none. */
function stripBands(d: Design, ids: string[]): { spacing: number; counts: number[] } | null {
  const counts: number[] = [];
  let spacing = Infinity;
  for (let i = 1; i < ids.length; i++) {
    const c = Object.values(d.connections).find((x) => x.grown && x.a.panelId === ids[i - 1] && x.b.panelId === ids[i]);
    const b = c && bandOf(d, c);
    if (!b) return null;
    counts.push(b.pattern.count);
    if (b.pattern.spacing > 0) spacing = Math.min(spacing, b.pattern.spacing);
  }
  return Number.isFinite(spacing) ? { spacing, counts } : null;
}

/** The slits a strip `len` long across has room for: how many per column, how long, and the bridges between them. */
export function slitRows(d: Design, len: number) {
  const m = d.material;
  const L = slitLayout(m, len);
  return L ? { ...L, b: hingeBridge(m) } : null;
}

/**
 * Slits on a strip's straight boards, as its bands have them (milestone 174): columns across each board's straight part
 * at the bands' spacing (or `spacing`), every other column shifted half a step, each board's count chosen so the
 * columns alternate across the bands. `keep`: a length at the strip's first (`start`) or last (`end`) end left whole
 * (a handle's place). Returns how many columns it cut.
 */
export function slitStrip(d: Design, boards: StripBoard[], width: number, keep: { at: 'start' | 'end'; len: number } | null, spacing?: number): number {
  const bands = stripBands(d, boards.map((x) => x.id));
  const sp = spacing ?? bands?.spacing;
  const rows = slitRows(d, width);
  if (!sp || !rows) return 0;
  const step = rows.S + rows.b;
  let made = 0;
  // the parity of the next column: a band's first column is unshifted (bendPatterns' layout)
  let parity = 0;
  boards.forEach((B, i) => {
    let y0 = B.y0, y1 = B.y1;
    if (keep && keep.at === 'start' && i === 0) y0 += keep.len;
    if (keep && keep.at === 'end' && i === boards.length - 1) y1 -= keep.len;
    const free = i === 0 && !keep ? rows.b : 0, freeEnd = i === boards.length - 1 && !keep ? rows.b : 0;
    y0 += free;
    y1 -= freeEnd;
    const L = y1 - y0;
    const after = i < boards.length - 1;
    let n = Math.max(0, Math.ceil(L / sp - 1e-9));
    if (i === 0) {
      // the first board's first column is free: its last must be shifted when a band follows
      if (n > 0) parity = after ? (n % 2 === 0 ? 0 : 1) : 0;
    } else if (after && n > 0 && (parity + n - 1) % 2 !== 1) n += 1;
    if (L > 1 && n > 0) {
      const pc = L / n;
      for (let k = 0; k < n; k++) {
        const y = y0 + (k + 0.5) * pc;
        const shifted = (parity + k) % 2 === 1;
        if (!shifted) for (let j = 0; j < rows.n; j++) addLine(d, B.id, [{ x: rows.b + j * step, y }, { x: rows.b + j * step + rows.S, y }], 'cut', 'slits');
        else
          for (let j = -1; j <= rows.n; j++) {
            const x0 = Math.max(rows.b, rows.b + j * step + step / 2), x1 = Math.min(width - rows.b, rows.b + j * step + step / 2 + rows.S);
            if (x1 - x0 >= rows.b) addLine(d, B.id, [{ x: x0, y }, { x: x1, y }], 'cut', 'slits');
          }
        made++;
      }
      parity = (parity + n) % 2;
    }
    // across the band after it: its columns, starting unshifted
    if (after && bands) parity = bands.counts[i] % 2;
  });
  return made;
}

/** The tightest inner radius plywood's slits reach in a strip `len` long across (Infinity: too short for one). */
export function stripReach(d: Design, len: number): number {
  return patternReach('slits', { m: d.material, r: 0, len, width: 10, turn: Math.PI / 2 });
}

/**
 * A handle on a strip's end (boxes.py's door handle, written fresh): a board `h` tall standing on the strip's outer
 * face across it, `from` mm in from the end, `width` long, held by tabs in slots in the strip. Its id, or null.
 */
export function addStripHandle(d: Design, board: StripBoard & { end: 'start' | 'end' }, width: number, from: number, h: number): string | null {
  const B = d.panels[board.id];
  if (!B) return null;
  // along the board: y at the handle's face nearer the end; it stands outward (against the board's material)
  const yEnd = board.end === 'start' ? 0 : board.y1;
  const yFace = board.end === 'start' ? yEnd + from : yEnd - from;
  const out = v3mul(matDir(B.frame), -1);
  const along = board.end === 'start' ? B.frame.v : v3mul(B.frame.v, -1);
  const x0 = (B.w - width) / 2;
  const o = toWorld(B.frame, x0, yFace, 0);
  // its material away from the end, towards the strip's middle
  const id = addFreePanel(d, { frame: { o, u: B.frame.u, v: out }, side: v3cross(B.frame.u, out).every((c, i) => Math.abs(c - along[i]) < 1e-6) ? 1 : -1, outer: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: h }, { x: 0, y: h }] });
  if (!id) return null;
  solve(d);
  connectSeams(d, id);
  solve(d);
  return id;
}

/** Plywood's living hinge at this thickness: the radius it is calibrated for (the material's pattern radius). */
export const hingeRadius = (d: Design) => bendOf(d.material).patternR;
