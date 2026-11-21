// Boxes built from boards (milestones 162, 164; BOXES_PRESETS_PLAN.md §3), for plywood and 4 mm corrugated only
// (`boardStock`). Each is a construction read in boxes.py and written fresh over the box kit (boards.ts).
//   an open-front box  a box with no top and no front wall: notes, cards or a stack of paper taken from the front
//                      (boxes.py's openbox and notesholder);
//   a pen holder       a box with a level plate partway down, holes in it holding pens upright (penholderbox);
//   a scoop tray       a low box whose front is a ramp from the base up to the front wall's top, so tokens and screws
//                      slide out under a finger (smallpartstray);
//   a bird house       a box whose front and back rise to a gable, a roof of two boards fingered at the ridge and a
//                      round door (birdhouse); plywood only for now (boards.ts `plywoodOnly`);
//   a bookend          half of a box: its base, its back and one side (halfbox);
//   a sliding-lid box  side and back walls past the lid, two rails on each side wall making its groove, a front as
//                      low as the lid's underside, and a lid that slides out over it (slidinglidbox).
import type { MsgKey } from '../../i18n';
import type { ParamDef, Params, TemplateDef } from '../types';
import { SIZE_MAX } from '../types';
import { setBoxSize } from '../../model/boxSize';
import { addDetail, addFreePanel, addWallInsert, connectSeams, deletePanel, growPanel, setCustomHeight, setPanelSize, setWallCorner, solve } from '../../model/ops';
import { panelEdges } from '../../model/edges';
import { pairKinds } from '../../model/jointDefaults';
import { minWeb } from '../../model/materials';
import { boardBoxRect, boardStock, hangByKeyholes, plywoodOnly } from './boards';
import { addStack, stackLeast } from '../../model/stack';
import { cleanAll, cleanWith, mainTray } from './box';
import { innerFace, nameAll, reseam, sheetLimits, wallsOf } from './shaped';

type Role = (name: string, id: string) => void;
const num = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'number', unit: 'mm', min, max, default: dflt });

/** Inside or outside, for a box of boards (no crease to crease: nothing folds). */
export const sizeAsWord = (def: () => TemplateDef): ParamDef => ({
  key: 'sizeAs', label: 'sen.sizeAs', type: 'choice', default: 'inside',
  options: [{ value: 'inside', label: 'sen.sizeAs.inside' }, { value: 'outside', label: 'sen.sizeAs.outside' }],
  allowed: (v, p, m) => cleanWith(def(), m, p, 'sizeAs', v),
  why: () => 'sen.why.engine',
});

/**
 * Milestone 177 (BOXES_PLYWOOD_PLAN.md E6): stacking feet under a box of boards' walls and tongues on their tops, on
 * plywood, where the walls are wide enough for both feet and a tongue.
 */
export const stackWord = (def: () => TemplateDef): ParamDef => ({
  key: 'stack', label: 'sen.stack', type: 'choice', default: 'none', addon: { off: 'none' },
  options: [{ value: 'none', label: 'sen.stack.none' }, { value: 'feet', label: 'sen.stack.feet' }],
  allowed: (v, p, m) => v === 'none' || (m.kind === 'plywood' && Math.min(Number(p.width), Number(p.depth)) >= stackLeast(m) && Number(p.height) >= 20 && cleanWith(def(), m, p, 'stack', v)),
  why: (_v, p, m) => (m.kind !== 'plywood' ? 'sen.why.plyOnly' : Math.min(Number(p.width), Number(p.depth)) < stackLeast(m) || Number(p.height) < 20 ? 'sen.why.stackRoom' : 'sen.why.engine'),
  affects: ['walls'],
});

/**
 * A box of boards at these sizes, inside or outside as the words say: its tray, or null. `shape` changes it before it
 * is sized (a wall taken away), so the sizes are measured on the box as it ends up.
 */
export function sizedBox(d: Parameters<TemplateDef['generate']>[0], p: Params, shape?: () => void): string | null {
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height);
  const as = p.sizeAs === 'outside' ? 'outside' : 'inside';
  if (!boardBoxRect(d, W, D, H)) return null;
  shape?.();
  const tr = mainTray(d)!;
  if (as === 'inside') d.sizeAs = 'inside';
  setBoxSize(d, tr, { w: W, d: D, h: H }, as);
  solve(d);
  return tr;
}

