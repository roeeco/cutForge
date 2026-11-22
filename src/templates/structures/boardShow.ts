// The rest of §3.2 (milestone 178, part 2, BOXES_PLYWOOD_PLAN.md), plywood only. Constructions read in boxes.py (a
// behaviour reference only: THIRD_PARTY.md) and written fresh over the box kit (boards.ts) and free boards:
//   a showcase      a small open box with a plate leaning back on two cheeks inside, a coin pressed into its hole
//                   (coindisplay);
//   a louvred box   a box whose front and back are slats at 45° held in the side walls, overlapping so rain runs off
//                   and air goes through, a roof board on top (stevensonscreenbox);
//   a can dispenser two sides with a chute sloping back near the top and one sloping forward below: cans put in at the
//                   front roll back, drop and roll out at the front's foot (can_storage);
//   a bottle stack  two beams with cradles cut in their tops, crossing two feet in half-slots: bottles lie in a row,
//                   and another row lies on them (bottlestack);
//   a jar rack      two sides with a shelf and a plate with round holes over it for each row: jars stand through the
//                   holes (spicesrack, paintbox);
//   a book cover    two covers and a spine bent between them on living hinges (folder);
//   a clock face    a round face with hour marks and numbers engraved, a hole for the movement, two feet crossing its
//                   foot in half-slots (clock).
import type { Design, P2, V3 } from '../../model/types';
import type { MsgKey } from '../../i18n';
import type { ParamDef, Params, TemplateDef } from '../types';
import { addDetail, addFreePanel, addPathShape, addRootPanel, connectSeams, deletePanel, growPanel, setCustomHeight, setPanelSize, setWallCorner, solve } from '../../model/ops';
import { bendOf, minWeb } from '../../model/materials';
import { setBoxSize } from '../../model/boxSize';
import { boardBoxRect, plywoodOnly } from './boards';
import { cleanAll, mainTray } from './box';
import { nameAll, reseam, sheetLimits, wallsOf } from './shaped';
import { insideOf } from './boardBoxes';

type Role = (name: string, id: string) => void;
const num = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'number', unit: 'mm', min, max, default: dflt });
const int = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'int', min, max, default: dflt });
const rect = (w: number, h: number): P2[] => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
const rad = (deg: number) => (deg * Math.PI) / 180;
const webOf = (d: Design) => Math.max(minWeb(d.material), d.material.thickness);

