// The sentence's folding structures (milestone 96, SENTENCE_BUILDER_PLAN.md
// S3): *a carton* (a tube whose ends close: a tuck or four flaps on top; a
// tuck, a snap-lock or four flaps underneath) and *a sleeve* (the tube with
// both ends open). Card and thin corrugated only; on a board that does not
// fold, a carton becomes a box with a lid that lifts off.
import { CRASH_LOCK_OFFERED } from '../../model/cartons';
import type { Design, MaterialProfile, TrayBottom, TrayTop } from '../../model/types';
import type { MsgKey } from '../../i18n';
import { SIZE_MAX, SIZE_MIN, SPACES_MAX, type Limit, type ParamDef, type Params, type TemplateDef } from '../types';
import { addRootPanel, addTray, addWallInsert, autoConnect, createDesign, growPanel, setClosure } from '../../model/ops';
import { trayRing } from '../../model/cartons';
import { topLidId } from '../../model/cartons';
import { boxSize, setBoxSize, type SizeAs } from '../../model/boxSize';
import { holeRecipe } from '../../easy/recipes';
import { cleanAll, cleanWith, frontWall, mainTray, nameRoles } from './box';
import { largestOk } from '../../sentence/resolve';
import { foldsAsCarton } from '../../model/materials';

/** A carton (milestone 68): an open base, its walls one strip glued at one corner, its ends closed. The golden designs are made with this. */
export function cartonDesign(m: MaterialProfile, top: TrayTop, bottom: TrayBottom, w = 80, d0 = 55, h = 100): Design {
  const d = createDesign(m);
  const base = addRootPanel(d, 0, 0, w, d0);
  addTray(d, base, h, { base: 'open', top, bottom });
  autoConnect(d);
  return d;
}

/** A carton end this board makes (C2): shipping flaps on corrugated only; every other end on board thin enough to tuck. */
const endOk = (v: string | number, m: MaterialProfile) => (v === 'rsc' ? m.kind === 'corrugated' : v === 'crash' ? CRASH_LOCK_OFFERED && m.kind === 'card' && foldsAsCarton(m, 0) : v === 'gable' ? m.kind === 'card' && foldsAsCarton(m, 0) : folds(m, 2));

/** Folds: card, and corrugated thin enough to tuck. */
// (milestone 116: card up to 1 mm; greyboard is card, and does not fold into a carton)
const folds = (m: MaterialProfile, most: number) => foldsAsCarton(m, most);

function sizeParams(h: number): ParamDef[] {
  return [
    { key: 'width', label: 'sen.width', type: 'number', unit: 'mm', min: SIZE_MIN, max: SIZE_MAX, default: 80, affects: ['walls'] },
    { key: 'depth', label: 'sen.depth', type: 'number', unit: 'mm', min: SIZE_MIN, max: SIZE_MAX, default: 55, affects: ['walls'] },
    { key: 'height', label: 'sen.height', type: 'number', unit: 'mm', min: SIZE_MIN, max: SIZE_MAX, default: h, affects: ['walls'] },
    {
      key: 'sizeAs', label: 'sen.sizeAs', type: 'choice', default: 'inside',
      options: [{ value: 'inside', label: 'sen.sizeAs.inside' }, { value: 'outside', label: 'sen.sizeAs.outside' }, { value: 'crease', label: 'sen.sizeAs.crease' }],
      allowed: (v, p, m) => cleanWith(defOf(p), m, p, 'sizeAs', v),
      why: () => 'sen.why.engine',
    },
  ];
}

const window: ParamDef = {
  key: 'window', label: 'sen.window', type: 'choice', default: 'none', addon: { off: 'none' },
  options: [{ value: 'none', label: 'sen.window.none' }, { value: 'circle', label: 'sen.window.circle' }, { value: 'rect', label: 'sen.window.rect' }],
  allowed: (v, p, m) => v === 'none' || (Number(p.height) >= 30 && cleanWith(defOf(p), m, p, 'window', v)),
  why: () => 'sen.why.window',
  affects: ['walls'],
};
const defOf = (p: Params): TemplateDef => ('top' in p ? carton : sleeve);