// --- the open-front box ---

function generateFrontOpen(d: Parameters<TemplateDef['generate']>[0], p: Params, role: Role) {
  // the front left open (the base's first edge): its wall taken away, as deleting a tray's wall opens that side
  const tr = sizedBox(d, p, () => {
    const front = wallsOf(d).e0;
    if (front) deletePanel(d, front);
  });
  if (!tr) return;
  // milestone 177 (boxes.py's NotesHolder, stackable): feet under the walls and tongues on their tops
  if (p.stack === 'feet') addStack(d, Object.values(wallsOf(d)));
  nameAll(d, role);
}

export const frontOpen: TemplateDef = {
  id: 'frontOpen',
  version: 1,
  name: 'sen.frontOpen',
  description: 'sen.frontOpen.desc',
  word: 'sen.frontOpen',
  status: 'beta',
  materials: ['plywood', 'corrugated'],
  canMake: boardStock,
  fallback: () => 'box',
  params: [
    num('width', 'sen.width', 40, SIZE_MAX, 160),
    num('depth', 'sen.depth', 40, SIZE_MAX, 110),
    num('height', 'sen.height', 15, SIZE_MAX, 60),
    sizeAsWord(() => frontOpen),
    stackWord(() => frontOpen),
  ],
  generate: generateFrontOpen,
  sentence: { main: 'sen.s.frontOpen' },
};
frontOpen.limits = sheetLimits(frontOpen, { width: 40, depth: 40, height: 15 });
frontOpen.accepts = (m, p) => (cleanAll(frontOpen, m, p) ? null : 'sen.why.engineSize');

// --- inside a box of boards: a level plate or a ramp between its walls ---

/** Where a box's inner faces are, as built (a tab-and-slot wall stands in from the base's edge, a fingered one not). */
export function insideOf(d: Parameters<TemplateDef['generate']>[0]): { xL: number; xR: number; zB: number; zF: number; floor: number } | null {
  const w = wallsOf(d);
  const tr = mainTray(d);
  if (!tr) return null;
  const t = d.material.thickness;
  const base = d.panels[d.trays[tr].baseId];
  const W = base?.w ?? 0, D = base?.h ?? 0;
  const xL = innerFace(d, w.e3, 0) ?? -W / 2 + t, xR = innerFace(d, w.e1, 0) ?? W / 2 - t;
  const zB = innerFace(d, w.e2, 2) ?? -D / 2 + t, zF = innerFace(d, w.e0, 2) ?? D / 2 - t;
  // the base's top face
  const floor = base ? base.frame.o[1] + t : t;
  return { xL, xR, zB, zF, floor };
}

/** A board lying level across a box's inside at height `y` (its underside), joined to the walls round it. */
function levelPlate(d: Parameters<TemplateDef['generate']>[0], y: number): string | null {
  const ins = insideOf(d);
  if (!ins) return null;
  const { xL, xR, zB, zF } = ins;
  return addFreePanel(d, { frame: { o: [xL, y, zF], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: [{ x: 0, y: 0 }, { x: xR - xL, y: 0 }, { x: xR - xL, y: zF - zB }, { x: 0, y: zF - zB }] });
}

// --- the pen holder ---

/** The holes a plate W × D (inside) has room for, each `hole` across with `web` between them and round its edge. */
function holeGrid(W: number, D: number, hole: number, web: number): { nx: number; ny: number } {
  const n = (L: number) => Math.max(0, Math.floor((L - web) / (hole + web)));
  return { nx: n(W), ny: n(D) };
}

function generatePenHolder(d: Parameters<TemplateDef['generate']>[0], p: Params, role: Role) {
  const tr = sizedBox(d, p);
  if (!tr) return;
  const ins = insideOf(d);
  if (!ins) return;
  const t = d.material.thickness;
  // the plate a third of the way down from the top: pens stand through it on the base
  const H = d.trays[tr].height;
  const y = Math.max(ins.floor + 20, H - Math.max(15, H / 3) - t);
  const plate = levelPlate(d, y);
  solve(d);
  if (plate) {
    connectSeams(d, plate);
    const P = d.panels[plate];
    const W = ins.xR - ins.xL, D = ins.zF - ins.zB;
    const hole = Number(p.hole), web = Math.max(3 * t, 4);
    const { nx, ny } = holeGrid(W, D, hole, web);
    // the grid centred on the plate
    const gx = (W - (nx * hole + (nx - 1) * web)) / 2, gy = (D - (ny * hole + (ny - 1) * web)) / 2;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) addDetail(d, P.id, 'circle', 'cut', gx + hole / 2 + i * (hole + web), gy + hole / 2 + j * (hole + web), hole, hole);
  }
  solve(d);
  nameAll(d, role, plate ? { plate } : {});
}

