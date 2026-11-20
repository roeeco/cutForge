// The bridge from shapes to the face graph (milestone 122, SHAPES_TO_DIELINES_PLAN.md
// §4.2): the one kernel-touching step of making. The solid is built with Make's facet
// counts (on a copy: the shapes keep their own), its mesh's triangles are named by the
// shape they came from (manifold keeps each leaf body's original id through the
// booleans) and by their role in that shape's own frame, and the face graph is made
// from them. Roles are read from directions in the shape's frame, so a resize or a
// moved sketch point keeps every key; a new facet count changes only the facets'.
import type { P2, Sculpt, Shape3, V3 } from '../model/types';
import { polyFromTriangles, type PFace, type Polyhedron } from '../model/polyhedron';
import { buildSolid, footprint, shapeMatrix, shapeOfOriginal } from './build';
import { scope, type Kernel } from './kernel';
import { parentMatrix } from './tree';
import { m4Apply, m4InvAffine, m4Mul } from './xform';
import { flattenSketch } from './round';
import { allCuts, trimmedSegPoints } from '../sketch/flatten';

/** Faces around a full turn for a curved shape, by what is made (SHAPES_TO_DIELINES_PLAN.md decision 4). */
export const DEFAULT_FACETS = { card: 12, boards: 8 } as const;
const CURVED = new Set<Shape3['kind']>(['cylinder', 'cone', 'sphere', 'halfsphere', 'torus', 'revolve']);

/** A copy of the shapes with every curved one cut into flat facets: its own count, `byShape`'s, or `facets`. */
export function facetedCopy(sc: Sculpt, facets: number, byShape: Record<string, number> = {}): Sculpt {
  const shapes: Sculpt['shapes'] = {};
  for (const [id, s] of Object.entries(sc.shapes)) {
    const n = byShape[id] ?? s.facets ?? facets;
    if (CURVED.has(s.kind)) shapes[id] = { ...s, facets: n };
    // an extrusion's arcs and curves: its count is per quarter turn
    else if (s.kind === 'extrude' && curvedSketch(s)) shapes[id] = { ...s, facets: byShape[id] ? Math.max(3, Math.round(byShape[id] / 4)) : (s.facets ?? Math.max(3, Math.round(facets / 4))) };
    else shapes[id] = s;
  }
  return { ...sc, shapes };
}

const curvedSketch = (s: Shape3) => !!s.sketch && (Object.values(s.sketch.segs).some((g) => !g.cons && g.k !== 'line') || Object.values(s.sketch.pts).some((p) => (p.r ?? 0) > 0 || (p.ch ?? 0) > 0));

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V): V => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const deg = (r: number) => (r * 180) / Math.PI;
const wrap = (k: number, n: number) => ((k % n) + n) % n;

/** Each footprint edge's outward normal (box, prism, pyramid), in the body's XY. */
function footNormals(s: Shape3): P2[] {
  const pts = flattenSketch(footprint(s));
  const ring = pts.length ? pts : [];
  const area = ring.reduce((a, p, i) => a + p.x * ring[(i + 1) % ring.length].y - ring[(i + 1) % ring.length].x * p.y, 0);
  const sgn = area >= 0 ? 1 : -1;
  // the corners' own points only (the footprint before rounding)
  const base = footprint({ ...s, corners: undefined });
  return base.map((p, i) => {
    const q = base[(i + 1) % base.length];
    const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1;
    return { x: (sgn * dy) / l, y: (-sgn * dx) / l };
  });
}

/**
 * A triangle's role in its shape (§4.2's table), from its normal and centre in the
 * leaf body's own coordinates (z up, as the body is built before it is turned y-up).
 */
