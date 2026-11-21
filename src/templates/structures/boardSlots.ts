// Slotted boards (milestone 165, BOXES_PRESETS_PLAN.md §3): boards of their own, none grown off another, held by
// half-slots where they cross and by tabs in slots where one stands on another's face; no box, no base. For plywood
// and 4 mm corrugated only (`boardStock`). Constructions read in boxes.py (a behaviour reference only) and written
// fresh over the free boards of the shape modeller (`addFreePanel`, `connectSeams`).
//   a laptop stand  two wedges crossing in an X, the laptop on their sloped tops against a lip (laptopstand);
//   a grid insert   boards crossing in half-slots, a grid of spaces with no box, to drop into one (trayinsert);
//   a shelf         two sides, level shelves between them and a back (storageshelf, wallrack);
//   a bottle rack   a front and a back with a row of round holes, for necks and bodies, held apart by two rails
//                   (bottlestack, winerack).
import type { Design, MaterialProfile, P2, V3 } from '../../model/types';
import type { MsgKey } from '../../i18n';
import type { ParamDef, Params, TemplateDef } from '../types';
import { SPACES_MAX } from '../types';
import { addDetail, addFreePanel, connectSeams, solve } from '../../model/ops';
import { MIN_COMPARTMENT } from '../../model/dividers';
import { minWeb } from '../../model/materials';
import { boardStock } from './boards';
import { cleanAll } from './box';
import { sheetLimits } from './shaped';

type Role = (name: string, id: string) => void;
const num = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'number', unit: 'mm', min, max, default: dflt });
const int = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'int', min, max, default: dflt });

/** A board standing upright on the floor, `o` its first corner, running along `u` (level), its outline in (along, up). */
function upright(d: Design, o: V3, u: V3, outer: P2[]): string | null {
  return addFreePanel(d, { frame: { o, u, v: [0, 1, 0] }, side: 1, outer });
}

/** A board lying level at height `y` (its underside), its corner at (x, z), `w` along x and `dz` along z. */
function level(d: Design, x: number, y: number, z: number, w: number, dz: number): string | null {
  return addFreePanel(d, { frame: { o: [x, y, z + dz], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: dz }, { x: 0, y: dz }] });
}

const rect = (w: number, h: number): P2[] => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];

/** Join every board to the boards it meets (half-slots, tabs in slots), then name them in order. */
function joinAll(d: Design, ids: (string | null)[], role: Role, names: string[]) {
  solve(d);
  for (const id of ids) if (id) connectSeams(d, id);
  solve(d);
  ids.forEach((id, i) => id && role(names[i] ?? `part-${i + 1}`, id));
}

const boards: Pick<TemplateDef, 'materials' | 'canMake' | 'fallback' | 'status' | 'version'> = {
  version: 1,
  status: 'beta',
  materials: ['plywood', 'corrugated'],
  canMake: boardStock,
  fallback: () => 'box',
};

// --- the laptop stand ---

/** The wedge of a laptop stand: its length along the floor, and its height at the back and at the front. */
function wedge(depth: number, angle: number, lip: number) {
  const a = (angle * Math.PI) / 180;
  // under the laptop's diagonal: the two wedges cross under its middle, each along a diagonal of its footprint
  const run = Math.SQRT2 * depth * Math.cos(a);
  const low = 12, rise = depth * Math.sin(a);
  return { run, low, rise, lip };
}

function generateLaptopStand(d: Design, p: Params, role: Role) {
  const { run, low, rise, lip } = wedge(Number(p.depth), Number(p.angle), Number(p.lip));
  const nub = Math.max(10, 3 * d.material.thickness);
  // along the wedge: the front's lip, then the sloped top up to the back
  const at = (x: number) => low + (rise * x) / run;
  const outer: P2[] = [{ x: 0, y: 0 }, { x: run, y: 0 }, { x: run, y: at(run) }, { x: nub, y: at(nub) }, { x: nub, y: at(nub) + lip }, { x: 0, y: at(nub) + lip }];
  const ids = [-45, 45].map((deg) => {
    const r = (deg * Math.PI) / 180;
    const u: V3 = [Math.sin(r), 0, -Math.cos(r)];
    // from the front (z +) to the back (z -), the two crossing at the origin
    return upright(d, [(-u[0] * run) / 2, 0, (-u[2] * run) / 2], u, outer);
  });
  joinAll(d, ids, role, ['wedge-1', 'wedge-2']);
}

