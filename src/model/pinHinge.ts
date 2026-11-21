// Pin hinges (milestone 176, BOXES_PLYWOOD_PLAN.md E5), after boxes.py's cabinet hinge in its outside style (a
// behaviour reference only: THIRD_PARTY.md), written fresh. A box's lid lies on its walls' tops, flush outside. Behind
// the back wall runs the hinge line, level with the lid's middle and a knuckle's radius and a swing behind the wall.
// Knuckles are small boards standing square to that line: those of the box on the back wall's outer face, those of
// the lid on its top face, reaching back over its back edge; they alternate along the line, a play apart, and a pin
// (a wooden dowel or a wire) goes through a hole in every one. A laser cuts holes square to the board, so a pin along
// the line can only pass through boards that stand square to it: the knuckles are boards of their own, not tongues of
// the lid or the wall (DECISIONS.md, milestone 176).
//
// Turning about the line, the lid only ever rises: every point of it is in front of the line and no lower than it,
// so it clears the walls. The lid's knuckles stay inside a knuckle's radius of the line below the wall's top, so they
// never reach the wall either. The box's knuckles carry a stop behind the line, a face the lid's top lands on at its
// open angle (105°): past upright, so the lid rests open on it.
//
// Every number here is a starting value for the owner's test cut (DECISIONS.md lists what to cut and what to look at).
import type { Design, Frame, P2, Panel, PinLid, Tray, V3 } from './types';
import { toLocal, toWorld } from './frame';
import { matOf, tOf } from './materials';
import { trayRing } from './cartons';

/** The pin's diameter a board starts with (mm): a 3 mm dowel or wire up to 4 mm plywood, 4 mm to 6 mm, 6 mm above. */
export const pinFor = (t: number) => (t <= 4 + 1e-9 ? 3 : t <= 6 + 1e-9 ? 4 : 6);
/** The pin diameters offered (mm): bamboo skewers and dowels, nails and brass or steel rod. */
export const PIN_SIZES = [2, 3, 4, 5, 6] as const;
/** How much larger than the pin its hole is (mm, across): it turns freely and does not wobble. */
export const PIN_PLAY = 0.3;
/** How far a moving part stays from a fixed one as the lid turns (mm). */
export const SWING = 0.5;
/** The play between neighbouring knuckles along the pin (mm). */
export const KNUCKLE_PLAY = 0.5;
/** The angle a pin-hinged lid opens to and rests at, on its stop (degrees from shut). */
export const PIN_OPEN = 105;
/** Knuckles per hinge: the box's at both ends, the lid's between. */
export const KNUCKLES = 3;

/** The sizes of a pin hinge in this board: the hole, the knuckle's radius round it, how far behind the wall the pin is, the knuckles' leaves. */
export function pinSizes(t: number, pin: number) {
  const hole = pin + PIN_PLAY;
  // the wood round the hole: never under 2.5 mm, more on thick board
  const R = hole / 2 + Math.max(2.5, 0.8 * t);
  const e = R + SWING;
  // a knuckle's leaf, where it stands on the lid or the wall: room for its tab and a web either side of its slot
  const leaf = Math.max(12, 4 * t);
  // the stop's face, which the open lid's top lands on
  const stop = t + 2;
  return { hole, R, e, leaf, stop };
}

/** How wide one hinge is along the pin (mm). */
export const hingeWidth = (t: number, n = KNUCKLES, play = KNUCKLE_PLAY) => n * t + (n - 1) * play;

/** The least width (mm) a box takes for two hinges, and the least height for the box's knuckles' leaves. */
export function pinRoom(t: number, pin = pinFor(t)): { width: number; height: number } {
  const s = pinSizes(t, pin);
  return { width: Math.ceil(4 * hingeWidth(t) + 4 * (t + 4)), height: Math.ceil(SWING + s.leaf + 2 + 2 * t) };
}

type Rect = { x0: number; y0: number; x1: number; y1: number };