export const penHolder: TemplateDef = {
  id: 'penHolder',
  version: 1,
  name: 'sen.penHolder',
  description: 'sen.penHolder.desc',
  word: 'sen.penHolder',
  status: 'beta',
  materials: ['plywood', 'corrugated'],
  canMake: boardStock,
  fallback: () => 'box',
  params: [
    num('width', 'sen.width', 50, SIZE_MAX, 120),
    num('depth', 'sen.depth', 40, SIZE_MAX, 70),
    num('height', 'sen.height', 50, SIZE_MAX, 90),
    sizeAsWord(() => penHolder),
    num('hole', 'sen.penHole', 8, 30, 13),
  ],
  generate: generatePenHolder,
  sentence: { main: 'sen.s.penHolder' },
};
penHolder.limits = sheetLimits(penHolder, { width: 50, depth: 40, height: 50 });
// at least one hole each way
penHolder.accepts = (m, p) => {
  const t = m.thickness, web = Math.max(3 * t, 4), g = holeGrid(Number(p.width) - 2 * t, Number(p.depth) - 2 * t, Number(p.hole), web);
  if (g.nx < 1 || g.ny < 1) return 'sen.why.penHoles' as MsgKey;
  return cleanAll(penHolder, m, p) ? null : 'sen.why.engineSize';
};

/**
 * A board resting on another (a ramp's foot on the base): no flap and no slots, its edge stopped at the other's face
 * (`slide`), where that joint can be made; a flap of rigid board would have to fold.
 */
function restOn(d: Parameters<TemplateDef['generate']>[0], id: string, on: string) {
  for (const c of Object.values(d.connections)) {
    if (c.grown || !((c.a.panelId === id && c.b.panelId === on) || (c.b.panelId === id && c.a.panelId === on))) continue;
    if (pairKinds(d, c).includes('slide')) c.kind = c.pref = 'slide';
  }
}

// --- the scoop tray ---

/** The ramp's slant (degrees from level): this, or steeper when the tray is too shallow front to back for it. */
const RAMP_SLANT = 35;
/** The most of the inside, front to back, the ramp may take; each of two (milestone 178). */
const RAMP_REACH = 0.6;
const RAMP_REACH_BOTH = 0.42;

function generateScoopTray(d: Parameters<TemplateDef['generate']>[0], p: Params, role: Role) {
  const tr = sizedBox(d, p);
  if (!tr) return;
  const ins = insideOf(d);
  if (!ins) return;
  // milestone 178 (boxes.py's two-sided SmallPartsTray, plywood): a ramp at the back too, each reaching less far
  const both = p.scoops === 'both';
  const w = wallsOf(d);
  if (both) {
    // the side walls rise a web above the ends, so the slots for the ramps' tabs by their tops have board round them
    const web = Math.max(minWeb(d.material), d.material.thickness);
    for (const e of ['e1', 'e3']) {
      if (!w[e]) continue;
      setCustomHeight(d, w[e], true);
      setPanelSize(d, w[e], undefined, d.panels[w[e]].h + web);
    }
    solve(d);
  }
  const ramps: string[] = [];
  for (const end of both ? (['e0', 'e2'] as const) : (['e0'] as const)) {
    const wall = w[end];
    const top = wall ? d.panels[wall].frame.o[1] + d.panels[wall].h : d.trays[tr].height;
    const rise = top - ins.floor, run = ins.zF - ins.zB;
    // from the wall's top down to the base, between the side walls
    const a = Math.max((RAMP_SLANT * Math.PI) / 180, Math.atan(rise / (run * (both ? RAMP_REACH_BOTH : RAMP_REACH))));
    const len = rise / Math.sin(a);
    const s = end === 'e0' ? -1 : 1;
    const ramp = addFreePanel(d, {
      frame: { o: [ins.xL, top, end === 'e0' ? ins.zF : ins.zB], u: [1, 0, 0], v: [0, -Math.sin(a), s * Math.cos(a)] },
      side: end === 'e0' ? 1 : -1,
      outer: [{ x: 0, y: 0 }, { x: ins.xR - ins.xL, y: 0 }, { x: ins.xR - ins.xL, y: len }, { x: 0, y: len }],
    });
    if (ramp) ramps.push(ramp);
  }
  solve(d);
  ramps.forEach((ramp, i) => {
    connectSeams(d, ramp);
    // held by the side walls' tabs; it rests on the base and against its end wall's top
    restOn(d, ramp, d.trays[tr].baseId);
    const end = w[i === 0 ? 'e0' : 'e2'];
    if (end) restOn(d, ramp, end);
  });
  solve(d);
  nameAll(d, role, ramps.length ? { ramp: ramps[0], ...(ramps[1] ? { 'ramp-2': ramps[1] } : {}) } : {});
}

