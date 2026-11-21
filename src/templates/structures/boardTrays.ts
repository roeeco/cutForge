// Trays of boards with parts of their own inside (milestone 178, BOXES_PLYWOOD_PLAN.md §3.2), plywood only.
// Constructions read in boxes.py (a behaviour reference only: THIRD_PARTY.md) and written fresh over the box kit
// (boards.ts) and free boards (`addFreePanel`, `connectSeams`).
//   a divider tray    a box whose dividers are loose: each drops into notches in the front and back walls' tops and
//                     lifts out by hand (dividertray);
//   a scoop organiser a box of spaces side by side, a ramp in each so small parts slide out under a finger
//                     (smallpartstray2).
import type { Design, P2 } from '../../model/types';
import type { MsgKey } from '../../i18n';
import type { ParamDef, Params, TemplateDef } from '../types';
import { addFreePanel, connectSeams, solve } from '../../model/ops';
import { MIN_COMPARTMENT } from '../../model/dividers';
import { minWeb } from '../../model/materials';
import { setBoxSize } from '../../model/boxSize';
import { boardBoxRect, plywoodOnly } from './boards';
import { cleanAll, cleanWith, mainTray } from './box';
import { nameAll, sheetLimits, wallsOf } from './shaped';
import { insideOf } from './boardBoxes';

type Role = (name: string, id: string) => void;
const num = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'number', unit: 'mm', min, max, default: dflt });
const int = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'int', min, max, default: dflt });
const rect = (w: number, h: number): P2[] => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];

/** Inside or outside, for a box of boards. */
const sizeAsWord = (def: () => TemplateDef): ParamDef => ({
  key: 'sizeAs', label: 'sen.sizeAs', type: 'choice', default: 'inside',
  options: [{ value: 'inside', label: 'sen.sizeAs.inside' }, { value: 'outside', label: 'sen.sizeAs.outside' }],
  allowed: (v, p, m) => cleanWith(def(), m, p, 'sizeAs', v),
  why: () => 'sen.why.engine',
});

/** A box of boards at the words' sizes, inside or outside: its tray, or null. */
function sizedBox(d: Design, p: Params): string | null {
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height);
  const as = p.sizeAs === 'outside' ? 'outside' : 'inside';
  if (!boardBoxRect(d, W, D, H)) return null;
  const tr = mainTray(d)!;
  if (as === 'inside') d.sizeAs = 'inside';
  setBoxSize(d, tr, { w: W, d: D, h: H }, as);
  solve(d);
  return tr;
}

/** How many spaces of at least `MIN_COMPARTMENT` (and `least`) fit across `L` with boards `t` thick between them. */
const spacesIn = (L: number, t: number, least = MIN_COMPARTMENT) => Math.max(1, Math.floor((L + t) / (Math.max(least, MIN_COMPARTMENT) + t) + 1e-9));

const plywood: Pick<TemplateDef, 'materials' | 'canMake' | 'fallback' | 'status' | 'version'> = {
  version: 1,
  status: 'beta',
  materials: ['plywood'],
  canMake: plywoodOnly,
  fallback: () => 'box',
};

// --- the divider tray ---

/** How far a loose divider's ears reach past the side walls' outer faces (so the notch is inside the divider). */
const ear = (t: number) => Math.max(2, t / 2);

function generateDividerTray(d: Design, p: Params, role: Role) {
  const tr = sizedBox(d, p);
  if (!tr) return;
  const ins = insideOf(d);
  if (!ins) return;
  const t = d.material.thickness, g = d.material.clearance;
  const H = d.trays[tr].height;
  const n = Math.round(Number(p.dividers));
  const across = ins.xR - ins.xL, sp = (across - n * t) / (n + 1);
  // each divider front to back between the front and the back, through notches in their tops: its ears reach past
  // their outer faces, its foot a clearance above the base, so it rests on the notches and lifts out
  const e = ear(t), z0 = ins.zF + t + e, L = ins.zF - ins.zB + 2 * (t + e);
  const y0 = ins.floor + g;
  const ids: string[] = [];
  for (let k = 1; k <= n; k++) {
    const x = ins.xL + k * sp + (k - 1) * t;
    const id = addFreePanel(d, { frame: { o: [x, y0, z0], u: [0, 0, -1], v: [0, 1, 0] }, side: 1, outer: rect(L, H - y0) });
    if (id) ids.push(id);
  }
  solve(d);
  for (const id of ids) connectSeams(d, id);
  solve(d);
  nameAll(d, role, Object.fromEntries(ids.map((x, i) => [`divider-${i + 1}`, x])));
}

