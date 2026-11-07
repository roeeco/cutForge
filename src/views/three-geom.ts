// Build three.js geometry from the design model (derived, never authoritative).
import * as THREE from 'three';
import type { Design, Frame, Panel } from '../model/types';
import type { Contour, Vec2 } from '../geom/types';
import { flattenContour } from '../geom/vec';
import { detailContour, panelNotches, panelOutline } from '../model/geometry';
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
  const outline = opts.joints === false ? [{ x: 0, y: 0 }, { x: p.w, y: 0 }, { x: p.w, y: p.h }, { x: 0, y: p.h }] : panelOutline(p, panelNotches(d, p));
  const shape = new THREE.Shape(toShapePts(outline));
  for (const dt of p.details) {
    if (dt.op !== 'cut') continue;
    const pts = flattenContour(detailContour(dt), 0.05);
    if (pts.length < 3) continue;
    const ccw = pts.slice().reverse();
    shape.holes.push(new THREE.Path(toShapePts(ccw)));
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 24 });
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
