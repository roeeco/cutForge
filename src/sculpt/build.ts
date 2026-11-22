// Shapes → solid (WAFFLE_MODE.md §3.2–3.3). Every primitive is built from a 2D
// CrossSection, z-up as manifold extrudes and revolves, then turned y-up and
// placed by the shape's turn and position. Groups join their Solids and cut
// their Holes; at the top level every Solid is joined and Holes cut nothing.
//
// Results are cached under a key made from the shape tree, so an edit rebuilds
// only the shapes it touched. Cached objects belong to the cache: callers must
// never `.delete()` them.
import type { P2, Sculpt, SculptPt, Shape3, SketchGraph, V3 } from '../model/types';
import { sketchRegion } from '../sketch/regions';
import { circleSegments, own, scope, type CrossSection, type Kernel, type Manifold } from './kernel';
import { flattenSketch, withRadii } from './round';
import { m4, m4Mul, m4Scale, Z_TO_Y, type M4 } from './xform';

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

/** A footprint outline as a CrossSection (curves and rounded corners flattened within 0.02 mm). */
export function footprintSection(k: Kernel, pts: SculptPt[], facets?: number): CrossSection {
  return k.CrossSection.ofPolygons([vec2(ccw(flattenSketch(pts, facets)))], 'NonZero');
}

/** The rings of the area a sketch fills (outer rings counter-clockwise, holes clockwise). */
export function sketchRings(sketch: SketchGraph, facets?: number): P2[][] {
  return sketchRegion(sketch, facets ? { facets } : undefined).flat();
}

/** A sketch's area as a CrossSection. */
export function sketchSection(k: Kernel, sketch: SketchGraph, facets?: number): CrossSection {
  return k.CrossSection.ofPolygons(sketchRings(sketch, facets).map(vec2), 'Positive');
}

/** Does any ring lie on both sides of the line x = 0 (it crosses its axis)? */
export function crossesAxis(rings: P2[][] | P2[]): boolean {
  const pts = (rings as (P2 | P2[])[]).flat() as P2[];
  if (!pts.length) return false;
  const lo = Math.min(...pts.map((p) => p.x)), hi = Math.max(...pts.map((p) => p.x));
  return lo < -1e-6 && hi > 1e-6;
}

/** The 2D move that puts a segment of the sketch on the +y axis (its a end at the origin). */
export function segFrame(sketch: SketchGraph, segId: string): { o: P2; ang: number } | null {
  const g = sketch.segs[segId];
  const a = g && sketch.pts[g.a], b = g && sketch.pts[g.b];
  if (!a || !b) return null;
  return { o: { x: a.x, y: a.y }, ang: Math.atan2(b.y - a.y, b.x - a.x) };
}
const toEdge = (f: { o: P2; ang: number }, p: P2): P2 => {
  // rotate so the edge points along +y
  const r = Math.PI / 2 - f.ang, c = Math.cos(r), s = Math.sin(r), x = p.x - f.o.x, y = p.y - f.o.y;
  return { x: x * c - y * s, y: x * s + y * c };
};
const axisFrameOf = (s: Shape3) => (s.axis?.kind === 'seg' && s.sketch ? segFrame(s.sketch, s.axis.id) : null);
/** The sketch's rings in the frame its revolve axis gives (the axis along +y through the origin). */
export function axisOutline(s: Shape3, facets?: number): P2[][] {
  if (!s.sketch) return [];
  const rings = sketchRings(s.sketch, facets);
  const f = axisFrameOf(s);
  return f ? rings.map((r) => r.map((p) => toEdge(f, p))) : rings;
}
/** Sketch-local 3D (x, y on the plane, z its normal) from the axis frame's 3D. */
function fromEdgeM(s: Shape3): M4 {
  const f = axisFrameOf(s);
  if (!f) return m4([0, 0, 0], [0, 0, 0, 1]);
  const r = -(Math.PI / 2 - f.ang), c = Math.cos(r), sn = Math.sin(r);
  return [c, sn, 0, 0, -sn, c, 0, 0, 0, 0, 1, 0, f.o.x, f.o.y, 0, 1];
}