/** A board standing front to back (its material towards +x from `x`), from `z` going back, its outline in (back, up). */
const along = (d: Design, x: number, y: number, z: number, outer: P2[]) => addFreePanel(d, { frame: { o: [x, y, z], u: [0, 0, -1], v: [0, 1, 0] }, side: 1, outer });
/** A board standing across (its material towards +z from `z`), from x, its outline in (across, up). */
const across = (d: Design, x: number, y: number, z: number, outer: P2[]) => addFreePanel(d, { frame: { o: [x, y, z], u: [1, 0, 0], v: [0, 1, 0] }, side: 1, outer });
/** A board lying level, its underside at `y`, from x across `w`, from its front edge at `z` back `dz`. */
const level = (d: Design, x: number, y: number, z: number, w: number, dz: number) => addFreePanel(d, { frame: { o: [x, y, z], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: rect(w, dz) });

/** Join every board to the boards it meets. */
function join(d: Design, ids: (string | null)[]) {
  solve(d);
  for (const id of ids) if (id) connectSeams(d, id);
  solve(d);
}
/** Join, then name them (`names[i]` for `ids[i]`). */
function finish(d: Design, ids: (string | null)[], names: string[], role: Role) {
  join(d, ids);
  ids.forEach((id, i) => id && role(names[i] ?? `part-${i + 1}`, id));
}

const plywood: Pick<TemplateDef, 'materials' | 'canMake' | 'fallback' | 'status' | 'version'> = {
  version: 1,
  status: 'beta',
  materials: ['plywood'],
  canMake: plywoodOnly,
  fallback: () => 'box',
};

/** A box of boards of these inside sizes: its tray, or null. */
function insideBox(d: Design, W: number, D: number, H: number): string | null {
  if (!boardBoxRect(d, W, D, H)) return null;
  const tr = mainTray(d)!;
  d.sizeAs = 'inside';
  setBoxSize(d, tr, { w: W, d: D, h: H }, 'inside');
  solve(d);
  return tr;
}

// --- the showcase ---

/** The coin plate's size for a coin, its lean back from upright, and the room the stand takes front to back and up. */
function coinStand(coin: number, lean: number, t: number, web: number) {
  const a = rad(lean);
  const L = coin + 2 * Math.max(web, 6), lift = Math.max(web, 6) + 2;
  // the cheeks: behind the plate's rear face, in front of its front face by a web, a web over its top (and the plate's
  // foot a web over the base, so its slots in the cheeks have board all round)
  const front = (t + web) / Math.cos(a) + lift * Math.tan(a), top = (L + web) * Math.cos(a) + lift;
  const back = L * Math.sin(a) + web + 4;
  return { a, L, lift, front, back, top, depth: front + back };
}

function generateShowcase(d: Design, p: Params, role: Role) {
  const coin = Number(p.coin), lean = Number(p.lean);
  const t = d.material.thickness, web = webOf(d);
  const s = coinStand(coin, lean, t, web);
  const W = Math.max(Number(p.width), s.L + 2 * t + 2 * Math.max(web, 6) + 8), D = Math.max(Number(p.depth), s.depth + 8), H = Number(p.height);
  const tr = insideBox(d, W, D, H);
  if (!tr) return;
  // the front low and the sides sloping down to it, so the coin is seen from the front (a display case's open face)
  const w = wallsOf(d), Hw = d.trays[tr].height, low = Math.max(12, 4 * d.material.thickness + 4, Hw * 0.35);
  if (w.e0) {
    setCustomHeight(d, w.e0, true);
    setPanelSize(d, w.e0, undefined, low);
  }
  for (const e of ['e1', 'e3'] as const) {
    const P = w[e] && d.panels[w[e]];
    if (P) setWallCorner(d, P.id, P.frame.u[2] > 0 ? 'tr' : 'tl', { dx: 0, dy: -(Hw - low) });
  }
  reseam(d, d.trays[tr].cornerKind);
  const ins = insideOf(d);
  if (!ins) return;
  // the plate's rear face from its foot (a little over the base, the stand centred front to back) up and back
  const zc = (ins.zF + ins.zB) / 2, zFoot = zc + (s.depth / 2 - s.front) + 0 * t;
  const v: V3 = [0, Math.cos(s.a), -Math.sin(s.a)];
  const yFoot = ins.floor + s.lift;
  const pw = s.L;
  const plate = addFreePanel(d, { frame: { o: [-pw / 2, yFoot, zFoot], u: [1, 0, 0], v }, side: 1, outer: rect(pw, s.L) });
  if (plate) addDetail(d, plate, 'circle', 'cut', pw / 2, s.L / 2, coin, coin);
  // the cheeks: the plate's edges on their faces; in (back, up) from the stand's front at the floor
  const zFront = zFoot + s.front, zBack = zFoot - s.back;
  const yTop = ins.floor + s.top;
  const lineZ = (y: number) => zFront - (y - ins.floor) * Math.tan(s.a);
  const cheek: P2[] = [{ x: 0, y: 0 }, { x: zFront - zBack, y: 0 }, { x: zFront - zBack, y: yTop - ins.floor }, { x: zFront - lineZ(yTop), y: yTop - ins.floor }];
  const ids: (string | null)[] = [plate], names = ['plate'];
  for (const x of [-pw / 2 - t, pw / 2]) {
    ids.push(along(d, x, ins.floor, zFront, cheek));
    names.push(`cheek-${ids.length - 1}`);
  }
  join(d, ids);
  const first: Record<string, string> = {};
  ids.forEach((id, i) => id && (first[names[i]] = id));
  nameAll(d, role, first);
}

export const showcase: TemplateDef = {
  ...plywood,
  id: 'showcase',
  name: 'sen.showcase',
  description: 'sen.showcase.desc',
  word: 'sen.showcase',
  params: [
    num('coin', 'sen.coinSize', 15, 60, 30),
    num('width', 'sen.width', 40, 150, 80),
    num('depth', 'sen.depth', 40, 150, 60),
    // its back's height: the sides slope down to a low front (from a 45 mm box it was a box)
    num('height', 'sen.height', 30, 120, 50),
    { key: 'lean', label: 'sen.leanBack', type: 'choice', options: ([20, 30, 35] as const).map((x) => ({ value: x, label: `sen.tilt${x}` as MsgKey })), default: 30 },
  ],
  generate: generateShowcase,
  sentence: { main: 'sen.s.showcase' },
};
showcase.limits = sheetLimits(showcase, { coin: 15, width: 40, depth: 40, height: 20 });
showcase.accepts = (m, p) => (cleanAll(showcase, m, p) ? null : 'sen.why.engineSize');

// --- the louvred box ---

/** A louvre's slat across the box (its width along its slope) and the rise from one slat to the next (they overlap). */
const slatOf = (t: number) => {
  const w = Math.max(20, 4 * t);
  return { w, pitch: w * Math.SQRT1_2 * 0.8 };
};

function generateLouvreBox(d: Design, p: Params, role: Role) {
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height);
  const tr = insideBox(d, W, D, H);
  if (!tr) return;
  const t = d.material.thickness, web = webOf(d);
  // the front and back walls taken away: slats stand there instead
  const w0 = wallsOf(d);
  for (const e of ['e0', 'e2']) if (w0[e]) deletePanel(d, w0[e]);
  solve(d);
  const ins = insideOf(d);
  if (!ins) return;
  const Hw = d.trays[tr].height;
  const base = d.panels[d.trays[tr].baseId];
  const zF = base.frame.o[2], zB = zF - base.h;
  const sl = slatOf(t), s2 = Math.SQRT1_2;
  const ids: (string | null)[] = [], names: string[] = [];
  // each slat leans out and down at 45°, a web in from the side walls' edges; the lowest a clearance over the base,
  // the highest a web under the walls' tops
  const run = sl.w * s2;
  const n = Math.max(2, Math.floor((Hw - web - ins.floor - 2 - run - t * s2) / sl.pitch) + 1);
  for (const [face, z0, dir] of [['front', zF - web, -1], ['back', zB + web, 1]] as const) {
    for (let k = 0; k < n; k++) {
      const y = ins.floor + 2 + k * sl.pitch;
      // from the outer foot up and in; the material on the inner side
      const v: V3 = [0, s2, dir * s2];
      ids.push(addFreePanel(d, { frame: { o: [ins.xL, y, z0 + (dir < 0 ? 0 : 0)], u: [1, 0, 0], v }, side: dir < 0 ? 1 : -1, outer: rect(ins.xR - ins.xL, sl.w) }));
      names.push(`${face}-slat-${k + 1}`);
    }
  }
  // the roof: a board over the side walls' tops, overhanging them all round
  const over = Math.max(web, 6) + t;
  const xL = ins.xL - t, xR = ins.xR + t;
  ids.push(level(d, xL - over, Hw + base.frame.o[1] - 0, zF + over, xR - xL + 2 * over, zF - zB + 2 * over));
  names.push('roof');
  join(d, ids);
  const first: Record<string, string> = {};
  ids.forEach((id, i) => id && (first[names[i]] = id));
  nameAll(d, role, first);
}

