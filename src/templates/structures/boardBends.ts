// Boxes of boards whose walls bend round living hinges on any outline (milestone 181, BOXES_PLYWOOD_PLAN.md E8),
// plywood that bends only. Constructions read in boxes.py (a behaviour reference only: THIRD_PARTY.md), written fresh
// over the box kit: a base from an outline whose chosen corners are rounded (`Footprint` 'outline', points with
// `curve: 'round'`), its walls bending round them as one strip with the straight walls between (milestone 64's bands).
//   a U box                 a box whose base bends up into its front and back walls round two living hinges, its
//                           ends U-shaped boards (ubox);
//   a rounded polygon box   a regular polygon with every corner rounded (roundedregularbox);
//   a rounded trapezoid box a trapezoid with all its corners, or only its back two or its front two, rounded
//                           (roundedtrapezoidbox, its radius per corner; flexbox2 and flexbox4 round two corners);
//   a heart box             two round lobes, a point and an inside corner between the lobes, a lid that drops in
//                           (heart).
import type { Design, MaterialProfile, P2, SketchPt } from '../../model/types';
import type { MsgKey } from '../../i18n';
import type { Limit, ParamDef, Params, TemplateDef } from '../types';
import { roundedMin } from '../../easy/recipes';
import { setBoxLid } from '../../easy/lid';
import { setBoxSize } from '../../model/boxSize';
import { bendOf } from '../../model/materials';
import { trayRing } from '../../model/cartons';
import { solve } from '../../model/ops';
import { boardBox, boardBoxRect } from './boards';
import { cleanAll, cleanWith, nameRoles } from './box';
import { sheetLimits } from './shaped';
import { growOutline } from './boardOutlines';

type Role = (name: string, id: string) => void;
const num = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'number', unit: 'mm', min, max, default: dflt });

/**
 * Plywood whose walls bend round a box's corners at a size a student makes (milestone 181): the tightest a 60 mm wall
 * bends round no more than 30 mm (plywood 3 and 4 mm; 5 mm needs about 50, 6 mm 90, 8 mm over 300).
 */
export const bendsRound = (m: MaterialProfile) => m.kind === 'plywood' && roundedMin(m, 60) <= 30;

const plywood: Pick<TemplateDef, 'materials' | 'canMake' | 'fallback' | 'status' | 'version'> = {
  version: 1,
  status: 'beta',
  materials: ['plywood'],
  canMake: bendsRound,
  fallback: () => 'box',
};

/** Inside or outside, for a box of boards (no crease to crease: nothing folds). */
const sizeAsWord = (def: () => TemplateDef): ParamDef => ({
  key: 'sizeAs', label: 'sen.sizeAs', type: 'choice', default: 'inside',
  options: [{ value: 'inside', label: 'sen.sizeAs.inside' }, { value: 'outside', label: 'sen.sizeAs.outside' }],
  allowed: (v, p, m) => cleanWith(def(), m, p, 'sizeAs', v),
  why: () => 'sen.why.engine',
});

/**
 * A box of boards on an outline whose corners marked `round` are rounded to `r` (the radius inside the walls when the
 * sizes are said inside: the base's corner is then `r` and the board further out), its walls `H` tall.
 */
