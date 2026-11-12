// Shapes → solid (WAFFLE_MODE.md §3.2–3.3). Every primitive is built from a 2D
// CrossSection, z-up as manifold extrudes and revolves, then turned y-up and
// placed by the shape's turn and position. Groups join their Solids and cut
// their Holes; at the top level every Solid is joined and Holes cut nothing.
//
// Results are cached under a key made from the shape tree, so an edit rebuilds
// only the shapes it touched. Cached objects belong to the cache: callers must
// never `.delete()` them.
import type { P2, Sculpt, SculptPt, Shape3, V3 } from '../model/types';
import { circleSegments, own, scope, type CrossSection, type Kernel, type Manifold } from './kernel';
import { flattenSketch, withRadii } from './round';
import { m4, m4Mul, Z_TO_Y, type M4 } from './xform';

const SQ = (n: number) => n * n;

/** Polygon signed area (positive = counter-clockwise). */
export function area2(pts: P2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}
const ccw = (pts: P2[]) => (area2(pts) >= 0 ? pts : [...pts].reverse());
const vec2 = (pts: P2[]) => pts.map((p) => [p.x, p.y] as [number, number]);

/** A regular n-gon fitted to a w × d box centred on the origin (a flat side at the front). */
export function ngon(n: number, w: number, d: number): P2[] {
  const raw: P2[] = [];
  for (let k = 0; k < n; k++) {
    const a = -Math.PI / 2 + Math.PI / n + (2 * Math.PI * k) / n;
    raw.push({ x: Math.cos(a), y: Math.sin(a) });
  }
  const xs = raw.map((p) => p.x), ys = raw.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return raw.map((p) => ({ x: ((p.x - (x0 + x1) / 2) / (x1 - x0)) * w, y: ((p.y - (y0 + y1) / 2) / (y1 - y0)) * d }));
}

/** A box's footprint corners (CCW from the front left), in the shape's local XY (y towards the back). */
export function rectFoot(w: number, d: number): P2[] {
  return [
    { x: -w / 2, y: -d / 2 },
    { x: w / 2, y: -d / 2 },
    { x: w / 2, y: d / 2 },
    { x: -w / 2, y: d / 2 },
  ];
}

/** The footprint outline of a box, prism or pyramid with its corner radii (points of a sketch). */
export function footprint(s: Shape3): SculptPt[] {
  const [w, , d] = s.size ?? [40, 40, 40];
  const poly = s.kind === 'box' ? rectFoot(w, d) : ngon(clampSides(s.n), w, d);
  return withRadii(poly, s.corners);
}
export const clampSides = (n?: number) => Math.max(3, Math.min(12, Math.round(n ?? 6)));

/** A sketch outline as a CrossSection (curves and rounded corners flattened within 0.02 mm). */
export function sketchSection(k: Kernel, pts: SculptPt[]): CrossSection {
  return k.CrossSection.ofPolygons([vec2(ccw(flattenSketch(pts)))], 'NonZero');
}

/** Does the outline lie on both sides of the line x = 0 (it crosses its axis)? */
export function crossesAxis(pts: P2[]): boolean {
  const flat = pts;
  const lo = Math.min(...flat.map((p) => p.x)), hi = Math.max(...flat.map((p) => p.x));
  return lo < -1e-6 && hi > 1e-6;
}

/** The 2D move that puts edge i of an outline on the +y axis (its start at the origin). */
export function edgeFrame(pts: P2[], i: number): { o: P2; ang: number } {
  const a = pts[i % pts.length], b = pts[(i + 1) % pts.length];
  return { o: a, ang: Math.atan2(b.y - a.y, b.x - a.x) };
}
const toEdge = (f: { o: P2; ang: number }, p: P2): P2 => {
  // rotate so the edge points along +y
  const r = Math.PI / 2 - f.ang, c = Math.cos(r), s = Math.sin(r), x = p.x - f.o.x, y = p.y - f.o.y;
  return { x: x * c - y * s, y: x * s + y * c };
};
/** The outline in the frame its revolve axis gives (the axis along +y through the origin). */
export function axisOutline(s: Shape3): P2[] {
  const pts = flattenSketch(s.sketch?.pts ?? []);
  if (s.axis?.kind !== 'edge') return pts;
  const f = edgeFrame(s.sketch!.pts, s.axis.i);
  return pts.map((p) => toEdge(f, p));
}
/** Sketch-local 3D (x, y on the plane, z its normal) from the axis frame's 3D. */
function fromEdgeM(s: Shape3): M4 {
  if (s.axis?.kind !== 'edge') return m4([0, 0, 0], [0, 0, 0, 1]);
  const f = edgeFrame(s.sketch!.pts, s.axis.i);
  const r = -(Math.PI / 2 - f.ang), c = Math.cos(r), sn = Math.sin(r);
  return [c, sn, 0, 0, -sn, c, 0, 0, 0, 0, 1, 0, f.o.x, f.o.y, 0, 1];
}