export const louvreBox: TemplateDef = {
  ...plywood,
  id: 'louvreBox',
  name: 'sen.louvreBox',
  description: 'sen.louvreBox.desc',
  word: 'sen.louvreBox',
  params: [
    num('width', 'sen.width', 60, 250, 120),
    num('depth', 'sen.depth', 60, 250, 100),
    num('height', 'sen.height', 80, 300, 140),
  ],
  generate: generateLouvreBox,
  sentence: { main: 'sen.s.louvreBox' },
};
louvreBox.limits = sheetLimits(louvreBox, { width: 60, depth: 60, height: 80 });
louvreBox.accepts = (m, p) => (cleanAll(louvreBox, m, p) ? null : 'sen.why.engineSize');

// --- the can dispenser ---

/** How steeply the chutes slope (degrees): enough for a can to roll. */
const CHUTE = 15;

/** The can dispenser's sizes for these words: inside width, depth and height. */
function canSizes(p: Params, t: number, web: number) {
  const c = Number(p.can), L = Number(p.length), n = Math.round(Number(p.cans));
  // each chute holds half the cans in a row, and a can's room more where it turns over
  const D = (Math.ceil(n / 2) + 1) * (c + 1) + 2 * web + 10;
  const drop = Math.tan(rad(CHUTE)) * D;
  return { c, W: L + 4, D, H: 2 * (c + 6 + drop + t) + c * 0.6 + 2 * web };
}

