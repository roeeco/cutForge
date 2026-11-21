// The sentence's first structures (milestone 95, SENTENCE_BUILDER_PLAN.md S2):
// *a box* and *a tray*, over the recipes Quick build already uses
// (`boxRecipe`, `setBoxLid`, `dividerLine`, `holeRecipe`) and the size intent
// of milestone 93 (`setBoxSize`). Every list asks the engine (`lidWhy`,
// `roundedMin`, `MIN_COMPARTMENT`) so a word is offered only where it can be
// made.
import type { Design, MaterialProfile } from '../../model/types';
import type { MsgKey } from '../../i18n';
import { SIZE_MAX, SIZE_MIN, SPACES_MAX, type Limit, type ParamDef, type Params, type TemplateDef } from '../types';
import { boxRecipe, dividerLine, holeRecipe, roundedMin, type Footprint } from '../../easy/recipes';
import { boxLid, lidWhy, setBoxLid, setCapRim, type CapRim, type LidChoice } from '../../easy/lid';
import { validate } from '../../model/validate';
import { NOTE_KEYS } from '../../easy/notes';
import { boxSize, setBoxSize, type SizeAs } from '../../model/boxSize';
import { MIN_COMPARTMENT } from '../../model/dividers';
import { trayRing } from '../../model/cartons';
import { addBasePlate, addLidHandle, addPinLid, addWallInsert, connectSeams, createDesign, growPanel, setPanelSize, solve } from '../../model/ops';
import { PIN_SIZES, pinFor, pinRoom } from '../../model/pinHinge';
import { layerDepth, lidLayers } from '../../model/lid';
import { dividersOn } from '../../model/dividers';
import { tOf } from '../../model/materials';
import { largestOk } from '../../sentence/resolve';
import { addStack, stackLeast } from '../../model/stack';

export type Shape = 'rect' | 'rounded' | 'round' | 'poly';

/** The box tray a structure's design has (its first tray that is not a lid). */
export function mainTray(d: Design): string | null {
  return Object.values(d.trays ?? {}).find((t) => !t.lidOf)?.id ?? null;
}

/** The sleeve's tray in a drawer's design (the second tray, not a lid). */
export function drawerShell(d: Design): string | null {
  const main = mainTray(d);
  return Object.values(d.trays ?? {}).find((t) => !t.lidOf && t.id !== main)?.id ?? null;
}

/** The wall at the front of a box (on its base's first edge), if it is a flat board. */
export function frontWall(d: Design, trayId: string): string | null {
  const t = d.trays?.[trayId];
  if (!t) return null;
  const ring = trayRing(d, t);
  const w = ring.find((r) => r.edge === 'e0')?.wall ?? ring[0]?.wall;
  return w && d.panels[w]?.sketch.kind === 'wall' ? w : null;
}

/** A structure's design built once per material and words, for the lists' questions (`lidWhy`) and the measured readout. */
const builds = new Map<string, Design>();
export function builtFor(def: TemplateDef, m: MaterialProfile, p: Params, skipLid = false): Design {
  const key = JSON.stringify([def.id, m, p, skipLid]);
  const hit = builds.get(key);
  if (hit) return hit;
  const d = createDesign(m);
  def.generate(d, skipLid ? { ...p, lid: 'none' } : p, () => undefined);
  solve(d);
  if (builds.size > 300) builds.delete(builds.keys().next().value!);
  builds.set(key, d);
  return d;
}

/**
 * Can an option be made now? Asked of the engine (SENTENCE_BUILDER_PLAN.md
 * §3.1): the structure built with this option, the words after it that are
 * add-ons left off (each is checked on its own when its turn comes), and
 * nothing that stops the cut. Cached per material and words.
 */
const cleanCache = new Map<string, boolean>();
export function cleanWith(def: TemplateDef, m: MaterialProfile, p: Params, key: string, v: string | number): boolean {
  const q: Params = { ...p, [key]: v };
  const i = def.params.findIndex((x) => x.key === key);
  for (const x of def.params.slice(i + 1)) if (x.addon) q[x.key] = x.addon.off;
  const ck = JSON.stringify([def.id, m, q]);
  const hit = cleanCache.get(ck);
  if (hit !== undefined) return hit;
  let ok = false;
  try {
    const d = builtFor(def, m, q);
    ok = !validate(d).some((x) => !NOTE_KEYS.has(x.key));
    if (ok && key === 'lid' && v !== 'none') {
      const tr = mainTray(d);
      // the word *closed* makes the lid the engine calls *fixed* (milestone 171); a plug or brim lid lifts off (173)
      const l = tr ? boxLid(d, tr) : null;
      // milestone 176: *pins*, a lid hinged on pins
      ok = !!l && (v === 'plug' || v === 'brim' ? l.kind === 'liftoff' && l.style === v : v === 'pins' ? l.kind === 'hinged' && !!l.pins : l.kind === (v === 'closed' ? 'fixed' : v));
    }
  } catch {
    ok = false;
  }
  if (cleanCache.size > 2000) cleanCache.delete(cleanCache.keys().next().value!);
  cleanCache.set(ck, ok);
  return ok;
}

