// Boxes of boards with a shape of their own (milestone 178, BOXES_PLYWOOD_PLAN.md §3.2), plywood only. Constructions
// read in boxes.py (a behaviour reference only: THIRD_PARTY.md) and written fresh over the box kit (boards.ts) and
// free boards (`addFreePanel`, `connectSeams`).
//   a console          a box whose top slopes from a low front up to the back, a panel set between the side walls a
//                      web below their tops (console); without a front it is a wedge, a ramp up a step (ramp);
//   a dispenser        a tall box with a front held between the side walls clear of the base, so the lowest of a stack
//                      slides out under it, a viewing slot up the front and a notch in the base for a finger (dispenser);
//   a castle tower     a tall box whose walls' tops are cut in crenels, arrow slits in its walls (castle);
//   a Gridfinity base  a tray of 42 mm cells: a plate with an opening for each, raised off the base so bins' feet drop
//                      in (gridfinitybase);
//   a cutlery caddy    a tray with a partition along its middle that rises above the walls as a handle, and spaces
//                      across each half (silverwarebox).
import type { Design, P2 } from '../../model/types';
import type { MsgKey } from '../../i18n';
import type { ParamDef, Params, TemplateDef } from '../types';
import { addDetail, addFreePanel, addWallInsert, connectSeams, deletePanel, setCustomHeight, setPanelSize, setWallCorner, solve } from '../../model/ops';
import { minWeb } from '../../model/materials';
import { setBoxSize } from '../../model/boxSize';
import { boardBoxRect, plywoodOnly } from './boards';
import { cleanAll, cleanWith, mainTray } from './box';
import { nameAll, reseam, sheetLimits, wallsOf } from './shaped';
import { insideOf } from './boardBoxes';

type Role = (name: string, id: string) => void;
const num = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'number', unit: 'mm', min, max, default: dflt });
const int = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'int', min, max, default: dflt });
const rect = (w: number, h: number): P2[] => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
/** The web a slot keeps from a board's edge: the material's least, never under its thickness. */
const webOf = (d: Design) => Math.max(minWeb(d.material), d.material.thickness);

const plywood: Pick<TemplateDef, 'materials' | 'canMake' | 'fallback' | 'status' | 'version'> = {
  version: 1,
  status: 'beta',
  materials: ['plywood'],
  canMake: plywoodOnly,
  fallback: () => 'box',
};

/** Join every board to the boards it meets, then name them (the box's own by its roles, these first). */
function finish(d: Design, ids: (string | null)[], names: string[], role: Role) {
  solve(d);
  for (const id of ids) if (id) connectSeams(d, id);
  solve(d);
  const first: Record<string, string> = {};
  ids.forEach((id, i) => id && (first[names[i]] = id));
  nameAll(d, role, first);
}

// --- the console ---

/** The console's panel slant (degrees) for these words, about as built (outside sizes, plywood). */
function consoleSlant(m: { thickness: number }, p: Params): number {
  const t = m.thickness, web = Math.max(t, 3) + t + 2;
  const F = p.frontWall === 'none' ? t : Math.min(Number(p.front), Number(p.height) - 20);
  return (Math.atan((Number(p.height) - web - 2 * t - F) / (Number(p.depth) - t)) * 180) / Math.PI;
}

function generateConsole(d: Design, p: Params, role: Role) {
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height);
  const wedge = p.frontWall === 'none';
  if (!boardBoxRect(d, W, D, H)) return;
  const t = d.material.thickness, web = webOf(d);
  let w = wallsOf(d);
  if (wedge && w.e0) {
    // a wedge: no front, the panel from the base's front edge up to the back (boxes.py's Ramp)
    deletePanel(d, w.e0);
    solve(d);
    w = wallsOf(d);
  }
  const ins = insideOf(d);
  if (!ins) return;
  const F = wedge ? ins.floor : Math.min(Number(p.front), H - 20);
  if (!wedge && w.e0) {
    setCustomHeight(d, w.e0, true);
    setPanelSize(d, w.e0, undefined, F);
  }
  // the panel's underside from the front's top (at the front face) up to the back wall's inner face, its top face a
  // web below the back wall's top; the side walls' tops run a web above the panel, parallel to it
  // (the panel a little lower than a web under the back's top: the side walls' tops, parallel to it, then keep a web
  // over its slots at the back too). A wedge's foot stands back from the base's front edge by as much as its square
  // end leans forward, so the whole foot is on the base
  const drop = web + t + 2;
  let zF = D / 2, run = zF - ins.zB;
  let a = Math.atan((H - drop - t - F) / run);
  for (let k = 0; k < 6; k++) {
    if (wedge) zF = D / 2 - t * Math.sin(a) - 1;
    run = zF - ins.zB;
    a = Math.atan((H - drop - t / Math.cos(a) - F) / run);
  }
  const len = run / Math.cos(a);
  const rise = (D / 2 - -D / 2) * Math.tan(a);
  // e1 runs from the front, e3 to it
  if (w.e1) setWallCorner(d, w.e1, 'tl', { dx: 0, dy: -rise });
  if (w.e3) setWallCorner(d, w.e3, 'tr', { dx: 0, dy: -rise });
  reseam(d, d.trays[mainTray(d)!].cornerKind);
  const panel = addFreePanel(d, { frame: { o: [ins.xL, F, zF], u: [1, 0, 0], v: [0, Math.sin(a), -Math.cos(a)] }, side: 1, outer: rect(ins.xR - ins.xL, len) });
  finish(d, [panel], ['panel'], role);
}