function generateCanDispenser(d: Design, p: Params, role: Role) {
  const t = d.material.thickness, web = Math.max(webOf(d), 6);
  const { c, W, D, H } = canSizes(p, t, web);
  const a = rad(CHUTE), sa = Math.sin(a), ca = Math.cos(a);
  const ids: (string | null)[] = [], names: string[] = [];
  // the sides, outside the width; the back between them a web in from their back edges; the top over the back part
  const SD = D + 2 * web + t, SH = H + 2 * web;
  ids.push(along(d, -W / 2 - t, 0, SD / 2, rect(SD, SH)), along(d, W / 2, 0, SD / 2, rect(SD, SH)));
  names.push('side-1', 'side-2');
  const zBack = -SD / 2 + web, zFront = SD / 2 - web;
  ids.push(across(d, -W / 2, web, zBack, rect(W, H)));
  names.push('back');
  // the lower chute: from the back down to the front, its foot a web over the sides' feet
  const y0 = web, run = zFront - (zBack + t) - 1;
  const lower: V3 = [0, -sa, ca];
  ids.push(addFreePanel(d, { frame: { o: [-W / 2, y0 + run * sa, zBack + t + 1], u: [1, 0, 0], v: lower }, side: -1, outer: rect(W, run / ca) }));
  names.push('chute-1');
  // the lip at the front's foot, a can's third tall, held by the sides only, a clearance over the chute
  const lipH = Math.max(c / 3, 10);
  ids.push(across(d, -W / 2, y0 + t / ca + 2, zFront - t, rect(W, lipH + t)));
  names.push('lip');
  // the upper chute: from near the front down towards the back, stopping a can and a play short of the back
  const y1 = y0 + run * sa + t + c + 6;
  const run2 = zFront - (zBack + t) - c - 8;
  const upper: V3 = [0, -sa, -ca];
  ids.push(addFreePanel(d, { frame: { o: [-W / 2, y1 + run2 * sa, zFront], u: [1, 0, 0], v: upper }, side: 1, outer: rect(W, run2 / ca) }));
  names.push('chute-2');
  // the top: over the upper chute by a can and a play, from the back to a can's width short of the front (where cans go in)
  const yTop = y1 + run2 * sa + t + c + 6;
  ids.push(level(d, -W / 2, Math.min(yTop, web + H - t), zFront - c - 10, W, zFront - c - 10 - zBack));
  names.push('top');
  finish(d, ids, names, role);
}

export const canDispenser: TemplateDef = {
  ...plywood,
  id: 'canDispenser',
  name: 'sen.canDispenser',
  description: 'sen.canDispenser.desc',
  word: 'sen.canDispenser',
  fallback: () => 'shelf',
  params: [
    num('can', 'sen.canSize', 30, 100, 66),
    num('length', 'sen.canLength', 40, 200, 115),
    int('cans', 'sen.cans', 3, 12, 4),
  ],
  generate: generateCanDispenser,
  sentence: { main: 'sen.s.canDispenser' },
};
canDispenser.limits = (m, p) => ({
  ...sheetLimits(canDispenser, { can: 30, length: 40 })(m, p),
  cans: { max: Math.max(3, Math.min(12, Math.floor(((Math.max(m.sheetW, m.sheetH) - 40 - 2 * Number(p.can)) * 2) / (Number(p.can) + 1)))), why: 'sen.why.sheet' as MsgKey },
});
canDispenser.accepts = (m, p) => (cleanAll(canDispenser, m, p) ? null : 'sen.why.engineSize');

// --- the bottle stack ---