/** A shape's stretch, or null when it has none (or it is [1, 1, 1]). */
export function stretchOf(s: Pick<Shape3, 'stretch'>): V3 | null {
  const v = s.stretch;
  return v && v.some((x) => Math.abs(x - 1) > 1e-9) ? v : null;
}
/** Its move and turn, with its stretch (along its own axes) applied first. */
export function poseMatrix(s: Shape3): M4 {
  const T = m4(s.at, s.q);
  const st = stretchOf(s);
  return st ? m4Mul(T, m4Scale(st)) : T;
}

/** The shape's own transform: sketch-local or built z-up → its parent's frame (its stretch included). */
export function shapeMatrix(s: Shape3): M4 {
  const base = s.kind === 'group' ? null : s.kind === 'extrude' || s.kind === 'revolve' ? (s.sketch?.plane === 'upright' ? null : Z_TO_Y) : Z_TO_Y;
  const T = poseMatrix(s);
  return base ? m4Mul(T, base) : T;
}

/** A shape's Faces count (3–64), or undefined for smooth. */
export const facetsOf = (s: Pick<Shape3, 'facets'>) => (s.facets ? Math.max(3, Math.min(64, Math.round(s.facets))) : undefined);

/** A leaf shape built in its own coordinates (before `shapeMatrix`). Empty when it cannot be built. */
function leafBody(k: Kernel, s: Shape3): Manifold {
  const { Manifold, CrossSection } = k;
  const [w, h, d] = s.size ?? [40, 40, 40];
  const fc = facetsOf(s);
  const segs = (r: number) => fc ?? circleSegments(r);
  const ok = (x: number) => Number.isFinite(x) && x > 0.01;
  switch (s.kind) {
    case 'box':
    case 'prism':
    case 'pyramid': {
      if (!ok(w) || !ok(h) || !ok(d)) return Manifold.ofMesh(emptyMesh(k));
      const top = s.kind === 'pyramid' ? Math.max(0, Math.min(1, s.top ?? 0)) : 1;
      // a box or prism tapered to a frustum (milestone 121): its top scaled in width and depth
      const tp: [number, number] = s.kind !== 'pyramid' && s.taper ? [Math.max(0, s.taper[0]), Math.max(0, s.taper[1])] : [top, top];
      let body = footprintSection(k, footprint(s), fc).extrude(h, 0, 0, tp);
      // chamfered edges (milestone 132): each cut off by a plane through the two lines d in from the edge
      if (s.kind !== 'pyramid' && !s.taper && s.chamfers?.length) for (const pl of chamferPlanes(s)) body = body.trimByPlane(pl.n as never, pl.off);
      return body;
    }
    case 'loft': {
      if (!ok(w) || !ok(h) || !ok(d)) return Manifold.ofMesh(emptyMesh(k));
      return Manifold.hull(loftCorners(s) as never);
    }
    // milestone 121: flat-faced shapes, each the hull of its corners (z up, the footprint in XY, y towards the back)
    case 'wedge':
    case 'roof':
    case 'gem': {
      if (!ok(w) || !ok(h) || !ok(d)) return Manifold.ofMesh(emptyMesh(k));
      return Manifold.hull(flatCorners(s) as never);
    }
    case 'cylinder':
    case 'cone': {
      if (!ok(w) || !ok(h) || !ok(d)) return Manifold.ofMesh(emptyMesh(k));
      const r = Math.max(w, d) / 2;
      const c = CrossSection.circle(r, segs(r)).scale([w / 2 / r, d / 2 / r]);
      const top = s.kind === 'cone' ? Math.max(0, Math.min(1, s.top ?? 0)) : 1;
      return c.extrude(h, 0, 0, [top, top]);
    }
    case 'sphere':
    case 'halfsphere': {
      if (!ok(w) || !ok(h) || !ok(d)) return Manifold.ofMesh(emptyMesh(k));
      const half = s.kind === 'halfsphere';
      const rz = half ? h : h / 2;
      const r = Math.max(w / 2, d / 2, rz);
      const u = Manifold.sphere(1, segs(r)).scale([w / 2, d / 2, rz]);
      return half ? u.trimByPlane([0, 0, 1], 0) : u.translate([0, 0, h / 2]);
    }
    case 'torus': {
      const tube = s.tube ?? h;
      const R = w / 2 - tube / 2;
      if (!ok(tube) || !ok(R) || !ok(d)) return Manifold.ofMesh(emptyMesh(k));
      const ring = CrossSection.circle(tube / 2, segs(tube / 2))
        .translate([R, 0])
        .revolve(segs(w / 2));
      return ring.scale([1, d / w, 1]).translate([0, 0, tube / 2]);
    }
    case 'extrude': {
      const H = s.height ?? 20;
      if (!s.sketch || Math.abs(H) < 0.01 || !sketchRings(s.sketch, fc).length) return Manifold.ofMesh(emptyMesh(k));
      const cs = sketchSection(k, s.sketch, fc);
      if (cs.isEmpty()) return Manifold.ofMesh(emptyMesh(k));
      const m = cs.extrude(Math.abs(H));
      return H < 0 ? m.translate([0, 0, H]) : m;
    }
    case 'revolve': {
      let rings = axisOutline(s, fc);
      if (!rings.length || crossesAxis(rings)) return Manifold.ofMesh(emptyMesh(k));
      const pts = rings.flat();
      // an outline left of the axis is mirrored (and its rings turned back the right way round)
      const mirror = Math.max(...pts.map((p) => p.x)) <= 1e-9;
      if (mirror) rings = rings.map((r) => r.map((p) => ({ x: -p.x, y: p.y })).reverse());
      const rmax = Math.max(...rings.flat().map((p) => p.x));
      const ang = Math.max(1, Math.min(360, s.angle ?? 360));
      const cs = CrossSection.ofPolygons(rings.map(vec2), 'Positive');
      if (cs.isEmpty()) return Manifold.ofMesh(emptyMesh(k));
      // revolved about +y, which becomes +z; back to the axis frame: (x, y, z) → (x, z, −y)
      let m = cs.revolve(segs(rmax), ang).transform(Z_TO_Y as never);
      if (mirror) m = m.mirror([1, 0, 0]);
      return axisFrameOf(s) ? m.transform(fromEdgeM(s) as never) : m;
    }
    default:
      return Manifold.ofMesh(emptyMesh(k));
  }
}