export const consoleBox: TemplateDef = {
  ...plywood,
  id: 'console',
  name: 'sen.console',
  description: 'sen.console.desc',
  word: 'sen.console',
  params: [
    num('width', 'sen.width', 60, 300, 160),
    num('depth', 'sen.depth', 60, 250, 120),
    // from a 45 mm box it was a box with a flat top: tall enough for a slope
    num('height', 'sen.backHeight', 90, 250, 110),
    num('front', 'sen.frontHeight', 15, 150, 30),
    // boxes.py's Ramp: no front, the panel from the base's front edge (the front's height is then not used)
    {
      key: 'frontWall', label: 'sen.frontWall', type: 'choice', default: 'low', addon: { off: 'low' },
      options: [{ value: 'low', label: 'sen.frontWall.low' }, { value: 'none', label: 'sen.frontWall.none' }],
      allowed: (v, p, m) => v === 'low' || cleanWith(consoleBox, m, p, 'frontWall', v),
      why: () => 'sen.why.engine',
      affects: ['walls'],
    },
  ],
  generate: generateConsole,
  sentence: { main: 'sen.s.console' },
};
consoleBox.limits = (m, p) => ({
  ...sheetLimits(consoleBox, { width: 60, depth: 60, height: 90 })(m, p),
  // the front below the back, with room for the panel's slant
  front: { max: Math.max(15, Math.min(150, Number(p.height) - 30)), why: 'sen.why.frontRoom' as MsgKey },
});
// the panel at 25° or steeper (a wedge 33°): flatter, it is a lid more than a slope, and a wedge's foot on thick
// plywood no longer sits on the base
consoleBox.accepts = (m, p) => (consoleSlant(m, p) < (p.frontWall === 'none' ? 33 : 25) ? 'sen.why.slopeLow' : cleanAll(consoleBox, m, p) ? null : 'sen.why.engineSize');

// --- the dispenser ---

function generateDispenser(d: Design, p: Params, role: Role) {
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height), gap = Number(p.slot);
  if (!boardBoxRect(d, W, D, H)) return;
  const tr = mainTray(d)!;
  d.sizeAs = 'inside';
  setBoxSize(d, tr, { w: W, d: D, h: H }, 'inside');
  solve(d);
  const t = d.material.thickness, web = webOf(d);
  const w0 = wallsOf(d).e0;
  if (w0) deletePanel(d, w0);
  solve(d);
  const ins = insideOf(d);
  if (!ins) return;
  const base = d.panels[d.trays[tr].baseId];
  const Hw = d.trays[tr].height;
  // the front, between the side walls, a web in from their front edges, its foot `gap` above the base and its top a
  // web below the side walls' tops, so its slots in them have board round them
  const zf = base.frame.o[2] - web - t;
  const fh = Hw - web - ins.floor - gap;
  const front = addFreePanel(d, { frame: { o: [ins.xL, ins.floor + gap, zf], u: [1, 0, 0], v: [0, 1, 0] }, side: 1, outer: rect(ins.xR - ins.xL, fh) });
  if (front) {
    // a viewing slot up the front, a third of its width
    const fw = ins.xR - ins.xL, vw = Math.max(8, fw / 3), vh = fh - 2 * Math.max(15, web + 6);
    if (vh > 20) addDetail(d, front, 'roundrect', 'cut', fw / 2, fh / 2, vw, vh);
  }
  // a finger hole in the base by its front, to push the lowest one out (a notch in its edge would split the open edge)
  const notch = Math.min(25, base.w / 4);
  addDetail(d, base.id, 'circle', 'cut', base.w / 2, Math.max(t + web, 4) + notch / 2, notch, notch);
  finish(d, [front], ['front'], role);
}

