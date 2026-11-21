// Boxes that stack (milestone 177, BOXES_PLYWOOD_PLAN.md §3.7, engine step E6), plywood only. Constructions read in
// boxes.py (a behaviour reference only: THIRD_PARTY.md) and written fresh over the box kit: a box of boards whose
// walls have stacking edges (`Panel.stack`, src/model/stack.ts), feet under them and a tongue on their tops, so one
// box stands on another like it and cannot slide off.
//   a stacking bin  a box with no front wall: across the foot of its front a board leaning out at 45° keeps parts in,
//                   and a hand gets in above it; bins stack into a wall of drawers with no runners (stackablebin);
//   a sieve stack   boxes with a grid of holes through the floor, stacked: what is poured in the top is sorted by
//                   size on the way down (brick_sorter).
import type { MsgKey } from '../../i18n';
import type { Limit, ParamDef, Params, TemplateDef } from '../types';
import type { MaterialProfile } from '../../model/types';
import { addDetail, addFreePanel, connectSeams, deletePanel, solve } from '../../model/ops';
import { addStack, stackLeast } from '../../model/stack';
import { trayRing } from '../../model/cartons';
import { plywoodOnly } from './boards';
import { insideOf, sizeAsWord, sizedBox } from './boardBoxes';
import { cleanAll } from './box';
import { nameAll, sheetLimits, wallsOf } from './shaped';

type Role = (name: string, id: string) => void;
type D = Parameters<TemplateDef['generate']>[0];
const num = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'number', unit: 'mm', min, max, default: dflt });

/** Every wall of a box's tray given stacking edges. */
function stackWalls(d: D, tr: string) {
  addStack(d, trayRing(d, d.trays[tr]).map((r) => r.wall));
}

/** A structure's limits: as large as one sheet takes, and never so small that the feet do not fit on a wall. */
function stackLimits(def: TemplateDef, lows: Record<string, number>): NonNullable<TemplateDef['limits']> {
  const sheet = sheetLimits(def, lows);
  return (m, p) => {
    const out = sheet(m, p);
    const least = stackLeast(m);
    const res: Record<string, Limit> = {};
    for (const key of Object.keys(out))
      Object.defineProperty(res, key, {
        enumerable: true,
        get: () => (key === 'width' || key === 'depth' ? { ...out[key], min: Math.max(lows[key], least) } : out[key]),
      });
    return res;
  };
}

/** Do this board's feet fit these words (the walls' outsides at least the feet's least)? */
const feetFit = (m: MaterialProfile, p: Params) => Math.min(Number(p.width), Number(p.depth)) >= stackLeast(m);

const plywood: Pick<TemplateDef, 'materials' | 'canMake' | 'fallback' | 'status' | 'version'> = {
  version: 1,
  status: 'beta',
  materials: ['plywood'],
  canMake: plywoodOnly,
  fallback: () => 'box',
};

// --- the stacking bin ---

function generateStackBin(d: D, p: Params, role: Role) {
  // the front left open (the base's first edge), as the open-front box's
  const tr = sizedBox(d, p, () => {
    const front = wallsOf(d).e0;
    if (front) deletePanel(d, front);
  });
  if (!tr) return;
  stackWalls(d, tr);
  const ins = insideOf(d);
  const base = d.panels[d.trays[tr].baseId];
  if (!ins || !base) return;
  const t = d.material.thickness, g = d.material.clearance, s2 = Math.SQRT1_2;
  // across the foot of the front a board leaning out at 45°, between the side walls: its outer face reaches a web
  // short of the sides' front edges at the slope's top (so its slots there have board round them), its foot a
  // clearance above the floor (held by the side walls, not by the floor)
  const H = d.trays[tr].height - t;
  const web = Math.max(3, t) + 1;
  const zFront = base.frame.o[2] - web;
  const fl = Math.max(6, Number(p.front) * H - t * s2);
  const zb = zFront - t * s2 - fl;
  const slope = addFreePanel(d, {
    frame: { o: [ins.xL, ins.floor + g + t * s2, zb], u: [1, 0, 0], v: [0, s2, s2] },
    side: 1,
    outer: [{ x: 0, y: 0 }, { x: ins.xR - ins.xL, y: 0 }, { x: ins.xR - ins.xL, y: fl * Math.SQRT2 }, { x: 0, y: fl * Math.SQRT2 }],
  });
  solve(d);
  if (slope) connectSeams(d, slope);
  solve(d);
  nameAll(d, role, slope ? { slope } : {});
}