/** The whole sentence as it stands, built and checked (no add-on turned off). */
export function cleanAll(def: TemplateDef, m: MaterialProfile, p: Params): boolean {
  const last = def.params[def.params.length - 1];
  return cleanWith(def, m, p, last.key, p[last.key] ?? last.default);
}

/** The clear inside along one direction for these words (a quick build of the box without its lid and spaces). */
function insideOf(def: TemplateDef, m: MaterialProfile, p: Params): { w: number; d: number; h: number; t: number; walls: { w: number; d: number } } | null {
  const d = builtFor(def, m, { ...p, spacesBy: 'none', window: 'none', finger: 'none' }, true);
  const tr = mainTray(d);
  if (!tr) return null;
  const s = boxSize(d, tr, 'inside')!, o = boxSize(d, tr, 'outside')!;
  return { ...s, t: m.thickness, walls: { w: o.w - s.w, d: o.d - s.d } };
}

/** How many equal spaces of at least `MIN_COMPARTMENT` fit across `L` with dividers `t` thick. */
export const mostSpaces = (L: number, t: number) => Math.max(1, Math.floor((L + t) / (MIN_COMPARTMENT + t) + 1e-9));
/** The count a wanted space size makes (SENTENCE_BUILDER_PLAN.md §3.5): n = max(1, floor((W + t) / (s + t))). */
export const spacesFor = (L: number, t: number, s: number) => Math.max(1, Math.floor((L + t) / (s + t) + 1e-9));
/** Each space's size for n spaces across L. */
export const spaceSize = (L: number, t: number, n: number) => (L - (n - 1) * t) / n;

const sizeLimit = (m: MaterialProfile): number => Math.min(m.sheetW, m.sheetH) - 10;

const SHAPES: Shape[] = ['rect', 'rounded', 'round', 'poly'];

/** Room for stacking feet (milestone 177): every wall at least as wide as both feet and a tongue between them take. */
export const stackRoom = (m: MaterialProfile, p: Params) => Math.min(Number(p.width), Number(p.depth)) >= stackLeast(m) && Number(p.height) >= 20;

