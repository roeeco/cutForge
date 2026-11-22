// A board larger than its sheet, cut across into pieces that fit and joined by puzzle keys (milestone 184,
// BOXES_PLYWOOD_PLAN.md E9). Nothing is stored but the student's ask (`Panel.keyed`): where the cuts go is worked out
// in the cut (`pieces.ts`), from the board's outline as it is cut and the sheet, each time.
//
// The cuts run straight across the board's longer way, as few as fit, each as near an equal share as it can be while
// it crosses no hole, slot, shape or line and leaves no sliver at the outline. Along each cut a dovetail key every
// 100 mm or so (milestone 64's key: neck and depth two boards, the head 1.6 necks), standing out of the piece before
// the cut into a socket in the piece after it, the board's clearance round it. The pieces are glued at the cut.
import type { MultiPolygon, Polygon } from 'polygon-clipping';
import type { MaterialProfile, P2 } from './types';
import type { TaggedContour } from '../geom/types';
import { flattenContour, pointInPolygon } from '../geom/vec';
import { safeDifference, safeIntersection, safeUnion } from '../geom/clip';
import { keyDims } from './wings';
import { minWeb } from './materials';

/** A key along a cut, from the cut line into the next piece: its neck, head and depth (mm). */
export type KeyDims = { neck: number; head: number; depth: number };
/** Where a board is cut (along `axis`, in the piece's coordinates), and where along each cut its keys are. */
export type KeyPlan = { axis: 'x' | 'y'; cuts: { at: number; keys: number[] }[]; key: KeyDims; clearance: number };

/** About how far apart keys go along a cut (mm). */
const KEY_EVERY = 100;
/** The step the search for a cut's place moves by (mm). */
const STEP = 0.5;
const BIG = 1e5;

type Ring = [number, number][];

/** The board's material crossed by the line `along = s`: the spans (across) where it is inside the outline and out of its holes. */
function spans(merged: MultiPolygon, axis: 'x' | 'y', s: number): [number, number][] {
  const out: [number, number][] = [];
  for (const poly of merged) {
    const hits: number[] = [];
    for (const ring of poly)
      for (let i = 0; i < ring.length - 1; i++) {
        const [a0, c0] = axis === 'x' ? ring[i] : [ring[i][1], ring[i][0]];
        const [a1, c1] = axis === 'x' ? ring[i + 1] : [ring[i + 1][1], ring[i + 1][0]];
        if ((a0 <= s && a1 > s) || (a1 <= s && a0 > s)) hits.push(c0 + ((s - a0) / (a1 - a0)) * (c1 - c0));
      }
    hits.sort((p, q) => p - q);
    for (let i = 0; i + 1 < hits.length; i += 2) out.push([hits[i], hits[i + 1]]);
  }
  return out;
}

/** Is a point (along, across) in the board's material? */
function inMaterial(merged: MultiPolygon, axis: 'x' | 'y', a: number, c: number): boolean {
  const q = axis === 'x' ? { x: a, y: c } : { x: c, y: a };
  return merged.some((poly) => {
    const ring = (r: Ring) => r.map(([x, y]) => ({ x, y }));
    return pointInPolygon(q, ring(poly[0])) && !poly.slice(1).some((h) => pointInPolygon(q, ring(h)));
  });
}

/**
 * Where to cut a board that does not fit its sheet (usable `W` × `H`, turned only when `canTurn`), or null when it
 * fits, when no straight cuts across make pieces that fit, or when no place for a cut is clear of its holes and shapes.
 */
