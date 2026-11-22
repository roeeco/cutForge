// Racks that hang on a wall (milestone 172, BOXES_PLYWOOD_PLAN.md §2), plywood only. Constructions read in boxes.py
// (a behaviour reference only) and written fresh over free boards, as the slot body's are (milestone 165).
//   a bin rack   an upright frame of bins: a back with keyholes, sides, a bottom, a top and a floor for each row, the
//                uprights between the bins, and a board leaning out at 45° across the foot of each row so parts stay in
//                and a hand gets in above it (bintray);
//   a wall rack  a back with keyholes and small shelves on it, each with a lip at its front and lips at its ends that
//                rise towards the back (wallrack).
import type { Design, P2 } from '../../model/types';
import type { MsgKey } from '../../i18n';
import type { ParamDef, Params, TemplateDef } from '../types';
import { addFreePanel, connectSeams, solve } from '../../model/ops';
import { cleatSizes, hangThing, hangWord, plywoodOnly, type CleatAt } from './boards';
import { cleanAll } from './box';
import { sheetLimits } from './shaped';

type Role = (name: string, id: string) => void;
const num = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'number', unit: 'mm', min, max, default: dflt });
const int = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'int', min, max, default: dflt });
const rect = (w: number, h: number): P2[] => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];

/** A board lying level, its underside at `y`, from (x, z) across `w` and back `dz`. */
const level = (d: Design, x: number, y: number, z: number, w: number, dz: number) =>
  addFreePanel(d, { frame: { o: [x, y, z], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: rect(w, dz) });

/** A board standing front to back (its material towards +x from `x`), from z going back, its outline in (back, up). */
const along = (d: Design, x: number, y: number, z: number, outer: P2[]) =>
  addFreePanel(d, { frame: { o: [x, y, z], u: [0, 0, -1], v: [0, 1, 0] }, side: 1, outer });

/** A board standing across (its material towards +z from `z`), from x, its outline in (across, up). */
const across = (d: Design, x: number, y: number, z: number, outer: P2[]) =>
  addFreePanel(d, { frame: { o: [x, y, z], u: [1, 0, 0], v: [0, 1, 0] }, side: -1, outer });

/**
 * Join every board to the boards it meets, hang the back as the words say (keyholes `below` its top edge, or a cleat
 * placed `at`), then name them.
 */
function finish(d: Design, p: Params, ids: (string | null)[], role: Role, names: string[], back: string | null, below?: number, at?: CleatAt) {
  solve(d);
  for (const id of ids) if (id) connectSeams(d, id);
  solve(d);
  const cleat = back ? hangThing(d, p, back, below, at) : [];
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

// --- the bin rack ---

/** A bin rack's rows: each row's clear height between its floor and the board above. */
const rowHeight = (H: number, rows: number, t: number) => (H - 2 * t - (rows - 1) * t) / rows;

function generateBinRack(d: Design, p: Params, role: Role) {
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height), t = d.material.thickness;
  const cols = Math.round(Number(p.columns)), rows = Math.round(Number(p.rows)), f = Number(p.front);
  // the bottom, the top and the back stand in from the sides' edges by a web, so their slots in the sides have board
  // round them (`jointWorks`): the sides are a little taller and deeper than the frame inside them
  const w = Math.max(3, t) + 1;
  const rh = rowHeight(H - 2 * w, rows, t), cw = (W - (cols - 1) * t) / cols;
  const g = d.material.clearance, s2 = Math.SQRT1_2;
  const ids: (string | null)[] = [], names: string[] = [];
  // the back (its front face at z = −D/2 + w + t, as tall as the sides), the sides outside the width, the bottom and the top
 const bz = -D / 2 + w + t, fd = D / 2 - bz;
  // milestone 179: hung on a cleat, the back reaches above the frame by the cleat's band (its rear face below is
  // crossed by the slots of every board joined to it)
  const cleat = p.hang === 'cleat', top = cleat ? cleatSizes(t).band + Math.max(6, 2 * t) + 2 : 0;
  ids.push(across(d, -W / 2, 0, bz, rect(W, H + top)), along(d, -W / 2 - t, 0, D / 2, rect(D, H)), along(d, W / 2, 0, D / 2, rect(D, H)));
  names.push('back', 'side-1', 'side-2');
  ids.push(level(d, -W / 2, w, D / 2, W, fd), level(d, -W / 2, H - w - t, D / 2, W, fd));
  names.push('bottom', 'top');
  // across the foot of each row a board leaning out at 45°: its outer face reaches the front at the slope's top, its
  // outer foot a clearance above the floor (held by the sides and the uprights, not by the floor)
  const fl = Math.max(4, f * rh - t * s2);
  for (let k = 0; k < rows; k++) {
    const y0 = w + t + k * (rh + t);
    if (k > 0) {
      ids.push(level(d, -W / 2, y0 - t, D / 2, W, fd));
      names.push(`floor-${k}`);
    }
    const zb = D / 2 - t * s2 - fl;
    ids.push(addFreePanel(d, { frame: { o: [-W / 2, y0 + g + t * s2, zb], u: [1, 0, 0], v: [0, s2, s2] }, side: 1, outer: rect(W, fl * Math.SQRT2) }));
    names.push(`slope-${k + 1}`);
    // the uprights between the bins of this row, their fronts cut back along the slope's inner face and on up to the front
    const xa = 2 * t * s2 + fl + g;
    for (let i = 1; i < cols; i++) {
      const x = -W / 2 + i * cw + (i - 1) * t;
      ids.push(along(d, x, y0, D / 2, [{ x: xa, y: 0 }, { x: fd, y: 0 }, { x: fd, y: rh }, { x: 0, y: rh }, { x: 0, y: Math.min(rh - 1, xa) }]));
      names.push(`upright-${k + 1}-${i}`);
    }
  }
  // the keyholes in the top bin's back, clear of the top board's slots
  const web = Math.max(2 * t, 6);
  finish(d, p, ids, role, names, ids[0], w + t + 6, { below: Math.max(6, 2 * t), stud: { y: w + t + web, h: Math.min(cleatSizes(t).band, rh - 2 * web), x0: web, x1: cw - web } });
}

export const binRack: TemplateDef = {
  ...plywood,
  id: 'binRack',
  name: 'sen.binRack',
  description: 'sen.binRack.desc',
  word: 'sen.binRack',
  params: [
    num('width', 'sen.width', 80, 300, 160),
    num('depth', 'sen.depth', 50, 200, 100),
    num('height', 'sen.height', 100, 300, 180),
    int('columns', 'sen.columns', 1, 6, 3),
    int('rows', 'sen.rows', 2, 5, 3),
    {
      key: 'front', label: 'sen.binFront', type: 'choice', default: 0.4,
      options: [0.3, 0.4, 0.5].map((v) => ({ value: v, label: `sen.binFront.${v * 10}` as MsgKey })),
    },
    hangWord(() => binRack),
  ],
  generate: generateBinRack,
  sentence: { main: 'sen.s.binRack' },
};
binRack.limits = (m, p) => {
  const t = m.thickness;
  const base = sheetLimits(binRack, { width: 80, depth: 50, height: 100 })(m, p);
  return {
    ...base,
    // every bin at least 30 mm wide and 40 mm tall
    columns: { max: Math.max(1, Math.floor((Number(p.width) + t) / (30 + t))), why: 'sen.why.spaceSmall' as MsgKey },
    rows: { max: Math.max(2, Math.min(5, Math.floor((Number(p.height) - t) / (40 + t)))), why: 'sen.why.spaceSmall' as MsgKey },
  };
};
binRack.accepts = (m, p) => (cleanAll(binRack, m, p) ? null : 'sen.why.engineSize');

// --- the wall rack ---

/** How much taller a wall rack's end lips are at the back than at the front (boxes.py's back height). */
const BACK_RISE = 1.5;

function generateWallRack(d: Design, p: Params, role: Role) {
  const W = Number(p.width), D = Number(p.depth), S = Number(p.spacing), n = Math.round(Number(p.shelves)), fh = Number(p.lip);
  const t = d.material.thickness;
  const bh = fh * BACK_RISE;
  // the back's front face at z = 0; the lowest shelf a web above its foot; room above the highest as between the others
  const web = Math.max(2 * t, 8);
  // every slot needs board round it (`jointWorks`): the lips reach a skirt below the shelf, the end lips twice as far
  // (so the front lip's slots in them have it too) and a skirt in front of the front lip and above its top
  const w = Math.max(3, t) + 1;
  const ids: (string | null)[] = [], names: string[] = [];
  // the back reaches past the end lips by a web, and below the lowest's skirt by a web
  const bw = W + 2 * t + 2 * web, y0 = web + 2 * w;
  ids.push(across(d, -bw / 2, 0, 0, rect(bw, y0 + n * S)));
  names.push('back');
  for (let k = 0; k < n; k++) {
    const y = y0 + k * S;
    ids.push(level(d, -W / 2, y, D, W, D));
    names.push(`shelf-${k + 1}`);
    // the front lip across the shelf's front edge; the end lips beside its ends and the front lip's; the end lips rise
    // from the front lip's height to half as much again at the back
    ids.push(across(d, -W / 2, y - w, D + t, rect(W, w + t + fh)));
    names.push(`lip-${k + 1}`);
    const L = D + t + w;
    const end: P2[] = [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: 2 * w + t + bh + w }, { x: 0, y: 2 * w + t + fh + w }];
    ids.push(along(d, -W / 2 - t, y - 2 * w, L, end), along(d, W / 2, y - 2 * w, L, end));
    names.push(`end-${k + 1}-1`, `end-${k + 1}-2`);
  }
  // a cleat at the back's top, above the end lips; its stand-off under the lowest shelf, between the end lips
  finish(d, p, ids, role, names, ids[0], undefined, { stud: { y: 2, h: Math.max(5, y0 - 2 * w - 4), x0: web + t + web, x1: bw - web - t - web } });
}

export const wallRack: TemplateDef = {
  ...plywood,
  id: 'wallRack',
  name: 'sen.wallRack',
  description: 'sen.wallRack.desc',
  word: 'sen.wallRack',
  params: [
    num('width', 'sen.width', 80, 300, 200),
    num('depth', 'sen.depth', 30, 150, 50),
    num('spacing', 'sen.shelfSpacing', 50, 200, 100),
    int('shelves', 'sen.shelves', 1, 5, 3),
    num('lip', 'sen.lipHeight', 10, 40, 20),
    hangWord(() => wallRack),
  ],
  generate: generateWallRack,
  sentence: { main: 'sen.s.wallRack' },
};
wallRack.limits = (m, p) => ({
  ...sheetLimits(wallRack, { width: 80, depth: 30, spacing: 50 })(m, p),
  // the end lips' backs below the next shelf
  lip: { max: Math.max(10, Math.min(40, Math.floor((Number(p.spacing) - 2 * m.thickness - 5) / BACK_RISE))), why: 'sen.why.lipRoom' as MsgKey },
});
wallRack.accepts = (m, p) => (cleanAll(wallRack, m, p) ? null : 'sen.why.engineSize');