/** The parameters a box and a tray share (keys shared across structures: SENTENCE_BUILDER_PLAN.md §3.2). */
function boxParams(o: { height: number; lid: boolean; addons: ('window' | 'finger' | 'handles')[] }): ParamDef[] {
  const def = () => (o.lid ? box : tray);
  const shapeOk = (v: string | number, p: Params, m: MaterialProfile) => {
    if (v === 'rect') return true;
    // a bent wall needs the box at least twice as wide as the tightest it bends round, and the engine to make it clean
    if (v !== 'poly' && Math.min(Number(p.width), Number(p.depth)) < 2 * roundedMin(m, Number(p.height) + 10) + 10) return false;
    return cleanWith(def(), m, p, 'shape', v);
  };
  const engine = (key: string) => (v: string | number, p: Params, m: MaterialProfile) => v === 'none' || cleanWith(def(), m, p, key, v);
  const out: ParamDef[] = [
    { key: 'width', label: 'sen.width', type: 'number', unit: 'mm', min: SIZE_MIN, max: SIZE_MAX, default: 160, affects: ['base'] },
    { key: 'depth', label: 'sen.depth', type: 'number', unit: 'mm', min: SIZE_MIN, max: SIZE_MAX, default: 110, affects: ['base'] },
    { key: 'height', label: 'sen.height', type: 'number', unit: 'mm', min: SIZE_MIN, max: SIZE_MAX, default: o.height, affects: ['walls'] },
    {
      key: 'sizeAs', label: 'sen.sizeAs', type: 'choice', default: 'inside',
      options: [{ value: 'inside', label: 'sen.sizeAs.inside' }, { value: 'outside', label: 'sen.sizeAs.outside' }, { value: 'crease', label: 'sen.sizeAs.crease' }],
      allowed: (v, p, m) => (v !== 'crease' || m.kind !== 'plywood') && cleanWith(def(), m, p, 'sizeAs', v),
      why: (v, _p, m) => (v === 'crease' && m.kind === 'plywood' ? 'sen.why.noCrease' : 'sen.why.engine'),
    },
    {
      key: 'shape', label: 'sen.shape', type: 'choice', default: 'rect',
      options: SHAPES.map((s) => ({ value: s, label: `sen.shape.${s}` as MsgKey })),
      allowed: shapeOk,
      why: (v, p, m) => (Math.min(Number(p.width), Number(p.depth)) < 2 * roundedMin(m, Number(p.height) + 10) + 10 ? 'sen.why.tooSmallToBend' : 'sen.why.engine'),
      affects: ['base', 'walls'],
    },
    { key: 'sides', label: 'sen.sides', type: 'int', min: 3, max: 12, default: 6, when: (p) => p.shape === 'poly' },
  ];
  if (o.lid)
    out.push({
      key: 'lid', label: 'sen.lid', type: 'choice', default: 'none', addon: { off: 'none' },
      // milestone 171 (UniversalBox's closed top): *closed*, a top fixed on with the walls' joint, on plywood
      // milestone 173 (UniversalBox's *flat* and *flatbrim*): a lid with a plug glued under it, or a brim of strips in slots
      // milestone 176 (UniversalBox's hinge edges, IntegratedHingeBox): *pins*, a lid hinged on knuckles and a pin, on plywood
      options: (['none', 'liftoff', 'hinged', 'arched', 'closed', 'plug', 'brim', 'pins'] as const).map((v) => ({ value: v, label: `sen.lid.${v}` as MsgKey })),
      allowed: (v, p, m) => {
        if (v === 'none') return true;
        if (v === 'pins') return m.kind === 'plywood' && p.shape === 'rect' && pinFits(m, p) && cleanWith(box, m, p, 'lid', v);
        if (v === 'closed') return m.kind === 'plywood' && p.shape !== 'round' && p.shape !== 'rounded' && cleanWith(box, m, p, 'lid', v);
        if (v === 'plug' || v === 'brim') return m.kind === 'plywood' && (p.shape === 'rect' || (v === 'plug' && p.shape === 'poly')) && cleanWith(box, m, p, 'lid', v);
        const d = builtFor(box, m, { ...p, lid: 'none' }, true);
        const tr = mainTray(d);
        return !!tr && !lidWhy(d, tr, v as LidChoice) && cleanWith(box, m, p, 'lid', v);
      },
      why: (v, p, m) => {
        if (v === 'closed') return m.kind !== 'plywood' ? 'sen.why.plyOnly' : 'sen.why.closedShape';
        if (v === 'pins') return m.kind !== 'plywood' ? 'sen.why.plyOnly' : p.shape !== 'rect' ? 'sen.why.pinShape' : !pinFits(m, p) ? 'sen.why.pinRoom' : 'sen.why.engine';
        if (v === 'plug' || v === 'brim') return m.kind !== 'plywood' ? 'sen.why.plyOnly' : p.shape === 'rect' || (v === 'plug' && p.shape === 'poly') ? 'sen.why.engine' : 'sen.why.lidShape';
        const d = builtFor(box, m, { ...p, lid: 'none' }, true);
        const tr = mainTray(d);
        return (tr ? lidWhy(d, tr, v as LidChoice) : 'lid.why.none') ?? 'sen.why.engine';
      },
      affects: ['lid'],
    });
  if (o.lid)
    // milestone 171 (TwoPiece): how deep a lid that lifts off reaches down the box; as deep as the box, a two-piece box
    out.push({
      key: 'rim', label: 'sen.rim', type: 'choice', default: 'none', addon: { off: 'none' },
      options: (['none', 'half', 'full'] as const).map((v) => ({ value: v, label: `sen.rim.${v}` as MsgKey })),
      when: (p) => p.lid === 'liftoff',
      allowed: (v, p, m) => v === 'none' || (m.kind === 'plywood' && cleanWith(box, m, p, 'rim', v)),
      why: (_v, _p, m) => (m.kind !== 'plywood' ? 'sen.why.plyOnly' : 'sen.why.engine'),
      affects: ['lid'],
    });
  if (o.lid)
    // milestone 173 (UniversalBox's lid handle): a board standing on a one-board lid that lifts off, with a hand hole
    out.push({
      key: 'lidHandle', label: 'sen.lidHandle', type: 'choice', default: 'none', addon: { off: 'none' },
      options: (['none', 'handle'] as const).map((v) => ({ value: v, label: `sen.lidHandle.${v}` as MsgKey })),
      when: (p) => p.lid === 'liftoff' || p.lid === 'plug' || p.lid === 'brim',
      allowed: (v, p, m) => v === 'none' || (m.kind === 'plywood' && (p.lid !== 'liftoff' || (p.rim ?? 'none') === 'none') && cleanWith(box, m, p, 'lidHandle', v) && !!handleOf(builtFor(box, m, { ...p, lidHandle: v }))),
      why: (_v, p, m) => (m.kind !== 'plywood' ? 'sen.why.plyOnly' : p.lid === 'liftoff' && (p.rim ?? 'none') !== 'none' ? 'sen.why.handleCap' : 'sen.why.handleRoom'),
      affects: ['lid'],
    });
  if (o.lid)
    // milestone 176: the pin's diameter, for a lid on pin hinges (a dowel or a wire the student has)
    out.push({
      key: 'pin', label: 'sen.pin', type: 'choice', default: 'auto', addon: { off: 'auto' },
      options: (['auto', ...PIN_SIZES] as const).map((v) => ({ value: v, label: `sen.pin.${v}` as MsgKey })),
      when: (p) => p.lid === 'pins',
      allowed: (v, p, m) => v === 'auto' || (m.kind === 'plywood' && pinFits(m, { ...p, pin: v }) && cleanWith(box, m, p, 'pin', v)),
      why: (_v, _p, m) => (m.kind !== 'plywood' ? 'sen.why.plyOnly' : 'sen.why.pinRoom'),
      affects: ['lid'],
    });
  out.push(
    {
      key: 'spacesBy', label: 'sen.spacesBy', type: 'choice', default: 'none', addon: { off: 'none' },
      options: [{ value: 'none', label: 'sen.spacesBy.none' }, { value: 'count', label: 'sen.spacesBy.count' }, { value: 'size', label: 'sen.spacesBy.size' }],
      // equal steps give spaces of different sizes in a round or many-sided box: a count only
      allowed: (v, p, m) => (v !== 'size' || p.shape === 'rect' || p.shape === 'rounded') && engine('spacesBy')(v, p, m),
      why: (v, p) => (v === 'size' && p.shape !== 'rect' && p.shape !== 'rounded' ? 'sen.why.sizeOnRect' : 'sen.why.engine'),
      affects: ['dividers'],
    },
    { key: 'nx', label: 'sen.nx', type: 'int', min: 1, max: SPACES_MAX, default: 3, when: (p) => p.spacesBy === 'count', affects: ['dividers'] },
    { key: 'ny', label: 'sen.ny', type: 'int', min: 1, max: SPACES_MAX, default: 2, when: (p) => p.spacesBy === 'count', affects: ['dividers'] },
    { key: 'sx', label: 'sen.sx', type: 'number', unit: 'mm', min: MIN_COMPARTMENT, max: SIZE_MAX, default: 50, when: (p) => p.spacesBy === 'size', affects: ['dividers'] },
    { key: 'sy', label: 'sen.sy', type: 'number', unit: 'mm', min: MIN_COMPARTMENT, max: SIZE_MAX, default: 50, when: (p) => p.spacesBy === 'size', affects: ['dividers'] },
  );
  if (o.addons.includes('window'))
    out.push({
      key: 'window', label: 'sen.window', type: 'choice', default: 'none', addon: { off: 'none' },
      options: [{ value: 'none', label: 'sen.window.none' }, { value: 'circle', label: 'sen.window.circle' }, { value: 'rect', label: 'sen.window.rect' }],
      // on a flat front wall tall enough for one
      allowed: (v, p, m) => v === 'none' || ((p.shape === 'rect' || p.shape === 'poly') && Number(p.height) >= 30 && engine('window')(v, p, m)),
      why: () => 'sen.why.window',
      affects: ['walls'],
    });
  if (o.addons.includes('finger'))
    out.push({
      key: 'finger', label: 'sen.finger', type: 'choice', default: 'none', addon: { off: 'none' },
      options: [{ value: 'none', label: 'sen.finger.none' }, { value: 'notch', label: 'sen.finger.notch' }],
      allowed: (v, p, m) => v === 'none' || ((p.shape === 'rect' || p.shape === 'poly') && Number(p.height) >= 25 && engine('finger')(v, p, m)),
      why: () => 'sen.why.window',
      affects: ['walls'],
    });
  if (o.addons.includes('handles'))
    out.push({
      key: 'handles', label: 'sen.handles', type: 'choice', default: 'none', addon: { off: 'none' },
      // milestone 171 (UniversalBox's handle edges): grips raised above the side walls, with a hand hole, on plywood with no lid
      options: [{ value: 'none', label: 'sen.handles.none' }, { value: 'slots', label: 'sen.handles.slots' }, { value: 'grips', label: 'sen.handles.grips' }],
      allowed: (v, p, m) =>
        v === 'none' ||
        (p.shape === 'rect' && Number(p.height) >= 25 && Number(p.depth) >= 60 && (v !== 'grips' || (m.kind === 'plywood' && (p.lid ?? 'none') === 'none')) && engine('handles')(v, p, m)),
      why: (v, p, m) => (v === 'grips' && m.kind !== 'plywood' ? 'sen.why.plyOnly' : v === 'grips' && (p.lid ?? 'none') !== 'none' ? 'sen.why.gripsLid' : 'sen.why.window'),
      affects: ['walls'],
    });
  if (o.lid)
    // milestone 173 (boxes.py's BasedBox): a base plate wider than the box all round, glued under its base
    out.push({
      key: 'overhang', label: 'sen.overhang', type: 'choice', default: 'none', addon: { off: 'none' },
      options: (['none', 'plate'] as const).map((v) => ({ value: v, label: `sen.overhang.${v}` as MsgKey })),
      allowed: (v, p, m) => v === 'none' || (m.kind === 'plywood' && (p.shape === 'rect' || p.shape === 'poly') && cleanWith(box, m, p, 'overhang', v)),
      why: (_v, p, m) => (m.kind !== 'plywood' ? 'sen.why.plyOnly' : p.shape === 'rect' || p.shape === 'poly' ? 'sen.why.engine' : 'sen.why.lidShape'),
      affects: ['base'],
    });
  if (o.addons.includes('handles'))
    // milestone 177 (boxes.py's Crate, UniversalBox's stackable edges): feet under the walls and tongues on their tops,
    // so one box stacks on another like it; on plywood, a square box with no lid (a lid would rest on the tongues)
    out.push({
      key: 'stack', label: 'sen.stack', type: 'choice', default: 'none', addon: { off: 'none' },
      options: [{ value: 'none', label: 'sen.stack.none' }, { value: 'feet', label: 'sen.stack.feet' }],
      allowed: (v, p, m) => v === 'none' || (m.kind === 'plywood' && p.shape === 'rect' && (p.lid ?? 'none') === 'none' && p.handles !== 'grips' && stackRoom(m, p) && engine('stack')(v, p, m)),
      why: (_v, p, m) => (m.kind !== 'plywood' ? 'sen.why.plyOnly' : (p.lid ?? 'none') !== 'none' ? 'sen.why.stackLid' : p.handles === 'grips' ? 'sen.why.stackGrips' : p.shape !== 'rect' ? 'sen.why.stackShape' : !stackRoom(m, p) ? 'sen.why.stackRoom' : 'sen.why.engine'),
      affects: ['walls'],
    });
  return out;
}