export const laptopStand: TemplateDef = {
  ...boards,
  id: 'laptopStand',
  name: 'sen.laptopStand',
  description: 'sen.laptopStand.desc',
  word: 'sen.laptopStand',
  params: [
    num('depth', 'sen.laptopDepth', 150, 350, 240),
    { key: 'angle', label: 'tpl.angle', type: 'choice', options: ([10, 15, 20, 25] as const).map((a) => ({ value: a, label: `sen.tilt${a}` as MsgKey })), default: 15 },
    num('lip', 'sen.lipHeight', 6, 30, 12),
  ],
  generate: generateLaptopStand,
  sentence: { main: 'sen.s.laptopStand' },
};
laptopStand.limits = sheetLimits(laptopStand, { depth: 150 });
laptopStand.accepts = (m, p) => (cleanAll(laptopStand, m, p) ? null : 'sen.why.engineSize');

// --- the grid insert ---

/** How many spaces of at least `MIN_COMPARTMENT` fit across `L` with boards `t` thick between them. */
const mostSpaces = (L: number, t: number) => Math.max(1, Math.min(SPACES_MAX, Math.floor((L + t) / (MIN_COMPARTMENT + t) + 1e-9)));

function generateGridInsert(d: Design, p: Params, role: Role) {
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height), t = d.material.thickness;
  const nx = Math.round(Number(p.nx)), ny = Math.round(Number(p.ny));
  const ids: (string | null)[] = [], names: string[] = [];
  // boards running front to back, between the spaces across; and boards running across, between the rows
  const cw = (W - (nx - 1) * t) / nx, cd = (D - (ny - 1) * t) / ny;
  for (let i = 1; i < nx; i++) {
    const x = -W / 2 + i * cw + (i - 1) * t;
    ids.push(upright(d, [x, 0, D / 2], [0, 0, -1], rect(D, H)));
    names.push(`across-${i}`);
  }
  for (let j = 1; j < ny; j++) {
    const z = D / 2 - j * cd - (j - 1) * t;
    ids.push(upright(d, [-W / 2, 0, z], [1, 0, 0], rect(W, H)));
    names.push(`row-${j}`);
  }
  joinAll(d, ids, role, names);
}

export const gridInsert: TemplateDef = {
  ...boards,
  id: 'gridInsert',
  name: 'sen.gridInsert',
  description: 'sen.gridInsert.desc',
  word: 'sen.gridInsert',
  params: [
    num('width', 'sen.width', 40, 300, 150),
    num('depth', 'sen.depth', 40, 300, 100),
    num('height', 'sen.height', 15, 150, 40),
    int('nx', 'sen.nx', 2, SPACES_MAX, 3),
    int('ny', 'sen.ny', 2, SPACES_MAX, 2),
  ],
  generate: generateGridInsert,
  sentence: { main: 'sen.s.gridInsert' },
};
gridInsert.limits = (m: MaterialProfile, p: Params) => ({
  nx: { max: mostSpaces(Number(p.width), m.thickness), why: 'sen.why.spaceSmall' as MsgKey },
  ny: { max: mostSpaces(Number(p.depth), m.thickness), why: 'sen.why.spaceSmall' as MsgKey },
});
gridInsert.accepts = (m, p) => (cleanAll(gridInsert, m, p) ? null : 'sen.why.engineSize');

// --- the shelf ---

function generateShelf(d: Design, p: Params, role: Role) {
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height), t = d.material.thickness;
  const n = Math.round(Number(p.shelves));
  const ids: (string | null)[] = [], names: string[] = [];
  // the sides, standing front to back, their inner faces W apart
  ids.push(upright(d, [-W / 2 - t, 0, D / 2], [0, 0, -1], rect(D, H)), upright(d, [W / 2, 0, D / 2], [0, 0, -1], rect(D, H)));
  names.push('side-1', 'side-2');
  // the back, between the sides, set in from their back edges (and the top shelf down from their tops) by a web, so
  // the slots that hold it are not at an edge
  const web = Math.max(minWeb(d.material), t);
  ids.push(upright(d, [-W / 2, 0, -D / 2 + web], [1, 0, 0], rect(W, H)));
  names.push('back');
  // the shelves, evenly from a little above the floor to the top, between the sides and in front of the back
  const bottom = Math.max(10, 3 * t), top = H - t - web;
  for (let k = 0; k < n; k++) {
    const y = bottom + ((top - bottom) * k) / (n - 1);
    ids.push(level(d, -W / 2, y, -D / 2 + web + t, W, D - web - t));
    names.push(`shelf-${k + 1}`);
  }
  joinAll(d, ids, role, names);
}

