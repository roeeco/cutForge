// Where panels' slabs touch or run into each other (milestone 16). Used by the
// export check so that no pair of touching panels is left unjoined without a
// message. Each panel's side faces are sampled (every ~1 mm, at five depths
// through the material) and tested against the other panel's slab: its own
// outline (with Adds and Cuts) × [0, t], minus through-cut regions. Faces are
// sampled on a grid too, so parallel panels lying in each other are found.
import type { Design, P2, Panel, V3 } from './types';
import { frameNormal, matDir, toLocal, toWorld } from './frame';
import { panelRings } from './outline';
import { removedByCut, throughRegions } from './through';
import { pointInPolygon, segDistPoint } from '../geom/vec';
import { v3dot, v3len, v3sub } from '../geom/v3';
import { tOf } from './materials';

/** Samples within this distance of the other slab count as touching (mm). */
export const TOUCH_EPS = 0.05;
/** Contacts shorter than this (a corner grazing a face) are left out (mm). */
export const MIN_CONTACT_EXTENT = 1.5;

export type Contact = {
  a: string;
  b: string;
  /** Deepest sample of one slab inside the other (0: they only touch). */
  depth: number;
  /** Largest distance between contact samples (mm). */
  extent: number;
  /** Angle between the two panels' planes, 0–90°. */
  angle: number;
  /** Parallel panels in the same plane (side by side), or face to face. */
  coplanar: boolean;
};

type Slab = { p: Panel; t: number; rings: P2[][]; cuts: P2[][]; min: V3; max: V3 };

function slab(d: Design, p: Panel): Slab {
  const t = tOf(d, p.id);
  const rings = panelRings(p).map((r) => r.map((e) => e.a));
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const r of rings)
    for (const q of r)
      for (const z of [0, t]) {
        const w = toWorld(p.frame, q.x, q.y, z);
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], w[k]);
          max[k] = Math.max(max[k], w[k]);
        }
      }
  return { p, t, rings, cuts: throughRegions(d, p.id), min, max };
}

/** Signed distance from a world point to a slab (negative inside: the depth inside). */
function dist(s: Slab, P: V3): number {
  const t = s.t;
  const l = toLocal(s.p.frame, P);
  const z = v3dot(v3sub(P, s.p.frame.o), matDir(s.p.frame));
  let inside = false, edge = Infinity;
  for (const r of s.rings) {
    if (pointInPolygon(l, r)) inside = !inside;
    for (let i = 0; i < r.length; i++) edge = Math.min(edge, segDistPoint(l, r[i], r[(i + 1) % r.length]));
  }
  if (inside && s.cuts.some((c) => pointInPolygon(l, c))) inside = false;
  const dp = inside ? -edge : edge;
  const dz = Math.max(-z, z - t);
  if (dp <= 0 && dz <= 0) return Math.max(dp, dz);
  return Math.hypot(Math.max(0, dp), Math.max(0, dz));
}

