// Enclosures (milestone 184, BOXES_PLYWOOD_PLAN.md §3.8): a box fitted out for electronics, written fresh after
// boxes.py's ElectronicsBox, RackBox, Rack19Box, Rack10Box and EuroRackSkiff (a behaviour reference only:
// THIRD_PARTY.md). Plywood only. Three fittings, each boards of their own marked `Panel.fitting`:
//   block  a top screwed on corner blocks: a triangle level in each corner, held in slots in the two walls a board
//          under their tops, a pilot hole in it; the top lies inside the walls on the blocks, flush with the walls'
//          tops (the engine's drop-in lid, its finger hole left out), a clearance hole over each block
//   front  a rack's front panel (19 or 10 inch), as tall as the whole rack units the walls take, glued face to face on
//          the front wall and standing out past the side walls in ears with the rack's oblong screw holes
//   rail   Eurorack rails: a level strip along the front and back walls' tops, held in slots, a hole every HP
//          (5.08 mm) on the modules' lines (122.5 mm apart)
import type { Design, P2, Panel, Tray, V3 } from '../../model/types';
import { addDetail, addFreePanel, connectSeam, connectSeams, laminateBoards, solve } from '../../model/ops';
import { findOpenSeams } from '../../model/seams';
import { trayRing } from '../../model/cartons';
import { dropinOnFrame, fingerId, flatLidsOf } from '../../model/lid';
import { toLocal, toWorld } from '../../model/frame';
import { tOf } from '../../model/materials';
import { setBoxLid } from '../../easy/lid';

/** The screws a top is held by (boxes.py's sizes): a pilot hole in the blocks and a clearance hole in the top (mm). */
export const SCREW = { pilot: 2, clear: 3 };
/** A corner block's legs along the walls (mm): boxes.py's 25 on 3 mm plywood, longer on thicker board. */
export const blockLeg = (t: number) => Math.max(25, 2 * t + 16);
/** The play between a glued block layer and the walls it does not touch (mm). */
const PLAY = 0.5;

/** A rack's front panel (EIA-310): its width and its screw holes' spacing across, and its opening between the rails (mm). */
export const RACKS = {
  '19': { panel: 482.6, holes: 465.1, opening: 450 },
  '10': { panel: 254, holes: 236.5, opening: 222 },
} as const;
export type RackKind = keyof typeof RACKS;
/** One rack unit (mm), and how much less a panel of n units is than n of them. */
export const RACK_U = 44.45, RACK_SHORT = 0.79;
/** The rack's oblong screw holes in a panel's ears (mm), and how far up from its bottom and down from its top. */
const EAR_HOLE = { w: 10, h: 6.5, y: 6.35 };

/** Eurorack (Doepfer A-100): one HP across (mm), a 3U module's height, its screw holes' lines apart. */
export const EURO = { hp: 5.08, module: 128.5, lines: 122.5, hole: 3 };
/** The inside depth Eurorack rails take (mm): the modules between the walls, a rail's hole a web clear of its edge, up to rails of 23 mm. */
export const EURO_DEPTH = { min: 129.5, max: 160 };

type Inside = { xL: number; xR: number; zB: number; zF: number; top: number; bottom: number; t: number };

/** A wall's inner face along a world axis (the face of its slab nearer the box's middle). */
function innerFace(d: Design, P: Panel, axis: 0 | 2): number {
  const { o, u, v, side } = P.frame;
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const a = o[axis], b = o[axis] + n[axis] * side * tOf(d, P.id);
  return Math.abs(a) < Math.abs(b) ? a : b;
}

/** A rectangular box's inside between its walls' inner faces, its walls' top and its foot (world, the box centred on the origin). */
export function insideBox(d: Design, trayId: string): Inside | null {
  const tr = d.trays?.[trayId];
  if (!tr) return null;
  const w = Object.fromEntries(trayRing(d, tr).map((r) => [r.edge, d.panels[r.wall]])) as Record<string, Panel | undefined>;
  if (!w.e0 || !w.e1 || !w.e2 || !w.e3) return null;
  const walls = [w.e0, w.e1, w.e2, w.e3];
  const B = d.panels[tr.baseId];
  return {
    xL: innerFace(d, w.e3, 0),
    xR: innerFace(d, w.e1, 0),
    zB: innerFace(d, w.e2, 2),
    zF: innerFace(d, w.e0, 2),
    top: Math.max(...walls.map((p) => p.frame.o[1] + p.h)),
    bottom: Math.min(...[...walls, ...(B ? [B] : [])].map((p) => p.frame.o[1])),
    t: tOf(d, tr.baseId),
  };
}

