// Things that hang on a wall (milestone 179, BOXES_PLYWOOD_PLAN.md §3.3), plywood only. Each hangs by the word *hang
// by* (`hangWord`): screws through keyholes, or a cleat (`hangByCleat`). Constructions read in boxes.py (a behaviour
// reference only: THIRD_PARTY.md) and written fresh over free boards (`addFreePanel`, `connectSeams`) and the box kit:
//   a tool holder   a back and a shelf held out on two braces, its front cut in slots for chisels and screwdrivers, or
//                   round holes, or slots of stepped widths at a slant for wrenches (wallslottedholder,
//                   wallchiselholder, wallwrenchholder);
//   a pliers holder a back and a bar in front of it on braces: pliers hang over the bar (wallpliersholder);
//   wall hooks      a back with J-shaped hooks standing out of it, big ones, or small ones under a shelf for keys
//                   (wallhook, keyholder);
//   a pin row       a back and a plate leaning back on two sides, pins standing out of it (wallpinrow);
//   a roll holder   a back and two arms with a hole each for a dowel or pipe the roll turns on (wallrollholder);
//   a hopper        a tall box on the wall whose front stops short of the base, so what is poured in at the top comes
//                   out into a low tray in front (wallhopper);
//   wall steps      a back, two sides and steps of level boards, each higher one further back, with holes for
//                   screwdrivers (wallstairs);
//   a drill stand   a box of rows whose walls step up towards the back, a drill bit standing in each space, on a desk or
//                   on a wall (drillstand, walldrillbox).
import type { Design, P2, V3 } from '../../model/types';
import type { MsgKey } from '../../i18n';
import type { ParamDef, Params, TemplateDef } from '../types';
import { addDetail, addFreePanel, addWallInsert, connectSeams, setCustomHeight, setPanelSize, setWallCorner, solve } from '../../model/ops';
import { minWeb } from '../../model/materials';
import { setBoxSize } from '../../model/boxSize';
import { boardBoxRect, cleatFits, cleatHeight, cleatSizes, hangByCleat, hangByKeyholes, hangThing, hangWord, plywoodOnly, type CleatAt } from './boards';
import { cleanAll, cleanWith, mainTray } from './box';
import { nameAll, reseam, sheetLimits, wallsOf } from './shaped';
import { insideOf } from './boardBoxes';

type Role = (name: string, id: string) => void;
const num = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'number', unit: 'mm', min, max, default: dflt });
const int = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'int', min, max, default: dflt });
const rect = (w: number, h: number): P2[] => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
const rad = (deg: number) => (deg * Math.PI) / 180;
/** The web a slot keeps from a board's edge: the material's least, never under its thickness. */
const webOf = (d: Design) => Math.max(minWeb(d.material), d.material.thickness);

/**
 * The back: a board standing across, its front face at z = 0 (the wall behind it), from x0, `w` wide and `h` tall, or
 * as tall as a cleat and its stand-off need (the same either way the thing hangs).
 */