export const stackBin: TemplateDef = {
  ...plywood,
  id: 'stackBin',
  name: 'sen.stackBin',
  description: 'sen.stackBin.desc',
  word: 'sen.stackBin',
  params: [
    num('width', 'sen.width', 60, 300, 100),
    num('depth', 'sen.depth', 60, 300, 120),
    num('height', 'sen.height', 50, 200, 80),
    sizeAsWord(() => stackBin),
    {
      key: 'front', label: 'sen.binFront', type: 'choice', default: 0.4,
      options: [0.3, 0.4, 0.5].map((v) => ({ value: v, label: `sen.binFront.${v * 10}` as MsgKey })),
    },
  ],
  generate: generateStackBin,
  sentence: { main: 'sen.s.stackBin' },
};
stackBin.limits = stackLimits(stackBin, { width: 60, depth: 60, height: 50 });
stackBin.accepts = (m, p) => (!feetFit(m, p) ? 'sen.why.stackRoom' : cleanAll(stackBin, m, p) ? null : 'sen.why.engineSize');

// --- the sieve stack ---

/** A sieve's holes and the grid between them (boxes.py's brick sorter levels: hole, grid), mm. */
const SIEVES: Record<number, number> = { 10: 3, 15: 4, 20: 5, 30: 5 };

/** How many holes `hole` across, with a grid `bar` between them, a floor `L` long takes (and a bar round the edge). */
const holesIn = (L: number, hole: number, bar: number) => Math.max(0, Math.floor((L - bar) / (hole + bar)));

function generateSieveStack(d: D, p: Params, role: Role) {
  const tr = sizedBox(d, p);
  if (!tr) return;
  stackWalls(d, tr);
  const ins = insideOf(d);
  const base = d.panels[d.trays[tr].baseId];
  if (!ins || !base) return;
  // the grid of holes in the floor's clear inside, centred, a bar (and a millimetre) clear of the walls
  const hole = Number(p.hole), bar = SIEVES[hole] ?? 4, edge = bar + 1;
  const W = ins.xR - ins.xL - 2 * edge, Dp = ins.zF - ins.zB - 2 * edge;
  const nx = holesIn(W, hole, bar), ny = holesIn(Dp, hole, bar);
  // the base's own coordinates: x along world x from its origin, y along world −z
  const x0 = ins.xL - base.frame.o[0] + edge + (W - (nx * hole + (nx - 1) * bar)) / 2;
  const y0 = base.frame.o[2] - ins.zF + edge + (Dp - (ny * hole + (ny - 1) * bar)) / 2;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      const id = addDetail(d, base.id, 'roundrect', 'cut', x0 + hole / 2 + i * (hole + bar), y0 + hole / 2 + j * (hole + bar), hole, hole);
      const dt = id ? base.details.find((x) => x.id === id) : undefined;
      if (dt) dt.r = Math.min(3, hole / 4);
    }
  solve(d);
  nameAll(d, role);
}

export const sieveStack: TemplateDef = {
  ...plywood,
  id: 'sieveStack',
  name: 'sen.sieveStack',
  description: 'sen.sieveStack.desc',
  word: 'sen.sieveStack',
  params: [
    num('width', 'sen.width', 60, 300, 160),
    num('depth', 'sen.depth', 60, 300, 160),
    num('height', 'sen.height', 30, 200, 60),
    sizeAsWord(() => sieveStack),
    { key: 'hole', label: 'sen.sieveHole', type: 'choice', default: 15, options: [10, 15, 20, 30].map((v) => ({ value: v, label: `sen.sieveHole.${v}` as MsgKey })) },
  ],
  generate: generateSieveStack,
  sentence: { main: 'sen.s.sieveStack' },
};
sieveStack.limits = stackLimits(sieveStack, { width: 60, depth: 60, height: 30 });
sieveStack.accepts = (m, p) => {
  if (!feetFit(m, p)) return 'sen.why.stackRoom';
  // at least two holes each way
  const t = m.thickness, hole = Number(p.hole), bar = SIEVES[hole] ?? 4;
  const inside = (L: number) => (p.sizeAs === 'outside' ? L - 2 * t : L) - 2 * (bar + 1);
  if (holesIn(inside(Number(p.width)), hole, bar) < 2 || holesIn(inside(Number(p.depth)), hole, bar) < 2) return 'sen.why.sieveRoom';
  return cleanAll(sieveStack, m, p) ? null : 'sen.why.engineSize';
};