/** A level board (its material up) with an outline in world x and z, its underside at `y`. */
function levelBoard(d: Design, y: number, pts: { x: number; z: number }[]): string | null {
  return addFreePanel(d, { frame: { o: [0, y, 0], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: pts.map((q) => ({ x: q.x, y: -q.z })) });
}

/** A level board's point at world (x, z), in its own coordinates. */
const onLevel = (p: Panel, x: number, z: number): P2 => {
  const q = toLocal(p.frame, [x, p.frame.o[1], z]);
  return { x: q.x, y: q.y };
};

/** Room for corner blocks: the inside at least two legs and a gap wide each way, and tall enough for them under the top (mm). */
export const blockRoom = (t: number, inside: { w: number; d: number; h: number }) => Math.min(inside.w, inside.d) >= 2 * blockLeg(t) + 10 && inside.h >= 5 * t + 10;

/**
 * A top screwed on corner blocks (boxes.py's ElectronicsBox). Each block is a right triangle level in a corner, its
 * legs in slots in the two walls, its top a board under the walls' tops (the web over its slots); under it, on board
 * thinner than 5 mm, a second triangle glued face to face, a play clear of the walls, so the screw has two boards to
 * bite. The top is the engine's drop-in lid: the box's inside less the fit, resting on the blocks, flush with the walls'
 * tops; its finger hole is left out (it is lifted off once the screws are out). Returns the top, or null.
 */
export function addScrewTop(d: Design, trayId: string): string | null {
  const ins = insideBox(d, trayId);
  const tr = d.trays?.[trayId];
  if (!ins || !tr) return null;
  const { t } = ins;
  const L = blockLeg(t);
  const corners: { x: number; z: number; sx: number; sz: number }[] = [
    { x: ins.xL, z: ins.zF, sx: 1, sz: -1 },
    { x: ins.xR, z: ins.zF, sx: -1, sz: -1 },
    { x: ins.xR, z: ins.zB, sx: -1, sz: 1 },
    { x: ins.xL, z: ins.zB, sx: 1, sz: 1 },
  ];
  const holeAt = (c: (typeof corners)[number]) => ({ x: c.x + (c.sx * L) / 3, z: c.z + (c.sz * L) / 3 });
  const made: string[] = [];
  for (const c of corners) {
    const tri = (g: number, leg: number) => [
      { x: c.x + c.sx * g, z: c.z + c.sz * g },
      { x: c.x + c.sx * (g + leg), z: c.z + c.sz * g },
      { x: c.x + c.sx * g, z: c.z + c.sz * (g + leg) },
    ];
    const id = levelBoard(d, ins.top - 2 * t, tri(0, L));
    if (!id) return null;
    d.panels[id].fitting = 'block';
    made.push(id);
    if (t < 5 - 1e-9) {
      const low = levelBoard(d, ins.top - 3 * t, tri(PLAY, L - 2 * PLAY - 1));
      if (low) {
        d.panels[low].fitting = 'block';
        laminateBoards(d, low, id);
        made.push(low);
      }
    }
  }
  solve(d);
  for (const id of made) if (!Object.values(d.connections).some((c) => c.kind === 'laminate' && c.a.panelId === id)) connectSeams(d, id);
  for (const id of made) {
    const P = d.panels[id];
    const c = corners.find((k) => onLevelInside(P, k));
    if (!c) continue;
    const q = onLevel(P, holeAt(c).x, holeAt(c).z);
    addDetail(d, id, 'circle', 'cut', q.x, q.y, SCREW.pilot, SCREW.pilot);
  }
  solve(d);
  setBoxLid(d, trayId, 'liftoff', 'dropin');
  solve(d);
  const top = flatLidsOf(d, trayId)[0];
  if (!top) return null;
  top.details = top.details.filter((x) => x.id !== fingerId(top.id));
  const on = dropinOnFrame(d, top, tr);
  if (on)
    for (const c of corners) {
      const h = holeAt(c);
      const q = toLocal(on, [h.x, ins.top - t, h.z]);
      addDetail(d, top.id, 'circle', 'cut', q.x, q.y, SCREW.clear, SCREW.clear);
    }
  solve(d);
  return top.id;
}

/** Is a block's corner (its first point) at this corner of the box? */
function onLevelInside(P: Panel, c: { x: number; z: number; sx: number; sz: number }): boolean {
  const s = P.sketch;
  if (s.kind !== 'poly') return false;
  return s.pts.some((q) => {
    const w = toWorld(P.frame, q.x, q.y, 0);
    return Math.abs(w[0] - c.x) < 1.5 && Math.abs(w[2] - c.z) < 1.5;
  });
}

/** How many whole rack units a box's walls are tall, and the panel's height for them (mm). */
export function rackUnits(wallsTall: number): { n: number; h: number } {
  const n = Math.floor((wallsTall + RACK_SHORT + 0.5) / RACK_U);
  return { n, h: n * RACK_U - RACK_SHORT };
}

/** Does a box this wide and tall outside go in a rack of this kind (between its rails, ears clear of the side walls, a unit tall)? */
export function rackFits(kind: RackKind, outside: { w: number; h: number }): boolean {
  const r = RACKS[kind];
  const ear = (r.panel - outside.w) / 2;
  const holeEdge = (r.panel - r.holes) / 2 + EAR_HOLE.w / 2;
  return outside.w <= r.opening - 1 && ear >= holeEdge + 2 && rackUnits(outside.h).n >= 1;
}

/**
 * A rack's front panel (boxes.py's Rack19Box and Rack10Box): a board as wide as the rack's panel and as tall as the
 * whole units the walls take, glued face to face on the front wall's outer face from the box's foot; the side walls'
 * and the base's finger ends meet it there, glued too (edge to face, nothing cut). In each ear an oblong screw hole a
 * little in from the bottom and the top, on the rack's hole lines. Returns the panel, or null.
 */
export function addRackFront(d: Design, trayId: string, kind: RackKind): string | null {
  const tr = d.trays?.[trayId];
  const ins = insideBox(d, trayId);
  const front = tr && trayRing(d, tr).find((r) => r.edge === 'e0')?.wall;
  if (!tr || !ins || !front) return null;
  const F = d.panels[front];
  const t = tOf(d, front);
  const r = RACKS[kind];
  const u = rackUnits(ins.top - ins.bottom);
  if (u.n < 1) return null;
  // the front wall's outer face: its slab's far side from the box's middle (the front is at +z)
  const zOut = innerFace(d, F, 2) + t;
  const cx = (ins.xL + ins.xR) / 2;
  const o: V3 = [cx - r.panel / 2, ins.bottom, zOut];
  const id = addFreePanel(d, { frame: { o, u: [1, 0, 0], v: [0, 1, 0] }, side: 1, outer: [{ x: 0, y: 0 }, { x: r.panel, y: 0 }, { x: r.panel, y: u.h }, { x: 0, y: u.h }] });
  if (!id) return null;
  d.panels[id].fitting = 'front';
  laminateBoards(d, id, front);
  const inX = (r.panel - r.holes) / 2;
  for (const x of [inX, r.panel - inX]) for (const y of [EAR_HOLE.y, u.h - EAR_HOLE.y]) addDetail(d, id, 'roundrect', 'cut', x, y, EAR_HOLE.w, EAR_HOLE.h);
  for (const dt of d.panels[id].details) if (dt.shape === 'roundrect') dt.r = EAR_HOLE.h / 2 - 0.01;
  solve(d);
  // the side walls' and the base's finger ends come through to the front's face: glued there, nothing cut
  for (const s of findOpenSeams(d, id)) if (s.type === 'face') connectSeam(d, s, 'butt');
  solve(d);
  return id;
}

/** The holes along a Eurorack rail: every HP from the inside's left, a web clear of the rail's ends (x from the inside's left wall, mm). */
export function euroHoles(insideW: number, railFrom: number, railTo: number): number[] {
  const out: number[] = [];
  for (let i = 0; EURO.hp / 2 + i * EURO.hp <= insideW; i++) {
    const x = EURO.hp / 2 + i * EURO.hp;
    if (x - EURO.hole / 2 >= railFrom + 2 && x + EURO.hole / 2 <= railTo - 2) out.push(x);
  }
  return out;
}

/**
 * Eurorack rails (boxes.py's EuroRackSkiff): a level strip along the front wall and one along the back, a board under
 * their tops (the web over their slots), stopping a millimetre short of the side walls (free boards meet edge to face,
 * and a slot needs board round it), each with a hole every HP on the modules' screw line: the two lines 122.5 mm apart,
 * centred in the box's depth. The modules lie on the rails between the walls. Returns the rails.
 */
export function addEuroRails(d: Design, trayId: string): string[] {
  const ins = insideBox(d, trayId);
  if (!ins) return [];
  const { t } = ins;
  const D = ins.zF - ins.zB, W = ins.xR - ins.xL;
  const off = (D - EURO.lines) / 2;
  const width = off + EURO.hole / 2 + 2.5;
  const x0 = ins.xL + 1, x1 = ins.xR - 1;
  const y = ins.top - 2 * t;
  const out: string[] = [];
  for (const [zWall, inward] of [[ins.zF, -1], [ins.zB, 1]] as const) {
    const zIn = zWall + inward * width;
    const id = levelBoard(d, y, [{ x: x0, z: zWall }, { x: x1, z: zWall }, { x: x1, z: zIn }, { x: x0, z: zIn }]);
    if (!id) continue;
    d.panels[id].fitting = 'rail';
    out.push(id);
  }
  solve(d);
  for (const id of out) connectSeams(d, id);
  for (const [k, id] of out.entries()) {
    const P = d.panels[id];
    const z = k === 0 ? ins.zF - off : ins.zB + off;
    for (const x of euroHoles(W, 1, W - 1)) {
      const q = onLevel(P, ins.xL + x, z);
      addDetail(d, id, 'circle', 'cut', q.x, q.y, EURO.hole, EURO.hole);
    }
  }
  solve(d);
  return out;
}

/** The fittings of a box (milestone 184): its corner blocks, rack front and rails. */
export const fittingsOf = (d: Design, kind?: Panel['fitting']) => d.order.filter((id) => d.panels[id]?.fitting && (!kind || d.panels[id].fitting === kind));
export type { Tray };