function backBoard(d: Design, x0: number, w: number, h: number) {
  const t = d.material.thickness;
  const tall = Math.max(h, cleatHeight(t, Math.max(6, 2 * t), 2 * t + 2 + Math.max(10, 3 * t)));
  return addFreePanel(d, { frame: { o: [x0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] }, side: -1, outer: rect(w, tall) });
}
/** A board standing out of the back's front face at `x` (its material towards −x), its outline in (forward, up). */
const arm = (d: Design, x: number, outer: P2[]) => addFreePanel(d, { frame: { o: [x, 0, 0], u: [0, 0, 1], v: [0, 1, 0] }, side: 1, outer });
/** A board lying level, its underside at `y`, from x across `w`, from its front edge at `z` back `dz` (outline: y = 0 at the front). */
const level = (d: Design, x: number, y: number, z: number, w: number, dz: number, outer?: P2[]) =>
  addFreePanel(d, { frame: { o: [x, y, z], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: outer ?? rect(w, dz) });

/**
 * The room a back keeps for hanging: above what is on it, for keyholes or a cleat's band; below, for the cleat's
 * stand-off. The same either way, so a thing does not change its size with the word.
 */
const hangRoom = (t: number) => ({ top: Math.max(6, 2 * t) + cleatSizes(t).band + 4, foot: 2 * t + 2 + Math.max(10, 3 * t) + 4 });
/** Where a cleat goes on a back `bw` wide: at its top, its stand-off at its foot across its middle half. */
const cleatAt = (t: number, bw: number): CleatAt => ({ stud: { y: 2 * t + 2, h: Math.max(10, 3 * t), x0: bw * 0.25, x1: bw * 0.75 } });

/** Join every board to the boards it meets, hang the back as the words say, then name them. */
function finish(d: Design, p: Params, ids: (string | null)[], names: string[], role: Role, back: string | null, at: CleatAt) {
  solve(d);
  for (const id of ids) if (id) connectSeams(d, id);
  solve(d);
  const cleat = back ? hangThing(d, p, back, undefined, at) : [];
  solve(d);
  ids.forEach((id, i) => id && role(names[i] ?? `part-${i + 1}`, id));
  for (const c of cleat) role(c.name, c.id);
}

const plywood: Pick<TemplateDef, 'materials' | 'canMake' | 'fallback' | 'status' | 'version'> = {
  version: 1,
  status: 'beta',
  materials: ['plywood'],
  canMake: plywoodOnly,
  fallback: () => 'shelf',
};

/** Two braces under a level board, standing out of the back: triangles with a blunt foot, a web inside its front edge. */
function braceOutline(yp: number, D: number, web: number, t: number): P2[] {
  const L = D - web, h = Math.max(20, L * 0.9);
  return [{ x: 0, y: yp - h }, { x: Math.max(6, 2 * t), y: yp - h }, { x: L, y: yp }, { x: 0, y: yp }];
}
const braceHeight = (D: number, web: number) => Math.max(20, (D - web) * 0.9);

// --- the tool holder ---

type ToolKind = 'slots' | 'holes' | 'wrench';

/** A tool holder's cuts across its shelf for these words: each tool's place (its middle from the tools' left), its width, and the shelf's width. */
function toolLayout(p: Params, t: number, web: number): { at: number[]; w: number[]; skew: number; W: number; margin: number } {
  const kind = (p.kind ?? 'slots') as ToolKind, n = Math.round(Number(p.tools)), size = Number(p.size);
  const rib = Math.max(8, 2 * t + 2);
  // a wrench's slots step from a third of the largest up to it, and lean 15° so the wrenches hang side by side
  const w = Array.from({ length: n }, (_, i) => (kind === 'wrench' && n > 1 ? size * (0.35 + (0.65 * i) / (n - 1)) : size));
  const skew = kind === 'wrench' ? Math.tan(rad(15)) : 0;
  const at: number[] = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    const span = w[i] + skew * Number(p.depth) * 0.6;
    at.push(x + rib / 2 + span / 2);
    x += span + rib;
  }
  // the braces at the shelf's ends, a web in from them, and a web between a brace and the first tool
  const margin = 2 * web + t;
  return { at, w, skew, W: x + 2 * margin, margin };
}

/** The shelf's outline (y = 0 at its front edge, its back at y = D): slots cut in from its front, unless it has holes. */
function toolShelf(kind: ToolKind, L: ReturnType<typeof toolLayout>, D: number): P2[] {
  if (kind === 'holes') return rect(L.W, D);
  const sd = D * 0.6;
  const out: P2[] = [{ x: 0, y: D }, { x: 0, y: 0 }];
  for (let i = 0; i < L.at.length; i++) {
    const c = L.margin + L.at[i], h = L.w[i] / 2, s = L.skew * sd;
    // each slot from the front edge back `sd`, its far end shifted `s` across for a wrench, its corners cut off
    const k = Math.min(h * 0.5, 2);
    out.push({ x: c - h, y: 0 }, { x: c - h + s, y: sd - k }, { x: c - h + s + k, y: sd }, { x: c + h + s - k, y: sd }, { x: c + h + s, y: sd - k }, { x: c + h, y: 0 });
  }
  out.push({ x: L.W, y: 0 }, { x: L.W, y: D });
  return out;
}

function generateToolHolder(d: Design, p: Params, role: Role) {
  const kind = (['slots', 'holes', 'wrench'].includes(String(p.kind)) ? p.kind : 'slots') as ToolKind;
  const D = Number(p.depth), t = d.material.thickness, web = webOf(d);
  const L = toolLayout(p, t, web);
  const room = hangRoom(t);
  const yp = room.foot + braceHeight(D, web);
  const bh = yp + t + room.top, bw = L.W;
  const ids: (string | null)[] = [backBoard(d, -bw / 2, bw, bh)];
  const names = ['back'];
  const shelf = level(d, -bw / 2, yp, D, bw, D, toolShelf(kind, L, D));
  ids.push(shelf);
  names.push('shelf');
  if (shelf && kind === 'holes') for (let i = 0; i < L.at.length; i++) addDetail(d, shelf, 'circle', 'cut', L.margin + L.at[i], D * 0.45, L.w[i], L.w[i]);
  for (const x of [-bw / 2 + web + t, bw / 2 - web]) {
    ids.push(arm(d, x, braceOutline(yp, D, web, t)));
    names.push(`brace-${ids.length - 2}`);
  }
  finish(d, p, ids, names, role, ids[0], cleatAt(t, bw));
}