/** Each number's range: the sizes as big as one sheet takes, the counts while every space is at least the smallest compartment. */
/** Where the largest-size search starts: sizes a box is known to cut clean at (the minimums before 20 November). */
const SEARCH_FROM = { width: 20, depth: 20, height: 10 } as const;

function boxLimits(def: TemplateDef) {
  return (m: MaterialProfile, p: Params): Record<string, Limit> => {
    const big = sizeLimit(m);
    const ins = insideOf(def, m, p);
    const as = (p.sizeAs as SizeAs) ?? 'inside';
    // an outside of one sheet, stated in the box's intent
    const k = as === 'inside' ? 1 : as === 'crease' ? 0.5 : 0;
    // the largest size that still cuts clean with the words before it (square corners, no add-ons), found
    // by bisection over builds (SENTENCE_BUILDER_PLAN.md §3.3); worked out only for the number asked about
    const sheetMax = (key: 'width' | 'depth' | 'height', hi: number): Limit => {
      // the search starts where a box is known to cut clean (sizes go down to SIZE_MIN, but a 5 mm box may not, and
      // a search from a size that fails gave that size as the largest: everything was squeezed to it)
      const lo = Math.max(SEARCH_FROM[key], Number(def.params.find((x) => x.key === key)!.type === 'choice' ? 0 : (def.params.find((x) => x.key === key) as { min: number }).min));
      const base: Params = { ...p, shape: 'rect' };
      const ck = JSON.stringify([def.id, m, { ...base, [key]: null }, key]);
      const v = largestOk(ck, lo, hi, (x) => cleanWith(def, m, { ...base, [key]: x }, key, x), 9, 0.5);
      return { max: Math.max(lo, v), why: 'sen.why.sheet' };
    };
    const out: Record<string, Limit> = {};
    Object.defineProperty(out, 'width', { enumerable: true, get: () => sheetMax('width', Math.floor(big - k * (ins?.walls.w ?? 0))) });
    Object.defineProperty(out, 'depth', { enumerable: true, get: () => sheetMax('depth', Math.floor(big - k * (ins?.walls.d ?? 0))) });
    Object.defineProperty(out, 'height', { enumerable: true, get: () => sheetMax('height', Math.floor(Math.min(300, big / 2))) });
    if (ins) {
      out.nx = { max: mostSpaces(ins.w, ins.t), why: 'sen.why.spaceSmall' };
      out.ny = { max: mostSpaces(ins.d, ins.t), why: 'sen.why.spaceSmall' };
      out.sx = { max: Math.floor(ins.w * 10) / 10, why: 'sen.why.inside' };
      out.sy = { max: Math.floor(ins.d * 10) / 10, why: 'sen.why.inside' };
    }
    return out;
  };
}