/** The corners of a wedge, a roof or a diamond in its body's coordinates (z up, footprint centred in XY). */
export function flatCorners(s: Shape3): V3[] {
  const [w, h, d] = s.size ?? [40, 40, 40];
  const x = w / 2, y = d / 2;
  if (s.kind === 'wedge') {
    // full height at the back, nothing at the front: a slope from the front edge up to the back's top
    return [[-x, -y, 0], [x, -y, 0], [x, y, 0], [-x, y, 0], [-x, y, h], [x, y, h]];
  }
  if (s.kind === 'roof') {
    // a ridge along x over the middle of the depth
    return [[-x, -y, 0], [x, -y, 0], [x, y, 0], [-x, y, 0], [-x, 0, h], [x, 0, h]];
  }
  // a diamond: a pavilion to a point, the girdle, a crown up to a flat table
  const n = clampSides(s.n ?? 8);
  const crown = Math.max(0.5, Math.min(h - 0.5, s.crown ?? h * 0.27));
  const table = Math.max(0.1, Math.min(0.95, s.table ?? 0.55));
  // the girdle fitted to the width and depth, as a prism's footprint is
  const girdle = ngon(n, w, d);
  const ring = (k: number, z: number): V3[] => girdle.map((p) => [k * p.x, k * p.y, z]);
  return [[0, 0, 0], ...ring(1, h - crown), ...ring(table, h)];
}