export const toolHolder: TemplateDef = {
  ...plywood,
  id: 'toolHolder',
  name: 'sen.toolHolder',
  description: 'sen.toolHolder.desc',
  word: 'sen.toolHolder',
  params: [
    int('tools', 'sen.tools', 2, 12, 6),
    num('size', 'sen.toolSize', 4, 40, 8),
    num('depth', 'sen.shelfDepth', 40, 150, 60),
    {
      key: 'kind', label: 'sen.toolKind', type: 'choice', default: 'slots',
      options: (['slots', 'holes', 'wrench'] as const).map((v) => ({ value: v, label: `sen.toolKind.${v}` as MsgKey })),
      allowed: (v, p, m) => cleanWith(toolHolder, m, p, 'kind', v),
      why: () => 'sen.why.engine',
    },
    hangWord(() => toolHolder),
  ],
  generate: generateToolHolder,
  sentence: { main: 'sen.s.toolHolder' },
};
toolHolder.limits = (m, p) => {
  const t = m.thickness, web = Math.max(minWeb(m), t);
  const one = toolLayout({ ...p, tools: 1 }, t, web);
  return {
    // as many tools as the sheet's length holds; slots no wider than a third of the shelf's depth from each other
    tools: { max: Math.max(2, Math.min(12, Math.floor((Math.max(m.sheetW, m.sheetH) - 20 - 2 * one.margin) / (one.W - 2 * one.margin)))), why: 'sen.why.sheet' as MsgKey },
    ...sheetLimits(toolHolder, { depth: 40 })(m, p),
  };
};
toolHolder.accepts = (m, p) => (cleanAll(toolHolder, m, p) ? null : 'sen.why.engineSize');

// --- the pliers holder ---

function generatePliersHolder(d: Design, p: Params, role: Role) {
  const n = Math.round(Number(p.bays)), bay = Number(p.bay), D = Number(p.depth), H = Number(p.height);
  const t = d.material.thickness, web = webOf(d);
  const room = hangRoom(t);
  // the braces: one at each end and one between each bay; their top slopes down from the back to the bar (boxes.py's bracing)
  const bw = n * bay + (n + 1) * t + 2 * web;
  const y0 = room.foot + web, hb = H + D * 0.6;
  const bh = y0 + hb + room.top;
  const ids: (string | null)[] = [backBoard(d, -bw / 2, bw, bh)];
  const names = ['back'];
  // the bar: in front of the braces, a web taller than them above and below
  const bar = addFreePanel(d, { frame: { o: [-bw / 2, y0 - web, D], u: [1, 0, 0], v: [0, 1, 0] }, side: 1, outer: rect(bw, H + 2 * web) });
  ids.push(bar);
  names.push('bar');
  for (let i = 0; i <= n; i++) {
    const x = -bw / 2 + web + t + i * (bay + t);
    ids.push(arm(d, x, [{ x: 0, y: y0 }, { x: D, y: y0 }, { x: D, y: y0 + H }, { x: 0, y: y0 + hb }]));
    names.push(`brace-${i + 1}`);
  }
  finish(d, p, ids, names, role, ids[0], cleatAt(t, bw));
}

export const pliersHolder: TemplateDef = {
  ...plywood,
  id: 'pliersHolder',
  name: 'sen.pliersHolder',
  description: 'sen.pliersHolder.desc',
  word: 'sen.pliersHolder',
  params: [
    int('bays', 'sen.bays', 1, 8, 3),
    num('bay', 'sen.bayWidth', 30, 150, 60),
    num('depth', 'sen.barDepth', 20, 80, 40),
    num('height', 'sen.barHeight', 30, 120, 50),
    hangWord(() => pliersHolder),
  ],
  generate: generatePliersHolder,
  sentence: { main: 'sen.s.pliersHolder' },
};
pliersHolder.limits = (m, p) => ({
  ...sheetLimits(pliersHolder, { bay: 30, height: 30 })(m, p),
  bays: { max: Math.max(1, Math.min(8, Math.floor((Math.max(m.sheetW, m.sheetH) - 40) / (Number(p.bay) + m.thickness)))), why: 'sen.why.sheet' as MsgKey },
});
pliersHolder.accepts = (m, p) => (cleanAll(pliersHolder, m, p) ? null : 'sen.why.engineSize');

// --- wall hooks ---

/** A J-shaped hook's outline (forward, up) from its foot at `y0`: a stem on the back, an arm out, the mouth opening up. */
export function hookOutline(mouth: number, t: number, y0: number, stem?: number): P2[] {
  const r = mouth / 2, ht = Math.max(10, 3 * t, mouth * 0.35), R = r + ht;
  const C = { x: ht + r, y: ht + r };
  const hs = stem ?? 2 * R + ht;
  const out: P2[] = [{ x: 0, y: y0 }, { x: C.x, y: y0 }];
  // the outer arc from under the mouth round to the tip, 30° above level; the tip; the inner arc back to the stem
  for (let i = 1; i <= 8; i++) {
    const a = rad(-90 + (120 * i) / 8);
    out.push({ x: C.x + R * Math.cos(a), y: y0 + C.y + R * Math.sin(a) });
  }
  for (let i = 0; i <= 10; i++) {
    const a = rad(30 - (210 * i) / 10);
    out.push({ x: C.x + r * Math.cos(a), y: y0 + C.y + r * Math.sin(a) });
  }
  out.push({ x: ht, y: y0 + hs }, { x: 0, y: y0 + hs });
  return out;
}
const hookSize = (mouth: number, t: number) => {
  const ht = Math.max(10, 3 * t, mouth * 0.35), R = mouth / 2 + ht;
  return { reach: ht + mouth / 2 + R, stem: 2 * R + ht };
};

