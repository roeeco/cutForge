// Custom presets (milestone 158, DIELINE_GENERATOR_ANALYSIS.md §4): a preset is a record (records.ts) whose slots are
// each a list of choices the engine checks. A student or teacher picks a combination nobody named (a gable top on a
// snap-lock bottom, a gusseted octagonal tray); every choice is built before it is offered, so what the engine refuses
// says why; the recogniser names the record when it is a style the catalogue has. A saved preset is a card of its own.
//
// A record is built on the structures it is made of: a cross is the box's words, a tube the carton's, and the corner
// rule the design's own joint choice for corners (so it outlives a change of sizes, as any joint choice does).
import type { ConnectionKind, Design, MaterialProfile } from '../model/types';
import type { MsgKey } from '../i18n';
import { defaults, generate, templateById } from './registry';
import type { Params } from './types';
import { seamKinds } from '../model/seams';
import { foldsAsCarton } from '../model/materials';
import { patchJoints } from '../model/jointDefaults';
import { applyJointChoices, solve } from '../model/ops';
import { validate } from '../model/validate';
import { NOTE_KEYS } from '../easy/notes';
import { recordKey, recordOf } from './records';
import { recognise, type Card, type Variant } from './catalogue';
import { chooseStyle, isAlias, styleById } from './styles';
import { mainTray } from './structures/box';

/** The slots a custom preset is made of, in the order the editor shows them. */
export type CustomRecord = {
  body: 'cross' | 'tube';
  /** The base's shape (a tube's is a rectangle). */
  footprint: 'rect' | 'poly' | 'round';
  /** An n-gon's sides. */
  sides?: number;
  /** A cross's lid and corner rule. */
  lid?: 'none' | 'liftoff' | 'hinged';
  corner?: ConnectionKind;
  /** A tube's two ends. */
  top?: string;
  bottom?: string;
  /** A window in the front. */
  window?: 'none' | 'circle' | 'rect';
};
export type Slot = 'body' | 'footprint' | 'sides' | 'lid' | 'corner' | 'top' | 'bottom' | 'window';
export type Sizes = { width: number; depth: number; height: number };

/** A choice in a slot: offered, or refused with the reason. */
export type Choice = { value: string | number; ok: boolean; why?: MsgKey };

/** A saved preset (kept in the library, persist.ts): its own name, its record and sizes. */
export type SavedPreset = { id: string; name: string; record: CustomRecord; sizes: Sizes; createdAt: number };

/** The slots a record has (a tube has ends, a cross a lid and corners; an n-gon its sides). */
export function slotsOf(r: CustomRecord): Slot[] {
  const out: Slot[] = ['body', 'footprint'];
  if (r.footprint === 'poly') out.push('sides');
  if (r.body === 'cross') out.push('lid', 'corner');
  else out.push('top', 'bottom');
  out.push('window');
  return out;
}

const SIDES = [3, 4, 5, 6, 7, 8, 10, 12];

/** Every value a slot can take, before the engine is asked. */
export function valuesOf(m: MaterialProfile, slot: Slot): (string | number)[] {
  switch (slot) {
    case 'body':
      return ['cross', 'tube'];
    case 'footprint':
      return ['rect', 'poly', 'round'];
    case 'sides':
      return SIDES.filter((n) => n !== 4);
    case 'lid':
      return ['none', 'liftoff', 'hinged'];
    case 'corner':
      return seamKinds(m, 'corner').filter((k) => k !== 'closure');
    case 'top':
      return optionValues('carton', 'top');
    case 'bottom':
      return optionValues('carton', 'bottom');
    case 'window':
      return ['none', 'circle', 'rect'];
  }
}

function optionValues(tpl: string, key: string): (string | number)[] {
  const p = templateById(tpl)?.params.find((x) => x.key === key);
  return p?.type === 'choice' ? p.options.map((o) => o.value) : [];
}