/** The footprint on the floor for these words, centred on the origin. */
function footprint(p: Params, W: number, D: number, H: number): Footprint {
  const x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2;
  switch (p.shape) {
    case 'rounded':
      // the walls end up taller than stated inside: bend for a little more
      return { kind: 'rounded', x0, z0, x1, z1, r: 0, height: H + 10 };
    case 'round':
      return { kind: 'round', x0, z0, x1, z1, height: H + 10 };
    case 'poly':
      return { kind: 'regular', x0, z0, x1, z1, sides: Math.round(Number(p.sides) || 6) };
    default:
      return { kind: 'rect', x0, z0, x1, z1 };
  }
}

/** The number of equal spaces each way these words ask for, in a box of this inside. */
export function spaceCounts(p: Params, inside: { w: number; d: number }, t: number): { nx: number; ny: number } {
  if (p.spacesBy === 'count') return { nx: Math.max(1, Math.round(Number(p.nx))), ny: Math.max(1, Math.round(Number(p.ny))) };
  if (p.spacesBy === 'size') return { nx: spacesFor(inside.w, t, Number(p.sx)), ny: spacesFor(inside.d, t, Number(p.sy)) };
  return { nx: 1, ny: 1 };
}

/** Dividers at equal steps across a box's clear inside (base coordinates). */
export function addSpaces(d: Design, trayId: string, p: Params) {
  const tray = d.trays[trayId];
  const base = d.panels[tray.baseId];
  const t = tOf(d, tray.baseId);
  const inside = boxSize(d, trayId, 'inside')!, out = boxSize(d, trayId, 'outside')!;
  const x0 = (out.w - inside.w) / 2, y0 = (out.d - inside.d) / 2;
  const { nx, ny } = spaceCounts(p, inside, t);
  const step = (L: number, n: number, k: number) => k * spaceSize(L, t, n) + (k - 1) * t + t / 2;
  // across first (dividers from front to back), then the ones from side to side between them
  for (let k = 1; k < nx; k++) {
    const x = x0 + step(inside.w, nx, k);
    dividerLine(d, base.id, { x, y: y0 + 1 }, { x, y: y0 + inside.d - 1 });
  }
  for (let k = 1; k < ny; k++) {
    const y = y0 + step(inside.d, ny, k);
    dividerLine(d, base.id, { x: x0 + 1, y }, { x: x0 + inside.w - 1, y });
  }
}