export const scoopTray: TemplateDef = {
  id: 'scoopTray',
  version: 1,
  name: 'sen.scoopTray',
  description: 'sen.scoopTray.desc',
  word: 'sen.scoopTray',
  status: 'beta',
  materials: ['plywood', 'corrugated'],
  canMake: boardStock,
  fallback: () => 'box',
  params: [
    num('width', 'sen.width', 50, SIZE_MAX, 120),
    num('depth', 'sen.depth', 60, SIZE_MAX, 120),
    num('height', 'sen.height', 20, 120, 40),
    sizeAsWord(() => scoopTray),
    // milestone 178 (BOXES_PLYWOOD_PLAN.md §3.2, boxes.py's two-sided SmallPartsTray): a ramp at each end, on plywood
    {
      key: 'scoops', label: 'sen.scoops', type: 'choice', default: 'one', addon: { off: 'one' },
      options: [{ value: 'one', label: 'sen.scoops.one' }, { value: 'both', label: 'sen.scoops.both' }],
      allowed: (v, p, m) => v === 'one' || (m.kind === 'plywood' && cleanWith(scoopTray, m, p, 'scoops', v)),
      why: (_v, _p, m) => (m.kind !== 'plywood' ? 'sen.why.plyOnly' : 'sen.why.engine'),
      affects: ['walls'],
    },
  ],
  generate: generateScoopTray,
  sentence: { main: 'sen.s.scoopTray' },
};
scoopTray.limits = sheetLimits(scoopTray, { width: 50, depth: 60, height: 20 });
scoopTray.accepts = (m, p) => (cleanAll(scoopTray, m, p) ? null : 'sen.why.engineSize');

// --- the bird house ---

/** The roof's pitch (degrees from level): 45°, so the two halves meet square at the ridge and finger there. */
const ROOF_PITCH = 45;

function generateBirdHouse(d: Parameters<TemplateDef['generate']>[0], p: Params, role: Role) {
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height);
  if (!boardBoxRect(d, W, D, H)) return;
  const w = wallsOf(d);
  if (!w.e0 || !w.e2) return;
  // the front and the back rise to a gable over the middle (the boards that run the box's full width)
  const fw = d.panels[w.e0].w;
  const rise = (fw / 2) * Math.tan((ROOF_PITCH * Math.PI) / 180);
  addWallInsert(d, w.e0, 'e2', 0.5, rise);
  addWallInsert(d, w.e2, 'e2', 0.5, rise);
  solve(d);
  // plywood only (`plywoodOnly`): on any other board, which never offers it (a change of board makes it a box), the
  // gabled box without its roof, rather than a roof the engine joins with flaps it was not made for
  if (!plywoodOnly(d.material)) return nameAll(d, role);
  // the roof: a board grown back off each of the front gable's sloped edges, as deep as the box, fingered to the
  // back gable, the side walls' tops and each other at the ridge
  const front = d.panels[w.e0];
  const sloped = panelEdges(front).filter((e) => Math.abs(e.a.y - e.b.y) > 1 && Math.abs(e.a.x - e.b.x) > 1);
  const roofs: string[] = [];
  for (const e of sloped) {
    const r = growPanel(d, w.e0, e.key, { height: D, angle: 90, dir: 'up', kind: 'finger' });
    if (r) roofs.push(r.panelId);
  }
  solve(d);
  for (const r of roofs) connectSeams(d, r);
  // the door, round, in the front below the eaves
  const door = Math.min(Number(p.door), fw - 6 * d.material.thickness, H - 30);
  if (door >= 15) addDetail(d, front.id, 'circle', 'cut', fw / 2, Math.max(door / 2 + 15, H * 0.6), door, door);
  solve(d);
  nameAll(d, role, Object.fromEntries(roofs.map((r, i) => [`roof-${i + 1}`, r])));
}