/** The structure and words a record is built from. */
export function wordsOf(r: CustomRecord, s: Sizes): { structure: 'box' | 'carton'; params: Params } {
  if (r.body === 'tube') {
    const def = templateById('carton')!;
    return { structure: 'carton', params: { ...defaults(def), ...s, top: r.top ?? 'tuck', bottom: r.bottom ?? 'snap', window: r.window ?? 'none' } };
  }
  const def = templateById('box')!;
  return {
    structure: 'box',
    params: { ...defaults(def), ...s, shape: r.footprint, ...(r.footprint === 'poly' ? { sides: r.sides ?? 6 } : {}), lid: r.lid ?? 'none', window: r.window ?? 'none' },
  };
}

/** A record as a design at these sizes; null when its structure cannot be built in this board. */
export function buildCustom(m: MaterialProfile, r: CustomRecord, s: Sizes): Design | null {
  const w = wordsOf(r, s);
  const def = templateById(w.structure);
  if (!def || !(def.canMake ? def.canMake(m) : def.materials.includes(m.kind))) return null;
  let d: Design;
  try {
    d = generate(def, m, w.params);
  } catch {
    return null;
  }
  if (r.body === 'cross' && r.corner) setCorner(d, r.corner);
  return d;
}

/** A design's corner rule, as its own joint choice for corners (kept through a change of sizes). */
export function setCorner(d: Design, kind: ConnectionKind) {
  patchJoints(d, { corner: kind });
  applyJointChoices(d);
  solve(d);
}

/** The record a design is, as the editor's slots (null when it is not a box or a carton). */
export function customOf(d: Design): CustomRecord | null {
  const t = d.template;
  if (!t || (t.id !== 'box' && t.id !== 'carton')) return null;
  const p = t.params;
  if (t.id === 'carton') return { body: 'tube', footprint: 'rect', top: String(p.top), bottom: String(p.bottom), window: (p.window as CustomRecord['window']) ?? 'none' };
  const tr = mainTray(d);
  const footprint = (p.shape === 'rounded' ? 'rect' : p.shape) as CustomRecord['footprint'];
  return {
    body: 'cross',
    footprint,
    ...(footprint === 'poly' ? { sides: Number(p.sides) } : {}),
    lid: (p.lid as CustomRecord['lid']) ?? 'none',
    ...(tr ? { corner: d.trays[tr].cornerKind } : {}),
    window: (p.window as CustomRecord['window']) ?? 'none',
  };
}

/** A design's sizes, as the editor keeps them. */
export function sizesOf(d: Design): Sizes {
  const p = d.template?.params ?? {};
  return { width: Number(p.width) || 120, depth: Number(p.depth) || 80, height: Number(p.height) || 45 };
}

/** A record with one slot changed, and the slots that no longer apply dropped (a tube has no lid). */
export function withSlot(r: CustomRecord, slot: Slot, v: string | number): CustomRecord {
  const next: CustomRecord = { ...r, [slot]: v } as CustomRecord;
  if (slot === 'body' && v === 'tube') {
    next.footprint = 'rect';
    delete next.sides;
    delete next.lid;
    delete next.corner;
    next.top ??= 'tuck';
    next.bottom ??= 'snap';
  }
  if (slot === 'body' && v === 'cross') {
    delete next.top;
    delete next.bottom;
    next.lid ??= 'none';
  }
  if (slot === 'footprint' && v === 'poly') next.sides ??= 6;
  if (slot === 'footprint' && v !== 'poly') delete next.sides;
  return next;
}

const cleanCache = new Map<string, { d: Design | null; ok: boolean }>();
/** A record built and checked (cached): clean when nothing stops the cut. */
export function checked(m: MaterialProfile, r: CustomRecord, s: Sizes): { d: Design | null; ok: boolean } {
  const key = JSON.stringify([m, r, s]);
  const hit = cleanCache.get(key);
  if (hit) return hit;
  const d = buildCustom(m, r, s);
  const ok = !!d && !validate(d).some((x) => !NOTE_KEYS.has(x.key));
  if (cleanCache.size > 200) cleanCache.clear();
  const out = { d, ok };
  cleanCache.set(key, out);
  return out;
}

/**
 * A slot's choices now: each built with the rest of the record as it is and checked. A refused one says why: a
 * rule of the body (a tube folds, and is a rectangle), the structure's own reason for that word, or the engine's.
 */