/** A beam's outline `L` long with `n` cradles `body` across cut in its top, `h` tall at its ends. */
function cradleBeam(L: number, n: number, body: number, h: number): P2[] {
  const pitch = L / n, r = body / 2, dip = Math.min(r * 0.45, h - 12);
  const out: P2[] = [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: h }];
  for (let i = n - 1; i >= 0; i--) {
    const cx = (i + 0.5) * pitch;
    // a shallow arc of the bottle's radius, `dip` deep
    const half = Math.sqrt(r * r - (r - dip) * (r - dip));
    for (let k = 0; k <= 8; k++) {
      const x = cx + half - (2 * half * k) / 8;
      const y = h - (Math.sqrt(Math.max(0, r * r - (x - cx) * (x - cx))) - (r - dip));
      out.push({ x, y });
    }
  }
  out.push({ x: 0, y: h });
  return out;
}

function generateBottleStack(d: Design, p: Params, role: Role) {
  const n = Math.round(Number(p.bottles)), body = Number(p.body), D = Number(p.depth);
  const t = d.material.thickness, web = Math.max(webOf(d), 6);
  const L = n * (body + 2 * web), h = Math.max(30, body * 0.4 + web), fh = h;
  const ids: (string | null)[] = [], names: string[] = [];
  // the feet first, front to back near each end (slotted from their tops); the beams across them (from their feet)
  for (const x of [-L / 2 + L / (2 * n) - t / 2, L / 2 - L / (2 * n) - t / 2]) {
    ids.push(along(d, x, 0, D / 2, rect(D, fh)));
    names.push(`foot-${ids.length}`);
  }
  for (const z of [D / 2 - D * 0.2, -D / 2 + D * 0.2 - t]) {
    ids.push(across(d, -L / 2, 0, z, cradleBeam(L, n, body, h)));
    names.push(`beam-${ids.length - 2}`);
  }
  finish(d, ids, names, role);
}

export const bottleStack: TemplateDef = {
  ...plywood,
  id: 'bottleStack',
  name: 'sen.bottleStack',
  description: 'sen.bottleStack.desc',
  word: 'sen.bottleStack',
  fallback: () => 'bottleRack',
  params: [
    int('bottles', 'sen.bottles', 2, 6, 3),
    num('body', 'sen.bottleBody', 50, 100, 78),
    num('depth', 'sen.depth', 100, 300, 180),
  ],
  generate: generateBottleStack,
  sentence: { main: 'sen.s.bottleStack' },
};
bottleStack.limits = (m, p) => ({
  bottles: { max: Math.max(2, Math.min(6, Math.floor((Math.max(m.sheetW, m.sheetH) - 20) / (Number(p.body) + 2 * Math.max(Math.max(minWeb(m), m.thickness), 6))))), why: 'sen.why.sheet' as MsgKey },
  ...sheetLimits(bottleStack, { depth: 100 })(m, p),
});
bottleStack.accepts = (m, p) => (cleanAll(bottleStack, m, p) ? null : 'sen.why.engineSize');

// --- the jar rack ---

function generateJarRack(d: Design, p: Params, role: Role) {
  const n = Math.round(Number(p.jars)), jar = Number(p.jar), rows = Math.round(Number(p.rows)), tall = Number(p.jarHeight);
  const t = d.material.thickness, web = Math.max(webOf(d), 6);
  const pitch = jar + 2 + web, W = n * pitch + web, D = jar + 2 * web + 2;
  const rh = tall + 10;
  const H = rows * (rh + t) + web;
  const ids: (string | null)[] = [], names: string[] = [];
  // the sides, outside the width, a web deeper than the shelves front and back
  const SD = D + 2 * web;
  ids.push(along(d, -W / 2 - t, 0, SD / 2, rect(SD, H + web)), along(d, W / 2, 0, SD / 2, rect(SD, H + web)));
  names.push('side-1', 'side-2');
  // a shelf for each row and, a little over half a jar above it, a plate with a hole for each jar; a back across behind them
  for (let k = 0; k < rows; k++) {
    const y = web + k * (rh + t);
    ids.push(level(d, -W / 2, y, D / 2, W, D));
    names.push(`shelf-${k + 1}`);
    const plate = level(d, -W / 2, y + t + tall * 0.55, D / 2, W, D);
    if (plate) for (let i = 0; i < n; i++) addDetail(d, plate, 'circle', 'cut', web / 2 + pitch / 2 + i * pitch, D / 2, jar + 2, jar + 2);
    ids.push(plate);
    names.push(`plate-${k + 1}`);
  }
  finish(d, ids, names, role);
}

