// A design posed for its picture (milestone 148, PRESETS_OVERHAUL.md §4.1): view only, the design is never changed.
// It starts from the stage's fold display and lid poses (lidPose.ts: folded lids opened about halfway, a lid of its
// own lifted over its box) and adds what tells a preset apart:
//   - a carton's top flaps opened a little past upright (`ends`), so its closure shows;
//   - a flat piece's back flap opened (`edgeFlaps`), so an envelope's outline shows;
//   - a drawer box's sleeve stood round its tray, the tray pulled half out (`drawer`);
//   - what goes inside, when the design says (`prop`): a bar of soap through a sleeve, a letter in an envelope.
// `autoPose` works the pose out from the design itself, so every picture of such a design is posed, the
// student's own included; a preset's card may ask for more (milestone 151).
import * as THREE from 'three';
import type { Design, Flap3d, Panel } from '../model/types';
import { foldDisplay } from './foldView';
import { applyLidPoses } from './lidPose';
import { boxLid, lidParts } from '../easy/lid';
import { trayRing } from '../model/cartons';
import { edgeFeatures } from '../model/edgeFeatures';
import { matDir, toWorld } from '../model/frame';
import { frameMatrix } from './three-geom';

export type PoseProp = 'pencils' | 'dice' | 'sweets' | 'soap' | 'letter';

export type Pose = {
  /** A carton's top flaps: 0 shut, 1 upright (in line with its walls), more: past upright. */
  ends?: number;
  /** Its bottom's flaps likewise (milestone 151: the view from below). */
  bottomEnds?: number;
  /** How far the flap on a flat piece's back edge opens, in degrees from shut. */
  backFlap?: number;
  /** A drawer box: how far the tray is in its sleeve (0 out beside it as cut, 1 all the way in); absent: as cut. */
  drawer?: number;
  /** What goes inside. */
  prop?: PoseProp;
  /** Boards drawn as a ghost (milestone 157's dice tower). */
  ghost?: string[];
  /** Laid on its side: an open tube's axis turned level, its open end towards the viewer (a sleeve). */
  lay?: boolean;
};

/** The trays that are boxes (not a lid of their own). */
const trays = (d: Design) => Object.values(d.trays ?? {}).filter((t) => !t.lidOf);

/** A sleeve: one open tube, no end closed, no base cut. */
export function isSleeve(d: Design): boolean {
  const ts = trays(d);
  return ts.length === 1 && ts[0].base === 'open' && !ts[0].top && !ts[0].bottom;
}

/** A drawer box: a tray and a second tray, the open tube it slides into (the drawer structure, milestone C2). */
export function drawerParts(d: Design): { tray: string; shell: string } | null {
  const ts = trays(d);
  if (ts.length !== 2) return null;
  const shell = ts.find((t) => t.base === 'open' && !t.top && !t.bottom);
  const tray = ts.find((t) => t !== shell && t.base !== 'open');
  return shell && tray ? { tray: tray.id, shell: shell.id } : null;
}

/** A flat piece: no box, every board card, at least one flap folded over a board (an envelope, a folder). */
function isFlatPiece(d: Design): boolean {
  return trays(d).length === 0 && edgeFeatures(d).some((h) => h.out.hinged.some((f) => (f.angle ?? 0) >= 150));
}

/** The pose a design's picture takes when nothing asks otherwise. */
export function autoPose(d: Design): Pose {
  const pose: Pose = {};
  if (trays(d).some((t) => t.top === 'seal' || t.top === 'rsc' || t.top === 'full' || !!t.ends?.top)) pose.ends = 1.12;
  if (isFlatPiece(d)) {
    pose.backFlap = 160;
    // an envelope: one board with its flaps folded over it
    if (d.order.length === 1) pose.prop = 'letter';
  }
  if (drawerParts(d)) pose.drawer = 0.55;
  if (isSleeve(d)) {
    pose.prop = 'soap';
    pose.lay = true;
  }
  return pose;
}

export type Posed = ReturnType<typeof foldDisplay> & {
  /** The fold fraction each folded flap is drawn at (1 folded as the design has it): by its key. */
  flapT: Map<string, number>;
  ghost: Set<string>;
};

/** Points of a board in the world, as shown (its outline's bounding corners and its thickness). */
function boardPoints(p: Panel, M: THREE.Matrix4): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const [x, y] of [[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]]) out.push(new THREE.Vector3(x, y, 0).applyMatrix4(M));
  return out;
}

export function boxOf(d: Design, ids: string[], xf: Map<string, THREE.Matrix4>): THREE.Box3 {
  const b = new THREE.Box3();
  for (const id of ids) {
    const p = d.panels[id];
    if (!p) continue;
    const M = (xf.get(id) ?? new THREE.Matrix4()).clone().multiply(frameMatrix(p.frame));
    for (const q of boardPoints(p, M)) b.expandByPoint(q);
  }
  return b;
}

