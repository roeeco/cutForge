// Boxes of boards on any footprint (milestone 180, BOXES_PLYWOOD_PLAN.md E7), plywood only. Each is a construction
// read in boxes.py (a behaviour reference only: THIRD_PARTY.md) and written fresh over the box kit: a base from the
// outline's points (`Footprint` 'outline') and a tray of walls fingered to it and to each other, at an inside corner
// as a corner seen from inside (`Tray.insideCorners`).
//   a chamfered box   a long box whose two ends are cut in walls of a regular polygon: two walls make a point, three
//                     a flat end with its corners cut off (angledbox);
//   a coffin box      six walls, narrow at the feet and the head and widest at the shoulders, a lid that lifts off
//                     with a cross engraved on it (coffin; its sides turn more at the shoulders: `COFFIN`);
//   a tetromino box   the outline of four squares, L, T, S or Z, so a set of them lies together on a desk (tetris);
//   a star box        a star of 4 to 8 points (regularstarbox is two polygon boxes that read as a star when closed:
//                     here the star is the footprint).
import type { Design, MaterialProfile, P2 } from '../../model/types';
import type { MsgKey } from '../../i18n';
import type { Limit, ParamDef, Params, TemplateDef } from '../types';
import { holeRecipe } from '../../easy/recipes';
import { boxLid, setBoxLid } from '../../easy/lid';
import { setBoxSize } from '../../model/boxSize';
import { solve } from '../../model/ops';
import { boardBox, plywoodOnly } from './boards';
import { cleanAll, cleanWith, mainTray, nameRoles } from './box';
import { sheetLimits } from './shaped';
import { cornersWord } from './corners';

type Role = (name: string, id: string) => void;
const num = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'number', unit: 'mm', min, max, default: dflt });
const int = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'int', min, max, default: dflt });

/** Inside or outside, for a box of boards (no crease to crease: nothing folds). */
const sizeAsWord = (def: () => TemplateDef): ParamDef => ({
  key: 'sizeAs', label: 'sen.sizeAs', type: 'choice', default: 'inside',
  options: [{ value: 'inside', label: 'sen.sizeAs.inside' }, { value: 'outside', label: 'sen.sizeAs.outside' }],
  allowed: (v, p, m) => cleanWith(def(), m, p, 'sizeAs', v),
  why: () => 'sen.why.engine',
});

/** Twice a polygon's signed area (positive: anticlockwise). */
const area2 = (pts: P2[]) => pts.reduce((s, q, i) => s + q.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * q.y, 0);

/**
 * A polygon moved out by `t` on every side, its corners mitred (milestone 180): the outline of a box whose walls,
 * `t` thick, stand inside it with their inner faces on the polygon given. Works at inside corners too.
 */
export function growOutline(pts: P2[], t: number): P2[] {
  const n = pts.length, s = area2(pts) >= 0 ? 1 : -1;
  return pts.map((q, i) => {
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    // the outward normals of the edges before and after (to the right of an anticlockwise outline)
    const nrm = (p: P2, r: P2) => {
      const dx = r.x - p.x, dy = r.y - p.y, l = Math.hypot(dx, dy) || 1;
      return { x: (s * dy) / l, y: (-s * dx) / l };
    };
    const n1 = nrm(a, q), n2 = nrm(q, b);
    const k = 1 + n1.x * n2.x + n1.y * n2.y;
    return k < 1e-6 ? { x: q.x + n1.x * t, y: q.y + n1.y * t } : { x: q.x + (t * (n1.x + n2.x)) / k, y: q.y + (t * (n1.y + n2.y)) / k };
  });
}

/**
 * A box of boards on an outline (floor coordinates, centred on the origin), `inside` the walls or `outside` them, its
 * walls `H` tall measured the same way: its tray, or null when the outline cannot be made.
 */
export function outlineBox(d: Design, pts: P2[], H: number, as: 'inside' | 'outside', corners?: Params[string]): string | null {
  const t = d.material.thickness;
  const base = as === 'inside' ? growOutline(pts, t) : pts;
  const tr = boardBox(d, { kind: 'outline', pts: base, height: H }, H);
  if (!tr) return null;
  if (corners === 'rigid') d.trays[tr].outsideCorners = 'reach';
  if (as === 'inside') d.sizeAs = 'inside';
  setBoxSize(d, tr, { h: H }, as);
  solve(d);
  return tr;
}