export function planKeySplit(merged: MultiPolygon, contours: TaggedContour[], m: MaterialProfile, W: number, H: number, canTurn: boolean): KeyPlan | null {
  const pts = merged.flatMap((poly) => poly[0]);
  if (!pts.length) return null;
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  const w = box.x1 - box.x0, h = box.y1 - box.y0;
  if ((w <= W + 1e-6 && h <= H + 1e-6) || (canTurn && h <= W + 1e-6 && w <= H + 1e-6)) return null;
  const key = keyDims(m, Infinity);
  if (!key) return null;
  const cl = Math.max(0.02, m.clearance), web = Math.max(minWeb(m), m.thickness);
  // the shapes' extents along each way (a cut keeps a web clear of them, and its keys' sockets too)
  const shapes = contours.map((c) => flattenContour(c.contour, 0.2)).filter((q) => q.length);
  const tries: KeyPlan[] = [];
  for (const axis of ['x', 'y'] as const) {
    const lo = axis === 'x' ? box.x0 : box.y0, hi = axis === 'x' ? box.x1 : box.y1;
    const across = axis === 'x' ? h : w;
    // the longest a piece may be along the cut way: as it lies (x along the sheet's width, y its height), or turned
    const [Wa, Ha] = axis === 'x' ? [W, H] : [H, W];
    const caps = [across <= Ha + 1e-6 ? Wa : 0, canTurn && across <= Wa + 1e-6 ? Ha : 0];
    const cap = Math.max(...caps) - key.depth - cl - 1;
    if (cap < 50) continue;
    const L = hi - lo;
    const n = Math.max(2, Math.ceil(L / cap));
    const along = (q: P2) => (axis === 'x' ? q.x : q.y);
    const bands = shapes.map((q) => [Math.min(...q.map(along)), Math.max(...q.map(along))] as const);
    const corners = merged.flatMap((poly) => poly.flatMap((r) => r.map((q) => (axis === 'x' ? q[0] : q[1]))));
    const placeAt = (s: number): number[] | null => {
      // clear of every shape by a web, the key and its socket included, and no corner of the outline beside the cut
      if (bands.some(([a, b]) => b > s - web - cl && a < s + key.depth + web + cl)) return null;
      if (corners.some((a) => Math.abs(a - s) < web && Math.abs(a - s) > 1e-9)) return null;
      const keys: number[] = [];
      for (const [a, b] of spans(merged, axis, s)) {
        const len = b - a;
        if (len < key.head + 2 * (web + cl)) continue;
        const k = Math.max(1, Math.round(len / KEY_EVERY));
        for (let j = 0; j < k; j++) {
          const c = a + (len * (j + 0.5)) / k;
          // the key and its socket in the material all round (a notch in the outline beside the cut would cut it off)
          const ok = [0, key.depth / 2, key.depth + cl].every((da) => [-1, 1].every((sg) => inMaterial(merged, axis, s + da, c + sg * (key.head / 2 + cl + web)))) && inMaterial(merged, axis, s - web, c);
          if (ok) keys.push(c);
        }
      }
      return keys.length ? keys : null;
    };
    const cuts: { at: number; keys: number[] }[] = [];
    let prev = lo;
    for (let k = 1; k < n && cuts.length === k - 1; k++) {
      const ideal = lo + (k * L) / n;
      // a piece no longer than the cap, and what is left no longer than the cuts after it can take
      const from = Math.max(prev + 20, hi - (n - k) * cap), to = Math.min(prev + cap, hi - 20);
      const cands: number[] = [];
      for (let s = from; s <= to + 1e-9; s += STEP) cands.push(s);
      cands.sort((p, q) => Math.abs(p - ideal) - Math.abs(q - ideal));
      for (const s of cands) {
        const keys = placeAt(s);
        if (keys) {
          cuts.push({ at: s, keys });
          prev = s;
          break;
        }
      }
    }
    if (cuts.length === n - 1 && hi - prev <= cap + 1e-6) tries.push({ axis, cuts, key, clearance: cl });
  }
  if (!tries.length) return null;
  return tries.sort((p, q) => p.cuts.length - q.cuts.length)[0];
}

/** A polygon given in (along, across) for this plan's axis, as the piece's (x, y). */
const toXY = (axis: 'x' | 'y', q: [number, number][]): Polygon => [[...q, q[0]].map(([a, c]) => (axis === 'x' ? [a, c] : [c, a]) as [number, number])];

/** A key from the cut at `s` into the next piece, centred at `c` across; grown by `g` all round (its socket). */
function keyPoly(s: number, c: number, k: KeyDims, g: number): [number, number][] {
  return [
    [s - (g ? 1 : 0.01), c - k.neck / 2 - g],
    [s + k.depth + g, c - k.head / 2 - g],
    [s + k.depth + g, c + k.head / 2 + g],
    [s - (g ? 1 : 0.01), c + k.neck / 2 + g],
  ];
}

/** The board's outline cut into its pieces by a plan, in order along its axis (each a polygon or more). */
export function applyKeySplit(merged: MultiPolygon, plan: KeyPlan): MultiPolygon[] {
  const { axis, cuts, key } = plan;
  const g = plan.clearance / 2;
  const at = [-BIG, ...cuts.map((c) => c.at), BIG];
  const out: MultiPolygon[] = [];
  for (let i = 0; i + 1 < at.length; i++) {
    const a = at[i], b = at[i + 1];
    let region: MultiPolygon = [toXY(axis, [[a, -BIG], [b, -BIG], [b, BIG], [a, BIG]])];
    // its keys into the next piece, and the sockets of the keys from the piece before
    if (i + 1 < at.length - 1) region = safeUnion([...region, ...cuts[i].keys.map((c) => toXY(axis, keyPoly(b, c, key, 0)))]);
    if (i > 0) region = safeDifference(region, cuts[i - 1].keys.map((c) => toXY(axis, keyPoly(a, c, key, g))));
    const part = safeIntersection(merged, region);
    if (part.length) out.push(part);
  }
  return out;
}