export const dispenser: TemplateDef = {
  ...plywood,
  id: 'dispenser',
  name: 'sen.dispenser',
  description: 'sen.dispenser.desc',
  word: 'sen.dispenser',
  params: [
    num('width', 'sen.width', 50, 250, 100),
    num('depth', 'sen.depth', 50, 250, 100),
    // tall enough to hold a stack (from a 45 mm box it was a box)
    num('height', 'sen.height', 100, 300, 150),
    num('slot', 'sen.slotHeight', 5, 40, 10),
  ],
  generate: generateDispenser,
  sentence: { main: 'sen.s.dispenser' },
};
dispenser.limits = sheetLimits(dispenser, { width: 50, depth: 50, height: 100 });
dispenser.accepts = (m, p) => (cleanAll(dispenser, m, p) ? null : 'sen.why.engineSize');

// --- the castle tower ---

/** A crenel's width and depth (mm), and the least merlon at a wall's ends (clear of the corner's fingers). */
const crenel = (t: number) => ({ c: Math.max(12, 3 * t), dep: Math.max(12, 3 * t), end: Math.max(12, 2 * t + 6) });

/** The crenels along a wall `L` wide: their spans in mm from its start. */
export function crenelSpans(L: number, t: number): [number, number][] {
  const { c, end } = crenel(t);
  const n = Math.floor((L - 2 * end + c) / (2 * c) + 1e-9);
  if (n < 1) return [];
  const e = (L - (2 * n - 1) * c) / 2;
  return Array.from({ length: n }, (_, i) => [e + 2 * i * c, e + 2 * i * c + c] as [number, number]);
}

function generateCastle(d: Design, p: Params, role: Role) {
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height);
  if (!boardBoxRect(d, W, D, H)) return;
  const tr = mainTray(d)!;
  const t = d.material.thickness;
  const { dep } = crenel(t);
  const w = wallsOf(d);
  for (const e of ['e0', 'e1', 'e2', 'e3']) {
    const P = w[e] && d.panels[w[e]];
    if (!P || P.sketch.kind !== 'wall') continue;
    const L = P.w, eps = 0.2 / L;
    for (const [s0, s1] of crenelSpans(L, t)) {
      addWallInsert(d, P.id, 'e2', s0 / L, 0);
      addWallInsert(d, P.id, 'e2', s0 / L + eps, -dep);
      addWallInsert(d, P.id, 'e2', s1 / L - eps, -dep);
      addWallInsert(d, P.id, 'e2', s1 / L, 0);
    }
    // an arrow slit in the middle of each wall
    if (P.h > 80) addDetail(d, P.id, 'roundrect', 'cut', L / 2, P.h * 0.55, Math.max(5, t + 2), Math.min(30, P.h / 5));
  }
  reseam(d, d.trays[tr].cornerKind);
  solve(d);
  nameAll(d, role);
}

export const castle: TemplateDef = {
  ...plywood,
  id: 'castle',
  name: 'sen.castle',
  description: 'sen.castle.desc',
  word: 'sen.castle',
  params: [
    num('width', 'sen.width', 60, 250, 90),
    num('depth', 'sen.depth', 60, 250, 90),
    num('height', 'sen.height', 80, 300, 160),
  ],
  generate: generateCastle,
  sentence: { main: 'sen.s.castle' },
};
castle.limits = sheetLimits(castle, { width: 60, depth: 60, height: 80 });
castle.accepts = (m, p) => (cleanAll(castle, m, p) ? null : 'sen.why.engineSize');

// --- the Gridfinity base ---

/** Gridfinity's pitch and the opening each cell has (boxes.py's defaults), and the play round the grid. */
const GRID = { pitch: 42, opening: 38, play: 0.5 };
/** How far the plate stands off the base, so a bin's feet go through it. */
const FEET = 5;

function generateGridfinity(d: Design, p: Params, role: Role) {
  const nx = Math.round(Number(p.nx)), ny = Math.round(Number(p.ny)), H = Number(p.height);
  const W = nx * GRID.pitch + 2 * GRID.play, D = ny * GRID.pitch + 2 * GRID.play;
  if (!boardBoxRect(d, W, D, H)) return;
  const tr = mainTray(d)!;
  d.sizeAs = 'inside';
  setBoxSize(d, tr, { w: W, d: D, h: H }, 'inside');
  solve(d);
  const ins = insideOf(d);
  if (!ins) return;
  const pw = ins.xR - ins.xL, pd = ins.zF - ins.zB;
  const plate = addFreePanel(d, { frame: { o: [ins.xL, ins.floor + FEET, ins.zF], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: rect(pw, pd) });
  if (plate)
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++) addDetail(d, plate, 'roundrect', 'cut', pw / 2 + (i - (nx - 1) / 2) * GRID.pitch, pd / 2 + (j - (ny - 1) / 2) * GRID.pitch, GRID.opening, GRID.opening);
  finish(d, [plate], ['plate'], role);
}

