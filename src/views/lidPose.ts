// How lids are shown on the stage (milestone 76, UI_CLEANUP_PLAN.md Part 3,
// LIDS_LINES_PROJECTS_PLAN.md §3.5). View only: the design is not changed.
// A lid of its own lies beside its box in the design; *Put on* shows it on the
// box. A folded lid (a tuck top, a living hinge, an arched lid) is shown
// opened back so the inside stays clear; *Close* shows it shut. Either way the
// lid is shut while one of its boards is selected (so its face can be drawn
// on where it really is), in the fold view and in *Show how it goes together*.
import * as THREE from 'three';
import type { Design } from '../model/types';
import { boxLid, lidParts } from '../easy/lid';
import { lidPutOn } from '../model/lid';
import { parentConnection } from '../model/ops';
import { bandChildMove, bandOf } from '../model/bands';
import { matDir, toWorld } from '../model/frame';
import { tOf } from '../model/materials';
import type { Bend, BandShown } from './foldView';

/** How far past its hinge's straight a plain folded lid opens (degrees): about 110° for a lid square to its wall. */
export const LID_OPEN_PAST = 20;

export type LidView = { shut: Record<string, boolean>; selected: string[]; foldT: number; assembling: boolean };

/** The boards that move with a lid: its parts and anything placed on them. */
function riders(d: Design, parts: string[]): Set<string> {
  const set = new Set(parts);
  for (let grew = true; grew; ) {
    grew = false;
    for (const id of d.order) {
      const h = d.panels[id]?.place?.host;
      if (h && set.has(h) && !set.has(id)) {
        set.add(id);
        grew = true;
      }
    }
  }
  return set;
}

/**
 * Move each lid to how it is shown (in place, on the display's matrices,
 * bends and bands). Returns the boards shown away from their place in the
 * design: they cannot be drawn on until the lid is shut.
 */
export function applyLidPoses(d: Design, r: { xf: Map<string, THREE.Matrix4>; bends: Bend[]; bands: BandShown[] }, v: LidView): Set<string> {
  const away = new Set<string>();
  const move = (ids: Set<string>, X: THREE.Matrix4, keepBend?: string) => {
    for (const id of ids) r.xf.set(id, X.clone().multiply(r.xf.get(id) ?? new THREE.Matrix4()));
    for (const b of r.bends)
      if (ids.has(b.panelId) && b.id !== keepBend) {
        b.pivot.applyMatrix4(X);
        b.axis.transformDirection(X);
        b.crease.transformDirection(X);
      }
    for (const id of ids) away.add(id);
  };
  for (const t of Object.values(d.trays ?? {})) {
    if (t.lidOf) continue;
    const lid = boxLid(d, t.id);
    if (lid.kind !== 'liftoff' && lid.kind !== 'hinged' && lid.kind !== 'arched') continue;
    const parts = lidParts(d, lid);
    const ids = riders(d, parts);
    const picked = v.selected.some((id) => ids.has(id));
    if (lid.kind === 'liftoff') {
      // beside the box in the design: on it when put on, and while it goes together
      // (a picked lid stays beside the box, where it can be drawn on)
      if (!(v.shut[t.id] || v.assembling) || (picked && !v.assembling)) continue;
      const T = lidPutOn(d, d.trays[lid.tray]);
      if (T) move(ids, new THREE.Matrix4().fromArray(T));
      continue;
    }
    // a folded lid: open unless closed, picked, folding or going together
    if (v.shut[t.id] || picked || v.foldT < 0.999 || v.assembling) continue;
    const c = parentConnection(d, lid.lid);
    if (!c || c.kind !== 'fold') continue;
    const P = r.xf.get(c.a.panelId) ?? new THREE.Matrix4();
    let R: THREE.Matrix4;
    const band = bandOf(d, c);
    if (band) {
      // a band unrolls: the lid stands in line with its wall
      R = new THREE.Matrix4().fromArray(bandChildMove(band, 0)).multiply(new THREE.Matrix4().fromArray(bandChildMove(band, 1)).invert());
      const i = r.bands.findIndex((s) => s.band.id === c.id);
      if (i >= 0) r.bands[i] = { ...r.bands[i], k: 0 };
    } else {
      // a crease: turned back about it, as the fold view unfolds it, and a little past
      const L = d.panels[lid.lid];
      const th = tOf(d, L.id);
      const pivot = new THREE.Vector3(...toWorld(L.frame, 0, -th / 2, th / 2));
      const axis = new THREE.Vector3(...L.frame.v).cross(new THREE.Vector3(...matDir(L.frame)).negate()).normalize();
      const phi = ((180 - c.angle + LID_OPEN_PAST) * Math.PI) / 180;
      R = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z).multiply(new THREE.Matrix4().makeRotationAxis(axis, phi)).multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    }
    move(ids, P.clone().multiply(R).multiply(P.clone().invert()), c.id);
  }
  return away;
}