/** A tray's boards: its base and walls. */
function trayBoards(d: Design, trayId: string): string[] {
  const t = d.trays?.[trayId];
  return t ? [t.baseId, ...trayRing(d, t).map((r) => r.wall)].filter((id) => !!d.panels[id]) : [];
}

/**
 * The drawer box assembled (view only): the sleeve turned so its tube runs front to back round the tray, the tray
 * `k` of the way in (pulled out of the front).
 */
function assembleDrawer(d: Design, shown: Posed, k: number) {
  const parts = drawerParts(d);
  if (!parts) return;
  const trayIds = trayBoards(d, parts.tray), shellIds = trayBoards(d, parts.shell);
  const ring = trayRing(d, d.trays[parts.tray]);
  const shellRing = trayRing(d, d.trays[parts.shell]);
  if (ring.length !== 4 || shellRing.length !== 4) return;
  const dirOf = (id: string, v: [number, number, number]) => new THREE.Vector3(...v).transformDirection(shown.xf.get(id) ?? new THREE.Matrix4());
  // the tray's axes: across its front, up, and towards its front (from its base's middle to the front wall)
  const front = d.panels[ring.find((r) => r.edge === 'e0')?.wall ?? ring[0].wall];
  const across = dirOf(front.id, front.frame.u).normalize();
  const up = dirOf(front.id, front.frame.v).normalize();
  const tb = boxOf(d, trayIds, shown.xf), tc = tb.getCenter(new THREE.Vector3());
  const fc = new THREE.Vector3(...toWorld(front.frame, front.w / 2, front.h / 2)).applyMatrix4(shown.xf.get(front.id) ?? new THREE.Matrix4());
  const toFront = fc.clone().sub(tc);
  toFront.sub(up.clone().multiplyScalar(toFront.dot(up))).sub(across.clone().multiplyScalar(toFront.dot(across)));
  if (toFront.lengthSq() < 1e-9) return;
  toFront.normalize();
  // the sleeve's axes: its tube's direction (its walls' height) and the side of the wall as wide as the tray
  const trayW = tb.getSize(new THREE.Vector3()).dot(new THREE.Vector3(Math.abs(across.x), Math.abs(across.y), Math.abs(across.z)));
  const wide = shellRing.map((r) => d.panels[r.wall]).reduce((a, b) => (Math.abs(b.w - trayW) < Math.abs(a.w - trayW) ? b : a));
  const sTube = dirOf(wide.id, wide.frame.v).normalize();
  const sAcross = dirOf(wide.id, wide.frame.u).normalize();
  const sThird = new THREE.Vector3().crossVectors(sAcross, sTube);
  const tThird = new THREE.Vector3().crossVectors(across, toFront);
  const from = new THREE.Matrix4().makeBasis(sAcross, sTube, sThird);
  const to = new THREE.Matrix4().makeBasis(across, toFront, tThird);
  const R = to.multiply(from.clone().transpose());
  const sb = boxOf(d, shellIds, shown.xf), sc = sb.getCenter(new THREE.Vector3());
  const depth = tb.getSize(new THREE.Vector3()).dot(new THREE.Vector3(Math.abs(toFront.x), Math.abs(toFront.y), Math.abs(toFront.z)));
  // the sleeve's middle: behind the tray's by how far the tray is out of it
  const target = tc.clone().addScaledVector(toFront, -(1 - k) * depth);
  const X = new THREE.Matrix4().makeTranslation(target.x, target.y, target.z).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-sc.x, -sc.y, -sc.z));
  for (const id of shellIds) shown.xf.set(id, X.clone().multiply(shown.xf.get(id) ?? new THREE.Matrix4()));
}

/**
 * The design posed: the fold display, lids opened or lifted as the pictures show them, and `pose` on top. The
 * flaps' fold fractions are returned by key (`<connection>:<i>` and `<board>:<edge>:<i>`, as the picture names them).
 */