/** Limits worked out only when asked for (`sheetLimits` bisects over builds), some of them changed by `extra`. */
function lazyLimits(base: Record<string, Limit>, extra: Record<string, (l: Limit | undefined) => Limit>): Record<string, Limit> {
  const out: Record<string, Limit> = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(extra)]))
    Object.defineProperty(out, k, { enumerable: true, get: () => (extra[k] ? extra[k](k in base ? base[k] : undefined) : base[k]) });
  return out;
}

const plywood: Pick<TemplateDef, 'materials' | 'canMake' | 'fallback' | 'status' | 'version'> = {
  version: 1,
  status: 'beta',
  materials: ['plywood'],
  canMake: plywoodOnly,
  fallback: () => 'box',
};

// --- the chamfered box ---

/** A chamfered box's outline (AngledBox): W × D, each end the half of a regular polygon of 2n + 2 sides `n` walls make, as far apart as the width takes. */
export function chamferOutline(W: number, D: number, n: number): P2[] {
  const m = 2 * Math.max(1, Math.round(n)) + 2;
  const R = D / 2 / Math.cos(Math.PI / m);
  // flat top and bottom: corners either side of straight up, then round (anticlockwise)
  const reg = Array.from({ length: m }, (_, k) => {
    const a = Math.PI / 2 - Math.PI / m + (2 * Math.PI * k) / m;
    return { x: R * Math.cos(a), y: R * Math.sin(a) };
  });
  const xmax = Math.max(...reg.map((q) => q.x));
  const shift = Math.max(0, W / 2 - xmax);
  return reg.map((q) => ({ x: q.x + Math.sign(q.x) * shift, y: q.y }));
}

/** How wide a chamfered box must be for its depth and end walls (its ends' polygon, and 10 mm of straight side between). */
export function chamferMinWidth(D: number, n: number): number {
  const m = 2 * Math.max(1, Math.round(n)) + 2;
  const R = D / 2 / Math.cos(Math.PI / m);
  return Math.ceil(2 * Math.max(...Array.from({ length: m }, (_, k) => R * Math.cos(Math.PI / 2 - Math.PI / m + (2 * Math.PI * k) / m))) + 10);
}

function generateChamferBox(d: Design, p: Params, role: Role) {
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height);
  if (!outlineBox(d, chamferOutline(W, D, Number(p.endWalls)), H, p.sizeAs === 'outside' ? 'outside' : 'inside', p.corners)) return;
  nameRoles(d, role);
}

export const chamferBox: TemplateDef = {
  ...plywood,
  id: 'chamferBox',
  name: 'sen.chamferBox',
  description: 'sen.chamferBox.desc',
  word: 'sen.chamferBox',
  params: [
    num('width', 'sen.width', 60, 300, 200),
    num('depth', 'sen.depth', 40, 250, 100),
    num('height', 'sen.height', 20, 250, 60),
    sizeAsWord(() => chamferBox),
    cornersWord((v, p, m) => cleanWith(chamferBox, m, p, 'corners', v)),
    int('endWalls', 'sen.endWalls', 2, 5, 3),
  ],
  generate: generateChamferBox,
  sentence: { main: 'sen.s.chamferBox' },
};
chamferBox.limits = (m, p) =>
  lazyLimits(sheetLimits(chamferBox, { width: 60, depth: 40, height: 20 })(m, p), {
    // longer than its ends: a regular polygon would be a box with straight sides
    width: (l) => ({ ...l, min: chamferMinWidth(Number(p.depth), Number(p.endWalls)), why: l?.why }),
    // five walls meet at 150°, the most a finger joint is laid out for: on thick plywood their fingers are slivers
    endWalls: () => ({ max: [5, 4, 3].find((n) => cleanWith(chamferBox, m, p, 'endWalls', n)) ?? 2, why: 'sen.why.engineSize' as MsgKey }),
  });
chamferBox.accepts = (m, p) => (Number(p.width) < chamferMinWidth(Number(p.depth), Number(p.endWalls)) ? 'sen.why.chamferWide' : cleanAll(chamferBox, m, p) ? null : 'sen.why.engineSize');

// --- the coffin box ---

/**
 * Coffin's proportions: the shoulders 0.7 of the way from the feet (boxes.py's default). Its sides turn at the shoulders
 * by 32°: the walls there meet at 148°, inside the 150° a finger joint is laid out for (boxes.py's own narrower head and
 * feet, 5/8 of the shoulders, turn there by only 20°).
 */
