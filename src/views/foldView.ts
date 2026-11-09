// View-only fold display: rigid transforms that unfold folded nets towards
// flat (foldT = 0) and the bend beads drawn along each fold. The model is
// never changed; every panel gets a transform from its design pose.
import * as THREE from 'three';
import type { Connection, Design, Flap3d } from '../model/types';
import { edgeWorld, frameNormal, matDir, toWorld } from '../model/frame';
import { cornerFit, inwardWorld } from '../model/seams';
import { findEdge } from '../model/edges';
import { tOf } from '../model/materials';

export type Bend = { id: string; panelId: string; pivot: THREE.Vector3; axis: THREE.Vector3; length: number; radius: number; crease: THREE.Vector3; mountain: boolean };

export function foldDisplay(d: Design, foldT: number): { xf: Map<string, THREE.Matrix4>; bends: Bend[] } {
  // the 3D pose has no allowance gap (that is only in the flat net), so the hinge sits at the corner
  const g = 0;
  const xf = new Map<string, THREE.Matrix4>();
  const bends: Bend[] = [];
  const grown = Object.values(d.connections).filter((c) => c.grown);
  const parentOf = new Map(grown.map((c) => [c.b.panelId, c]));
  // tray corners made folds (milestone 35): the wall folds off its neighbour's side edge
  const hinged = new Map(Object.values(d.connections).filter((c) => !c.grown && c.kind === 'fold' && c.hingeOf).map((c) => [c.hingeOf!, c]));
  const visit = (id: string): THREE.Matrix4 => {
    const have = xf.get(id);
    if (have) return have;
    const h = hinged.get(id);
    const hm = h && hingeMatrix(d, h, id, foldT, visit);
    if (hm) {
      xf.set(id, hm);
      return hm;
    }
    const c = parentOf.get(id);
    const p = d.panels[id];
    let m = new THREE.Matrix4();
    // a placed panel rides on its host (milestone 28)
    const host = !c && p?.place?.host;
    if (host && d.panels[host]) m = visit(host).clone();
    if (c && p && d.panels[c.a.panelId]) {
      const parentM = visit(c.a.panelId);
      m = parentM.clone();
      if (c.kind === 'fold') {
        const t = tOf(d, id);
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
 * A wall folded off its neighbour (a tray corner made a fold): the neighbour's
 * display matrix, then a turn about their shared corner line by
 * (180° − corner angle) × (1 − foldT), so at 0 it lies flat in line with the
 * neighbour (as in the cut net) and at 1 where it stands.
 */
function hingeMatrix(d: Design, c: Connection, id: string, foldT: number, visit: (id: string) => THREE.Matrix4): THREE.Matrix4 | null {
  const childA = c.a.panelId === id;
  const stay = childA ? c.b : c.a, me = childA ? c.a : c.b;
  const S = d.panels[stay.panelId], C = d.panels[id];
  if (!S || !C || !findEdge(S, stay.edge) || !findEdge(C, me.edge)) return null;
  const fit = cornerFit(S, stay.edge, C, me.edge, 1e-6);
  if (!fit) return null;
  const m = visit(stay.panelId).clone();
  const alpha = Math.atan2(fit.sin, fit.cos);
  const psi = (Math.PI - alpha) * (1 - foldT);
  if (psi < 1e-6) return m;
  const [a, b] = edgeWorld(S, stay.edge);
  const pivot = new THREE.Vector3(...a);
  const axis = new THREE.Vector3(...b).sub(pivot).normalize();
  // the turn that brings the wall in line with its neighbour (its inward side to the neighbour's outward side)
  const iC = new THREE.Vector3(...inwardWorld(C, me.edge)), target = new THREE.Vector3(...inwardWorld(S, stay.edge)).negate();
  const full = Math.PI - alpha;
  const sign = iC.clone().applyAxisAngle(axis, full).distanceTo(target) <= iC.clone().applyAxisAngle(axis, -full).distanceTo(target) ? 1 : -1;
  const r = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z).multiply(new THREE.Matrix4().makeRotationAxis(axis, sign * psi)).multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
  return m.multiply(r);
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