export const jarRack: TemplateDef = {
  ...plywood,
  id: 'jarRack',
  name: 'sen.jarRack',
  description: 'sen.jarRack.desc',
  word: 'sen.jarRack',
  fallback: () => 'bottleRack',
  params: [
    int('jars', 'sen.jars', 2, 10, 5),
    num('jar', 'sen.jarSize', 25, 90, 45),
    num('jarHeight', 'sen.jarHeight', 40, 200, 90),
    int('rows', 'sen.rows', 1, 4, 2),
  ],
  generate: generateJarRack,
  sentence: { main: 'sen.s.jarRack' },
};
jarRack.limits = (m, p) => ({
  jars: { max: Math.max(2, Math.min(10, Math.floor((Math.max(m.sheetW, m.sheetH) - 30) / (Number(p.jar) + 2 + Math.max(Math.max(minWeb(m), m.thickness), 6))))), why: 'sen.why.sheet' as MsgKey },
  ...sheetLimits(jarRack, { jar: 25, jarHeight: 40 })(m, p),
});
jarRack.accepts = (m, p) => (cleanAll(jarRack, m, p) ? null : 'sen.why.engineSize');

// --- the book cover ---

function generateBookCover(d: Design, p: Params, role: Role) {
  const W = Number(p.width), H = Number(p.height), S = Number(p.spine);
  // the back cover lying flat; the spine and the front cover bent up off it on living hinges as tight as the board
  // bends, the book a little open (the spine keeps a flat between its two bends)
  const r = bendOf(d.material).patternR;
  const back = addRootPanel(d, 0, 0, W, H);
  const spine = growPanel(d, back, 'e1', { height: S, angle: 90, dir: 'up', kind: 'fold' });
  const front = spine ? growPanel(d, spine.panelId, 'e2', { height: W, angle: 120, dir: 'up', kind: 'fold' }) : null;
  for (const g of [spine, front]) {
    const c = g && d.connections[g.connectionId];
    if (!c) continue;
    c.pref = 'fold';
    c.radius = r;
  }
  solve(d);
  role('back', back);
  if (spine) role('spine', spine.panelId);
  if (front) role('front', front.panelId);
}

export const bookCover: TemplateDef = {
  id: 'bookCover',
  version: 1,
  status: 'beta',
  name: 'sen.bookCover',
  description: 'sen.bookCover.desc',
  word: 'sen.bookCover',
  materials: ['plywood'],
  // plywood that bends round a spine (3 and 4 mm)
  canMake: (m) => m.kind === 'plywood' && bendOf(m).patternR <= 30,
  fallback: () => 'box',
  params: [
    num('width', 'sen.coverWidth', 80, 250, 150),
    num('height', 'sen.coverHeight', 100, 330, 210),
    // two bends as tight as 3 mm plywood bends (30 mm) and a flat between: a box file's spine
    num('spine', 'sen.spine', 70, 120, 80),
  ],
  generate: generateBookCover,
  sentence: { main: 'sen.s.bookCover' },
};
bookCover.limits = sheetLimits(bookCover, { width: 80, height: 100 });
bookCover.accepts = (m, p) => (cleanAll(bookCover, m, p) ? null : 'sen.why.engineSize');

// --- the clock face ---

/** Seven-segment numerals (segments a–g) for engraving: which segments each digit lights. */
const SEGMENTS: Record<string, string> = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };

