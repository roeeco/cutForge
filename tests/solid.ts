// Test helper: sample 3D points and count how many manufactured panel solids contain each.
import type { Design, V3 } from '../src/model/types';
import { matDir, toLocal } from '../src/model/frame';
import { panelExtras, panelNotches, panelOutline } from '../src/model/geometry';
import { pointInPolygon } from '../src/geom/vec';
import { throughRegions } from '../src/model/through';
import { v3dot, v3len, v3sub } from '../src/geom/v3';
import { tOf } from '../src/model/materials';

export function solidCounter(d: Design) {
  const solids = d.order.map((id) => {
    const p = d.panels[id];
    const ex = panelExtras(d, p);
    return { p, t: tOf(d, id), outline: panelOutline(p, panelNotches(d, p)), holes: [...ex.holes, ...ex.cuts, ...throughRegions(d, p.id)], m: matDir(p.frame) };
  });
  return (P: V3) => {
    let n = 0;
    for (const s of solids) {
      const z = v3dot(v3sub(P, s.p.frame.o), s.m);
      if (z <= 1e-6 || z >= s.t - 1e-6) continue;
      const l = toLocal(s.p.frame, P);
      if (!pointInPolygon(l, s.outline)) continue;
      if (s.holes.some((h) => pointInPolygon(l, h))) continue;
      n++;
    }
    return n;
  };
}

/** Max number of solids overlapping at any sample point in a box. */
export function maxOverlap(d: Design, min: V3, max: V3, step = 0.37): number {
  const count = solidCounter(d);
  let worst = 0;
  for (let x = min[0] + step / 3; x < max[0]; x += step)
    for (let y = min[1] + step / 3; y < max[1]; y += step)
      for (let z = min[2] + step / 3; z < max[2]; z += step) worst = Math.max(worst, count([x, y, z]));
  return worst;
}

// ---------------------------------------------------------------------------
// Pairwise slab contact (milestone 16): which pairs of panels touch or overlap.
// Independent of the model's seam code: every panel's nominal slab (its own
// outline, with through-cut regions removed) is sampled on its side faces and
// on both faces, and each sample is tested against every other slab.

import { panelRings } from '../src/model/outline';
import { removedByCut } from '../src/model/through';
import { segDistPoint } from '../src/geom/vec';
import { toWorld } from '../src/model/frame';

type Slab = { id: string; p: Design['panels'][string]; rings: { x: number; y: number }[][]; cuts: { x: number; y: number }[][]; min: V3; max: V3 };

function slabsOf(d: Design): Slab[] {
  const t = d.material.thickness;
  const out: Slab[] = [];
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p || removedByCut(d, id)) continue;
    const rings = panelRings(p).map((r) => r.map((e) => e.a));
    const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
    for (const r of rings)
      for (const q of r)
        for (const z of [0, t]) {
          const w = toWorld(p.frame, q.x, q.y, z);
          for (let k = 0; k < 3; k++) (min[k] = Math.min(min[k], w[k])), (max[k] = Math.max(max[k], w[k]));
        }
    out.push({ id, p, rings, cuts: throughRegions(d, id), min, max });
  }
  return out;
}

/** Signed distance (approximate outside, exact inside) from a world point to a slab: < 0 inside. */
function slabDist(s: Slab, t: number, P: V3): number {
  const l = toLocal(s.p.frame, P);
  const z = v3dot(v3sub(P, s.p.frame.o), matDir(s.p.frame));
  let inside = false, edge = Infinity;
  for (const r of s.rings) {
    if (pointInPolygon(l, r)) inside = !inside;
    for (let i = 0; i < r.length; i++) edge = Math.min(edge, segDistPoint(l, r[i], r[(i + 1) % r.length]));
  }
  if (inside && s.cuts.some((c) => pointInPolygon(l, c))) inside = false;
  const dPoly = inside ? -edge : edge;
  const dz = Math.max(-z, z - t);
  if (dPoly <= 0 && dz <= 0) return Math.max(dPoly, dz);
  return Math.hypot(Math.max(0, dPoly), Math.max(0, dz));
}

/** Sample points on a slab's surface (side faces and both faces), restricted to a world box. */
function surfaceSamples(s: Slab, t: number, lo: V3, hi: V3, step: number): V3[] {
  const pts: V3[] = [];
  const keep = (w: V3) => w[0] >= lo[0] && w[0] <= hi[0] && w[1] >= lo[1] && w[1] <= hi[1] && w[2] >= lo[2] && w[2] <= hi[2];
  for (const r of s.rings)
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(1, Math.ceil(L / step));
      for (let k = 0; k <= n; k++) {
        const x = a.x + ((b.x - a.x) * k) / n, y = a.y + ((b.y - a.y) * k) / n;
        for (const z of [0, t / 4, t / 2, (3 * t) / 4, t]) {
          const w = toWorld(s.p.frame, x, y, z);
          if (keep(w)) pts.push(w);
        }
      }
    }
  // both faces, on a grid
  const xs = s.rings.flat().map((q) => q.x), ys = s.rings.flat().map((q) => q.y);
  const fstep = step * 2;
  for (let x = Math.min(...xs) + fstep / 2; x < Math.max(...xs); x += fstep)
    for (let y = Math.min(...ys) + fstep / 2; y < Math.max(...ys); y += fstep) {
      const q = { x, y };
      let inside = false;
      for (const r of s.rings) if (pointInPolygon(q, r)) inside = !inside;
      if (!inside) continue;
      for (const z of [0, t]) {
        const w = toWorld(s.p.frame, x, y, z);
        if (keep(w)) pts.push(w);
      }
    }
  return pts;
}

export type SlabContact = { a: string; b: string; /** deepest sample of one slab inside the other (mm, 0 = touching) */ depth: number; /** largest distance between contact samples */ extent: number };

/**
 * Pairs of panels whose slabs touch (a sample of one lies within `eps` of the
 * other) or overlap, over a contact at least `minExtent` long. Point contacts
 * (a corner grazing a face) are left out.
 */
export function slabContacts(d: Design, eps = 0.05, step = 1, minExtent = 1.5): SlabContact[] {
  const t = d.material.thickness;
  const slabs = slabsOf(d);
  const out: SlabContact[] = [];
  for (let i = 0; i < slabs.length; i++)
    for (let j = i + 1; j < slabs.length; j++) {
      const A = slabs[i], B = slabs[j];
      const lo: V3 = [0, 1, 2].map((k) => Math.max(A.min[k], B.min[k]) - eps - 0.01) as V3;
      const hi: V3 = [0, 1, 2].map((k) => Math.min(A.max[k], B.max[k]) + eps + 0.01) as V3;
      if (lo[0] > hi[0] || lo[1] > hi[1] || lo[2] > hi[2]) continue;
      const hits: V3[] = [];
      let depth = 0;
      for (const [X, Y] of [[A, B], [B, A]] as const)
        for (const P of surfaceSamples(X, t, lo, hi, step)) {
          const sd = slabDist(Y, t, P);
          if (sd <= eps) {
            hits.push(P);
            depth = Math.max(depth, -sd);
          }
        }
      if (hits.length < 2) continue;
      let extent = 0;
      const h = hits.length > 400 ? hits.filter((_, k) => k % Math.ceil(hits.length / 400) === 0) : hits;
      for (let x = 0; x < h.length; x++) for (let y = x + 1; y < h.length; y++) extent = Math.max(extent, v3len(v3sub(h[x], h[y])));
      if (extent >= minExtent) out.push({ a: A.id, b: B.id, depth, extent });
    }
  return out;
}