export const birdHouse: TemplateDef = {
  id: 'birdHouse',
  version: 1,
  name: 'sen.birdHouse',
  description: 'sen.birdHouse.desc',
  word: 'sen.birdHouse',
  status: 'beta',
  materials: ['plywood'],
  canMake: plywoodOnly,
  fallback: () => 'box',
  params: [
    num('width', 'sen.width', 80, 250, 120),
    num('depth', 'sen.depth', 80, 250, 120),
    num('height', 'sen.eaveHeight', 80, 250, 120),
    num('door', 'sen.doorSize', 20, 60, 32),
  ],
  generate: generateBirdHouse,
  sentence: { main: 'sen.s.birdHouse' },
};
birdHouse.limits = sheetLimits(birdHouse, { width: 80, depth: 80, height: 80 });
birdHouse.accepts = (m, p) => (cleanAll(birdHouse, m, p) ? null : 'sen.why.engineSize');

// --- the bookend ---

/** How far up the front a half box's triangular side keeps a short upright edge (a triangle's tip is not cut clean). */
const halfLip = (t: number) => 2 * t + 2;
/** A clamp hole's size: the square a clamp's jaw goes through (boxes.py's clamping size). */
const CLAMP = 25;

/** Where a half box's clamp holes go in a triangular side, `D` long and `H` tall, its back at x = D: none when they do not fit. */
function clampHoles(D: number, H: number, t: number): { x: number; y: number }[] | null {
  const web = Math.max(2, t) + 2;
  const lip = halfLip(t);
  const top = (x: number) => lip + ((H - lip) * x) / D;
  // one low in the middle of the base, one high near the back
  const a = { x: D / 2, y: t + web + CLAMP / 2 };
  const b = { x: D - t - web - CLAMP / 2, y: H / 2 };
  const fits = (q: { x: number; y: number }) => q.y + CLAMP / 2 + web <= top(q.x - CLAMP / 2) && q.x - CLAMP / 2 >= web && q.y - CLAMP / 2 >= t + web;
  return fits(a) && fits(b) && b.x - a.x >= CLAMP + web ? [a, b] : null;
}

function generateBookend(d: Parameters<TemplateDef['generate']>[0], p: Params, role: Role) {
  // milestone 171 (HalfBox): its sides are triangles, from the back's top down to the base's front; a design saved
  // before has no `ends` and keeps its one square side (166)
  const one = (p.ends ?? 'one') === 'one';
  const t = d.material.thickness;
  const tr = sizedBox(d, p, () => {
    const w = wallsOf(d);
    for (const e of one ? ['e0', 'e3'] : ['e0']) if (w[e]) deletePanel(d, w[e]);
  });
  if (!tr) return;
  const w = wallsOf(d);
  if (!one) {
    // the sides slope from the back's top to a short edge at the base's front (e1 runs from the front, e3 to it)
    const H = d.panels[w.e2]?.h ?? Number(p.height);
    const drop = H - halfLip(t);
    if (w.e1) setWallCorner(d, w.e1, 'tl', { dx: 0, dy: -drop });
    if (w.e3) setWallCorner(d, w.e3, 'tr', { dx: 0, dy: -drop });
    reseam(d, d.trays[tr].cornerKind);
    if (p.clamp === 'holes')
      for (const e of ['e1', 'e3'] as const) {
        const P = w[e] && d.panels[w[e]];
        const at = P ? clampHoles(P.w, P.h, t) : null;
        if (!P || !at) continue;
        // e1's back is at its far end, e3's at its start
        for (const q of at) addDetail(d, P.id, 'roundrect', 'cut', e === 'e1' ? q.x : P.w - q.x, q.y, CLAMP, CLAMP);
      }
  }
  if (p.hang === 'keyholes' && w.e2) hangByKeyholes(d, w.e2);
  solve(d);
  nameAll(d, role);
}