function roundedOutlineBox(d: Design, pts: P2[], rounded: boolean[], r: number, H: number, as: 'inside' | 'outside', first?: (tray: string) => void): string | null {
  const t = d.material.thickness;
  const base = as === 'inside' ? growOutline(pts, t) : pts;
  const R = as === 'inside' ? r + t : r;
  const out: SketchPt[] = base.map((q, i) => (rounded[i] ? { ...q, curve: 'round', r: R } : { ...q }));
  // walls end up a little taller than said inside: bend for a little more (as the box's rounded shape does)
  const tr = boardBox(d, { kind: 'outline', pts: out, height: H + 10 }, H);
  if (!tr) return null;
  // a lid before the sizes are stated: a box said inside keeps its stated sizes through a lid (`keepingStatedSizes`), and
  // re-stating a width on an outline with rounded corners would lose them
  first?.(tr);
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

const asOf = (p: Params) => (p.sizeAs === 'outside' ? 'outside' : 'inside');

// --- the U box ---

function generateUBox(d: Design, p: Params, role: Role) {
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height);
  const tr = boardBoxRect(d, W, D, H);
  if (!tr) return;
  // the front and back walls grow off the base round a living hinge, as tight as the board bends or as asked
  const r = Math.max(Number(p.radius), bendOf(d.material).patternR);
  for (const e of ['e0', 'e2']) {
    const w = trayRing(d, d.trays[tr]).find((x) => x.edge === e)?.wall;
    const c = Object.values(d.connections).find((x) => x.grown && x.b.panelId === w);
    if (!c) continue;
    c.kind = c.pref = 'fold';
    c.radius = r;
  }
  solve(d);
  if (asOf(p) === 'inside') d.sizeAs = 'inside';
  setBoxSize(d, tr, { w: W, d: D, h: H }, asOf(p));
  solve(d);
  nameRoles(d, role);
}

export const uBox: TemplateDef = {
  ...plywood,
  id: 'uBox',
  name: 'sen.uBox',
  description: 'sen.uBox.desc',
  word: 'sen.uBox',
  params: [
    num('width', 'sen.width', 60, 300, 160),
    num('depth', 'sen.depth', 60, 250, 120),
    num('height', 'sen.height', 40, 250, 80),
    sizeAsWord(() => uBox),
    num('radius', 'sen.bendRadius', 20, 80, 30),
  ],
  generate: generateUBox,
  sentence: { main: 'sen.s.uBox' },
};
uBox.limits = (m, p) => {
  // the bend: as asked, never tighter than the board bends; the walls rise a flat 20 mm above it, the base as much between
  const r = Math.max(Number(p.radius), bendOf(m).patternR);
  return lazyLimits(sheetLimits(uBox, { width: 60, depth: Math.max(60, 2 * r + 20), height: Math.max(40, r + 20) })(m, p), {
    depth: (l) => ({ ...l, min: 2 * r + 20, why: l?.why }),
    height: (l) => ({ ...l, min: r + 20, why: l?.why }),
    radius: () => ({ min: Math.min(80, bendOf(m).patternR), max: Math.max(Math.min(80, bendOf(m).patternR), Math.floor(Math.min((Number(p.depth) - 20) / 2, Number(p.height) - 20))), why: 'sen.why.bendRoom' as MsgKey }),
  });
};
uBox.accepts = (m, p) => (cleanAll(uBox, m, p) ? null : 'sen.why.engineSize');

// --- the rounded polygon box ---

/** A rounded polygon's outline: a regular polygon `n` sides `S` across its corners, one side at the front. */
export function polyOutline(n: number, S: number): P2[] {
  const k = Math.max(3, Math.round(n));
  return Array.from({ length: k }, (_, i) => {
    const a = -Math.PI / 2 - Math.PI / k + (2 * Math.PI * i) / k;
    return { x: (S / 2) * Math.cos(a), y: (S / 2) * Math.sin(a) };
  });
}

function generateRoundPolyBox(d: Design, p: Params, role: Role) {
  const pts = polyOutline(Number(p.sides), Number(p.size));
  if (!roundedOutlineBox(d, pts, pts.map(() => true), Number(p.radius), Number(p.height), asOf(p))) return;
  nameRoles(d, role);
}

