// Build three.js geometry from the design model (derived, never authoritative).
import * as THREE from 'three';
import type { Design, Frame, Panel } from '../model/types';
import type { Contour, Vec2 } from '../geom/types';
import { flattenContour, pointInPolygon } from '../geom/vec';
import { holeCuts, ownOutline } from '../model/outline';
import polygonClipping from 'polygon-clipping';
import { throughRegions } from '../model/through';
import { edgeFlapGeom, panelExtras, panelNotches, panelOutlines } from '../model/geometry';
import type { P2 } from '../model/types';
import { frameNormal } from '../model/frame';
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

/**
 * What a panel's 3D slab is made from: its outline rings, the holes in them,
 * its thickness and side. Plain data, so the stage can tell whether a panel's
 * slab really changed (its joints, a neighbour's slots, a fold-over's lock
 * slots) without tracking every part of the design that feeds it.
 */
export type PanelShape = { t: number; side: 1 | -1; rings: Vec2[][]; holes: Vec2[][] };

export function panelShape(d: Design, p: Panel, opts: { joints?: boolean } = {}): PanelShape {
  // its own material's thickness (a ghost: the material it would be made in)
  const t = d.panels[p.id] ? tOf(d, p.id) : profileOf(d, p.material).thickness;
  const own = ownOutline(p);
  const notches = opts.joints === false ? {} : panelNotches(d, p);
  let rings = own.rings.flatMap((r) => panelOutlines(p, notches, r));
  // material a joint adds in the panel's own plane (a locking tab's barbs), and plain flaps on free
  // edges (milestone 67): they hold nothing and fold whichever way the student likes, so they show
  // flat in the board's plane, as the cut plan has them (they were missing from the stage)
  const flatAdds = opts.joints === false ? [] : [...jointFlatAdds(d, p), ...(p.edgeFlaps ?? []).map((f) => edgeFlapGeom(d, p, f)?.poly).filter((x): x is Vec2[] => !!x)];
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
  const holes: Vec2[][] = [];
  for (const h of holeCuts(p)) for (const dc of h.contours) holes.push(flattenContour(dc, 0.05).slice().reverse());
  for (const h of own.holes) holes.push(h.slice().reverse());
  holes.push(...extraHoles);
  if (opts.joints !== false) holes.push(...panelExtras(d, p).holes);
  return { t, side: p.frame.side === -1 ? -1 : 1, rings, holes: holes.filter((h) => h.length >= 3) };
}

/** A short fingerprint of a panel shape: equal fingerprints build the same slab. */
export function shapeKey(s: PanelShape): string {
  const r = (v: number) => Math.round(v * 1000);
  const ring = (pts: Vec2[]) => pts.map((q) => `${r(q.x)},${r(q.y)}`).join(' ');
  return `${s.t}|${s.side}|${s.rings.map(ring).join('/')}|${s.holes.map(ring).join('/')}`;
}

/** The slab (an extrusion of the outline, holes cut) for a panel shape. */
export function shapeGeometry(s: PanelShape): THREE.BufferGeometry {
  const shapes = s.rings.map((r) => new THREE.Shape(toShapePts(r)));
  // each hole goes into the ring that contains it
  for (const pts of s.holes) {
    if (!shapes.length) break;
    const k = shapes.length > 1 ? Math.max(0, s.rings.findIndex((r) => pointInPolygon(pts[0], r))) : 0;
    shapes[k].holes.push(new THREE.Path(toShapePts(pts)));
  }
  const g = new THREE.ExtrudeGeometry(shapes, { depth: s.t, bevelEnabled: false, curveSegments: 24 });
  if (s.side === -1) g.translate(0, 0, -s.t);
  g.computeVertexNormals();
  return g;
}

export function panelGeometry(d: Design, p: Panel, opts: { joints?: boolean } = {}): THREE.BufferGeometry {
  return shapeGeometry(panelShape(d, p, opts));
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