function generateBox(d: Design, p: Params, kindLid: boolean, role: (name: string, id: string) => void) {
  const as = (p.sizeAs as SizeAs) ?? 'inside';
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height);
  const r = boxRecipe(d, footprint(p, W, D, H), H, 'open');
  if (!r) return;
  const tray = mainTray(d)!;
  if (as !== 'outside') d.sizeAs = as;
  // the base and walls at the sizes as stated (a round box's base never smaller than its walls bend round)
  if (p.shape === 'rect' || p.shape === 'poly') setBoxSize(d, tray, { w: W, d: D, h: H }, as);
  else setBoxSize(d, tray, { h: H }, as);
  if (p.spacesBy && p.spacesBy !== 'none') addSpaces(d, tray, p);
  const front = frontWall(d, tray);
  const fw = front ? d.panels[front] : null;
  if (fw && p.window && p.window !== 'none') {
    // in the wall's lower middle, clear of a finger notch at its top
    const s = Math.min(fw.w * 0.4, fw.h * 0.35);
    holeRecipe(d, fw.id, p.window === 'circle' ? 'circle' : 'rect', fw.w / 2, fw.h * 0.42, s, s);
  }
  if (fw && p.finger === 'notch') holeRecipe(d, fw.id, 'circle', fw.w / 2, fw.h, 20, 20);
  if (p.handles === 'grips') addGrips(d, tray);
  if (p.handles === 'slots') {
    const t = d.trays[tray];
    for (const e of ['e1', 'e3']) {
      const w = trayRing(d, t).find((x) => x.edge === e)?.wall;
      const P = w && d.panels[w];
      if (P) holeRecipe(d, P.id, 'roundrect', P.w / 2, P.h - 12, Math.min(40, P.w * 0.4), 10);
    }
  }
  // milestone 177: stacking feet and tongues on every wall
  if (p.stack === 'feet') addStack(d, trayRing(d, d.trays[tray]).map((r) => r.wall));
  if (kindLid && p.lid === 'closed') addClosedTop(d, tray);
  // milestone 176: a lid hinged on pins
  else if (kindLid && p.lid === 'pins') addPinLid(d, tray, { pin: pinOf(p, d.material) });
  else if (kindLid && (p.lid === 'plug' || p.lid === 'brim')) {
    // milestone 173: a plug or a brim under the lid's top reaches into the box: the dividers stop under it
    setBoxLid(d, tray, 'liftoff', p.lid);
    lowerUnderLid(d, tray);
  } else if (kindLid && p.lid && p.lid !== 'none') {
    // milestone 171: a rim asks for a cap (a shallow tray over the box) as deep as it says
    const rim = p.lid === 'liftoff' && (p.rim === 'half' || p.rim === 'full') ? (p.rim as CapRim) : null;
    setBoxLid(d, tray, p.lid as LidChoice, rim ? 'cap' : undefined);
    if (rim) {
      setCapRim(d, tray, rim);
      solve(d);
    }
  }
  // milestone 173: a handle on a one-board lid that lifts off; a base plate under the box
  if (kindLid && p.lidHandle === 'handle') {
    const l = boxLid(d, tray);
    if (l.kind === 'liftoff' && l.style !== 'cap' && l.style !== 'dropin') addLidHandle(d, l.top);
  }
  if (kindLid && p.overhang === 'plate') addBasePlate(d, tray, overhangOf(tOf(d, d.trays[tray].baseId)));
  nameRoles(d, role);
}

