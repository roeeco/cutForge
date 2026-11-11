// Build three.js geometry from the design model (derived, never authoritative).
import * as THREE from 'three';
import type { Design, Frame, Panel } from '../model/types';
import type { Contour, Vec2 } from '../geom/types';
import { flattenContour, pointInPolygon } from '../geom/vec';
import { holeCuts, ownOutline } from '../model/outline';
import polygonClipping from 'polygon-clipping';
import { throughRegions } from '../model/through';
import { panelExtras, panelNotches, panelOutlines } from '../model/geometry';
import type { P2 } from '../model/types';
import { frameNormal } from '../model/frame';
import { panelToWorld } from '../model/bent';
import { profileOf, tOf } from '../model/materials';

/**
 * Matrix taking panel-local (x, y, z) to world, with z measured along the
 * plane normal (u × v). Geometry for a panel whose material lies on the
 * negative-normal side is shifted to z ∈ [-t, 0] so the basis stays right-handed.
 */
export function frameMatrix(f: Frame): THREE.Matrix4 {
  const n = frameNormal(f);
  const m = new THREE.Matrix4();
  m.makeBasis(new THREE.Vector3(...f.u), new THREE.Vector3(...f.v), new THREE.Vector3(...n));
  m.setPosition(...f.o);
  return m;
}

/** Joint additions lying in a panel's own plane (not folded like a glue flap). */
function jointFlatAdds(d: Design, p: Panel): Vec2[][] {
  const out: Vec2[][] = [];
  for (const c of Object.values(d.connections)) for (const a of c.geom?.adds ?? []) if (a.flat && a.panelId === p.id) out.push(a.poly);
  return out;
}

const toShapePts = (pts: Vec2[]) => pts.map((p) => new THREE.Vector2(p.x, p.y));

export function panelGeometry(d: Design, p: Panel, opts: { joints?: boolean } = {}): THREE.BufferGeometry {
  // its own material's thickness (a ghost: the material it would be made in)
  const t = d.panels[p.id] ? tOf(d, p.id) : profileOf(d, p.material).thickness;
  const own = ownOutline(p);
  const notches = opts.joints === false ? {} : panelNotches(d, p);
  let rings = own.rings.flatMap((r) => panelOutlines(p, notches, r));
  // material a joint adds in the panel's own plane (a locking tab's barbs)
  const flatAdds = opts.joints === false ? [] : jointFlatAdds(d, p);
  if (flatAdds.length) {
    const ring = (pts: Vec2[]) => pts.map((q) => [q.x, q.y] as [number, number]);
    const res = polygonClipping.union(rings.map((r) => [ring(r)]), ...flatAdds.map((k) => [ring(k)]));
    rings = res.map((poly) => poly[0].slice(0, -1).map(([x, y]) => ({ x, y })));
  }
  const extraHoles: Vec2[][] = [];
  const cuts = opts.joints === false ? [] : [...panelExtras(d, p).cuts, ...throughRegions(d, p.id)];
  if (cuts.length) {
    // material a joint removes past a corner
    const ring = (pts: Vec2[]) => pts.map((q) => [q.x, q.y] as [number, number]);
    const res = polygonClipping.difference(rings.map((r) => [ring(r)]), ...cuts.map((k) => [ring(k)]));
    rings = res.map((poly) => poly[0].slice(0, -1).map(([x, y]) => ({ x, y })));
    // holes the subtraction made (a through-cut inside the panel)
    for (const poly of res) for (const h of poly.slice(1)) extraHoles.push(h.slice(0, -1).map(([x, y]) => ({ x, y })));
  }
  const shapes = rings.map((r) => new THREE.Shape(toShapePts(r)));
  const holeRings: Vec2[][][] = rings.map(() => []);
  // each hole goes into the ring that contains it
  const addHole = (pts: Vec2[]) => {
    if (pts.length < 3) return;
    const k = shapes.length > 1 ? Math.max(0, rings.findIndex((r) => pointInPolygon(pts[0], r))) : 0;
    shapes[k].holes.push(new THREE.Path(toShapePts(pts)));
    holeRings[k].push(pts);
  };
  for (const h of holeCuts(p)) for (const dc of h.contours) addHole(flattenContour(dc, 0.05).slice().reverse());
  for (const h of own.holes) addHole(h.slice().reverse());
  for (const h of extraHoles) addHole(h);
  if (opts.joints !== false) for (const h of panelExtras(d, p).holes) addHole(h);
  // a bent wall (milestone 46): sliced at its facets and laid along them
  if (p.bent?.facets.length) return bentSlab(p, rings.map((r, i) => ({ outer: r, holes: holeRings[i] })), 0, t);
  const g = new THREE.ExtrudeGeometry(shapes, { depth: t, bevelEnabled: false, curveSegments: 24 });
  if (p.frame.side === -1) g.translate(0, 0, -t);
  g.computeVertexNormals();
  return g;
}