const COFFIN = { shoulder: 0.7, turn: (32 * Math.PI) / 180 };

/** How far in from the shoulders a coffin's feet and head are (each side), for its sides to turn by `COFFIN.turn`. */
export function coffinInset(L: number): number {
  const f = COFFIN.shoulder * L, h = (1 - COFFIN.shoulder) * L;
  let lo = 0, hi = L;
  for (let i = 0; i < 50; i++) {
    const a = (lo + hi) / 2;
    if (Math.atan(a / f) + Math.atan(a / h) < COFFIN.turn) lo = a;
    else hi = a;
  }
  return hi;
}

/** The narrowest a coffin may be at the shoulders: its feet and head at least 24 mm across. */
export const coffinMinWidth = (L: number) => Math.ceil(2 * (coffinInset(L) + 12));

/** A coffin's outline: `L` from the feet (at the front) to the head, `Wd` wide at the shoulders. */
export function coffinOutline(L: number, Wd: number): P2[] {
  const e = Math.max(5, Wd / 2 - coffinInset(L)), s = -L / 2 + COFFIN.shoulder * L;
  // floor coordinates: y along −Z, so the feet (the front, +Z) are at -L/2
  return [{ x: -e, y: -L / 2 }, { x: e, y: -L / 2 }, { x: Wd / 2, y: s }, { x: e, y: L / 2 }, { x: -e, y: L / 2 }, { x: -Wd / 2, y: s }];
}

function generateCoffinBox(d: Design, p: Params, role: Role) {
  const L = Number(p.length), Wd = Number(p.width), H = Number(p.height);
  const tr = outlineBox(d, coffinOutline(L, Wd), H, p.sizeAs === 'outside' ? 'outside' : 'inside', p.corners);
  if (!tr) return;
  setBoxLid(d, tr, 'liftoff');
  solve(d);
  const lid = boxLid(d, tr);
  const top = lid.kind === 'liftoff' ? d.panels[lid.top] : undefined;
  if (top && p.cross === 'cross') {
    // a cross engraved on the lid, its crossing nearer the head (boxes.py's cross is a fifth of the length)
    const c = Math.min(top.w * 0.45, top.h * 0.3), bar = Math.max(4, c * 0.12);
    const cx = top.w / 2, cy = top.h * 0.55;
    holeRecipe(d, top.id, 'rect', cx, cy, bar, c, 'engrave');
    holeRecipe(d, top.id, 'rect', cx, cy + c * 0.18, c * 0.6, bar, 'engrave');
  }
  solve(d);
  nameRoles(d, role);
}

export const coffinBox: TemplateDef = {
  ...plywood,
  id: 'coffinBox',
  name: 'sen.coffinBox',
  description: 'sen.coffinBox.desc',
  word: 'sen.coffinBox',
  params: [
    num('length', 'sen.length', 100, 300, 200),
    num('width', 'sen.coffinWidth', 50, 200, 90),
    num('height', 'sen.height', 25, 150, 50),
    sizeAsWord(() => coffinBox),
    cornersWord((v, p, m) => cleanWith(coffinBox, m, p, 'corners', v)),
    {
      key: 'cross', label: 'sen.cross', type: 'choice', default: 'cross',
      options: [{ value: 'cross', label: 'sen.cross.cross' }, { value: 'none', label: 'sen.cross.none' }],
    },
  ],
  generate: generateCoffinBox,
  sentence: { main: 'sen.s.coffinBox' },
};
coffinBox.limits = (m, p) =>
  lazyLimits(sheetLimits(coffinBox, { length: 100, height: 25 })(m, p), {
    // no wider at the shoulders than half its length (a coffin, not a hexagon), wide enough for its feet and head
    width: () => ({ min: coffinMinWidth(Number(p.length)), max: Math.max(coffinMinWidth(Number(p.length)), Math.floor(Number(p.length) / 2)), why: 'sen.why.coffinWide' as MsgKey }),
  });
coffinBox.accepts = (m, p) =>
  Number(p.width) > Number(p.length) / 2 || Number(p.width) < coffinMinWidth(Number(p.length)) ? 'sen.why.coffinWide' : cleanAll(coffinBox, m, p) ? null : 'sen.why.engineSize';