/** The pin's diameter these words ask for (milestone 176): the board's own, or the one said. */
export const pinOf = (p: Params, m: Pick<MaterialProfile, 'thickness'>) => (p.pin === undefined || p.pin === 'auto' ? pinFor(m.thickness) : Number(p.pin));

/** Is the box wide and tall enough for two pin hinges (milestone 176)? Its outside: the inside and two walls. */
export function pinFits(m: MaterialProfile, p: Params): boolean {
  const room = pinRoom(m.thickness, pinOf(p, m));
  const out = (v: number) => Number(v) + (p.sizeAs === 'outside' ? 0 : 2 * m.thickness);
  return out(Number(p.width)) >= room.width && Number(p.height) + (p.sizeAs === 'outside' ? 0 : m.thickness) >= room.height;
}

/** How far a base plate stands out past the walls (milestone 173): two boards, never under 6 mm. */
export const overhangOf = (t: number) => Math.max(6, 2 * t);

/** A lid's handle (milestone 173): the board standing on a box's lid top, if it has one. */
export function handleOf(d: Design): string | null {
  const tr = mainTray(d);
  const l = tr ? boxLid(d, tr) : null;
  return l?.kind === 'liftoff' ? lidLayers(d, l.top, 1).find((p) => p.place?.pose === 'standing')?.id ?? null : null;
}

/** Dividers stop a play under a layered lid's plug or brim (milestone 173), so it seats. */
function lowerUnderLid(d: Design, trayId: string) {
  const l = boxLid(d, trayId);
  if (l.kind !== 'liftoff') return;
  const t = d.trays[trayId];
  const B = d.panels[t.baseId];
  const walls = trayRing(d, t).map((r) => d.panels[r.wall]).filter(Boolean);
  if (!B || !walls.length) return;
  const top = Math.max(...walls.map((w) => w.frame.o[1] + w.h));
  const floor = B.frame.o[1] + tOf(d, B.id);
  const most = top - layerDepth(d, l.top) - 1 - floor;
  let changed = false;
  for (const id of dividersOn(d, B.id)) {
    const P = d.panels[id];
    if (P && P.h > most) {
      P.h = Math.max(5, most);
      changed = true;
    }
  }
  if (changed) solve(d);
}

/**
 * A top fixed on (milestone 171, UniversalBox's closed top): a board grown off the back wall's top, as far as the
 * base's front edge, joined to every wall it meets with the walls' own joint. It does not open (`boxLid`: *fixed*).
 */
export function addClosedTop(d: Design, trayId: string): string | null {
  const t = d.trays[trayId];
  const back = trayRing(d, t).find((r) => r.edge === 'e2')?.wall;
  const B = d.panels[t.baseId];
  if (!back || !B) return null;
  const g = growPanel(d, back, 'e2', { height: 10, angle: 90, dir: 'up', kind: t.cornerKind === 'tabslot' ? 'tabslot' : 'finger' });
  if (!g) return null;
  solve(d);
  // as far as the base's front edge (its frame's origin), measured along the top's own v
  const L = d.panels[g.panelId];
  const reach = (B.frame.o[0] - L.frame.o[0]) * L.frame.v[0] + (B.frame.o[1] - L.frame.o[1]) * L.frame.v[1] + (B.frame.o[2] - L.frame.o[2]) * L.frame.v[2];
  setPanelSize(d, g.panelId, undefined, reach);
  solve(d);
  connectSeams(d, g.panelId);
  solve(d);
  return g.panelId;
}

/** How far a grip rises above a side wall, and its hand hole (milestone 171). */
const GRIP = { rise: 24, hole: 13, web: 7 };

/**
 * Grips on the two side walls (milestone 171, UniversalBox's handle edges): each wall's top rises in the middle in a
 * rounded tongue with a hand hole through it.
 */