/** The shape's own transform: sketch-local or built z-up → its parent's frame. */
export function shapeMatrix(s: Shape3): M4 {
  const base = s.kind === 'group' ? null : s.kind === 'extrude' || s.kind === 'revolve' ? (s.sketch?.plane === 'upright' ? null : Z_TO_Y) : Z_TO_Y;
  const T = m4(s.at, s.q);
  return base ? m4Mul(T, base) : T;
}

/** A leaf shape built in its own coordinates (before `shapeMatrix`). Empty when it cannot be built. */
function leafBody(k: Kernel, s: Shape3): Manifold {
  const { Manifold, CrossSection } = k;
  const [w, h, d] = s.size ?? [40, 40, 40];
  const ok = (x: number) => Number.isFinite(x) && x > 0.01;
  switch (s.kind) {
    case 'box':
    case 'prism':
    case 'pyramid': {
      if (!ok(w) || !ok(h) || !ok(d)) return Manifold.ofMesh(emptyMesh(k));
      const top = s.kind === 'pyramid' ? Math.max(0, Math.min(1, s.top ?? 0)) : 1;
      return sketchSection(k, footprint(s)).extrude(h, 0, 0, [top, top]);
    }
    case 'cylinder':
    case 'cone': {
      if (!ok(w) || !ok(h) || !ok(d)) return Manifold.ofMesh(emptyMesh(k));
      const r = Math.max(w, d) / 2;
      const c = CrossSection.circle(r, circleSegments(r)).scale([w / 2 / r, d / 2 / r]);
      const top = s.kind === 'cone' ? Math.max(0, Math.min(1, s.top ?? 0)) : 1;
      return c.extrude(h, 0, 0, [top, top]);
    }
    case 'sphere':
    case 'halfsphere': {
      if (!ok(w) || !ok(h) || !ok(d)) return Manifold.ofMesh(emptyMesh(k));
      const half = s.kind === 'halfsphere';
      const rz = half ? h : h / 2;
      const r = Math.max(w / 2, d / 2, rz);
      const u = Manifold.sphere(1, circleSegments(r)).scale([w / 2, d / 2, rz]);
      return half ? u.trimByPlane([0, 0, 1], 0) : u.translate([0, 0, h / 2]);
    }
    case 'torus': {
      const tube = s.tube ?? h;
      const R = w / 2 - tube / 2;
      if (!ok(tube) || !ok(R) || !ok(d)) return Manifold.ofMesh(emptyMesh(k));
      const ring = CrossSection.circle(tube / 2, circleSegments(tube / 2))
        .translate([R, 0])
        .revolve(circleSegments(w / 2));
      return ring.scale([1, d / w, 1]).translate([0, 0, tube / 2]);
    }
    case 'extrude': {
      const pts = s.sketch?.pts ?? [];
      const H = s.height ?? 20;
      if (pts.length < 3 || Math.abs(H) < 0.01) return Manifold.ofMesh(emptyMesh(k));
      const m = sketchSection(k, pts).extrude(Math.abs(H));
      return H < 0 ? m.translate([0, 0, H]) : m;
    }
    case 'revolve': {
      const pts = s.sketch?.pts ?? [];
      if (pts.length < 3) return Manifold.ofMesh(emptyMesh(k));
      let flat = axisOutline(s);
      if (crossesAxis(flat)) return Manifold.ofMesh(emptyMesh(k));
      const mirror = Math.max(...flat.map((p) => p.x)) <= 1e-9;
      if (mirror) flat = flat.map((p) => ({ x: -p.x, y: p.y }));
      const rmax = Math.max(...flat.map((p) => p.x));
      const ang = Math.max(1, Math.min(360, s.angle ?? 360));
      const cs = CrossSection.ofPolygons([vec2(ccw(flat))], 'NonZero');
      // revolved about +y, which becomes +z; back to the axis frame: (x, y, z) → (x, z, −y)
      let m = cs.revolve(circleSegments(rmax), ang).transform(Z_TO_Y as never);
      if (mirror) m = m.mirror([1, 0, 0]);
      return s.axis?.kind === 'edge' ? m.transform(fromEdgeM(s) as never) : m;
    }
    default:
      return Manifold.ofMesh(emptyMesh(k));
  }
}

function emptyMesh(k: Kernel) {
  return new k.Mesh({ numProp: 3, vertProperties: new Float32Array(0), triVerts: new Uint32Array(0) });
}