/** The sizes' ends: as large as one sheet takes, found by building (as the box's). */
function sizeLimits(def: TemplateDef) {
  return (m: MaterialProfile, p: Params): Record<string, Limit> => {
    const out: Record<string, Limit> = {};
    for (const key of ['width', 'depth', 'height'] as const)
      Object.defineProperty(out, key, {
        enumerable: true,
        get: () => {
          const ck = JSON.stringify([def.id, m, { ...p, [key]: null }, key]);
          // a gable top (C4) needs some depth: its roofs' glue flaps would overlap the peaks in the flat on a shallow box
          const lo = key === 'depth' && p.top === 'gable' ? GABLE_MIN_DEPTH : 20;
          const v = largestOk(ck, lo, Math.min(m.sheetW, m.sheetH) - 10, (x) => cleanWith(def, m, { ...p, [key]: x }, key, x), 9, 0.5);
          return { ...(lo > 20 ? { min: lo } : {}), max: Math.max(lo, v), why: 'sen.why.sheet' as MsgKey };
        },
      });
    return out;
  };
}

/** The shallowest box a gable top is offered on (mm, inside). */
export const GABLE_MIN_DEPTH = 50;

/**
 * A gable top (milestone C4): the side walls peaked to a ridge half the
 * depth above their tops (45° roofs), a roof folded off the front and the back
 * walls' tops, glued to the peaks and stopping just short of the ridge (the
 * two would collide where they meet), each with a handle slot near it.
 */
function gableTop(d: Design, tray: string) {
  const t = d.trays[tray];
  const ring = trayRing(d, t);
  const o = boxSize(d, tray, 'outside');
  if (!o) return;
  const run = o.d / 2, th = d.material.thickness;
  for (const r of ring.filter((x) => x.edge === 'e1' || x.edge === 'e3')) addWallInsert(d, r.wall, 'e2', 0.5, run);
  autoConnect(d);
  const S = Math.hypot(run, run) - 3 * th - 1;
  for (const r of ring.filter((x) => x.edge === 'e0' || x.edge === 'e2')) {
    const g = growPanel(d, r.wall, 'e2', { height: S, angle: 135, dir: 'up', kind: 'fold' });
    const P = g && d.panels[g.panelId];
    if (P) holeRecipe(d, P.id, 'roundrect', P.w / 2, P.h - 12, Math.min(40, P.w * 0.4), 10);
  }
  autoConnect(d);
}

function generateTube(d: Design, p: Params, ends: { top?: TrayTop; bottom?: TrayBottom }, role: (name: string, id: string) => void) {
  const as = (p.sizeAs as SizeAs) ?? 'inside';
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height);
  const base = addRootPanel(d, -W / 2, D / 2, W, D);
  addTray(d, base, H, { base: 'open', ...ends });
  autoConnect(d);
  const tray = mainTray(d)!;
  if (as !== 'outside') d.sizeAs = as;
  setBoxSize(d, tray, { w: W, d: D, h: H }, as);
  const t = d.trays[tray];
  const top = t.top === 'tuck' ? topLidId(t) : null;
  if (top && d.panels[top] && (p.thumb === 'notch' || p.dust === 'without')) setClosure(d, top, { style: 'tuck', ...(p.thumb === 'notch' ? { thumb: true } : {}), ...(p.dust === 'without' ? { dust: false } : {}) });
  if (p.top === 'gable') gableTop(d, tray);
  const front = frontWall(d, tray);
  const fw = front ? d.panels[front] : null;
  if (fw && p.window && p.window !== 'none') {
    const s = Math.min(fw.w * 0.45, fw.h * 0.3);
    holeRecipe(d, fw.id, p.window === 'circle' ? 'circle' : 'rect', fw.w / 2, fw.h / 2, s, s);
  }
  nameRoles(d, role);
}

