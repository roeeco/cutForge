// Boards of their own with no box (milestone 178, BOXES_PLYWOOD_PLAN.md §3.2), plywood only: held by tabs in slots
// and half-slots, as the slot body's are (milestone 165). Constructions read in boxes.py (a behaviour reference only:
// THIRD_PARTY.md) and written fresh over free boards (`addFreePanel`, `connectSeams`).
//   a record rack     two sides, a level board and a board leaning back between them, each with a row of slits the
//                     discs stand in (discrack);
//   a flyer stand     a plate with rounded corners leaning back a little in a slot in a foot (display);
//   a motor bracket   a base, an upright plate with a stepper motor's hole pattern and two triangular gussets
//                     (nemamount);
//   a pegboard        a board with rows of upright slots for pegboard hooks, hung by keyholes or standing on two feet
//                     that cross its foot in half-slots (skadisboard, skadisstand).
import type { Design, P2 } from '../../model/types';
import type { MsgKey } from '../../i18n';
import type { ParamDef, Params, TemplateDef } from '../types';
import { addDetail, addFreePanel, connectSeams, solve } from '../../model/ops';
import { minWeb } from '../../model/materials';
import { hangByKeyholes, plywoodOnly } from './boards';
import { cleanAll, cleanWith } from './box';
import { sheetLimits } from './shaped';

type Role = (name: string, id: string) => void;
const num = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'number', unit: 'mm', min, max, default: dflt });
const int = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'int', min, max, default: dflt });
const rect = (w: number, h: number): P2[] => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
const rad = (deg: number) => (deg * Math.PI) / 180;
const webOf = (d: Design) => Math.max(minWeb(d.material), d.material.thickness);

/** A rectangle `w` × `h` with its corners rounded by `r` (each a few straight steps). */
function rounded(w: number, h: number, r: number): P2[] {
  const out: P2[] = [];
  const arc = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (Math.PI / 2) * (i / 6);
      out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  };
  arc(w - r, r, -Math.PI / 2);
  arc(w - r, h - r, 0);
  arc(r, h - r, Math.PI / 2);
  arc(r, r, Math.PI);
  return out;
}

/** A board standing front to back (its material towards +x from `x`), from `z` going back, its outline in (back, up). */
const along = (d: Design, x: number, y: number, z: number, outer: P2[]) => addFreePanel(d, { frame: { o: [x, y, z], u: [0, 0, -1], v: [0, 1, 0] }, side: 1, outer });

/** Join every board to the boards it meets, then name them. */
function finish(d: Design, ids: (string | null)[], names: string[], role: Role) {
  solve(d);
  for (const id of ids) if (id) connectSeams(d, id);
  solve(d);
  ids.forEach((id, i) => id && role(names[i] ?? `part-${i + 1}`, id));
}

const plywood: Pick<TemplateDef, 'materials' | 'canMake' | 'fallback' | 'status' | 'version'> = {
  version: 1,
  status: 'beta',
  materials: ['plywood'],
  canMake: plywoodOnly,
  fallback: () => 'shelf',
};

// --- the record rack ---

/** How far the discs lean back (boxes.py's default). */
const DISC_LEAN = 18;

/** A record rack's sizes for these words: the slits' pitch, the width between the sides, the sides' depth and height. */
function discRack(p: Params, t: number) {
  const disc = Number(p.disc), dt = Number(p.discThickness), n = Math.round(Number(p.discs));
  const web = Math.max(t, 3) + 1;
  const pitch = dt + 1 + Math.max(3, t);
  return { disc, dt, n, web, pitch, W: n * pitch + 2 * web, D: Math.round(disc * 0.75), H: Math.round(disc * 0.7) };
}