function generateWallHooks(d: Design, p: Params, role: Role) {
  const n = Math.round(Number(p.hooks)), mouth = Number(p.mouth), shelf = p.shelf === 'shelf';
  const t = d.material.thickness, web = webOf(d);
  const room = hangRoom(t);
  const hk = hookSize(mouth, t);
  const pitch = Math.max(hk.reach * 0.8, mouth + 2 * t + 10, 25);
  // a key board's shelf over the hooks, held out on two braces at its ends
  const sd = Math.max(40, hk.reach + 10);
  const margin = shelf ? 2 * web + t + pitch / 2 : pitch / 2;
  const bw = (n - 1) * pitch + 2 * margin;
  const y0 = room.foot;
  // the shelf's underside over the hooks' stems, its braces' feet no lower than the hooks'
  const ys = y0 + Math.max(hk.stem + 10, braceHeight(sd, web));
  const bh = (shelf ? ys + t : y0 + hk.stem) + room.top;
  const ids: (string | null)[] = [backBoard(d, -bw / 2, bw, bh)];
  const names = ['back'];
  for (let i = 0; i < n; i++) {
    const x = -bw / 2 + margin + i * pitch + t / 2;
    ids.push(arm(d, x, hookOutline(mouth, t, y0)));
    names.push(`hook-${i + 1}`);
  }
  if (shelf) {
    ids.push(level(d, -bw / 2, ys, sd, bw, sd));
    names.push('shelf');
    for (const x of [-bw / 2 + web + t, bw / 2 - web]) {
      ids.push(arm(d, x, braceOutline(ys, sd, web, t)));
      names.push(`brace-${ids.length - n - 2}`);
    }
  }
  finish(d, p, ids, names, role, ids[0], cleatAt(t, bw));
}

export const wallHooks: TemplateDef = {
  ...plywood,
  id: 'wallHooks',
  name: 'sen.wallHooks',
  description: 'sen.wallHooks.desc',
  word: 'sen.wallHooks',
  params: [
    int('hooks', 'sen.hooks', 1, 12, 3),
    num('mouth', 'sen.hookMouth', 10, 80, 30),
    {
      key: 'shelf', label: 'sen.hookShelf', type: 'choice', default: 'none', addon: { off: 'none' },
      options: [{ value: 'none', label: 'sen.hookShelf.none' }, { value: 'shelf', label: 'sen.hookShelf.shelf' }],
      allowed: (v, p, m) => v === 'none' || cleanWith(wallHooks, m, p, 'shelf', v),
      why: () => 'sen.why.engine',
    },
    hangWord(() => wallHooks),
  ],
  generate: generateWallHooks,
  sentence: { main: 'sen.s.wallHooks' },
};
wallHooks.limits = (m, p) => {
  const hk = hookSize(Number(p.mouth), m.thickness);
  const pitch = Math.max(hk.reach * 0.8, Number(p.mouth) + 2 * m.thickness + 10, 25);
  return {
    hooks: { max: Math.max(1, Math.min(12, Math.floor((Math.max(m.sheetW, m.sheetH) - 60) / pitch))), why: 'sen.why.sheet' as MsgKey },
    ...sheetLimits(wallHooks, { mouth: 10 })(m, p),
  };
};
wallHooks.accepts = (m, p) => (cleanAll(wallHooks, m, p) ? null : 'sen.why.engineSize');

// --- the pin row ---

function generatePinRow(d: Design, p: Params, role: Role) {
  const n = Math.round(Number(p.pins)), L = Number(p.pinLength), a = rad(Number(p.angle));
  const t = d.material.thickness, web = webOf(d);
  const room = hangRoom(t);
  const pw = Math.max(12, 3 * t + 4), pitch = Math.max(30, pw + 15);
  // the plate: leaning back by the pins' angle, its foot `zb` out from the back; the sides a web inside its ends
  const hp = Math.max(50, 7 * t + 10), W = n * pitch + 2 * (2 * web + t);
  const y0 = room.foot, zb = hp * Math.sin(a) + Math.max(20, 3 * t);
  const vp: V3 = [0, Math.cos(a), -Math.sin(a)], np: V3 = [0, Math.sin(a), Math.cos(a)];
  const bh = y0 + hp * Math.cos(a) + L * Math.sin(a) + room.top;
  const ids: (string | null)[] = [backBoard(d, -W / 2, W, bh)];
  const names = ['back'];
  // the plate's rear face from (zb, y0) up along vp; its material in front (+np)
  const plate = addFreePanel(d, { frame: { o: [-W / 2, y0, zb], u: [1, 0, 0], v: vp }, side: 1, outer: rect(W, hp) });
  ids.push(plate);
  names.push('plate');
  // the sides: from the back to the plate's rear face, a web inside its foot and its top
  const s0 = web, s1 = hp - web;
  const at = (s: number) => ({ x: zb - s * Math.sin(a), y: y0 + s * Math.cos(a) });
  for (const x of [-W / 2 + web + t, W / 2 - web]) {
    const A = at(s0), B = at(s1);
    ids.push(arm(d, x, [{ x: 0, y: A.y }, A, B, { x: 0, y: B.y }]));
    names.push(`side-${ids.length - 2}`);
  }
  // the pins, square to the plate's front face, from a web above its foot
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + 2 * web + t + (i + 0.5) * pitch + t / 2;
    const o: V3 = [x, y0 + s0 * vp[1] + t * np[1], zb + s0 * vp[2] + t * np[2]];
    ids.push(addFreePanel(d, { frame: { o, u: np, v: vp }, side: 1, outer: rect(L, pw) }));
    names.push(`pin-${i + 1}`);
  }
  finish(d, p, ids, names, role, ids[0], cleatAt(t, W));
}