export const roundPolyBox: TemplateDef = {
  ...plywood,
  id: 'roundPolyBox',
  name: 'sen.roundPolyBox',
  description: 'sen.roundPolyBox.desc',
  word: 'sen.roundPolyBox',
  params: [
    // the key `sides` is the box's own polygon's: this one is `corners`; four is a rounded box (the box's own shape), and
    // a triangle's corners would not bend on 4 mm plywood at a size a student makes
    { key: 'corners', label: 'sen.polyCorners', type: 'choice', default: 5, options: [5, 6, 7, 8].map((v) => ({ value: v, label: `sen.polyCorners.${v}` as MsgKey })),
      // more corners turn less each, so they bend round a larger radius and leave shorter sides: offered where they cut clean
      allowed: (v, p, m) => cleanWith(roundPolyBox, m, p, 'corners', v),
      why: () => 'sen.why.engineSize',
    },
    num('size', 'sen.across', 80, 300, 150),
    num('height', 'sen.height', 30, 250, 60),
    sizeAsWord(() => roundPolyBox),
    num('radius', 'sen.cornerRadius', 10, 80, 25),
  ],
  generate: (d, p, role) => generateRoundPolyBox(d, { ...p, sides: p.corners }, role),
  sentence: { main: 'sen.s.roundPolyBox' },
};
roundPolyBox.limits = (m, p) => lazyLimits(sheetLimits(roundPolyBox, { size: 80, height: 30 })(m, p), {});
roundPolyBox.accepts = (m, p) => (cleanAll(roundPolyBox, m, p) ? null : 'sen.why.engineSize');

// --- the rounded trapezoid box ---

/** Which corners of a trapezoid are rounded: front left, front right, back right, back left. */
const TRAP_CORNERS: Record<string, boolean[]> = { all: [true, true, true, true], back: [false, false, true, true], front: [true, true, false, false] };

/** A trapezoid's outline: `F` wide at the front, `B` at the back, `D` from front to back, centred. */
export function trapOutline(F: number, B: number, D: number): P2[] {
  // floor coordinates: y along −Z, so the front (+Z) is at −D/2
  return [{ x: -F / 2, y: -D / 2 }, { x: F / 2, y: -D / 2 }, { x: B / 2, y: D / 2 }, { x: -B / 2, y: D / 2 }];
}

function generateRoundTrapBox(d: Design, p: Params, role: Role) {
  const pts = trapOutline(Number(p.width), Number(p.back), Number(p.depth));
  if (!roundedOutlineBox(d, pts, TRAP_CORNERS[String(p.rounded)] ?? TRAP_CORNERS.all, Number(p.radius), Number(p.height), asOf(p))) return;
  nameRoles(d, role);
}

export const roundTrapBox: TemplateDef = {
  ...plywood,
  id: 'roundTrapBox',
  name: 'sen.roundTrapBox',
  description: 'sen.roundTrapBox.desc',
  word: 'sen.roundTrapBox',
  params: [
    num('width', 'sen.frontWidth', 80, 300, 180),
    num('back', 'sen.backWidth', 40, 280, 110),
    num('depth', 'sen.depth', 60, 250, 110),
    num('height', 'sen.height', 30, 250, 60),
    sizeAsWord(() => roundTrapBox),
    {
      key: 'rounded', label: 'sen.roundedCorners', type: 'choice', default: 'all',
      options: (['all', 'back', 'front'] as const).map((v) => ({ value: v, label: `sen.roundedCorners.${v}` as MsgKey })),
    },
    num('radius', 'sen.cornerRadius', 10, 80, 35),
  ],
  generate: generateRoundTrapBox,
  sentence: { main: 'sen.s.roundTrapBox' },
};
roundTrapBox.limits = (m, p) =>
  lazyLimits(sheetLimits(roundTrapBox, { width: 120, depth: 100, height: 30 })(m, p), {
    // (the searches for the largest sizes start where its rounded corners leave walls between them: 100 mm deep)
    // narrower at the back than at the front: a trapezoid, not a rectangle
    back: () => ({ max: Math.max(40, Number(p.width) - 20), why: 'sen.why.trapBack' as MsgKey }),
  });
roundTrapBox.accepts = (m, p) => (Number(p.back) > Number(p.width) - 20 ? 'sen.why.trapBack' : cleanAll(roundTrapBox, m, p) ? null : 'sen.why.engineSize');

// --- the heart box ---