function roleOf(s: Shape3, n: V, c: V, N: number, segPts: { id: string; pts: P2[] }[] | null, facets: number): { role: string; facetOf?: PFace['facetOf'] } {
  const up = n[2], az = Math.atan2(n[1], n[0]);
  const step = (2 * Math.PI) / N;
  switch (s.kind) {
    case 'box':
    case 'prism':
    case 'pyramid': {
      if (up > 1 - 1e-6) return { role: 'top' };
      if (up < -1 + 1e-6) return { role: 'bottom' };
      const h = norm([n[0], n[1], 0]);
      const ns = footNormals(s);
      let best = -1, bd = -2;
      ns.forEach((q, i) => {
        const dd = q.x * h[0] + q.y * h[1];
        if (dd > bd) (bd = dd), (best = i);
      });
      // a rounded corner's facets lie between two sides
      if (bd < 1 - 1e-4) return { role: `corner${best}/a${Math.round(deg(az))}`, facetOf: 'ruled' };
      if (s.kind === 'box') return { role: ['+z', '+x', '-z', '-x'][best] ?? `side${best}` };
      return { role: `side${best}` };
    }
    case 'cylinder':
    case 'cone':
      if (up > 1 - 1e-6) return { role: 'cap1' };
      if (up < -1 + 1e-6) return { role: 'cap0' };
      return { role: `f${wrap(Math.round((Math.atan2(c[1], c[0]) - step / 2) / step), N)}`, facetOf: 'ruled' };
    case 'sphere':
    case 'halfsphere': {
      if (s.kind === 'halfsphere' && up < -1 + 1e-6) return { role: 'cap0' };
      const el = Math.asin(Math.max(-1, Math.min(1, up)));
      return { role: `f${wrap(Math.round(az / step), N)}.${Math.round(el / step)}`, facetOf: 'curved' };
    }
    case 'torus': {
      const around = Math.atan2(c[1], c[0]);
      const radial = n[0] * Math.cos(around) + n[1] * Math.sin(around);
      const tube = Math.atan2(n[2], radial);
      return { role: `f${wrap(Math.round(around / step), N)}.${wrap(Math.round(tube / step), N)}`, facetOf: 'curved' };
    }
    case 'extrude': {
      if (up > 1 - 1e-6) return { role: 'top' };
      if (up < -1 + 1e-6) return { role: 'bottom' };
      // the sketch segment its wall stands on (the nearest), and where along it for a curve's facets
      if (segPts) {
        let best: { id: string; dist: number; t: number; straight: boolean } | null = null;
        for (const sg of segPts) {
          const pts = sg.pts;
          let L = 0;
          const lens = pts.slice(1).map((p, i) => (L += Math.hypot(p.x - pts[i].x, p.y - pts[i].y)));
          for (let i = 0; i + 1 < pts.length; i++) {
            const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
            const t = l2 ? Math.max(0, Math.min(1, ((c[0] - a.x) * dx + (c[1] - a.y) * dy) / l2)) : 0;
            const dist = Math.hypot(c[0] - a.x - t * dx, c[1] - a.y - t * dy);
            const at = ((i ? lens[i - 1] : 0) + t * Math.sqrt(l2)) / (L || 1);
            if (!best || dist < best.dist - 1e-9) best = { id: sg.id, dist, t: at, straight: pts.length === 2 };
          }
        }
        if (best && best.dist < 0.5) return best.straight ? { role: `seg:${best.id}` } : { role: `seg:${best.id}/f${Math.round(best.t * facets * 4)}`, facetOf: 'ruled' };
      }
      return { role: `a${Math.round(deg(az))}`, facetOf: 'ruled' };
    }
    default: {
      // a revolve and anything else: by the facet's direction
      const el = Math.asin(Math.max(-1, Math.min(1, up)));
      return { role: `f${wrap(Math.round(az / step), N)}.${Math.round(el / step)}`, facetOf: 'curved' };
    }
  }
}

/**
 * The solid's face graph. `facets`: faces around a full turn for curved shapes without
 * their own count. Keys are `<shapeId>:<role>`, a Hole's `hole:<shapeId>:<role>`, faces
 * merged across shapes join theirs with '+'.
 */
export function shapePolyhedron(k: Kernel, sc: Sculpt, facets: number = DEFAULT_FACETS.card, byShape: Record<string, number> = {}): Polyhedron {
  const fsc = facetedCopy(sc, facets, byShape);
  return scope(() => {
    const m = buildSolid(k, fsc);
    if (m.isEmpty()) return { faces: {}, edges: {}, issues: [] };
    const mesh = m.getMesh();
    mesh.merge();
    const np = mesh.numProp, vp = mesh.vertProperties, tv = mesh.triVerts;
    const V: V3[] = [];
    for (let i = 0; i < vp.length / np; i++) V.push([vp[i * np], vp[i * np + 1], vp[i * np + 2]]);
    const T: [number, number, number][] = [];
    for (let i = 0; i < tv.length; i += 3) T.push([tv[i], tv[i + 1], tv[i + 2]]);
    // each triangle's shape, from its run
    const shapeOfTri: (string | undefined)[] = new Array(T.length);
    for (let r = 0; r < mesh.runOriginalID.length; r++) {
      const id = shapeOfOriginal(mesh.runOriginalID[r]);
      for (let t = mesh.runIndex[r] / 3; t < mesh.runIndex[r + 1] / 3; t++) shapeOfTri[t] = id;
    }
    const frames = new Map<string, { inv: number[]; N: number; seg: { id: string; pts: P2[] }[] | null; facets: number }>();
    const frameOf = (id: string) => {
      let f = frames.get(id);
      if (f) return f;
      const s = fsc.shapes[id];
      const M = m4Mul(parentMatrix(fsc, id), shapeMatrix(s));
      const fc = s.facets ?? facets;
      let seg: { id: string; pts: P2[] }[] | null = null;
      if (s.kind === 'extrude' && s.sketch) {
        const cuts = allCuts(s.sketch);
        seg = s.sketch.order.filter((g) => s.sketch!.segs[g] && !s.sketch!.segs[g].cons).map((g) => ({ id: g, pts: s.sketch!.segs[g].k === 'line' ? (() => { const p = trimmedSegPoints(s.sketch!, g, cuts); return [p[0], p[p.length - 1]]; })() : trimmedSegPoints(s.sketch!, g, cuts) }));
      }
      f = { inv: m4InvAffine(M), N: CURVED.has(s.kind) ? fc : facets, seg, facets: fc };
      frames.set(id, f);
      return f;
    };
    return polyFromTriangles(V, T, (t) => {
      const id = shapeOfTri[t];
      const s = id ? fsc.shapes[id] : undefined;
      if (!id || !s) return { key: `?:t${t}`, src: [] };
      const f = frameOf(id);
      const [a, b, c] = T[t].map((i) => m4Apply(f.inv as never, V[i]) as V);
      const n = norm(cross(sub(b, a), sub(c, a)));
      const cen: V = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      const r = roleOf(s, n, cen, f.N, f.seg, f.facets);
      // a face a Hole left in the solid
      const key = `${s.hole ? 'hole:' : ''}${id}:${r.role}`;
      return { key, src: [{ shapeId: id, role: r.role }], ...(r.facetOf ? { facetOf: r.facetOf } : {}) };
    });
  });
}