export const dividerTray: TemplateDef = {
  ...plywood,
  id: 'dividerTray',
  name: 'sen.dividerTray',
  description: 'sen.dividerTray.desc',
  word: 'sen.dividerTray',
  params: [
    num('width', 'sen.width', 50, 300, 160),
    num('depth', 'sen.depth', 50, 300, 110),
    num('height', 'sen.height', 30, 150, 45),
    sizeAsWord(() => dividerTray),
    int('dividers', 'sen.dividerCount', 1, 10, 2),
  ],
  generate: generateDividerTray,
  sentence: { main: 'sen.s.dividerTray' },
};
dividerTray.limits = (m, p) => ({
  ...sheetLimits(dividerTray, { width: 50, depth: 50, height: 30 })(m, p),
  dividers: { max: Math.max(1, Math.min(10, spacesIn(Number(p.width) - (p.sizeAs === 'outside' ? 2 * m.thickness : 0), m.thickness) - 1)), why: 'sen.why.spaceSmall' as MsgKey },
});
dividerTray.accepts = (m, p) => (cleanAll(dividerTray, m, p) ? null : 'sen.why.engineSize');

// --- the scoop organiser ---

/** The slant of each space's ramp (degrees from level), or steeper when the tray is shallow front to back. */
const SCOOP_SLANT = 35;

function generateScoopOrganiser(d: Design, p: Params, role: Role) {
  const tr = sizedBox(d, p);
  if (!tr) return;
  const ins = insideOf(d);
  if (!ins) return;
  const t = d.material.thickness;
  const n = Math.round(Number(p.spaces));
  const front = wallsOf(d).e0;
  const H = d.trays[tr].height;
  const top = front ? d.panels[front].frame.o[1] + d.panels[front].h : H;
  const W = ins.xR - ins.xL, run = ins.zF - ins.zB, sw = (W - (n - 1) * t) / n;
  // the partitions between the spaces, front to back, on the base and between the front and back walls, a web
  // below the walls' tops so their slots there have board round them
  const web = Math.max(minWeb(d.material), t);
  const ids: (string | null)[] = [], names: string[] = [];
  for (let i = 1; i < n; i++) {
    const x = ins.xL + i * sw + (i - 1) * t;
    ids.push(addFreePanel(d, { frame: { o: [x, ins.floor, ins.zF], u: [0, 0, -1], v: [0, 1, 0] }, side: 1, outer: rect(run, H - ins.floor - web) }));
    names.push(`partition-${i}`);
  }
  // a ramp in each space, from the front wall's top to the base, between the partitions (or the side walls)
  const rise = top - ins.floor;
  const a = Math.max((SCOOP_SLANT * Math.PI) / 180, Math.atan(rise / (run * 0.6)));
  const len = rise / Math.sin(a);
  for (let i = 0; i < n; i++) {
    const x = ins.xL + i * (sw + t);
    ids.push(addFreePanel(d, { frame: { o: [x, top, ins.zF], u: [1, 0, 0], v: [0, -Math.sin(a), -Math.cos(a)] }, side: 1, outer: rect(sw, len) }));
    names.push(`ramp-${i + 1}`);
  }
  solve(d);
  for (const id of ids) if (id) connectSeams(d, id);
  solve(d);
  const first: Record<string, string> = {};
  ids.forEach((id, i) => id && (first[names[i]] = id));
  nameAll(d, role, first);
}

export const scoopOrganiser: TemplateDef = {
  ...plywood,
  id: 'scoopOrganiser',
  name: 'sen.scoopOrganiser',
  description: 'sen.scoopOrganiser.desc',
  word: 'sen.scoopOrganiser',
  params: [
    num('width', 'sen.width', 80, 300, 180),
    num('depth', 'sen.depth', 60, 200, 100),
    num('height', 'sen.height', 25, 100, 40),
    sizeAsWord(() => scoopOrganiser),
    int('spaces', 'sen.nx', 2, 8, 3),
  ],
  generate: generateScoopOrganiser,
  sentence: { main: 'sen.s.scoopOrganiser' },
};
scoopOrganiser.limits = (m, p) => ({
  ...sheetLimits(scoopOrganiser, { width: 80, depth: 60, height: 25 })(m, p),
  // every space at least 25 mm across, for a finger
  spaces: { max: Math.max(2, Math.min(8, spacesIn(Number(p.width) - 2 * m.thickness, m.thickness, 25))), why: 'sen.why.spaceSmall' as MsgKey },
});
scoopOrganiser.accepts = (m, p) => (cleanAll(scoopOrganiser, m, p) ? null : 'sen.why.engineSize');