function generateRecordRack(d: Design, p: Params, role: Role) {
  const t = d.material.thickness, web = webOf(d);
  const r = discRack(p, t);
  const { W, D, H, pitch, dt, n } = r;
  const ids: (string | null)[] = [], names: string[] = [];
  ids.push(along(d, -W / 2 - t, 0, D / 2, rect(D, H)), along(d, W / 2, 0, D / 2, rect(D, H)));
  names.push('side-1', 'side-2');
  // the lower board, level a quarter of the way up, a web in from the sides' front and back; its slits front to back
  const yl = Math.round(H * 0.22), ld = D - 2 * web;
  const lower = addFreePanel(d, { frame: { o: [-W / 2, yl, D / 2 - web], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: rect(W, ld) });
  ids.push(lower);
  names.push('lower');
  // the rear board, leaning back, from behind the lower board up to a web below the sides' tops
  const a = rad(DISC_LEAN), zr = -D / 2 + web + (H - web - yl) * Math.tan(a) + t;
  const rl = (H - web - (yl + t + 4)) / Math.cos(a);
  const rear = addFreePanel(d, { frame: { o: [-W / 2, yl + t + 4, zr], u: [1, 0, 0], v: [0, Math.cos(a), -Math.sin(a)] }, side: 1, outer: rect(W, rl) });
  ids.push(rear);
  names.push('rear');
  // the slits, one per disc, the disc's thickness and a play wide
  for (let i = 0; i < n; i++) {
    const cx = r.web + pitch / 2 + i * pitch;
    if (lower) addDetail(d, lower, 'roundrect', 'cut', cx, ld * 0.55, dt + 1, ld * 0.7);
    if (rear) addDetail(d, rear, 'roundrect', 'cut', cx, rl * 0.5, dt + 1, rl * 0.6);
  }
  finish(d, ids, names, role);
}

export const recordRack: TemplateDef = {
  ...plywood,
  id: 'recordRack',
  name: 'sen.recordRack',
  description: 'sen.recordRack.desc',
  word: 'sen.recordRack',
  params: [
    num('disc', 'sen.discSize', 80, 320, 150),
    num('discThickness', 'sen.discThickness', 2, 12, 5),
    int('discs', 'sen.discs', 3, 30, 10),
  ],
  generate: generateRecordRack,
  sentence: { main: 'sen.s.recordRack' },
};
recordRack.limits = (m, p) => {
  const r = discRack({ ...p, discs: 1 }, m.thickness);
  return {
    ...sheetLimits(recordRack, { disc: 80 })(m, p),
    discs: { max: Math.max(3, Math.min(30, Math.floor((Math.max(m.sheetW, m.sheetH) - 20 - 2 * r.web) / r.pitch))), why: 'sen.why.sheet' as MsgKey },
  };
};
recordRack.accepts = (m, p) => (cleanAll(recordRack, m, p) ? null : 'sen.why.engineSize');

// --- the flyer stand ---

function generateFlyerStand(d: Design, p: Params, role: Role) {
  const W = Number(p.width), H = Number(p.height), lean = rad(Number(p.lean));
  const t = d.material.thickness, web = webOf(d);
  // the foot: a level board on the table, a web wider than the plate each side, deep enough to stand
  const fd = Math.max(50, Math.round(H * 0.3)), fw = W + 2 * web + 2 * t;
  const foot = addFreePanel(d, { frame: { o: [-fw / 2, 0, fd / 2], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: rect(fw, fd) });
  // the plate on the foot's top, a little behind its middle, leaning back
  const plate = addFreePanel(d, { frame: { o: [-W / 2, t, fd * 0.1], u: [1, 0, 0], v: [0, Math.cos(lean), -Math.sin(lean)] }, side: 1, outer: rounded(W, H, Math.min(20, W / 6, H / 6)) });
  finish(d, [foot, plate], ['foot', 'plate'], role);
}

export const flyerStand: TemplateDef = {
  ...plywood,
  id: 'flyerStand',
  name: 'sen.flyerStand',
  description: 'sen.flyerStand.desc',
  word: 'sen.flyerStand',
  fallback: () => 'stand',
  params: [
    num('width', 'sen.width', 60, 300, 150),
    num('height', 'sen.height', 80, 300, 210),
    { key: 'lean', label: 'sen.leanBack', type: 'choice', options: ([10, 15, 20] as const).map((x) => ({ value: x, label: `sen.tilt${x}` as MsgKey })), default: 10 },
  ],
  generate: generateFlyerStand,
  sentence: { main: 'sen.s.flyerStand' },
};
flyerStand.limits = sheetLimits(flyerStand, { width: 60, height: 80 });
flyerStand.accepts = (m, p) => (cleanAll(flyerStand, m, p) ? null : 'sen.why.engineSize');

// --- the motor bracket ---

/** Stepper motors' faces (NEMA sizes): the face, the boss's hole, the screws' spacing and their holes (mm). */
const NEMA: Record<string, { face: number; boss: number; screws: number; hole: number }> = {
  17: { face: 42.3, boss: 23, screws: 31, hole: 3.4 },
  23: { face: 56.4, boss: 38.5, screws: 47.1, hole: 5.2 },
};

function generateMotorBracket(d: Design, p: Params, role: Role) {
  const n = NEMA[String(p.motor)] ?? NEMA[17];
  const t = d.material.thickness, web = webOf(d);
  // the plate: the motor's face with a gusset and a web either side; as tall as the face and a web over the base
  const g = Math.max(20, n.face * 0.5);
  const PW = n.face + 2 * (t + 2 * web), PH = n.face + 2 * web + t;
  const D = Math.max(Number(p.depth), g + 2 * web + t);
  const BW = PW + 2 * web;
  // the base on the table; the plate stands on it a web in from its back edge
  const base = addFreePanel(d, { frame: { o: [-BW / 2, 0, D / 2], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: rect(BW, D) });
  const zp = -D / 2 + web;
  const plate = addFreePanel(d, { frame: { o: [-PW / 2, t, zp], u: [1, 0, 0], v: [0, 1, 0] }, side: 1, outer: rect(PW, PH) });
  // the gussets: triangles on the base, against the plate's front face, inside its edges by a web
  const gh = PH - web - 2;
  const tri: P2[] = [{ x: 0, y: 0 }, { x: g, y: 0 }, { x: 0, y: gh }];
  const ids: (string | null)[] = [base, plate];
  for (const x of [-PW / 2 + web, PW / 2 - web - t]) ids.push(addFreePanel(d, { frame: { o: [x, t, zp + t], u: [0, 0, 1], v: [0, 1, 0] }, side: -1, outer: tri }));
  if (plate) {
    const cx = PW / 2, cy = t + web + n.face / 2;
    addDetail(d, plate, 'circle', 'cut', cx, cy, n.boss, n.boss);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) addDetail(d, plate, 'circle', 'cut', cx + (sx * n.screws) / 2, cy + (sy * n.screws) / 2, n.hole, n.hole);
  }
  // two slots in the base to screw it down, in front of the gussets
  if (base) for (const x of [BW * 0.25, BW * 0.75]) addDetail(d, base, 'roundrect', 'cut', x, Math.max(web + 6, (D - g - web - t) / 2), 5, Math.max(6, Math.min(16, D - g - 3 * web - t)));
  finish(d, ids, ['base', 'plate', 'gusset-1', 'gusset-2'], role);
}

export const motorBracket: TemplateDef = {
  ...plywood,
  id: 'motorBracket',
  name: 'sen.motorBracket',
  description: 'sen.motorBracket.desc',
  word: 'sen.motorBracket',
  params: [
    { key: 'motor', label: 'sen.motor', type: 'choice', options: [{ value: 17, label: 'sen.motor.17' }, { value: 23, label: 'sen.motor.23' }], default: 17, allowed: (v, p, m) => cleanWith(motorBracket, m, p, 'motor', v), why: () => 'sen.why.engine' },
    num('depth', 'sen.depth', 40, 150, 60),
  ],
  generate: generateMotorBracket,
  sentence: { main: 'sen.s.motorBracket' },
};
motorBracket.accepts = (m, p) => (cleanAll(motorBracket, m, p) ? null : 'sen.why.engineSize');

// --- the pegboard ---

/** Pegboard slots as IKEA's Skådis has them: 5 × 15 mm, 20 mm apart across, every other column 20 mm lower, rows 40 mm apart. */
const PEG = { w: 5, h: 15, dx: 20, dy: 40 };

function generatePegboard(d: Design, p: Params, role: Role) {
  const W = Number(p.width), H = Number(p.height), feet = p.mount === 'feet';
  const t = d.material.thickness;
  const ids: (string | null)[] = [], names: string[] = [];
  // standing: two feet front to back crossing the board's foot in half-slots (the feet first, so they are slotted from their tops)
  const fh = 50, fd = Math.max(100, Math.round(H * 0.4));
  if (feet)
    for (const x of [-W / 2 + W * 0.18, W / 2 - W * 0.18 - t]) {
      ids.push(along(d, x, 0, fd / 2, [{ x: 0, y: 0 }, { x: fd, y: 0 }, { x: fd, y: fh * 0.4 }, { x: fd / 2 + 15, y: fh }, { x: fd / 2 - 15, y: fh }, { x: 0, y: fh * 0.4 }]));
      names.push(`foot-${ids.length}`);
    }
  const y0 = feet ? 10 : 0;
  const board = addFreePanel(d, { frame: { o: [-W / 2, y0, -t / 2], u: [1, 0, 0], v: [0, 1, 0] }, side: 1, outer: rounded(W, H, 10) });
  ids.push(board);
  names.push('board');
  if (board) {
    // the slots in a grid centred on the board, a margin clear of its edges (and of the feet's slots)
    const mx = 15, my = feet ? fh + 10 : 25;
    const cols = Math.floor((W - 2 * mx - PEG.w) / PEG.dx) + 1, rows = Math.floor((H - my - 25 - PEG.h - PEG.dy / 2) / PEG.dy) + 1;
    const x0 = (W - (cols - 1) * PEG.dx) / 2;
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const cy = my + PEG.h / 2 + j * PEG.dy + (i % 2 ? PEG.dy / 2 : 0);
        if (cy + PEG.h / 2 < H - 20) addDetail(d, board, 'roundrect', 'cut', x0 + i * PEG.dx, cy, PEG.w, PEG.h);
      }
  }
  finish(d, ids, names, role);
  if (!feet && board) {
    // hung on a wall: keyholes between the top two rows of slots
    hangByKeyholes(d, board, 4);
    solve(d);
  }
}

export const pegboard: TemplateDef = {
  ...plywood,
  id: 'pegboard',
  name: 'sen.pegboard',
  description: 'sen.pegboard.desc',
  word: 'sen.pegboard',
  params: [
    num('width', 'sen.width', 100, 500, 200),
    // tall enough for rows of slots (from a 45 mm box it was a plain board)
    num('height', 'sen.height', 200, 400, 280),
    {
      key: 'mount', label: 'sen.mount', type: 'choice', default: 'keyholes',
      options: [{ value: 'keyholes', label: 'sen.mount.keyholes' }, { value: 'feet', label: 'sen.mount.feet' }],
      allowed: (v, p, m) => cleanWith(pegboard, m, p, 'mount', v),
      why: () => 'sen.why.engine',
    },
  ],
  generate: generatePegboard,
  sentence: { main: 'sen.s.pegboard' },
};
pegboard.limits = sheetLimits(pegboard, { width: 100, height: 200 });
pegboard.accepts = (m, p) => (cleanAll(pegboard, m, p) ? null : 'sen.why.engineSize');


// --- the honeycomb rack ---

/** A honeycomb rack's lattice for these words: the slats' spacing along the floor, the inside's width and height. */
function honeycomb(p: Params, t: number) {
  const B = Number(p.bottle), c = Math.round(Number(p.columns)), rows = Math.round(Number(p.rows));
  // parallel slats a bottle and a board apart (measured square to them, at 60°)
  const pitch = (B + t) / Math.sin(Math.PI / 3);
  return { pitch, W: c * pitch, H: (Math.sqrt(3) * pitch * rows) / 2 };
}

/** Where a line from (x, 0) at `deg` enters and leaves the rectangle mx..W − mx × my..H − my: null when it misses. */
function clip(x: number, deg: number, W: number, H: number, mx: number, my: number): [P2, P2] | null {
  const dx = Math.cos(rad(deg)), dy = Math.sin(rad(deg));
  let t0 = -Infinity, t1 = Infinity;
  for (const [p0, d, lo, hi] of [[x, dx, mx, W - mx], [0, dy, my, H - my]] as const) {
    if (Math.abs(d) < 1e-12) {
      if (p0 < lo || p0 > hi) return null;
      continue;
    }
    const a = (lo - p0) / d, b = (hi - p0) / d;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  return t1 - t0 > 1e-6 ? [{ x: x + dx * t0, y: dy * t0 }, { x: x + dx * t1, y: dy * t1 }] : null;
}

function generateHoneycomb(d: Design, p: Params, role: Role) {
  const t = d.material.thickness, D = Number(p.depth);
  const { pitch, W, H } = honeycomb(p, t);
  // the frame: two sides, and a bottom and a top between them, standing in a skirt from the sides' edges so their
  // slots have board round them (as the bin rack's frame)
  const w = Math.max(3, t) + 1;
  const SH = H + 2 * t + 2 * w;
  const ids: (string | null)[] = [], names: string[] = [];
  ids.push(along(d, -W / 2 - t, 0, D / 2, rect(D, SH)), along(d, W / 2, 0, D / 2, rect(D, SH)));
  names.push('side-1', 'side-2');
  const fd = D - 2 * w, z0 = D / 2 - w;
  ids.push(addFreePanel(d, { frame: { o: [-W / 2, w, z0], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: rect(W, fd) }));
  ids.push(addFreePanel(d, { frame: { o: [-W / 2, w + t + H, z0], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: rect(W, fd) }));
  names.push('bottom', 'top');
  // the slats: lines at 60° and 120° across the inside, one set an eighth of the pitch in from the left, the other
  // half a pitch on, so they cross away from the frame (a quarter of a row from the bottom and the top, an eighth of
  // a pitch or more from the sides); every slat at 60° first, so each is slotted from its back and each at 120° from its front
  const y0 = w + t;
  const lines: { deg: number; from: number }[] = [];
  for (const [deg, off] of [[60, pitch / 8], [120, pitch / 8 + pitch / 2]] as const)
    for (let k = -Math.ceil(H / pitch) - 2; k <= Math.ceil(W / pitch) + 2; k++) lines.push({ deg, from: off + k * pitch });
  let n = 0;
  for (const l of lines) {
    const seg = clip(l.from, l.deg, W, H, 0, 0);
    if (!seg) continue;
    let [A, B] = seg;
    const L0 = Math.hypot(B.x - A.x, B.y - A.y);
    const u: [number, number, number] = [(B.x - A.x) / L0, (B.y - A.y) / L0, 0];
    // the board's own face (the one its outline is drawn on) is on the side of -nrm; its square end can only be
    // tabbed into the frame where that face's corner meets it, so at an end where the other face's corner would
    // reach the frame first, the slat stops a millimetre short (held there by its half-slots alone)
    const nrm = [-u[1], u[0]];
    const inward = (E: P2) => (E.y < 1e-6 ? [0, 1] : E.y > H - 1e-6 ? [0, -1] : E.x < 1e-6 ? [1, 0] : [-1, 0]);
    const pull = (E: P2, dir: number) => {
      const f = inward(E), nf = nrm[0] * f[0] + nrm[1] * f[1], uf = dir * (u[0] * f[0] + u[1] * f[1]);
      const by = nf > 0 ? ((t / 2) * nf) / uf : ((t / 2) * -nf + 1) / uf;
      return { x: E.x + dir * u[0] * by, y: E.y + dir * u[1] * by };
    };
    [A, B] = [pull(A, 1), pull(B, -1)];
    const L = Math.hypot(B.x - A.x, B.y - A.y);
    // a corner piece too short to hold
    if (L < pitch / 2) continue;
    const o: [number, number, number] = [-W / 2 + A.x - (nrm[0] * t) / 2, y0 + A.y - (nrm[1] * t) / 2, z0];
    ids.push(addFreePanel(d, { frame: { o, u, v: [0, 0, -1] }, side: 1, outer: rect(L, fd) }));
    names.push(`slat-${++n}`);
  }
  finish(d, ids, names, role);
}

export const honeycombRack: TemplateDef = {
  ...plywood,
  id: 'honeycombRack',
  name: 'sen.honeycombRack',
  description: 'sen.honeycombRack.desc',
  word: 'sen.honeycombRack',
  params: [
    num('bottle', 'sen.bottleBody', 50, 110, 80),
    int('columns', 'sen.cellsAcross', 1, 4, 2),
    int('rows', 'sen.rows', 1, 4, 2),
    num('depth', 'sen.depth', 100, 300, 180),
  ],
  generate: generateHoneycomb,
  sentence: { main: 'sen.s.honeycombRack' },
};
honeycombRack.limits = (m, p) => {
  const one = honeycomb({ ...p, columns: 1, rows: 1 }, m.thickness);
  const room = Math.max(m.sheetW, m.sheetH) - 40;
  return {
    ...sheetLimits(honeycombRack, { depth: 100 })(m, p),
    columns: { max: Math.max(1, Math.min(4, Math.floor(room / one.pitch))), why: 'sen.why.sheet' as MsgKey },
    rows: { max: Math.max(1, Math.min(4, Math.floor(Math.min(m.sheetW, m.sheetH) / one.H))), why: 'sen.why.sheet' as MsgKey },
  };
};
honeycombRack.accepts = (m, p) => (cleanAll(honeycombRack, m, p) ? null : 'sen.why.engineSize');