// ---- cache -------------------------------------------------------------------

const CACHE_MAX = 400;
const cache = new Map<string, Manifold>();
function cached(key: string, make: () => Manifold): Manifold {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const m = own(scope(make));
  cache.set(key, m);
  while (cache.size > CACHE_MAX) {
    const [k0, old] = cache.entries().next().value as [string, Manifold];
    cache.delete(k0);
    old.delete();
  }
  return m;
}
/** Free everything the cache holds (tests; a design closed). */
export function clearShapeCache() {
  for (const m of cache.values()) m.delete();
  cache.clear();
}
export const shapeCacheSize = () => cache.size;

const GEOM_FIELDS = ['kind', 'size', 'n', 'top', 'tube', 'corners', 'sketch', 'height', 'angle', 'axis'] as const;

/** The stable key of a shape's geometry in its parent's frame (its subtree for a group). */
export function shapeKey(sc: Sculpt, id: string, seen = new Set<string>()): string {
  const s = sc.shapes[id];
  if (!s || seen.has(id)) return '∅';
  seen.add(id);
  const g: Record<string, unknown> = {};
  for (const f of GEOM_FIELDS) if (s[f] !== undefined) g[f] = s[f];
  const kids = s.kind === 'group' ? (s.children ?? []).map((c) => `${sc.shapes[c]?.hole ? 'H' : 'S'}${shapeKey(sc, c, seen)}`) : [];
  return JSON.stringify([g, s.at, s.q, kids]);
}

/** One shape (a group with its members) built in its parent's frame. */
export function buildShape(k: Kernel, sc: Sculpt, id: string): Manifold {
  const key = shapeKey(sc, id);
  return cached(key, () => {
    const s = sc.shapes[id];
    if (!s) return k.Manifold.ofMesh(emptyMesh(k));
    if (s.kind === 'group') {
      const kids = (s.children ?? []).filter((c) => sc.shapes[c] && c !== id);
      const solids = kids.filter((c) => !sc.shapes[c].hole).map((c) => buildShape(k, sc, c));
      const holes = kids.filter((c) => sc.shapes[c].hole).map((c) => buildShape(k, sc, c));
      // a group of holes only is one complex hole: its holes joined
      let m = solids.length ? k.Manifold.union(solids) : holes.length ? k.Manifold.union(holes) : k.Manifold.ofMesh(emptyMesh(k));
      if (solids.length && holes.length) m = m.subtract(k.Manifold.union(holes));
      return m.transform(m4(s.at, s.q) as never);
    }
    return leafBody(k, s).transform(shapeMatrix(s) as never);
  });
}

/** The key of the whole solid. */
export function solidKey(sc: Sculpt): string {
  return JSON.stringify(sc.order.filter((id) => sc.shapes[id] && !sc.shapes[id].hole).map((id) => shapeKey(sc, id)));
}

/** The solid: every top-level Solid joined (Holes outside a group cut nothing). Owned by the cache. */
export function buildSolid(k: Kernel, sc: Sculpt | undefined): Manifold {
  if (!sc) return cached('[]', () => k.Manifold.ofMesh(emptyMesh(k)));
  return cached(`solid:${solidKey(sc)}`, () => {
    const parts = sc.order.filter((id) => sc.shapes[id] && !sc.shapes[id].hole).map((id) => buildShape(k, sc, id));
    return parts.length ? k.Manifold.union(parts) : k.Manifold.ofMesh(emptyMesh(k));
  });
}

/** Volume of a solid (mm³). */
export const volumeOf = (m: Manifold) => m.volume();

export type MeshArrays = { pos: Float32Array; nrm: Float32Array; idx: Uint32Array; box: { min: V3; max: V3 } | null };
const meshCache = new WeakMap<Manifold, MeshArrays>();
/** Triangles for the 3D view, with normals that stay sharp at edges over 30°. */
export function meshArrays(m: Manifold): MeshArrays {
  const hit = meshCache.get(m);
  if (hit) return hit;
  const r = scope(() => {
    const withN = m.calculateNormals(0, 30);
    const mesh = withN.getMesh();
    const np = mesh.numProp, n = mesh.vertProperties.length / np;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 3; j++) {
        pos[i * 3 + j] = mesh.vertProperties[i * np + j];
        nrm[i * 3 + j] = np >= 6 ? mesh.vertProperties[i * np + 3 + j] : 0;
      }
    }
    const bb = m.isEmpty() ? null : m.boundingBox();
    return { pos, nrm, idx: new Uint32Array(mesh.triVerts), box: bb ? { min: [...bb.min] as V3, max: [...bb.max] as V3 } : null };
  });
  meshCache.set(m, r);
  return r;
}

export { SQ };