export const bookend: TemplateDef = {
  id: 'bookend',
  version: 2,
  name: 'sen.bookend',
  description: 'sen.bookend.desc',
  word: 'sen.bookend',
  status: 'beta',
  materials: ['plywood', 'corrugated'],
  canMake: boardStock,
  fallback: () => 'box',
  params: [
    num('width', 'sen.width', 60, 250, 120),
    num('depth', 'sen.depth', 60, 250, 120),
    num('height', 'sen.height', 60, 300, 150),
    sizeAsWord(() => bookend),
    {
      key: 'ends', label: 'sen.ends', type: 'choice', default: 'triangles',
      options: [{ value: 'triangles', label: 'sen.ends.triangles' }, { value: 'one', label: 'sen.ends.one' }],
      allowed: (v, p, m) => cleanWith(bookend, m, p, 'ends', v),
      why: () => 'sen.why.engine',
      affects: ['walls'],
    },
    {
      key: 'hang', label: 'sen.hang', type: 'choice', default: 'none', addon: { off: 'none' },
      options: [{ value: 'none', label: 'sen.hang.none' }, { value: 'keyholes', label: 'sen.hang.keyholes' }],
      allowed: (v, p, m) => v === 'none' || (Number(p.width) >= 80 && cleanWith(bookend, m, p, 'hang', v)),
      why: () => 'sen.why.hangRoom',
      affects: ['walls'],
    },
    {
      key: 'clamp', label: 'sen.clamp', type: 'choice', default: 'none', addon: { off: 'none' },
      options: [{ value: 'none', label: 'sen.clamp.none' }, { value: 'holes', label: 'sen.clamp.holes' }],
      // on triangular sides with room for both holes
      allowed: (v, p, m) => v === 'none' || ((p.ends ?? 'one') === 'triangles' && !!clampHoles(Number(p.depth), Number(p.height), m.thickness) && cleanWith(bookend, m, p, 'clamp', v)),
      why: () => 'sen.why.clampRoom',
      affects: ['walls'],
    },
  ],
  generate: generateBookend,
  sentence: { main: 'sen.s.bookend' },
};
bookend.limits = sheetLimits(bookend, { width: 60, depth: 60, height: 60 });
bookend.accepts = (m, p) => (cleanAll(bookend, m, p) ? null : 'sen.why.engineSize');

// --- the sliding-lid box ---

/** Milestone 178: room for `n` spaces across a sliding-lid box `W` wide inside, each 20 mm or more. */
const partsFit = (W: number, t: number, n: number) => (W - (n - 1) * t) / n >= 20;

/** The play a sliding lid has in its grooves (each side): a tenth of the board, never less than the fit or 0.3 mm. */
export const slidePlay = (t: number, c: number) => Math.max(c, 0.1 * t, 0.3);