export const pinRow: TemplateDef = {
  ...plywood,
  id: 'pinRow',
  name: 'sen.pinRow',
  description: 'sen.pinRow.desc',
  word: 'sen.pinRow',
  params: [
    int('pins', 'sen.pins', 2, 12, 6),
    num('pinLength', 'sen.pinLength', 20, 60, 35),
    { key: 'angle', label: 'sen.pinAngle', type: 'choice', options: ([10, 20, 30] as const).map((x) => ({ value: x, label: `sen.pinAngle.${x}` as MsgKey })), default: 20 },
    hangWord(() => pinRow),
  ],
  generate: generatePinRow,
  sentence: { main: 'sen.s.pinRow' },
};
pinRow.limits = (m, p) => ({
  pins: { max: Math.max(2, Math.min(12, Math.floor((Math.max(m.sheetW, m.sheetH) - 60) / Math.max(30, Math.max(12, 3 * m.thickness + 4) + 15)))), why: 'sen.why.sheet' as MsgKey },
  ...sheetLimits(pinRow, { pinLength: 20 })(m, p),
});
pinRow.accepts = (m, p) => (cleanAll(pinRow, m, p) ? null : 'sen.why.engineSize');

// --- the roll holder ---

function generateRollHolder(d: Design, p: Params, role: Role) {
  const RW = Number(p.rollWidth), RD = Number(p.rollSize), dowel = Number(p.dowel);
  const t = d.material.thickness, web = webOf(d);
  const room = hangRoom(t);
  // two arms a little wider apart than the roll, a web in from the back's ends; the dowel's hole clear of the wall by the roll
  const bw = RW + 4 + 2 * t + 2 * web;
  const ah = Math.max(dowel + 4 * web, 40), reach = RD / 2 + 8 + ah / 2;
  const y0 = room.foot;
  const bh = y0 + ah + room.top;
  const ids: (string | null)[] = [backBoard(d, -bw / 2, bw, bh)];
  const names = ['back'];
  // each arm: square at the back, round at its front about the dowel's hole
  const out: P2[] = [{ x: 0, y: y0 }, { x: reach, y: y0 }];
  for (let i = 1; i < 12; i++) {
    const q = rad(-90 + (180 * i) / 12);
    out.push({ x: reach + (ah / 2) * Math.cos(q), y: y0 + ah / 2 + (ah / 2) * Math.sin(q) });
  }
  out.push({ x: reach, y: y0 + ah }, { x: 0, y: y0 + ah });
  for (const x of [-bw / 2 + web + t, bw / 2 - web]) {
    const id = arm(d, x, out);
    if (id) addDetail(d, id, 'circle', 'cut', reach, ah / 2, dowel + 1, dowel + 1);
    ids.push(id);
    names.push(`arm-${ids.length - 1}`);
  }
  finish(d, p, ids, names, role, ids[0], cleatAt(t, bw));
}

export const rollHolder: TemplateDef = {
  ...plywood,
  id: 'rollHolder',
  name: 'sen.rollHolder',
  description: 'sen.rollHolder.desc',
  word: 'sen.rollHolder',
  params: [
    num('rollWidth', 'sen.rollWidth', 60, 400, 280),
    num('rollSize', 'sen.rollSize', 40, 200, 130),
    // the hole a dowel or pipe turns in: 19 mm or more (the hole is 1 mm wider)
    num('dowel', 'sen.dowel', 19, 40, 25),
    hangWord(() => rollHolder),
  ],
  generate: generateRollHolder,
  sentence: { main: 'sen.s.rollHolder' },
};
rollHolder.limits = sheetLimits(rollHolder, { rollWidth: 60, rollSize: 40 });
rollHolder.accepts = (m, p) => (cleanAll(rollHolder, m, p) ? null : 'sen.why.engineSize');

/**
 * Step a side wall's top down towards the front (+z): at each world `z`, from `back` to `front` (mm from the wall's
 * full height, ≤ 0); the front corner at the last step's `front`. Inserts are placed by where `z` falls along the
 * wall's top edge, whichever way the wall's own x runs.
 */