export function choicesFor(m: MaterialProfile, r: CustomRecord, s: Sizes, slot: Slot): Choice[] {
  return valuesOf(m, slot).map((v) => {
    if (v === (r as Record<string, unknown>)[slot]) return { value: v, ok: true };
    const why = ruleWhy(m, r, slot, v);
    if (why) return { value: v, ok: false, why };
    const next = withSlot(r, slot, v);
    const c = checked(m, next, s);
    if (!c.d) return { value: v, ok: false, why: 'custom.why.board' };
    // a corner rule that did not take (the engine keeps another where this one does not fit)
    if (slot === 'corner') {
      const tr = mainTray(c.d);
      const kinds = Object.values(c.d.connections).filter((x) => !x.grown && x.trayId === tr && !x.wing && x.kind !== 'closure').map((x) => x.kind);
      if (!kinds.length || kinds.some((k) => k !== v)) return { value: v, ok: false, why: v === 'gusset' ? 'custom.why.gusset' : 'custom.why.corner' };
    }
    if (!c.ok) return { value: v, ok: false, why: wordWhy(m, r, s, slot, v) ?? 'sen.why.engine' };
    return { value: v, ok: true };
  });
}

/** The body's own rules. */
function ruleWhy(m: MaterialProfile, r: CustomRecord, slot: Slot, v: string | number): MsgKey | null {
  if (slot === 'body' && v === 'tube' && !foldsAsCarton(m, 4)) return 'custom.why.tubeFolds';
  if (slot === 'footprint' && r.body === 'tube' && v !== 'rect') return 'custom.why.tubeRect';
  return null;
}

/** The structure's own reason for a word it does not offer (the sentence's, e.g. a hinged lid on a round box). */
function wordWhy(m: MaterialProfile, r: CustomRecord, s: Sizes, slot: Slot, v: string | number): MsgKey | null {
  const w = wordsOf(r, s);
  const key = slot === 'footprint' ? 'shape' : slot;
  const p = templateById(w.structure)?.params.find((x) => x.key === key);
  if (!p || p.type !== 'choice' || !p.why) return null;
  try {
    return p.allowed && !p.allowed(v, w.params, m) ? p.why(v, w.params, m) : null;
  } catch {
    return null;
  }
}

/**
 * What the catalogue calls a record: the card variant the recogniser names it, and whether it is that variant
 * exactly (built at the same sizes, the same record) or only nearest to it.
 */
export function nameOf(m: MaterialProfile, r: CustomRecord, s: Sizes): { card: Card; v: Variant; same: boolean } | null {
  const c = checked(m, r, s);
  if (!c.d) return null;
  const got = recognise(c.d);
  if (!got) return null;
  const own = variantDesign(m, got.v, s);
  return { ...got, same: !!own && recordKey(recordOf(own)) === recordKey(recordOf(c.d)) };
}

/** A catalogue variant built at these sizes (its style's words, or its structure's own). */
function variantDesign(m: MaterialProfile, v: Variant, s: Sizes): Design | null {
  if (!v.structure) return null;
  const def = templateById(v.structure);
  if (!def) return null;
  const style = v.style ? styleById(v.style) : undefined;
  const base = { ...defaults(def), ...s, ...(v.words ?? {}) };
  const r = style && !isAlias(style) ? chooseStyle(style, m, base, templateById) : { id: def.id, params: base };
  if (!r) return null;
  try {
    return generate(templateById(r.id)!, m, { ...r.params, ...s });
  } catch {
    return null;
  }
}

/** A saved preset as a card of its own (milestone 158): its own name, its record (as built in this board) its one variant's pattern. */
export function customCard(p: SavedPreset, m: MaterialProfile): Card {
  const w = wordsOf(p.record, p.sizes);
  const built = checked(m, p.record, p.sizes).d;
  return {
    id: `custom:${p.id}`,
    title: 'card.custom',
    name: p.name,
    group: 'more',
    status: 'beta',
    challenges: [],
    variants: [{ id: `custom:${p.id}`, structure: w.structure, words: w.params, sentence: false, match: built ? recordOf(built) : { body: p.record.body } }],
  };
}

/** A saved preset's design, ready to open. */
export function startFromPreset(m: MaterialProfile, p: SavedPreset): Design | null {
  const d = buildCustom(m, p.record, p.sizes);
  if (d) d.name = p.name;
  return d;
}