export function contourLinePoints(c: Contour, z: number): THREE.Vector3[] {
  const pts = flattenContour(c, 0.05);
  const out = pts.map((q) => new THREE.Vector3(q.x, q.y, z));
  if (c.closed && out.length) out.push(out[0].clone());
  return out;
}

export function contourShapeGeometry(c: Contour): THREE.ShapeGeometry {
  return new THREE.ShapeGeometry(new THREE.Shape(toShapePts(flattenContour(c, 0.05))));
}

/** z of the two faces of a panel slab in frame-matrix coordinates. */
export function faceZ(p: Panel, t: number): [number, number] {
  return p.frame.side === 1 ? [0, t] : [-t, 0];
}

/** A glue flap lying on a panel face: slab between z0 and z1 measured into the material. */
export function flapGeometry(p: Panel, poly: P2[], z0: number, z1: number): THREE.BufferGeometry {
  if (p.bent?.facets.length) return bentSlab(p, [{ outer: poly, holes: [] }], z0, z1);
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(toShapePts(poly)), { depth: z1 - z0, bevelEnabled: false });
  // material z → frame-matrix z (along u × v)
  if (p.frame.side === 1) g.translate(0, 0, z0);
  else g.translate(0, 0, -z1);
  return g;
}

type FlatPoly = { outer: Vec2[]; holes: Vec2[][] };
const ringArea = (r: Vec2[]) => r.reduce((a, q, i) => a + q.x * r[(i + 1) % r.length].y - r[(i + 1) % r.length].x * q.y, 0) / 2;

/**
 * A bent panel's slab (milestone 46): each polygon cut into its facets' x
 * ranges, both faces laid along the facets (`panelToWorld`, so neighbouring
 * facets share their edges) and the sides along the outline, split where it
 * crosses from one facet to the next. The result is in the panel frame's
 * matrix coordinates, so it is drawn like any panel's geometry. Faces are
 * material 0, sides material 1 (as an extrusion's groups).
 */