function stepTop(d: Design, wallId: string, steps: { z: number; back: number; front: number }[]) {
  const P = d.panels[wallId];
  if (!P || !steps.length) return;
  const u = P.frame.u, o = P.frame.o, w = P.w, h = P.h;
  // the front corner (x = w when the wall's x runs towards the front) down first: the top edge then runs from the
  // top right corner to the top left one, and an insert is a fraction along that line, pushed off it (as adapt.ts reads them)
  const toFront = u[2] > 0;
  // (the front-most step's front)
  const drop = [...steps].sort((a, b) => b.z - a.z)[0].front;
  setWallCorner(d, wallId, toFront ? 'tr' : 'tl', { dx: 0, dy: drop });
  const tr = { x: w, y: h + (toFront ? drop : 0) }, tl = { x: 0, y: h + (toFront ? 0 : drop) };
  const dir = { x: tl.x - tr.x, y: tl.y - tr.y };
  const L2 = dir.x * dir.x + dir.y * dir.y, L = Math.sqrt(L2);
  const inw = { x: -dir.y / L, y: dir.x / L };
  const put = (x: number, y: number) => {
    const t = ((x - tr.x) * dir.x + (y - tr.y) * dir.y) / L2;
    const off = -((x - tr.x - dir.x * t) * inw.x + (y - tr.y - dir.y * t) * inw.y);
    addWallInsert(d, wallId, 'e2', t, off);
  };
  const xOf = (z: number) => (z - o[2]) / u[2];
  for (const st of steps) {
    // the wall's own x of the step, and which side of it is the front
    const x = xOf(st.z), dx = toFront ? 0.3 : -0.3;
    put(x - dx, h + st.back);
    put(x + dx, h + st.front);
  }
}

// --- the hopper ---

function generateHopper(d: Design, p: Params, role: Role) {
  const W = Number(p.width), hd = Number(p.hopper), dd = Number(p.tray), H = Number(p.height), dh = Number(p.trayHeight);
  const D = hd + dd;
  if (!boardBoxRect(d, W, D, H)) return;
  const tr = mainTray(d)!;
  d.sizeAs = 'inside';
  setBoxSize(d, tr, { w: W, d: D, h: H }, 'inside');
  solve(d);
  const t = d.material.thickness, web = webOf(d);
  const w = wallsOf(d);
  // the front a low lip; the sides step down from the hopper's height to the lip's in front of the hopper
  if (w.e0) {
    setCustomHeight(d, w.e0, true);
    setPanelSize(d, w.e0, undefined, dh);
  }
  const Hw = d.trays[tr].height;
  const ins0 = insideOf(d);
  if (!ins0) return;
  // the hopper's front: its back face `hd` in front of the back's inner face
  const zf = ins0.zB + hd;
  for (const e of ['e1', 'e3'] as const) {
    const P = w[e] && d.panels[w[e]];
    // the step a web in front of the hopper's front
    if (P) stepTop(d, P.id, [{ z: zf + t + web, back: 0, front: -(Hw - dh) }]);
  }
  reseam(d, d.trays[tr].cornerKind);
  const ins = insideOf(d);
  if (!ins) return;
  // the hopper's front between the side walls, its foot a gap over the base, its top a web under the walls' tops
  const gap = Math.max(15, Math.min(dh - 5, (dh * 2) / 3));
  const fh = Hw - web - ins.floor - gap;
  const front = addFreePanel(d, { frame: { o: [ins.xL, ins.floor + gap, zf], u: [1, 0, 0], v: [0, 1, 0] }, side: 1, outer: rect(ins.xR - ins.xL, fh) });
  solve(d);
  if (front) connectSeams(d, front);
  solve(d);
  const back = w.e2;
  const B = back ? d.panels[back] : null;
  const cleat = B ? hangThing(d, p, back, undefined, { stud: { y: 2 * t + 2, x0: B.w * 0.25, x1: B.w * 0.75 } }, Math.max(B.w / 8, 2 * t + 10)) : [];
  solve(d);
  nameAll(d, role, { front: front ?? '', ...Object.fromEntries(cleat.map((c) => [c.name, c.id])) });
}

export const hopper: TemplateDef = {
  ...plywood,
  id: 'hopper',
  name: 'sen.hopper',
  description: 'sen.hopper.desc',
  word: 'sen.hopper',
  fallback: () => 'dispenser',
  params: [
    num('width', 'sen.width', 50, 250, 80),
    num('hopper', 'sen.hopperDepth', 30, 150, 50),
    num('tray', 'sen.trayDepth', 30, 120, 45),
    num('height', 'sen.height', 100, 300, 150),
    num('trayHeight', 'sen.trayHeight', 25, 80, 40),
    hangWord(() => hopper),
  ],
  generate: generateHopper,
  sentence: { main: 'sen.s.hopper' },
};
hopper.limits = (m, p) => ({
  ...sheetLimits(hopper, { width: 50, hopper: 30, height: 100 })(m, p),
  trayHeight: { max: Math.max(25, Math.min(80, Number(p.height) - 50)), why: 'sen.why.frontRoom' as MsgKey },
});
hopper.accepts = (m, p) => (cleanAll(hopper, m, p) ? null : 'sen.why.engineSize');

// --- wall steps ---