/** The box a pin-hinged lid closes: a rectangle with four walls, its back on the base's third edge. */
function boxOf(d: Design, trayId: string): { box: Tray; base: Panel; r: Rect; back: Panel } | null {
  const box = d.trays?.[trayId];
  const base = box && d.panels[box.baseId];
  if (!box || !base || base.sketch.kind !== 'poly' || base.sketch.pts.length !== 4 || base.sketch.round || base.sketch.pts.some((q) => q.curve)) return null;
  const ring = trayRing(d, box);
  if (ring.length !== 4) return null;
  const back = d.panels[ring.find((x) => x.edge === 'e2')?.wall ?? ''];
  if (!back) return null;
  const xs = base.sketch.pts.map((q) => q.x), ys = base.sketch.pts.map((q) => q.y);
  return { box, base, back, r: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } };
}

/** An arc's points about (cx, cy), radius r, from angle a0 to a1 (degrees, counter-clockwise), ends included. */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): P2[] {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 10));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

export type KnuckleLayout = { k: number; on: 'lid' | 'wall'; frame: Frame; pts: P2[]; hole: P2 };
export type PinLayout = {
  lid: { frame: Frame; pts: P2[] };
  /** The hinge line: a point on it and its direction (the base's u), in the world. */
  axis: { o: V3; dir: V3 };
  knuckles: KnuckleLayout[];
  hole: number;
};

/**
 * Where a pin-hinged lid and its knuckles are for its box as it now is: the lid on the walls' tops, flush with their
 * outer faces; the knuckles' outlines in planes square to the hinge line (local x behind the back wall's outer face,
 * local y up, from the world's floor), before their outlines are moved to start at (0, 0). Null when the box is not
 * a walled rectangle.
 */
export function pinLayout(d: Design, trayId: string, h: Pick<PinLid, 'pin' | 'knuckles' | 'play' | 'open'>): PinLayout | null {
  const b = boxOf(d, trayId);
  if (!b) return null;
  const { base, back, r } = b;
  const t = matOf(d, base.id).thickness;
  const f = base.frame;
  // the walls' top (world y), and the lid's middle there
  const H = Math.max(...[0, back.w].map((x) => toWorld(back.frame, x, back.h)[1]));
  const Va = H + t / 2;
  const s = pinSizes(t, h.pin);
  const W = r.x1 - r.x0, D = r.y1 - r.y0;
  const lift = (p: V3, y: number): V3 => [p[0], y, p[2]];
  // the lid: the base's rectangle, lying on the walls' tops, its material up
  const lo = lift(toWorld(f, r.x0, r.y0), H);
  const n = [f.u[1] * f.v[2] - f.u[2] * f.v[1], f.u[2] * f.v[0] - f.u[0] * f.v[2], f.u[0] * f.v[1] - f.u[1] * f.v[0]];
  const lid = { frame: { o: lo, u: [...f.u] as V3, v: [...f.v] as V3, side: (n[1] >= 0 ? 1 : -1) as 1 | -1 }, pts: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D }, { x: 0, y: D }] };
  // the hinge line: behind the back wall's outer face (the base's far edge) by e, level with the lid's middle
  const backDir = f.v as V3;
  const axisAt = lift(toWorld(f, r.x0, r.y1), Va);
  const axis = { o: [axisAt[0] + backDir[0] * s.e, axisAt[1], axisAt[2] + backDir[2] * s.e] as V3, dir: [...f.u] as V3 };
  // two hinges, a fifth of the width in from each side, each never nearer a side than the side wall's thickness and
  // a web of board (one hinge lets the lid twist: a box too narrow for two takes none)
  const gw = hingeWidth(t, h.knuckles, h.play);
  const margin = t + 4;
  if (W < 4 * gw + 4 * margin || H - SWING - s.leaf < 2 * t + 2) return null;
  const centres = [W * 0.2, W * 0.8].map((c) => Math.min(Math.max(c, margin + gw / 2), W - margin - gw / 2));
  // in the knuckle's plane: x behind the back wall's outer face, y the world's height
  const e = s.e, R = s.R, ax = e, ay = Va;
  const lidPts: P2[] = [{ x: -s.leaf, y: H + t }, { x: 0, y: H + t }, ...arc(ax, ay, R, 180, 450), { x: -s.leaf, y: ay + R }];
  // the box's knuckle: a leaf on the wall's face, from a swing under the wall's top down; round the pin; a stop behind
  // it whose face lies where the open lid's top is (the lid's direction from the line at `open`, its top face t/2 off)
  const op = (h.open * Math.PI) / 180;
  const dir = { x: Math.cos(Math.PI - op), y: Math.sin(Math.PI - op) }, nrm = { x: Math.cos(Math.PI / 2 - op), y: Math.sin(Math.PI / 2 - op) };
  const q0 = { x: ax + e * dir.x + (t / 2) * nrm.x, y: ay + e * dir.y + (t / 2) * nrm.y };
  const q1 = { x: ax + (e + s.stop) * dir.x + (t / 2) * nrm.x, y: ay + (e + s.stop) * dir.y + (t / 2) * nrm.y };
  const top = H - SWING, bottom = top - s.leaf;
  const backX = Math.max(ax + R, q1.x + Math.max(3, t));
  const a0 = (Math.atan2(q0.y - ay, q0.x - ax) * 180) / Math.PI;
  // the round's front, down to the leaf's top
  const a1 = 180 + (Math.asin(Math.min(1, (ay - top) / R)) * 180) / Math.PI;
  const wallPts: P2[] = [{ x: 0, y: bottom }, { x: backX, y: bottom }, { x: backX, y: q1.y }, q1, q0, ...arc(ax, ay, R, a0, a1), { x: 0, y: top }];
  const knuckles: KnuckleLayout[] = [];
  let k = 0;
  for (const c of centres)
    for (let j = 0; j < h.knuckles; j++) {
      const x = c - gw / 2 + j * (t + h.play);
      const on = j % 2 ? 'lid' : 'wall';
      // its plane: at x along the base, local x towards the back, local y up, its material towards +u
      const o = lift(toWorld(f, r.x0 + x, r.y1), 0);
      const u = backDir, v: V3 = [0, 1, 0];
      const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const side = (nn[0] * f.u[0] + nn[1] * f.u[1] + nn[2] * f.u[2] >= 0 ? 1 : -1) as 1 | -1;
      knuckles.push({ k: k++, on, frame: { o, u: [...u] as V3, v, side }, pts: on === 'lid' ? lidPts : wallPts, hole: { x: ax, y: ay } });
    }
  return { lid, axis, knuckles, hole: s.hole };
}