export function bentSlab(p: Panel, polys: FlatPoly[], z0: number, z1: number): THREE.BufferGeometry {
  const fs = p.bent!.facets;
  const inv = frameMatrix(p.frame).invert();
  const v = new THREE.Vector3();
  const at = (x: number, y: number, z: number): [number, number, number] => {
    v.set(...panelToWorld(p, x, y, z)).applyMatrix4(inv);
    return [v.x, v.y, v.z];
  };
  const caps: number[] = [], sides: number[] = [];
  // a triangle facing `want` (a local direction), flipped if needed
  const tri = (out: number[], a: number[], b: number[], c: number[], want: THREE.Vector3) => {
    const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const n = ab.cross(ac);
    if (n.dot(want) >= 0) out.push(...a, ...b, ...c);
    else out.push(...a, ...c, ...b);
  };
  const into = (x: number, y: number) => {
    const a = at(x, y, z0), b = at(x, y, z1);
    return new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  };
  const ring = (r: Vec2[]) => r.map((q) => [q.x, q.y] as [number, number]);
  for (let k = 0; k < fs.length; k++) {
    const x0 = k === 0 ? -1e5 : fs[k].s0, x1 = k === fs.length - 1 ? 1e5 : fs[k].s1;
    const strip: [number, number][][] = [[[x0, -1e5], [x1, -1e5], [x1, 1e5], [x0, 1e5]]];
    for (const P of polys) {
      let res: ReturnType<typeof polygonClipping.intersection>;
      try {
        res = polygonClipping.intersection([ring(P.outer), ...P.holes.map(ring)], strip);
      } catch {
        continue;
      }
      for (const poly of res) {
        // points on a facet boundary land exactly on it, so neighbouring facets share them
        const snap = (x: number) => (Math.abs(x - fs[k].s0) < 1e-6 ? fs[k].s0 : Math.abs(x - fs[k].s1) < 1e-6 ? fs[k].s1 : x);
        const rs = poly.map((r) => r.slice(0, -1).map(([x, y]) => new THREE.Vector2(snap(x), y)));
        if (rs[0].length < 3) continue;
        const faces = THREE.ShapeUtils.triangulateShape(rs[0], rs.slice(1));
        const all = rs.flat();
        const mid = all.reduce((m, q) => m.add(q), new THREE.Vector2()).divideScalar(all.length);
        const inw = into(mid.x, mid.y);
        for (const [i, j, l] of faces) {
          const A = all[i], B = all[j], C = all[l];
          tri(caps, at(A.x, A.y, z0), at(B.x, B.y, z0), at(C.x, C.y, z0), inw.clone().negate());
          tri(caps, at(A.x, A.y, z1), at(B.x, B.y, z1), at(C.x, C.y, z1), inw);
        }
      }
    }
  }
  // sides: every outline edge, split at the facet boundaries it crosses
  const cuts = fs.slice(0, -1).map((f) => f.s1);
  for (const P of polys)
    for (const r of [P.outer, ...P.holes]) {
      // outward is to the right of a CCW outer ring and of a CW hole (and left otherwise)
      const ccw = ringArea(r) > 0, hole = r !== P.outer;
      const sgn = ccw !== hole ? 1 : -1;
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        const xs = [0, ...cuts.filter((c) => (c - a.x) * (c - b.x) < 0).map((c) => (c - a.x) / (b.x - a.x)).sort((m, n) => m - n), 1];
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        if (L < 1e-9) continue;
        const ox = (sgn * (b.y - a.y)) / L, oy = (-sgn * (b.x - a.x)) / L;
        for (let j = 0; j + 1 < xs.length; j++) {
          const p0 = { x: a.x + (b.x - a.x) * xs[j], y: a.y + (b.y - a.y) * xs[j] }, p1 = { x: a.x + (b.x - a.x) * xs[j + 1], y: a.y + (b.y - a.y) * xs[j + 1] };
          const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2, zm = (z0 + z1) / 2;
          const c0 = at(mx, my, zm), c1 = at(mx + ox * 0.01, my + oy * 0.01, zm);
          const want = new THREE.Vector3(c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]);
          const q00 = at(p0.x, p0.y, z0), q10 = at(p1.x, p1.y, z0), q11 = at(p1.x, p1.y, z1), q01 = at(p0.x, p0.y, z1);
          tri(sides, q00, q10, q11, want);
          tri(sides, q00, q11, q01, want);
        }
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(caps.concat(sides), 3));
  g.addGroup(0, caps.length / 3, 0);
  g.addGroup(caps.length / 3, sides.length / 3, 1);
  g.computeVertexNormals();
  return g;
}

/**
 * A bent panel's map from its flat coordinates to its frame's matrix
 * coordinates (milestone 46): `z` along u × v as for a planar panel's lines
 * (so its sign follows `frame.side`). Null for a planar panel.
 */
export function bentWarp(p: Panel): ((x: number, y: number, z: number) => THREE.Vector3) | null {
  if (!p.bent?.facets.length) return null;
  const inv = frameMatrix(p.frame).invert();
  const side = p.frame.side;
  return (x, y, z) => new THREE.Vector3(...panelToWorld(p, x, y, z * side)).applyMatrix4(inv);
}

/** Points of a polyline with no step longer than `step` (so it follows a bent panel). */
export function densify(pts: THREE.Vector3[], step = 2): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    out.push(a);
    const b = pts[i + 1];
    if (!b) break;
    const n = Math.floor(a.distanceTo(b) / step);
    for (let k = 1; k <= n; k++) out.push(a.clone().lerp(b, k / (n + 1)));
  }
  return out;
}