function contactOf(A: Slab, B: Slab): Contact | null {
  const lo = [0, 1, 2].map((k) => Math.max(A.min[k], B.min[k]) - TOUCH_EPS - 0.01);
  const hi = [0, 1, 2].map((k) => Math.min(A.max[k], B.max[k]) + TOUCH_EPS + 0.01);
  if (lo[0] > hi[0] || lo[1] > hi[1] || lo[2] > hi[2]) return null;
  const inBox = (w: V3) => w[0] >= lo[0] && w[0] <= hi[0] && w[1] >= lo[1] && w[1] <= hi[1] && w[2] >= lo[2] && w[2] <= hi[2];
  const hits: V3[] = [];
  let depth = 0;
  for (const [X, Y] of [
    [A, B],
    [B, A],
  ] as const)
    for (const r of X.rings)
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 1.5));
        for (let k = 0; k <= n; k++) {
          const x = a.x + ((b.x - a.x) * k) / n, y = a.y + ((b.y - a.y) * k) / n;
          for (const z of [0, X.t / 2, X.t]) {
            const w = toWorld(X.p.frame, x, y, z);
            if (!inBox(w)) continue;
            const sd = dist(Y, w);
            if (sd <= TOUCH_EPS) {
              hits.push(w);
              depth = Math.max(depth, -sd);
            }
          }
        }
      }
  // both faces, on a 2.5 mm grid over the part of the panel inside the shared box (parallel panels lying in each other)
  for (const [X, Y] of [
    [A, B],
    [B, A],
  ] as const) {
    const corners: P2[] = [];
    for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) corners.push(toLocal(X.p.frame, [x, y, z]));
    const xs = X.rings.flat().map((q) => q.x), ys = X.rings.flat().map((q) => q.y);
    const x0 = Math.max(Math.min(...xs), Math.min(...corners.map((q) => q.x))), x1 = Math.min(Math.max(...xs), Math.max(...corners.map((q) => q.x)));
    const y0 = Math.max(Math.min(...ys), Math.min(...corners.map((q) => q.y))), y1 = Math.min(Math.max(...ys), Math.max(...corners.map((q) => q.y)));
    for (let x = x0 + 1.25; x < x1; x += 2.5)
      for (let y = y0 + 1.25; y < y1; y += 2.5) {
        let inside = false;
        for (const r of X.rings) if (pointInPolygon({ x, y }, r)) inside = !inside;
        if (!inside) continue;
        for (const z of [0, X.t]) {
          const w = toWorld(X.p.frame, x, y, z);
          if (!inBox(w)) continue;
          const sd = dist(Y, w);
          if (sd <= TOUCH_EPS) {
            hits.push(w);
            depth = Math.max(depth, -sd);
          }
        }
      }
  }
  if (hits.length < 2) return null;
  // extent: the two samples farthest apart (from the box corners of the hits)
  let extent = 0;
  const h = hits.length > 300 ? hits.filter((_, k) => k % Math.ceil(hits.length / 300) === 0) : hits;
  for (let x = 0; x < h.length; x++) for (let y = x + 1; y < h.length; y++) extent = Math.max(extent, v3len(v3sub(h[x], h[y])));
  if (extent < MIN_CONTACT_EXTENT) return null;
  const c = Math.min(1, Math.abs(v3dot(frameNormal(A.p.frame), frameNormal(B.p.frame))));
  const angle = (Math.acos(c) * 180) / Math.PI;
  const parallel = c > 0.9998;
  const coplanar = parallel && isSideBySide(A, B);
  return { a: A.p.id, b: B.p.id, depth, extent, angle, coplanar };
}

/** Parallel slabs whose thickness ranges overlap (one plane), rather than stacked face to face. */
function isSideBySide(A: Slab, B: Slab): boolean {
  const n = frameNormal(A.p.frame);
  const za = [0, A.t].map((z) => v3dot(toWorld(A.p.frame, 0, 0, z), n)), zb = [0, B.t].map((z) => v3dot(toWorld(B.p.frame, 0, 0, z), n));
  const lo = Math.max(Math.min(...za), Math.min(...zb)), hi = Math.min(Math.max(...za), Math.max(...zb));
  return hi - lo > TOUCH_EPS;
}

const cache = new Map<string, Contact[]>();

const pair = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

/**
 * Every pair of panels whose slabs touch or overlap, over more than a point.
 * Pairs with a connection between them are left out unless `all` (the export
 * check only needs the unjoined ones). Cached by geometry.
 */
export function panelContacts(d: Design, all = false): Contact[] {
  const ids = d.order.filter((id) => d.panels[id]);
  const joined = all ? new Set<string>() : new Set(Object.values(d.connections).map((c) => pair(c.a.panelId, c.b.panelId)));
  const sig = JSON.stringify([
    [...joined].sort(),
    d.material.thickness,
    ids.map((id) => {
      const p = d.panels[id];
      return [id, tOf(d, id), p.frame, p.w, p.h, p.sketch, p.ext, p.details.filter((x) => x.op === 'add' || x.op === 'cut').map((x) => [x.id, x.op, x.shape, x.cx, x.cy, x.w, x.h, x.r, x.path, x.array, x.through])];
    }),
  ]);
  const hit = cache.get(sig);
  if (hit) return hit;
  const slabs = ids.filter((id) => !removedByCut(d, id)).map((id) => slab(d, d.panels[id]));
  const out: Contact[] = [];
  for (let i = 0; i < slabs.length; i++)
    for (let j = i + 1; j < slabs.length; j++) {
      if (joined.has(pair(slabs[i].p.id, slabs[j].p.id))) continue;
      const c = contactOf(slabs[i], slabs[j]);
      if (c) out.push(c);
    }
  if (cache.size > 50) cache.clear();
  cache.set(sig, out);
  return out;
}
