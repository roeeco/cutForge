// Build three.js geometry from the design model (derived, never authoritative).
import * as THREE from 'three';
import type { Design, Frame, Panel } from '../model/types';
import type { Contour, Vec2 } from '../geom/types';
import { flattenContour, pointInPolygon } from '../geom/vec';
import { holeCuts, ownOutline } from '../model/outline';
import { panelExtras, panelNotches, panelOutline } from '../model/geometry';
import type { P2 } from '../model/types';
import { frameNormal } from '../model/frame';

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

const toShapePts = (pts: Vec2[]) => pts.map((p) => new THREE.Vector2(p.x, p.y));

export function panelGeometry(d: Design, p: Panel, opts: { joints?: boolean } = {}): THREE.BufferGeometry {
  const t = d.material.thickness;
  const own = ownOutline(p);
  const notches = opts.joints === false ? {} : panelNotches(d, p);
  const rings = own.rings.map((r) => panelOutline(p, notches, r));
  const shapes = rings.map((r) => new THREE.Shape(toShapePts(r)));
  // each hole goes into the ring that contains it
  const addHole = (pts: Vec2[]) => {
    if (pts.length < 3) return;
    const k = shapes.length > 1 ? Math.max(0, rings.findIndex((r) => pointInPolygon(pts[0], r))) : 0;
    shapes[k].holes.push(new THREE.Path(toShapePts(pts)));
  };
  for (const h of holeCuts(p)) for (const dc of h.contours) addHole(flattenContour(dc, 0.05).slice().reverse());
  for (const h of own.holes) addHole(h.slice().reverse());
  if (opts.joints !== false) for (const h of panelExtras(d, p).holes) addHole(h);
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
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(toShapePts(poly)), { depth: z1 - z0, bevelEnabled: false });
  // material z → frame-matrix z (along u × v)
  if (p.frame.side === 1) g.translate(0, 0, z0);
  else g.translate(0, 0, -z1);
  return g;
}