/**
 * A heart's outline for sides `l` long (boxes.py's: a square on its corner, a round lobe on each upper side): the point
 * at the front, each side running up to a lobe of two quarter circles with a short flat between them (a wall stands on
 * it: a lobe bent all the way round would leave a sliver of wall there), and two short walls meeting at an inside corner
 * between the lobes, at least `cleft` long (room for their fingers). As points, the lobes' corners marked round, and
 * their radius.
 */
export function heartOutline(l: number, cleft = 0): { pts: P2[]; rounded: boolean[]; r: number } {
  const s = Math.SQRT1_2;
  const f = 0.18 * l, c = Math.max(0.13 * l, cleft), r = (l - c - f) / 2;
  // the right side runs from the point along u; the lobe turns left (n) round two quarter circles
  const u = { x: s, y: s }, n = { x: -s, y: s };
  const A = { x: l * s, y: l * s };
  const P1 = { x: A.x + u.x * r, y: A.y + u.y * r };
  const P2 = { x: P1.x + n.x * (2 * r + f), y: P1.y + n.y * (2 * r + f) };
  const Q = { x: P2.x - u.x * (r + c), y: P2.y - u.y * (r + c) };
  const mirror = (q: P2) => ({ x: -q.x, y: q.y });
  const pts = [{ x: 0, y: 0 }, P1, P2, Q, mirror(P2), mirror(P1)];
  // centred front to back (floor coordinates: y along −Z, the point at the front)
  const y0 = (Math.min(...pts.map((q) => q.y)) + Math.max(...pts.map((q) => q.y))) / 2;
  return { pts: pts.map((q) => ({ x: q.x, y: q.y - y0 })), rounded: [false, true, true, false, true, true], r };
}

/** How wide a heart is: twice the furthest its lobes reach across (a lobe's first arc, centred `r` in from its side). */
const heartWidth = (l: number, cleft: number) => {
  const r = heartOutline(l, cleft).r;
  return 2 * (Math.SQRT1_2 * (l - r) + r);
};

/** The sides a heart `W` wide has (its width grows with them). */
export function heartSide(W: number, cleft: number): number {
  let lo = 1, hi = W;
  for (let i = 0; i < 40; i++) {
    const l = (lo + hi) / 2;
    if (heartWidth(l, cleft) < W) lo = l;
    else hi = l;
  }
  return (lo + hi) / 2;
}

function generateHeartBox(d: Design, p: Params, role: Role) {
  // the walls between the lobes long enough for their fingers and the base's (four boards and some)
  const cleft = 4 * d.material.thickness + 6;
  const h = heartOutline(heartSide(Number(p.width), cleft), cleft);
  // its lid drops in onto a ledge inside the walls (the engine's drop-in lid: a cap's own inside corner is not fingered)
  const tr = roundedOutlineBox(d, h.pts, h.rounded, h.r, Number(p.height), asOf(p), (t) => void (p.lid === 'liftoff' && setBoxLid(d, t, 'liftoff', 'dropin')));
  if (!tr) return;
  nameRoles(d, role);
}

export const heartBox: TemplateDef = {
  ...plywood,
  id: 'heartBox',
  name: 'sen.heartBox',
  description: 'sen.heartBox.desc',
  word: 'sen.heartBox',
  params: [
    num('width', 'sen.width', 140, 300, 180),
    num('height', 'sen.height', 30, 150, 50),
    sizeAsWord(() => heartBox),
    {
      key: 'lid', label: 'sen.lid', type: 'choice', default: 'liftoff', addon: { off: 'none' },
      options: [{ value: 'none', label: 'sen.lid.none' }, { value: 'liftoff', label: 'sen.lid.liftoff' }],
      allowed: (v, p, m) => v === 'none' || cleanWith(heartBox, m, p, 'lid', v),
      why: () => 'sen.why.engine',
    },
  ],
  generate: generateHeartBox,
  sentence: { main: 'sen.s.heartBox' },
};
heartBox.limits = (m, p) => lazyLimits(sheetLimits(heartBox, { width: 140, height: 30 })(m, p), {});
heartBox.accepts = (m, p) => (cleanAll(heartBox, m, p) ? null : 'sen.why.engineSize');