function generateWallSteps(d: Design, p: Params, role: Role) {
  const W = Number(p.width), n = Math.round(Number(p.steps)), sd = Number(p.step), rise = Number(p.rise), hole = Number(p.hole);
  const t = d.material.thickness, web = webOf(d);
  const room = hangRoom(t);
  // the steps, the lowest at the front; each a level board from the back to its front edge, a riser under its front
  // edge down to the step below (the lowest down to a foot board); two sides with the steps' outline round them
  const y0 = room.foot, D = n * sd;
  const bw = W + 2 * t + 2 * web;
  const top = y0 + n * rise;
  const bh = top + t + room.top;
  const ids: (string | null)[] = [backBoard(d, -bw / 2, bw, bh)];
  const names = ['back'];
  // the sides: square at the back, stepped at the front a web outside each step and riser
  const side: P2[] = [{ x: 0, y: y0 - web }, { x: D + web, y: y0 - web }];
  for (let k = 0; k < n; k++) {
    const yk = y0 + (k + 1) * rise + t + web, zk = D - k * sd + web;
    side.push({ x: zk, y: yk });
    if (k < n - 1) side.push({ x: zk - sd, y: yk });
  }
  side.push({ x: 0, y: top + t + web });
  for (const x of [-W / 2, W / 2 + t]) {
    ids.push(arm(d, x, side));
    names.push(`side-${ids.length}`);
  }
  for (let k = 0; k < n; k++) {
    const yk = y0 + (k + 1) * rise, zk = D - k * sd;
    // each step from its front edge back past the riser standing on it by a web (the top one to the back), so the
    // steps are alike (equal level boards are shelves, not a rack's narrow rails)
    const deep = k === n - 1 ? zk : sd + t + 2 * web;
    const st = level(d, -W / 2, yk, zk, W, deep);
    ids.push(st);
    names.push(`step-${k + 1}`);
    // holes for screwdrivers along the step's middle
    if (st && hole > 0) {
      const m = Math.max(1, Math.floor((W - 2 * web) / (hole + Math.max(8, hole * 0.6))));
      for (let i = 0; i < m; i++) addDetail(d, st, 'circle', 'cut', ((i + 0.5) * W) / m, Math.min(sd / 2, zk - web - hole / 2), hole, hole);
    }
    // the riser under this step, a web behind its front edge, standing on the step below (the lowest on nothing: its
    // foot is the sides')
    ids.push(addFreePanel(d, { frame: { o: [-W / 2, y0 + k * rise + (k ? t : 0), zk - web - t], u: [1, 0, 0], v: [0, 1, 0] }, side: 1, outer: rect(W, rise - (k ? t : 0)) }));
    names.push(`riser-${k + 1}`);
  }
  finish(d, p, ids, names, role, ids[0], cleatAt(t, bw));
}

export const wallSteps: TemplateDef = {
  ...plywood,
  id: 'wallSteps',
  name: 'sen.wallSteps',
  description: 'sen.wallSteps.desc',
  word: 'sen.wallSteps',
  params: [
    num('width', 'sen.width', 80, 400, 200),
    int('steps', 'sen.stepCount', 2, 5, 3),
    num('step', 'sen.stepDepth', 25, 80, 40),
    num('rise', 'sen.stepRise', 20, 80, 40),
    num('hole', 'sen.holeSize', 0, 30, 10),
    hangWord(() => wallSteps),
  ],
  generate: generateWallSteps,
  sentence: { main: 'sen.s.wallSteps' },
};
wallSteps.limits = sheetLimits(wallSteps, { width: 80, step: 25, rise: 20 });
wallSteps.accepts = (m, p) => (cleanAll(wallSteps, m, p) ? null : 'sen.why.engineSize');

// --- the drill stand ---

/** A drill stand's rows' wall heights (front to back): the lowest at the front, each higher by `step`. */
const rowHeights = (H: number, rows: number, step: number) => Array.from({ length: rows }, (_, k) => H - (rows - 1 - k) * step);