function generateSlideBox(d: Parameters<TemplateDef['generate']>[0], p: Params, role: Role) {
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height);
  const t = d.material.thickness, play = slidePlay(t, d.material.clearance);
  // the walls rise past the lid: its groove (t and the play over and under it), an upper rail over it and a web above
  // that, so the rail's slots are not at the wall's edge; the front stops at the lid's underside, so the lid slides
  // out over it
  const groove = t + 2 * play, top = H + groove + t + Math.max(minWeb(d.material), t);
  if (!boardBoxRect(d, W, D, top)) return;
  const w = wallsOf(d);
  if (!w.e0) return;
  const front = d.panels[w.e0];
  setCustomHeight(d, w.e0, true);
  setPanelSize(d, w.e0, undefined, H - front.frame.o[1]);
  solve(d);
  const ins = insideOf(d);
  if (!ins) return;
  // the rails: on each side wall's inner face, one under the lid (its top at H) and one over it; a strip three
  // boards wide, tabbed into the side wall and resting against the front and back walls at its ends
  const r = 3 * t, run = ins.zF - ins.zB;
  const rails: string[] = [];
  for (const [x0, sgn] of [[ins.xL, 1], [ins.xR, -1]] as const)
    for (const y of [H - t, H + groove]) {
      const x = sgn > 0 ? x0 : x0 - r;
      const id = addFreePanel(d, { frame: { o: [x, y, ins.zF], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: [{ x: 0, y: 0 }, { x: r, y: 0 }, { x: r, y: run }, { x: 0, y: run }] });
      if (id) rails.push(id);
    }
  // the lid: across between the side walls less the play, from over the front wall to the back wall less the play;
  // drawn slid a third of the way out, so its picture and the stage show how it opens
  const lidW = ins.xR - ins.xL - 2 * play, lidD = run + t - play;
  const out = Math.round(lidD / 3);
  const lid = addFreePanel(d, { frame: { o: [ins.xL + play, H + play, ins.zF + t + out], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: [{ x: 0, y: 0 }, { x: lidW, y: 0 }, { x: lidW, y: lidD }, { x: 0, y: lidD }] });
  solve(d);
  for (const id of rails) {
    connectSeams(d, id);
    for (const e of ['e0', 'e2']) if (w[e]) restOn(d, id, w[e]);
  }
  // a thumb hole near the lid's front edge, to pull it
  if (lid && lidW > 40) addDetail(d, lid, 'circle', 'cut', lidW / 2, Math.min(18, lidD / 5), 18, 18);
  // milestone 178 (boxes.py's CompartmentBox): partitions front to back under the lid, on the base and between the
  // front and back walls, their tops a web below the front's so its slots have board round them
  const n = Math.round(Number(p.parts ?? 1));
  const parts: string[] = [];
  if (n > 1) {
    const web = Math.max(minWeb(d.material), t), sw = (ins.xR - ins.xL - (n - 1) * t) / n;
    for (let i = 1; i < n; i++) {
      const x = ins.xL + i * sw + (i - 1) * t;
      const id = addFreePanel(d, { frame: { o: [x, ins.floor, ins.zF], u: [0, 0, -1], v: [0, 1, 0] }, side: 1, outer: [{ x: 0, y: 0 }, { x: run, y: 0 }, { x: run, y: H - web - ins.floor }, { x: 0, y: H - web - ins.floor }] });
      if (id) parts.push(id);
    }
    solve(d);
    for (const id of parts) connectSeams(d, id);
  }
  solve(d);
  nameAll(d, role, { ...(lid ? { lid } : {}), ...Object.fromEntries(rails.map((x, i) => [`rail-${i + 1}`, x])), ...Object.fromEntries(parts.map((x, i) => [`partition-${i + 1}`, x])) });
}

export const slideBox: TemplateDef = {
  id: 'slideBox',
  version: 1,
  name: 'sen.slideBox',
  description: 'sen.slideBox.desc',
  word: 'sen.slideBox',
  status: 'beta',
  materials: ['plywood', 'corrugated'],
  canMake: boardStock,
  fallback: () => 'box',
  fallbackWords: { lid: 'liftoff' },
  params: [
    num('width', 'sen.width', 60, 280, 140),
    num('depth', 'sen.depth', 50, 280, 100),
    num('height', 'sen.height', 20, 200, 50),
    // milestone 178 (BOXES_PLYWOOD_PLAN.md §3.2, boxes.py's CompartmentBox): spaces under the lid, on plywood
    {
      key: 'parts', label: 'sen.parts', type: 'choice', default: 1, addon: { off: 1 },
      options: [1, 2, 3, 4, 5].map((v) => ({ value: v, label: `sen.parts.${v}` as MsgKey })),
      allowed: (v, p, m) => Number(v) === 1 || (m.kind === 'plywood' && partsFit(Number(p.width), m.thickness, Number(v)) && cleanWith(slideBox, m, p, 'parts', v)),
      why: (v, p, m) => (m.kind !== 'plywood' ? 'sen.why.plyOnly' : !partsFit(Number(p.width), m.thickness, Number(v)) ? 'sen.why.spaceSmall' : 'sen.why.engine'),
      affects: ['dividers'],
    },
  ],
  generate: generateSlideBox,
  sentence: { main: 'sen.s.slideBox' },
};
slideBox.limits = sheetLimits(slideBox, { width: 60, depth: 50, height: 20 });
slideBox.accepts = (m, p) => (cleanAll(slideBox, m, p) ? null : 'sen.why.engineSize');