export const shelf: TemplateDef = {
  ...boards,
  id: 'shelf',
  name: 'sen.shelf',
  description: 'sen.shelf.desc',
  word: 'sen.shelf',
  params: [
    num('width', 'sen.width', 60, 300, 200),
    num('depth', 'sen.depth', 40, 250, 100),
    num('height', 'sen.height', 60, 300, 200),
    int('shelves', 'sen.shelves', 2, 5, 3),
  ],
  generate: generateShelf,
  sentence: { main: 'sen.s.shelf' },
};
shelf.limits = sheetLimits(shelf, { width: 60, depth: 40, height: 60 });
shelf.accepts = (m, p) => (cleanAll(shelf, m, p) ? null : 'sen.why.engineSize');

// --- the bottle rack ---

/** The holes a bottle rack's boards have room for across `W`: bodies `body` across, with a web between and round them. */
const bottlesIn = (W: number, body: number, web: number) => Math.max(0, Math.floor((W - web) / (body + web)));

function generateBottleRack(d: Design, p: Params, role: Role) {
  const n = Math.round(Number(p.bottles)), body = Number(p.body), neck = Math.max(20, Math.round(body * 0.42));
  const t = d.material.thickness, web = Math.max(8, 3 * t);
  const W = n * body + (n + 1) * web, H = body + 2 * web + 20, D = Number(p.depth);
  const ids: (string | null)[] = [], names: string[] = [];
  // the front holds the necks, the back the bodies, the holes at one height so a bottle lies level
  // each board's material towards the inside: the front from D/2 − t to D/2, the back from −D/2 to −D/2 + t
  const front = upright(d, [-W / 2, 0, D / 2 - t], [1, 0, 0], rect(W, H));
  const back = upright(d, [-W / 2, 0, -D / 2], [1, 0, 0], rect(W, H));
  ids.push(front, back);
  names.push('front', 'back');
  const cy = 20 + web + body / 2;
  for (let i = 0; i < n; i++) {
    const cx = web + body / 2 + i * (body + web);
    if (front) addDetail(d, front, 'circle', 'cut', cx, cy, neck, neck);
    if (back) addDetail(d, back, 'circle', 'cut', cx, cy, body, body);
  }
  // two rails under the holes, between the boards, holding them apart
  const rail = Math.min(40, 20 + web - 2);
  for (const [k, x] of [[1, -W / 2 + web], [2, W / 2 - web - rail]] as const) {
    ids.push(level(d, x, 20 + web / 2 - t, -D / 2 + t, rail, D - 2 * t));
    names.push(`rail-${k}`);
  }
  joinAll(d, ids, role, names);
}

export const bottleRack: TemplateDef = {
  ...boards,
  id: 'bottleRack',
  name: 'sen.bottleRack',
  description: 'sen.bottleRack.desc',
  word: 'sen.bottleRack',
  params: [
    int('bottles', 'sen.bottles', 1, 6, 3),
    num('body', 'sen.bottleBody', 50, 100, 78),
    num('depth', 'sen.depth', 100, 300, 180),
  ],
  generate: generateBottleRack,
  sentence: { main: 'sen.s.bottleRack' },
};
// as many bottles as one sheet's width holds
bottleRack.limits = (m: MaterialProfile, p: Params) => {
  const web = Math.max(8, 3 * m.thickness);
  return { bottles: { max: Math.max(1, Math.min(6, bottlesIn(Math.min(m.sheetW, m.sheetH) - 10, Number(p.body), web))), why: 'sen.why.sheet' as MsgKey } };
};
bottleRack.accepts = (m, p) => (cleanAll(bottleRack, m, p) ? null : 'sen.why.engineSize');
