// View-only fold display: rigid transforms that unfold folded nets towards
// flat (foldT = 0) and the bend beads drawn along each fold. The model is
// never changed; every panel gets a transform from its design pose.
import * as THREE from 'three';
import type { Design, Flap3d } from '../model/types';
import { frameNormal, matDir, toWorld } from '../model/frame';

export type Bend = { id: string; panelId: string; pivot: THREE.Vector3; axis: THREE.Vector3; length: number; radius: number; crease: THREE.Vector3; mountain: boolean };

export function foldDisplay(d: Design, foldT: number): { xf: Map<string, THREE.Matrix4>; bends: Bend[] } {
  const t = d.material.thickness;
  // the 3D pose has no allowance gap (that is only in the flat net), so the hinge sits at the corner
  const g = 0;
  const xf = new Map<string, THREE.Matrix4>();
  const bends: Bend[] = [];
  const grown = Object.values(d.connections).filter((c) => c.grown);
  const parentOf = new Map(grown.map((c) => [c.b.panelId, c]));
  const visit = (id: string): THREE.Matrix4 => {
    const have = xf.get(id);
    if (have) return have;
    const c = parentOf.get(id);
    const p = d.panels[id];
    let m = new THREE.Matrix4();
    if (c && p && d.panels[c.a.panelId]) {
      const parentM = visit(c.a.panelId);
      m = parentM.clone();
      if (c.kind === 'fold') {
        // hinge: a line along the child's bottom edge, half a (thickness +
        // allowance) below it and half a (thickness − allowance) into the
        // material: unfolding about it lays the child flat beside its parent.
        const f = p.frame;
        const md = new THREE.Vector3(...matDir(f));
        const v = new THREE.Vector3(...f.v);
        const u = new THREE.Vector3(...f.u);
        const pivot = new THREE.Vector3(...toWorld(f, 0, -(t + g) / 2, (t - g) / 2));
        const axis = new THREE.Vector3().crossVectors(v, md.clone().negate()).normalize();
        const phi = ((180 - c.angle) * (1 - foldT) * Math.PI) / 180;
        if (phi > 1e-6) {
          const r = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z).multiply(new THREE.Matrix4().makeRotationAxis(axis, phi)).multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
          m.multiply(r);
        }
        const radius = (t / Math.SQRT2) * 0.97;
        // crease on the outside of the bend, bisecting the two outer faces
        const out = md.clone().negate().add(v.clone().negate().applyAxisAngle(axis, -phi / 2)).normalize();
        const mid = pivot.clone().addScaledVector(u, p.w / 2);
        bends.push({
          id: c.id,
          panelId: id,
          pivot: mid.applyMatrix4(parentM),
          axis: u.clone().transformDirection(parentM),
          length: p.w,
          radius,
          crease: out.transformDirection(parentM),
          mountain: c.foldDir === 'mountain',
        });
      }
    }
    xf.set(id, m);
    return m;
  };
  for (const id of d.order) visit(id);
  return { xf, bends };
}

/**
 * Display matrix for a glue flap's geometry (built in its receiver's local
 * coords): it moves with the panel it is cut from and turns about its hinge by
 * angle × foldT from lying flat beside that panel, so at foldT = 1 it is where
 * it is glued and at 0 where the cut net has it. A flap without an owner
 * (older stored geometry) rides on its receiver.
 */
export function flapMatrix(d: Design, f: Flap3d, xf: Map<string, THREE.Matrix4>, foldT: number): THREE.Matrix4 {
  const R = d.panels[f.panelId];
  const base = R ? frameBasis(R.frame) : new THREE.Matrix4();
  const O = f.owner ? d.panels[f.owner] : undefined;
  if (!O || !f.hinge || !f.angle) return (xf.get(f.panelId) ?? new THREE.Matrix4()).clone().multiply(base);
  const h0 = new THREE.Vector3(...toWorld(O.frame, ...f.hinge[0]));
  const h1 = new THREE.Vector3(...toWorld(O.frame, ...f.hinge[1]));
  const axis = h1.clone().sub(h0).normalize();
  const phi = (-(f.angle * (1 - foldT)) * Math.PI) / 180;
  const m = (xf.get(O.id) ?? new THREE.Matrix4()).clone();
  if (Math.abs(phi) > 1e-9) m.multiply(new THREE.Matrix4().makeTranslation(h0.x, h0.y, h0.z).multiply(new THREE.Matrix4().makeRotationAxis(axis, phi)).multiply(new THREE.Matrix4().makeTranslation(-h0.x, -h0.y, -h0.z)));
  return m.multiply(base);
}

/** A panel frame as a matrix: local x, y along u, v and z along u × v (as `frameMatrix`). */
function frameBasis(f: Design['panels'][string]['frame']): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...f.u), new THREE.Vector3(...f.v), new THREE.Vector3(...frameNormal(f)));
  return m.setPosition(...f.o);
}