/** A loft's corners (milestone 132): its base outline at the floor, its top outline at its height (z up), each fitted to the width and depth. */
export function loftCorners(s: Shape3): V3[] {
  const [w, h, d] = s.size ?? [40, 40, 40];
  const k = Math.max(0.05, Math.min(4, s.top ?? 1));
  return [...ngon(clampLoft(s.n ?? 4), w, d).map((p) => [p.x, p.y, 0] as V3), ...ngon(clampLoft(s.n2 ?? 8), w * k, d * k).map((p) => [p.x, p.y, h] as V3)];
}
const clampLoft = (n: number) => Math.max(3, Math.min(32, Math.round(n)));

/** The faces of a box or prism in its body's coordinates (z up): each role's outward normal and offset (dot(n, x) = h on the face). */
export function bodyFaces(s: Shape3): Record<string, { n: V3; h: number }> {
  const [, H] = s.size ?? [40, 40, 40];
  const foot = footprint({ ...s, corners: undefined }).map((p) => ({ x: p.x, y: p.y }));
  const out: Record<string, { n: V3; h: number }> = { top: { n: [0, 0, 1], h: H }, bottom: { n: [0, 0, -1], h: 0 } };
  const ccw = area2(foot) >= 0 ? 1 : -1;
  foot.forEach((p, i) => {
    const q = foot[(i + 1) % foot.length];
    const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1;
    const n: V3 = [(ccw * dy) / l, (-ccw * dx) / l, 0];
    const role = s.kind === 'box' ? (['+z', '+x', '-z', '-x'][i] ?? `side${i}`) : `side${i}`;
    out[role] = { n, h: n[0] * p.x + n[1] * p.y };
  });
  return out;
}

/** The planes a box's or prism's chamfers cut along (milestone 132): `trimByPlane(n, off)` keeps the body behind each. */
export function chamferPlanes(s: Shape3): { n: V3; off: number; m: V3 }[] {
  const F = bodyFaces(s);
  const out: { n: V3; off: number; m: V3 }[] = [];
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (const c of s.chamfers ?? []) {
    const A = F[c.a], B = F[c.b];
    if (!A || !B || !(c.d > 0)) continue;
    const e = cross(A.n, B.n);
    const le = Math.hypot(...e);
    if (le < 1e-6) continue;
    const eu: V3 = [e[0] / le, e[1] / le, e[2] / le];
    // a point on the edge: on both faces, with no component along it
    const M = [A.n, B.n, eu];
    const det = dot(M[0], cross(M[1], M[2]));
    const X0: V3 = [0, 1, 2].map((i) => (A.h * cross(M[1], M[2])[i] + B.h * cross(M[2], M[0])[i]) / det) as V3;
    // in each face, d away from the edge (away from the other face)
    const inA = cross(A.n, eu), inB = cross(B.n, eu);
    const sa = dot(inA, B.n) > 0 ? -1 : 1, sb = dot(inB, A.n) > 0 ? -1 : 1;
    const PA: V3 = [X0[0] + inA[0] * sa * c.d, X0[1] + inA[1] * sa * c.d, X0[2] + inA[2] * sa * c.d];
    const PB: V3 = [X0[0] + inB[0] * sb * c.d, X0[1] + inB[1] * sb * c.d, X0[2] + inB[2] * sb * c.d];
    let m = cross([PB[0] - PA[0], PB[1] - PA[1], PB[2] - PA[2]], eu);
    const lm = Math.hypot(...m) || 1;
    m = [m[0] / lm, m[1] / lm, m[2] / lm];
    if (dot(m, [A.n[0] + B.n[0], A.n[1] + B.n[1], A.n[2] + B.n[2]]) < 0) m = [-m[0], -m[1], -m[2]];
    // keep what lies behind the chamfer's plane (its outward normal m)
    out.push({ n: [-m[0], -m[1], -m[2]], off: -dot(m, PA), m });
  }
  return out;
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

const GEOM_FIELDS = ['kind', 'size', 'n', 'top', 'tube', 'corners', 'sketch', 'height', 'angle', 'axis', 'stretch', 'facets', 'taper', 'crown', 'table', 'hull', 'chamfers', 'n2'] as const;

/** The stable key of a shape's geometry in its parent's frame (its subtree for a group). */
export function shapeKey(sc: Sculpt, id: string, seen = new Set<string>()): string {
  const s = sc.shapes[id];
  if (!s || seen.has(id)) return '∅';
  seen.add(id);
  const g: Record<string, unknown> = {};
  for (const f of GEOM_FIELDS) if (s[f] !== undefined) g[f] = s[f];
  const kids = s.kind === 'group' ? (s.children ?? []).map((c) => `${sc.shapes[c]?.hole ? 'H' : 'S'}${shapeKey(sc, c, seen)}`) : [];
  // the id too (milestone 122): a body remembers which shape it came from, so two shapes alike never share one
  return JSON.stringify([id, g, s.at, s.q, kids]);
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
      // a hull (milestone 121): the hull of its solids, a new body of its own (its faces are the hull's)
      if (s.hull && solids.length) {
        const body = k.Manifold.hull(solids).asOriginal();
        originals.set(body.originalID(), s.id);
        return body.transform(poseMatrix(s) as never);
      }
      // a group of holes only is one complex hole: its holes joined
      let m = solids.length ? k.Manifold.union(solids) : holes.length ? k.Manifold.union(holes) : k.Manifold.ofMesh(emptyMesh(k));
      if (solids.length && holes.length) m = m.subtract(k.Manifold.union(holes));
      return m.transform(poseMatrix(s) as never);
    }
    // marked as an original, so the solid's faces can say which shape they came from (milestone 60)
    const body = leafBody(k, s).asOriginal();
    originals.set(body.originalID(), s.id);
    return body.transform(shapeMatrix(s) as never);
  });
}