export const carton: TemplateDef = {
  id: 'carton',
  version: 1,
  name: 'sen.carton',
  description: 'sen.carton.desc',
  word: 'sen.carton',
  status: 'stable',
  materials: ['card', 'corrugated'],
  // milestone C2: 4 mm corrugated makes a carton with shipping (RSC) flaps only; tucks, snap-locks and four-flap ends stay on thinner board
  canMake: (m) => folds(m, 4),
  fallback: () => 'box',
  fallbackWords: { lid: 'liftoff' },
  params: [
    ...sizeParams(100),
    {
      key: 'top', label: 'sen.top', type: 'choice', default: 'tuck',
      options: [{ value: 'tuck', label: 'sen.top.tuck' }, { value: 'seal', label: 'sen.top.seal' }, { value: 'rsc', label: 'sen.top.rsc' }, { value: 'gable', label: 'sen.top.gable' }],
      allowed: (v, p, m) => endOk(v, m) && cleanWith(carton, m, p, 'top', v),
      why: () => 'sen.why.engine',
      affects: ['lid'],
    },
    {
      key: 'bottom', label: 'sen.bottom', type: 'choice', default: 'snap',
      options: [{ value: 'snap', label: 'sen.bottom.snap' }, { value: 'tuck', label: 'sen.bottom.tuck' }, { value: 'seal', label: 'sen.bottom.seal' }, { value: 'rsc', label: 'sen.bottom.rsc' }, { value: 'crash', label: 'sen.bottom.crash' }],
      allowed: (v, p, m) => endOk(v, m) && cleanWith(carton, m, p, 'bottom', v),
      why: () => 'sen.why.engine',
      affects: ['base'],
    },
    {
      // milestone C2: a straight tuck end (both tucks off the back wall), said as a clause; absent, a reverse tuck
      key: 'tuckFrom', label: 'sen.tuckFrom', type: 'choice', default: 'opposite', addon: { off: 'opposite' },
      options: [{ value: 'opposite', label: 'sen.tuckFrom.opposite' }, { value: 'same', label: 'sen.tuckFrom.same' }],
      when: (p) => p.top === 'tuck' && p.bottom === 'tuck',
      allowed: (v, p, m) => v === 'opposite' || cleanWith(carton, m, p, 'tuckFrom', v),
      why: () => 'sen.why.engine',
      affects: ['base'],
    },
    {
      key: 'thumb', label: 'sen.thumb', type: 'choice', default: 'none', addon: { off: 'none' },
      options: [{ value: 'none', label: 'sen.thumb.none' }, { value: 'notch', label: 'sen.thumb.notch' }],
      when: (p) => p.top === 'tuck',
      allowed: (v, p, m) => v === 'none' || cleanWith(carton, m, p, 'thumb', v),
      why: () => 'sen.why.engine',
      affects: ['lid'],
    },
    {
      key: 'dust', label: 'sen.dust', type: 'choice', default: 'with', addon: { off: 'with' },
      options: [{ value: 'with', label: 'sen.dust.with' }, { value: 'without', label: 'sen.dust.without' }],
      when: (p) => p.top === 'tuck',
      allowed: (v, p, m) => v === 'with' || cleanWith(carton, m, p, 'dust', v),
      why: () => 'sen.why.engine',
      affects: ['walls'],
    },
    window,
  ],
  generate: (d, p, role) => generateTube(d, p, { top: p.top === 'gable' ? undefined : (p.top as TrayTop), bottom: (p.bottom === 'tuck' && p.tuckFrom === 'same' ? 'tuckBack' : p.bottom) as TrayBottom }, role),
  sentence: { main: 'sen.s.carton' },
};
carton.limits = sizeLimits(carton);
carton.accepts = (m, p) => (cleanAll(carton, m, p) ? null : 'sen.why.engineSize');

export const sleeve: TemplateDef = {
  id: 'sleeve',
  version: 1,
  name: 'sen.sleeve',
  description: 'sen.sleeve.desc',
  word: 'sen.sleeve',
  status: 'stable',
  materials: ['card', 'corrugated'],
  canMake: (m) => folds(m, 4),
  fallback: () => 'box',
  params: [...sizeParams(60), window],
  generate: (d, p, role) => generateTube(d, p, {}, role),
  sentence: { main: 'sen.s.sleeve' },
};
sleeve.limits = sizeLimits(sleeve);
sleeve.accepts = (m, p) => (cleanAll(sleeve, m, p) ? null : 'sen.why.engineSize');