function addGrips(d: Design, trayId: string) {
  const t = d.trays[trayId];
  for (const e of ['e1', 'e3']) {
    const w = trayRing(d, t).find((x) => x.edge === e)?.wall;
    const P = w && d.panels[w];
    if (!P || P.sketch.kind !== 'wall') continue;
    const half = Math.min(40, P.w * 0.22) / P.w, shoulder = Math.min(18, P.w * 0.1) / P.w;
    // its top edge (e2) runs back from the far corner: the points in order along it
    const at: [number, number][] = [[0.5 - half - shoulder, 0], [0.5 - half, GRIP.rise], [0.5 + half, GRIP.rise], [0.5 + half + shoulder, 0]];
    for (const [tt, off] of at) {
      const id = addWallInsert(d, P.id, 'e2', tt, off);
      const s = d.panels[P.id].sketch;
      const ins = s.kind === 'wall' ? s.inserts?.find((x) => x.id === id) : undefined;
      // the raised points curve over the top; the shoulders are corners, so the wall's top stays straight up to them (curved, they bowed it under the top)
      if (ins && off > 0) ins.curve = 'auto';
    }
    solve(d);
    const hw = 2 * half * P.w * 0.78;
    holeRecipe(d, P.id, 'roundrect', P.w / 2, P.h + GRIP.rise - GRIP.web - GRIP.hole / 2, hw, GRIP.hole);
  }
  solve(d);
}

/**
 * Every board gets a role (milestone 95), so a regenerated design keeps the
 * student's shapes on the same board: the base, each wall by its base edge,
 * the dividers in order across then front to back, a lid of its own's base
 * and walls, and anything else in the order it was made.
 */
export function nameRoles(d: Design, role: (name: string, id: string) => void) {
  const named = new Set<string>();
  const name = (n: string, id: string | undefined) => {
    // a carton's top (`<tray>/top`) is found by `solve` from its tray's id: it keeps that form (the tray's id is made stable)
    if (!id || named.has(id) || !d.panels[id] || /\/top$/.test(id)) return;
    named.add(id);
    role(n, id);
  };
  for (const t of Object.values(d.trays ?? {})) {
    const pre = t.lidOf ? 'lid' : '';
    name(`${pre}base`, t.baseId);
    for (const r of trayRing(d, t)) name(`${pre}wall-${r.edge}`, r.wall);
  }
  const divs = d.order.filter((id) => d.panels[id]?.divider);
  divs.sort((a, b) => {
    const A = d.panels[a].divider!, B = d.panels[b].divider!;
    const ra = Math.round(((A.rot % 180) + 180) % 180), rb = Math.round(((B.rot % 180) + 180) % 180);
    return ra - rb || A.at.x - B.at.x || A.at.y - B.at.y;
  });
  divs.forEach((id, i) => name(`div-${i + 1}`, id));
  // milestone 176: a lid on pin hinges and its knuckles, left to right
  for (const id of d.order) {
    const p = d.panels[id];
    if (p?.pinLid) name('lid', id);
    else if (p?.knuckle) name(`knuckle-${p.knuckle.k + 1}`, id);
  }
  let k = 0;
  for (const id of d.order) if (!named.has(id)) name(`part-${++k}`, id);
}

export const box: TemplateDef = {
  id: 'box',
  version: 1,
  name: 'sen.box',
  description: 'sen.box.desc',
  word: 'sen.box',
  status: 'stable',
  materials: ['plywood', 'corrugated', 'card'],
  // milestone 153: a box has a tray's handles too, so the tray is one card with it (Open box) and loses nothing
  params: boxParams({ height: 45, lid: true, addons: ['window', 'finger', 'handles'] }),
  generate: (d, p, role) => generateBox(d, p, true, role),
  sentence: { main: 'sen.s.box' },
};
box.limits = boxLimits(box);
box.accepts = (m, p) => (cleanAll(box, m, p) ? null : 'sen.why.engineSize');

export const tray: TemplateDef = {
  id: 'tray',
  version: 1,
  name: 'sen.tray',
  description: 'sen.tray.desc',
  word: 'sen.tray',
  status: 'stable',
  materials: ['plywood', 'corrugated', 'card'],
  params: boxParams({ height: 30, lid: false, addons: ['handles'] }),
  generate: (d, p, role) => generateBox(d, p, false, role),
  sentence: { main: 'sen.s.box' },
};
tray.limits = boxLimits(tray);
// the same generator as the box's (`generateBox`): a tray is a box with no lid, window or finger notch (milestone 153: handles on both)
tray.sameAs = (p) => ({ id: 'box', params: { ...p, lid: 'none', window: 'none', finger: 'none' } });
tray.accepts = (m, p) => (cleanAll(tray, m, p) ? null : 'sen.why.engineSize');