/** Which shape each leaf body's original id belongs to (ids are per kernel session; set whenever a body is built). */
const originals = new Map<number, string>();
export const shapeOfOriginal = (originalID: number): string | undefined => originals.get(originalID);

/** The key of the whole solid. */
export function solidKey(sc: Sculpt): string {
  return JSON.stringify(sc.order.filter((id) => sc.shapes[id] && !sc.shapes[id].hole).map((id) => shapeKey(sc, id)));
}

/** The solid: every top-level Solid joined (Holes outside a group cut nothing). Owned by the cache. */
export function buildSolid(k: Kernel, sc: Sculpt | undefined): Manifold {
  if (!sc) return cached('[]', () => k.Manifold.ofMesh(emptyMesh(k)));
  const ids = sc.order.filter((id) => sc.shapes[id] && !sc.shapes[id].hole);
  const keys = ids.map((id) => shapeKey(sc, id));
  const solid = cached(`solid:${JSON.stringify(keys)}`, () => {
    if (!ids.length) return k.Manifold.ofMesh(emptyMesh(k));
    // an edit usually changes one shape: join it to the cached union of all the others (WAFFLE_MODE.md §10.2)
    const prev = lastSolid.keys;
    const changed = prev && prev.length === keys.length ? keys.map((x, i) => (x === prev[i] ? -1 : i)).filter((i) => i >= 0) : null;
    if (changed && changed.length === 1 && keys.length > 2) {
      const j = changed[0];
      const restKey = `rest:${JSON.stringify(keys.filter((_, i) => i !== j))}`;
      const rest = cached(restKey, () => k.Manifold.union(ids.filter((_, i) => i !== j).map((id) => buildShape(k, sc, id))));
      return rest.add(buildShape(k, sc, ids[j]));
    }
    return k.Manifold.union(ids.map((id) => buildShape(k, sc, id)));
  });
  lastSolid.keys = keys;
  return solid;
}
const lastSolid: { keys: string[] | null } = { keys: null };

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