/** A number as engraved bars in a unit box (polygons of the path shape), `n` digits side by side, and its aspect (w / h). */
function numeral(text: string): { polys: P2[][]; aspect: number } {
  const dw = 0.5, gap = 0.18, th = 0.09;
  const W = text.length * dw + (text.length - 1) * gap;
  const polys: P2[][] = [];
  const bar = (x0: number, y0: number, x1: number, y1: number) => polys.push([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]);
  [...text].forEach((ch, i) => {
    const x = i * (dw + gap);
    for (const s of SEGMENTS[ch] ?? '') {
      if (s === 'a') bar(x, 1 - th, x + dw, 1);
      if (s === 'g') bar(x, 0.5 - th / 2, x + dw, 0.5 + th / 2);
      if (s === 'd') bar(x, 0, x + dw, th);
      if (s === 'f') bar(x, 0.5 + th / 2 + 0.02, x + th, 1 - th - 0.02);
      if (s === 'b') bar(x + dw - th, 0.5 + th / 2 + 0.02, x + dw, 1 - th - 0.02);
      if (s === 'e') bar(x, th + 0.02, x + th, 0.5 - th / 2 - 0.02);
      if (s === 'c') bar(x + dw - th, th + 0.02, x + dw, 0.5 - th / 2 - 0.02);
    }
  });
  // into the unit box, centred
  return { polys: polys.map((q) => q.map((r) => ({ x: r.x / W - 0.5, y: r.y - 0.5 }))), aspect: W };
}

function generateClockFace(d: Design, p: Params, role: Role) {
  const R = Number(p.size) / 2, t = d.material.thickness;
  const ids: (string | null)[] = [], names: string[] = [];
  // two feet front to back under the face, crossing its foot in half-slots (made first, so they are slotted from their tops)
  const fd = Math.max(70, R * 0.8), fh = Math.max(30, R * 0.3);
  for (const x of [-R * 0.45 - t / 2, R * 0.45 - t / 2]) {
    ids.push(along(d, x, 0, fd / 2, [{ x: 0, y: 0 }, { x: fd, y: 0 }, { x: fd, y: fh * 0.4 }, { x: fd / 2 + 10, y: fh }, { x: fd / 2 - 10, y: fh }, { x: 0, y: fh * 0.4 }]));
    names.push(`foot-${ids.length}`);
  }
  // the face, round, standing on the feet a little above the table
  const ring: P2[] = Array.from({ length: 48 }, (_, i) => ({ x: R + R * Math.cos((2 * Math.PI * i) / 48), y: R + R * Math.sin((2 * Math.PI * i) / 48) }));
  const face = addFreePanel(d, { frame: { o: [-R, 8, -t / 2], u: [1, 0, 0], v: [0, 1, 0] }, side: 1, outer: ring });
  ids.push(face);
  names.push('face');
  if (face) {
    // the movement's spindle through the middle; an hour mark at each hour, longer at the quarters; 12, 3, 6, 9
    addDetail(d, face, 'circle', 'cut', R, R, Number(p.spindle), Number(p.spindle));
    for (let h = 0; h < 12; h++) {
      const a = Math.PI / 2 - (2 * Math.PI * h) / 12, q = h % 3 === 0;
      const len = q ? R * 0.12 : R * 0.07, at = R * 0.9 - len / 2;
      const id = addDetail(d, face, 'roundrect', 'engrave', R + at * Math.cos(a), R + at * Math.sin(a), q ? 3 : 2, len);
      const dt = id && d.panels[face].details.find((x) => x.id === id);
      if (dt) dt.rot = 90 - (a * 180) / Math.PI;
    }
    const nh = R * 0.16;
    for (const [txt, h] of [['12', 0], ['3', 3], ['6', 6], ['9', 9]] as const) {
      const a = Math.PI / 2 - (2 * Math.PI * h) / 12, at = R * 0.66;
      const nm = numeral(txt);
      addPathShape(d, face, nm.polys, R + at * Math.cos(a), R + at * Math.sin(a), nh * nm.aspect, nh, 'engrave');
    }
  }
  finish(d, ids, names, role);
}

export const clockFace: TemplateDef = {
  ...plywood,
  id: 'clockFace',
  name: 'sen.clockFace',
  description: 'sen.clockFace.desc',
  word: 'sen.clockFace',
  fallback: () => 'pegboard',
  params: [
    num('size', 'sen.clockSize', 120, 380, 200),
    num('spindle', 'sen.spindle', 5, 12, 8),
  ],
  generate: generateClockFace,
  sentence: { main: 'sen.s.clockFace' },
};
clockFace.limits = sheetLimits(clockFace, { size: 120 });
clockFace.accepts = (m, p) => (cleanAll(clockFace, m, p) ? null : 'sen.why.engineSize');