// --- the tetromino box ---

/** The tetrominoes that are not rectangles (an I and an O are a plain box), as their outlines in squares. */
export const TETROMINOES: Record<string, [number, number][]> = {
  L: [[0, 0], [3, 0], [3, 2], [2, 2], [2, 1], [0, 1]],
  T: [[0, 0], [3, 0], [3, 1], [2, 1], [2, 2], [1, 2], [1, 1], [0, 1]],
  S: [[0, 0], [2, 0], [2, 1], [3, 1], [3, 2], [1, 2], [1, 1], [0, 1]],
  Z: [[1, 0], [3, 0], [3, 1], [2, 1], [2, 2], [0, 2], [0, 1], [1, 1]],
};

/** A tetromino's outline, each square `s` across (outside, so a set of them fits together), centred on the origin. */
export function tetrominoOutline(piece: string, s: number): P2[] {
  const q = TETROMINOES[piece] ?? TETROMINOES.L;
  const cx = (Math.max(...q.map((x) => x[0])) * s) / 2, cy = (Math.max(...q.map((x) => x[1])) * s) / 2;
  return q.map(([x, y]) => ({ x: x * s - cx, y: y * s - cy }));
}

function generateTetrominoBox(d: Design, p: Params, role: Role) {
  if (!outlineBox(d, tetrominoOutline(String(p.piece), Number(p.block)), Number(p.height), 'outside')) return;
  nameRoles(d, role);
}

export const tetrominoBox: TemplateDef = {
  ...plywood,
  id: 'tetrominoBox',
  name: 'sen.tetrominoBox',
  description: 'sen.tetrominoBox.desc',
  word: 'sen.tetrominoBox',
  params: [
    {
      key: 'piece', label: 'sen.piece', type: 'choice', default: 'L',
      options: Object.keys(TETROMINOES).map((k) => ({ value: k, label: `sen.piece.${k}` as MsgKey })),
    },
    num('block', 'sen.block', 30, 100, 50),
    num('height', 'sen.height', 20, 200, 40),
  ],
  generate: generateTetrominoBox,
  sentence: { main: 'sen.s.tetrominoBox' },
};
tetrominoBox.limits = sheetLimits(tetrominoBox, { block: 30, height: 20 });
tetrominoBox.accepts = (m, p) => (cleanAll(tetrominoBox, m, p) ? null : 'sen.why.engineSize');

// --- the star box ---

/**
 * How far in a star's inner corners are, as a share of its points' radius, for `n` points: its points about 50° to 60°
 * sharp and its inner corners 100° to 140° (from outside), both inside the 30° to 150° a finger joint is laid out for.
 * A star of three points cannot have both (its inner corners are nearly straight), so a star has four or more.
 */
export const starInner = (n: number) => Math.min(0.6, 0.25 + 0.05 * Math.round(n));

/** A star's outline: `n` points `R` from the middle, the first pointing to the back. */
export function starOutline(n: number, R: number): P2[] {
  const k = Math.max(4, Math.round(n));
  return Array.from({ length: 2 * k }, (_, i) => {
    const r = i % 2 ? R * starInner(k) : R, a = Math.PI / 2 + (Math.PI * i) / k;
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  });
}

function generateStarBox(d: Design, p: Params, role: Role) {
  if (!outlineBox(d, starOutline(Number(p.points), Number(p.radius)), Number(p.height), p.sizeAs === 'outside' ? 'outside' : 'inside', p.corners)) return;
  nameRoles(d, role);
}

export const starBox: TemplateDef = {
  ...plywood,
  id: 'starBox',
  name: 'sen.starBox',
  description: 'sen.starBox.desc',
  word: 'sen.starBox',
  params: [
    int('points', 'sen.points', 4, 8, 5),
    num('radius', 'sen.starRadius', 40, 150, 80),
    num('height', 'sen.height', 20, 200, 50),
    sizeAsWord(() => starBox),
    cornersWord((v, p, m) => cleanWith(starBox, m, p, 'corners', v)),
  ],
  generate: generateStarBox,
  sentence: { main: 'sen.s.starBox' },
};
starBox.limits = (m: MaterialProfile, p: Params) => sheetLimits(starBox, { radius: 40, height: 20 })(m, p);
starBox.accepts = (m, p) => (cleanAll(starBox, m, p) ? null : 'sen.why.engineSize');