export const gridfinityBase: TemplateDef = {
  ...plywood,
  id: 'gridfinityBase',
  name: 'sen.gridfinityBase',
  description: 'sen.gridfinityBase.desc',
  word: 'sen.gridfinityBase',
  params: [
    int('nx', 'sen.cellsAcross', 1, 6, 3),
    int('ny', 'sen.cellsDeep', 1, 5, 2),
    num('height', 'sen.wallHeight', 20, 60, 25),
  ],
  generate: generateGridfinity,
  sentence: { main: 'sen.s.gridfinityBase' },
};
// as many cells as one sheet holds
gridfinityBase.limits = (m) => ({
  nx: { max: Math.max(1, Math.min(6, Math.floor((Math.max(m.sheetW, m.sheetH) - 20) / GRID.pitch))), why: 'sen.why.sheet' as MsgKey },
  ny: { max: Math.max(1, Math.min(5, Math.floor((Math.min(m.sheetW, m.sheetH) - 20) / GRID.pitch))), why: 'sen.why.sheet' as MsgKey },
});
gridfinityBase.accepts = (m, p) => (cleanAll(gridfinityBase, m, p) ? null : 'sen.why.engineSize');

// --- the cutlery caddy ---

/** How far the caddy's handle rises above its walls, and its hand hole. */
const HANDLE = { rise: 50, hole: 24 };

function generateCaddy(d: Design, p: Params, role: Role) {
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height), n = Math.round(Number(p.spaces));
  if (!boardBoxRect(d, W, D, H)) return;
  const tr = mainTray(d)!;
  d.sizeAs = 'inside';
  setBoxSize(d, tr, { w: W, d: D, h: H }, 'inside');
  solve(d);
  const ins = insideOf(d);
  if (!ins) return;
  const t = d.material.thickness, web = webOf(d);
  const Hw = d.trays[tr].height;
  const L = ins.xR - ins.xL;
  // the middle partition, side to side on the base, held by the side walls a web below their tops; above that it
  // narrows to a handle rising over the walls, with a hand hole
  const hb = Hw - web - ins.floor, top = Hw + HANDLE.rise - ins.floor;
  const i1 = Math.min(L * 0.2, 40), i2 = i1 + Math.min(15, L * 0.05);
  const mid: P2[] = [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: hb }, { x: L - i1, y: hb }, { x: L - i2, y: top }, { x: i2, y: top }, { x: i1, y: hb }, { x: 0, y: hb }];
  const zc = (ins.zF + ins.zB) / 2 - t / 2;
  const ids: (string | null)[] = [addFreePanel(d, { frame: { o: [ins.xL, ins.floor, zc], u: [1, 0, 0], v: [0, 1, 0] }, side: 1, outer: mid })];
  const names = ['handle'];
  if (ids[0]) addDetail(d, ids[0], 'roundrect', 'cut', L / 2, top - HANDLE.hole / 2 - 12, Math.max(30, L - 2 * i2 - 40), HANDLE.hole);
  // spaces across each half: dividers front to back, from the front (or back) wall to the partition, a web lower
  const half = zc - ins.zB, sw = (L - (n - 1) * t) / n, dh = hb - web;
  for (let i = 1; i < n; i++) {
    const x = ins.xL + i * sw + (i - 1) * t;
    ids.push(addFreePanel(d, { frame: { o: [x, ins.floor, ins.zF], u: [0, 0, -1], v: [0, 1, 0] }, side: 1, outer: rect(ins.zF - zc - t, dh) }));
    ids.push(addFreePanel(d, { frame: { o: [x, ins.floor, zc], u: [0, 0, -1], v: [0, 1, 0] }, side: 1, outer: rect(half, dh) }));
    names.push(`divider-${i}-1`, `divider-${i}-2`);
  }
  finish(d, ids, names, role);
}

export const caddy: TemplateDef = {
  ...plywood,
  id: 'caddy',
  name: 'sen.caddy',
  description: 'sen.caddy.desc',
  word: 'sen.caddy',
  params: [
    num('width', 'sen.width', 120, 300, 220),
    num('depth', 'sen.depth', 80, 220, 140),
    num('height', 'sen.height', 45, 150, 70),
    int('spaces', 'sen.caddySpaces', 1, 4, 2),
  ],
  generate: generateCaddy,
  sentence: { main: 'sen.s.caddy' },
};
caddy.limits = sheetLimits(caddy, { width: 120, depth: 80, height: 45 });
caddy.accepts = (m, p) => (cleanAll(caddy, m, p) ? null : 'sen.why.engineSize');