function generateDrillStand(d: Design, p: Params, role: Role) {
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height), rows = Math.round(Number(p.rows)), cols = Math.round(Number(p.columns)), step = Number(p.step);
  if (!boardBoxRect(d, W, D, H)) return;
  const tr = mainTray(d)!;
  d.sizeAs = 'inside';
  setBoxSize(d, tr, { w: W, d: D, h: H }, 'inside');
  solve(d);
  // (a web of 6 mm or more: on 3 mm plywood the least web left the partitions' slots too near the step)
  const t = d.material.thickness, web = Math.max(webOf(d), 6);
  const w = wallsOf(d);
  const Hw = d.trays[tr].height;
  const hs = rowHeights(Hw, rows, step);
  // the front as low as the front row; the sides step up row by row to the back's height
  if (w.e0) {
    setCustomHeight(d, w.e0, true);
    setPanelSize(d, w.e0, undefined, hs[0]);
  }
  const ins0 = insideOf(d);
  if (!ins0) return;
  const rd = (ins0.zF - ins0.zB - (rows - 1) * t) / rows;
  for (const e of ['e1', 'e3'] as const) {
    const P = w[e] && d.panels[w[e]];
    if (!P) continue;
    // a step at each row's back, a web in front of the partition between it and the next row (the partition stands
    // in the taller part, its slot with board above it)
    stepTop(d, P.id, Array.from({ length: rows - 1 }, (_, k) => ({ z: ins0.zF - (k + 1) * rd - k * t - web, back: -(Hw - hs[k + 1]), front: -(Hw - hs[k]) })));
  }
  reseam(d, d.trays[tr].cornerKind);
  const ins = insideOf(d);
  if (!ins) return;
  const ids: (string | null)[] = [], names: string[] = [];
  // the rows' partitions: across between the side walls, on the base, each a web under the side walls' step above it
  for (let k = 0; k < rows - 1; k++) {
    const z = ins.zF - (k + 1) * rd - k * t - t;
    ids.push(addFreePanel(d, { frame: { o: [ins.xL, ins.floor, z], u: [1, 0, 0], v: [0, 1, 0] }, side: 1, outer: rect(ins.xR - ins.xL, hs[k + 1] - ins.floor - web) }));
    names.push(`row-${k + 1}`);
  }
  // the columns: dividers front to back in each row, as tall as the row's front, a web under it
  const cw = (ins.xR - ins.xL - (cols - 1) * t) / cols;
  for (let k = 0; k < rows; k++) {
    const zFront = ins.zF - k * (rd + t), h = hs[k] - ins.floor - web;
    for (let i = 1; i < cols; i++) {
      const x = ins.xL + i * cw + (i - 1) * t;
      ids.push(addFreePanel(d, { frame: { o: [x, ins.floor, zFront], u: [0, 0, -1], v: [0, 1, 0] }, side: 1, outer: rect(rd, h) }));
      names.push(`divider-${k + 1}-${i}`);
    }
  }
  solve(d);
  for (const id of ids) if (id) connectSeams(d, id);
  solve(d);
  // on a wall: by its back, which is the tallest wall
  const back = w.e2;
  const B = back ? d.panels[back] : null;
  let cleat: { name: string; id: string }[] = [];
  if (B && p.hang === 'keyholes') hangByKeyholes(d, back, undefined, Math.max(B.w / 8, 2 * t + 10));
  else if (B && p.hang === 'cleat') cleat = hangByCleat(d, back, { stud: { y: 2 * t + 2, x0: B.w * 0.25, x1: B.w * 0.75 } });
  solve(d);
  const first: Record<string, string> = {};
  ids.forEach((id, i) => id && (first[names[i]] = id));
  for (const c of cleat) first[c.name] = c.id;
  nameAll(d, role, first);
}

export const drillStand: TemplateDef = {
  ...plywood,
  id: 'drillStand',
  name: 'sen.drillStand',
  description: 'sen.drillStand.desc',
  word: 'sen.drillStand',
  fallback: () => 'organiser',
  params: [
    num('width', 'sen.width', 60, 300, 120),
    num('depth', 'sen.depth', 60, 250, 90),
    num('height', 'sen.height', 40, 200, 90),
    int('rows', 'sen.rows', 2, 5, 3),
    int('columns', 'sen.columns', 1, 8, 4),
    num('step', 'sen.rowStep', 10, 40, 20),
    {
      key: 'hang', label: 'sen.hang', type: 'choice', default: 'none', addon: { off: 'none' },
      options: [{ value: 'none', label: 'sen.hang.none' }, { value: 'keyholes', label: 'sen.hang.keyholes' }, { value: 'cleat', label: 'sen.hang.cleat' }],
      allowed: (v, p, m) => v === 'none' || (v === 'cleat' ? cleatFits(drillStand, m, p) : m.kind === 'plywood' && cleanWith(drillStand, m, p, 'hang', v)),
      why: (v, _p, m) => (m.kind !== 'plywood' ? 'sen.why.plyOnly' : v === 'cleat' ? 'sen.why.cleatRoom' : 'sen.why.hangRoom'),
    },
  ],
  generate: generateDrillStand,
  sentence: { main: 'sen.s.drillStand' },
};
drillStand.limits = (m, p) => ({
  ...sheetLimits(drillStand, { width: 60, depth: 60, height: 40 })(m, p),
  // every row's front at least 20 mm tall
  step: { max: Math.max(10, Math.min(40, Math.floor((Number(p.height) - 20) / Math.max(1, Number(p.rows) - 1)))), why: 'sen.why.spaceSmall' as MsgKey },
  // spaces 15 mm or more across and front to back
  columns: { max: Math.max(1, Math.min(8, Math.floor((Number(p.width) + m.thickness) / (15 + m.thickness)))), why: 'sen.why.spaceSmall' as MsgKey },
  rows: { max: Math.max(2, Math.min(5, Math.floor((Number(p.depth) + m.thickness) / (15 + m.thickness)))), why: 'sen.why.spaceSmall' as MsgKey },
});
drillStand.accepts = (m, p) => (cleanAll(drillStand, m, p) ? null : 'sen.why.engineSize');