export function posedDisplay(d: Design, pose: Pose = autoPose(d)): Posed {
  const shown: Posed = { ...foldDisplay(d, 1), flapT: new Map(), ghost: new Set(pose.ghost ?? []) };
  const shut: Record<string, boolean> = {};
  const lifted: { ids: string[]; height: number }[] = [];
  for (const t of trays(d)) {
    const lid = boxLid(d, t.id);
    if (lid.kind !== 'liftoff') continue;
    shut[t.id] = true;
    lifted.push({ ids: lidParts(d, lid), height: Number(d.template?.params.height) || 40 });
  }
  applyLidPoses(d, shown, { shut, selected: [], foldT: 1, assembling: false, openPast: -35 });
  for (const { ids, height } of lifted) {
    // about the lid's middle: up by about half the box's height, its near side tipped up
    const c = new THREE.Vector3();
    let n = 0;
    for (const id of ids) {
      const p = d.panels[id];
      if (!p) continue;
      c.add(new THREE.Vector3(...p.frame.o).applyMatrix4(shown.xf.get(id) ?? new THREE.Matrix4()));
      n++;
    }
    if (!n) continue;
    c.divideScalar(n);
    const tilt = new THREE.Matrix4()
      .makeTranslation(c.x, c.y + height * 0.75 + 14, c.z)
      .multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), -0.18))
      .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
    for (const id of ids) shown.xf.set(id, tilt.clone().multiply(shown.xf.get(id) ?? new THREE.Matrix4()));
  }
  // a carton's top flaps opened
  if (pose.ends !== undefined)
    for (const c of Object.values(d.connections)) c.geom?.flaps3d.forEach((f, i) => f.endOf === 'top' && f.hinge && shown.flapT.set(`${c.id}:${i}`, 1 - pose.ends!));
  if (pose.bottomEnds !== undefined)
    for (const c of Object.values(d.connections)) c.geom?.flaps3d.forEach((f, i) => f.endOf === 'bottom' && f.hinge && shown.flapT.set(`${c.id}:${i}`, 1 - pose.bottomEnds!));
  // a flat piece's flap on its back edge (the farthest from the viewer) opened
  if (pose.backFlap !== undefined) {
    let far: { key: string; f: Flap3d; depth: number } | null = null;
    for (const h of edgeFeatures(d))
      h.out.hinged.forEach((f, i) => {
        const p = d.panels[f.panelId];
        if (!p || !f.hinge || !f.angle) return;
        const m = new THREE.Vector3(...toWorld(p.frame, (f.hinge[0][0] + f.hinge[1][0]) / 2, (f.hinge[0][1] + f.hinge[1][1]) / 2, 0)).applyMatrix4(shown.xf.get(p.id) ?? new THREE.Matrix4());
        const depth = m.dot(PICTURE_VIEW);
        if (!far || depth < far.depth) far = { key: `${h.panelId}:${h.key}:${i}`, f, depth };
      });
    const pick = far as { key: string; f: Flap3d; depth: number } | null;
    if (pick) shown.flapT.set(pick.key, Math.max(-0.2, 1 - pose.backFlap / (pick.f.angle ?? 180)));
  }
  if (pose.drawer !== undefined) assembleDrawer(d, shown, pose.drawer);
  if (pose.lay) layDown(d, shown);
  return shown;
}

/** Everything turned a quarter about the level x axis, so an upright tube lies front to back (its open end towards the viewer), on the floor. */
function layDown(d: Design, shown: Posed) {
  const b = boxOf(d, d.order, shown.xf);
  if (b.isEmpty()) return;
  const c = b.getCenter(new THREE.Vector3());
  const R = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  const X = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
  const after = b.clone().applyMatrix4(X);
  const lift = new THREE.Matrix4().makeTranslation(0, b.min.y - after.min.y, 0);
  const M = lift.multiply(X);
  for (const id of d.order) shown.xf.set(id, M.clone().multiply(shown.xf.get(id) ?? new THREE.Matrix4()));
}

/** The direction the pictures look from (illustrate.ts's view, towards the viewer). */
export const PICTURE_VIEW = new THREE.Vector3(0.75, 1.08, 1).normalize();

/** A board's outward face direction in the world (for props laid on a board). */
export function boardNormal(p: Panel, xf: Map<string, THREE.Matrix4>): THREE.Vector3 {
  return new THREE.Vector3(...matDir(p.frame)).transformDirection(xf.get(p.id) ?? new THREE.Matrix4());
}

/** Which face of a board its folded flaps lie on: 1 its frame's +z side, -1 the other (1 when it has none). */
export function sideOfFlaps(d: Design, p: Panel, xf: Map<string, THREE.Matrix4>): 1 | -1 {
  const M = (xf.get(p.id) ?? new THREE.Matrix4()).clone().multiply(frameMatrix(p.frame));
  const n = new THREE.Vector3(0, 0, 1).transformDirection(M);
  const o = new THREE.Vector3(p.w / 2, p.h / 2, 0).applyMatrix4(M);
  for (const h of edgeFeatures(d, p.id))
    for (const f of h.out.hinged) {
      if (!f.frame || f.poly.length < 3) continue;
      const c = f.poly.reduce((a, q) => ({ x: a.x + q.x / f.poly.length, y: a.y + q.y / f.poly.length }), { x: 0, y: 0 });
      const w = new THREE.Vector3(...toWorld(f.frame, c.x, c.y, 0)).applyMatrix4(xf.get(p.id) ?? new THREE.Matrix4());
      const s = w.sub(o).dot(n);
      if (Math.abs(s) > 1e-3) return s > 0 ? 1 : -1;
    }
  return 1;
}