/** A board given an outline and a frame, the outline moved to start at (0, 0) and the frame with it (as `addFreePanel` does). Returns the shift. */
export function setBoard(p: Panel, frame: Frame, pts: P2[]): P2 {
  const mx = Math.min(...pts.map((q) => q.x)), my = Math.min(...pts.map((q) => q.y));
  const o: V3 = [0, 1, 2].map((i) => frame.o[i] + frame.u[i] * mx + frame.v[i] * my) as V3;
  const ps = pts.map((q) => ({ x: q.x - mx, y: q.y - my }));
  const edgeIds = p.sketch.kind === 'poly' && p.sketch.edgeIds.length === ps.length ? p.sketch.edgeIds : ps.map((_, i) => `e${i}`);
  p.sketch = { kind: 'poly', pts: ps, edgeIds };
  p.frame = { o, u: [...frame.u] as V3, v: [...frame.v] as V3, side: frame.side };
  p.w = Math.max(...ps.map((q) => q.x));
  p.h = Math.max(...ps.map((q) => q.y));
  return { x: mx, y: my };
}

/** The id of a knuckle's pin hole. */
export const pinHoleId = (knuckle: string) => `${knuckle}:pin`;

/** A design's pin-hinged lids. */
export const pinLids = (d: Design): Panel[] => d.order.map((id) => d.panels[id]).filter((p): p is Panel => !!p?.pinLid);
/** The knuckles of a pin-hinged lid, left to right: those on the lid, those on the wall, or all. */
export const knucklesOf = (d: Design, lidId: string, on?: 'lid' | 'wall'): Panel[] =>
  d.order.map((id) => d.panels[id]).filter((p): p is Panel => !!p?.knuckle && p.knuckle.lid === lidId && (!on || p.knuckle.on === on)).sort((a, b) => a.knuckle!.k - b.knuckle!.k);

/**
 * Keep every pin-hinged lid and its knuckles on its box (`solve`, once the walls stand): the lid on the walls' tops,
 * the knuckles on the hinge line, their pin holes on it. A lid whose box went keeps where it is, as a plain board.
 */
export function reconcilePinLids(d: Design) {
  for (const L of pinLids(d)) {
    const h = L.pinLid!;
    const lay = d.trays?.[h.tray] ? pinLayout(d, h.tray, h) : null;
    if (!lay) {
      delete L.pinLid;
      continue;
    }
    setBoard(L, lay.lid.frame, lay.lid.pts);
    for (const K of knucklesOf(d, L.id)) {
      const at = lay.knuckles.find((x) => x.k === K.knuckle!.k && x.on === K.knuckle!.on);
      if (!at) continue;
      const sh = setBoard(K, at.frame, at.pts);
      const hole = K.details.find((x) => x.id === pinHoleId(K.id));
      if (hole) Object.assign(hole, { cx: at.hole.x - sh.x, cy: at.hole.y - sh.y, w: lay.hole, h: lay.hole });
    }
  }
}

/** The hinge line of a pin-hinged lid in the world (a point on it, its direction) and the angle it opens to, or null. */
export function pinAxis(d: Design, lidId: string): { o: V3; dir: V3; open: number } | null {
  const L = d.panels[lidId];
  const h = L?.pinLid;
  if (!h) return null;
  const lay = pinLayout(d, h.tray, h);
  return lay ? { ...lay.axis, open: h.open } : null;
}

/** A point turned about a line (a point on it, its unit direction) by `a` radians, right-handed. */
function rotAbout(axis: { o: V3; dir: V3 }, p: V3, a: number): V3 {
  const k = axis.dir, c = Math.cos(a), s = Math.sin(a);
  const v: V3 = [p[0] - axis.o[0], p[1] - axis.o[1], p[2] - axis.o[2]];
  const kv = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const x: V3 = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
  return [0, 1, 2].map((i) => axis.o[i] + v[i] * c + x[i] * s + k[i] * kv * (1 - c)) as V3;
}

/** The signed turn (radians, right-handed about the axis's direction) that opens a lid by `deg`: the way that lifts its front. */
export function openTurn(axis: { o: V3; dir: V3 }, front: V3, deg: number): number {
  const sign = rotAbout(axis, front, 0.3)[1] >= rotAbout(axis, front, -0.3)[1] ? 1 : -1;
  return (sign * deg * Math.PI) / 180;
}

/** A point of a pin-hinged lid (or of anything turning with it) after the lid opens by `deg` about its hinge line. World coordinates. */
export function turnAbout(axis: { o: V3; dir: V3 }, front: V3, deg: number): (p: V3) => V3 {
  const a = openTurn(axis, front, deg);
  return (p) => rotAbout(axis, p, a);
}

/** The frame a board is at after its lid opens by `deg` (a pin-hinged lid's, or a knuckle on it). */
export function turnedFrame(f: Frame, turn: (p: V3) => V3): Frame {
  const o = turn(f.o), pu = turn([f.o[0] + f.u[0], f.o[1] + f.u[1], f.o[2] + f.u[2]]), pv = turn([f.o[0] + f.v[0], f.o[1] + f.v[1], f.o[2] + f.v[2]]);
  return { o, u: [pu[0] - o[0], pu[1] - o[1], pu[2] - o[2]], v: [pv[0] - o[0], pv[1] - o[1], pv[2] - o[2]], side: f.side };
}

/** The lid's front-middle point (world), the one that rises as it opens. */
export function lidFront(L: Panel): V3 {
  return toWorld(L.frame, L.w / 2, 0, 0);
}

/** A knuckle's pin hole centre in the world. */
export function holeAt(K: Panel): V3 | null {
  const h = K.details.find((x) => x.id === pinHoleId(K.id));
  return h ? toWorld(K.frame, h.cx, h.cy) : null;
}

/** Where a world point is on a knuckle (its local coordinates). */
export const onKnuckle = (K: Panel, p: V3) => toLocal(K.frame, p);

/** The box's walls a pin-hinged lid rests on: it covers them, and is held by its knuckles, not joined to them. */
export function pinLidCovers(d: Design): [string, string][] {
  const out: [string, string][] = [];
  for (const L of pinLids(d)) {
    const box = d.trays?.[L.pinLid!.tray];
    if (!box) continue;
    for (const r of trayRing(d, box)) out.push([L.id, r.wall]);
  }
  return out;
}

/** The thickness of a knuckle (its board's). */
export const knuckleT = (d: Design, K: Panel) => tOf(d, K.id);
