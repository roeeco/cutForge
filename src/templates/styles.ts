// Named packaging styles (milestone C1, SENTENCE_STYLES_PLAN.md): each a name
// for a set of the sentence's words, not a template of its own. Picking one
// fills in several words at once; the sentence shows the name whenever its
// words match one. Nothing new is stored: the style is worked out from the
// words every time. The welcome screen's card grid lists the same styles.
import type { MaterialProfile } from '../model/types';
import type { MsgKey } from '../i18n';
import type { Params, TemplateDef } from './types';
import { makes } from './types';
import { chooseStructure, type Change } from '../sentence/resolve';

export type StyleGroup = 'boxes' | 'cartons' | 'shipping' | 'flat';
export type StyleUse = 'cosmetics' | 'pharma' | 'food' | 'gift' | 'retail' | 'shipping' | 'stationery' | 'cards' | 'jewelry';

export type StyleDef = {
  id: string;
  /** The structure (template) it sets. */
  structure: string;
  /** The words it fixes. */
  words: Params;
  group: StyleGroup;
  uses: StyleUse[];
  /** The trade's code, shown only once the owner has checked it (`codeChecked`). */
  code?: string;
  codeChecked?: boolean;
  status: 'planned' | 'beta' | 'stable';
};

/** The styles in list order (most specific first within a structure, so `styleOf` finds the narrowest). */
export const STYLES: StyleDef[] = [
  // boxes and trays
  { id: 'openTray', structure: 'tray', words: {}, group: 'boxes', uses: ['food', 'gift'], code: 'ECMA C10', status: 'stable' },
  { id: 'hingedTray', structure: 'box', words: { lid: 'hinged' }, group: 'boxes', uses: ['gift'], code: 'ECMA C30', status: 'stable' },
  { id: 'hexBox', structure: 'box', words: { shape: 'poly', sides: 6, lid: 'hinged' }, group: 'boxes', uses: ['gift'], code: 'ECMA E50', status: 'stable' },
  { id: 'hexLid', structure: 'box', words: { shape: 'poly', sides: 6, lid: 'liftoff' }, group: 'boxes', uses: ['gift'], status: 'stable' },
  { id: 'trayLid', structure: 'box', words: { lid: 'liftoff' }, group: 'boxes', uses: ['gift'], code: 'ECMA C20 / FEFCO 0301', status: 'stable' },
  { id: 'drawerBox', structure: 'drawer', words: {}, group: 'boxes', uses: ['gift', 'jewelry'], status: 'stable' },
  // cartons
  { id: 'ste', structure: 'carton', words: { top: 'tuck', bottom: 'tuck', tuckFrom: 'same' }, group: 'cartons', uses: ['cards', 'cosmetics'], code: 'ECMA A50', status: 'stable' },
  { id: 'rte', structure: 'carton', words: { top: 'tuck', bottom: 'tuck', tuckFrom: 'opposite' }, group: 'cartons', uses: ['cosmetics', 'pharma'], code: 'ECMA A55', status: 'stable' },
  { id: 'tuckSnap', structure: 'carton', words: { top: 'tuck', bottom: 'snap' }, group: 'cartons', uses: ['retail'], code: 'ECMA A60', status: 'stable' },
  { id: 'autoBottom', structure: 'carton', words: { top: 'tuck', bottom: 'crash' }, group: 'cartons', uses: ['retail', 'cosmetics'], code: 'ECMA A65 / B40', status: 'stable' },
  { id: 'gable', structure: 'carton', words: { top: 'gable' }, group: 'cartons', uses: ['gift', 'food'], status: 'stable' },
  { id: 'sealed', structure: 'carton', words: { top: 'seal', bottom: 'seal' }, group: 'cartons', uses: ['pharma', 'food'], code: 'ECMA A10', status: 'stable' },
  // shipping
  { id: 'rsc', structure: 'carton', words: { top: 'rsc', bottom: 'rsc' }, group: 'shipping', uses: ['shipping'], code: 'FEFCO 0201', status: 'stable' },
  // flat pieces
  { id: 'diamondEnvelope', structure: 'envelope', words: { flaps: 'pointed' }, group: 'flat', uses: ['gift', 'stationery'], status: 'stable' },
  { id: 'pocketEnvelope', structure: 'envelope', words: { flaps: 'pocket' }, group: 'flat', uses: ['cards', 'stationery'], status: 'stable' },
  { id: 'presFolder', structure: 'folder', words: {}, group: 'flat', uses: ['stationery'], status: 'stable' },
  { id: 'giftCardHolder', structure: 'cardHolder', words: {}, group: 'flat', uses: ['gift', 'cards'], status: 'stable' },
  { id: 'openSleeve', structure: 'sleeve', words: {}, group: 'cartons', uses: ['cosmetics'], code: 'ECMA D10', status: 'stable' },
];

export const styleById = (id: string) => STYLES.find((s) => s.id === id);
const shown = (s: StyleDef) => s.status !== 'planned';

const same = (a: unknown, b: unknown) => String(a) === String(b);

/** The style these words are, or null (the sentence then shows the plain structure word). */
export function styleOf(structure: string, p: Params): StyleDef | null {
  const hits = STYLES.filter((s) => shown(s) && s.structure === structure && Object.entries(s.words).every(([k, v]) => same(p[k], v)));
  // the most specific: the one fixing the most words (list order breaks ties)
  return hits.sort((a, b) => Object.keys(b.words).length - Object.keys(a.words).length)[0] ?? null;
}

/**
 * Choose a style: its structure (the words it shares kept) with its own words
 * set, then every word checked in order as the resolver does. A word the
 * material cannot have takes its fallback and is reported.
 */
export function chooseStyle(s: StyleDef, m: MaterialProfile, params: Params, byId: (id: string) => TemplateDef | undefined): { id: string; params: Params; changes: Change[] } | null {
  const to = byId(s.structure);
  if (!to || !makes(to, m)) return null;
  const r = chooseStructure(to, m, { ...params, ...s.words });
  if (styleOf(to.id, r.params)?.id === s.id) return { id: to.id, params: r.params, changes: r.changes };
  // not at these sizes (a gable top on a shallow box): the structure's own sizes, and a note for each size that changed
  const own: Params = {};
  for (const p of to.params) if (p.type === 'number' && p.unit === 'mm') own[p.key] = p.default;
  const r2 = chooseStructure(to, m, { ...params, ...own, ...s.words });
  const sizes: Change[] = Object.keys(own).filter((k) => k in params && String(params[k]) !== String(r2.params[k])).map((k) => ({ key: k, from: params[k], to: r2.params[k], why: 'sen.why.styleSize' as MsgKey }));
  return { id: to.id, params: r2.params, changes: [...sizes, ...r2.changes] };
}

const listedCache = new Map<string, boolean>();
/** Can this material make this style as it is (every word it fixes allowed)? Hidden otherwise, never greyed. */
export function styleListed(s: StyleDef, m: MaterialProfile, params: Params, byId: (id: string) => TemplateDef | undefined): boolean {
  if (!shown(s)) return false;
  const key = JSON.stringify([s.id, m.id, m.thickness, m.kind, params]);
  const hit = listedCache.get(key);
  if (hit !== undefined) return hit;
  const r = chooseStyle(s, m, params, byId);
  const ok = !!r && styleOf(r.id, r.params)?.id === s.id;
  if (listedCache.size > 400) listedCache.clear();
  listedCache.set(key, ok);
  return ok;
}

/** A style's words in the interface. */
export const styleName = (s: StyleDef) => `style.${s.id}` as MsgKey;
export const styleWord = (s: StyleDef) => `style.${s.id}.word` as MsgKey;
export const styleDesc = (s: StyleDef) => `style.${s.id}.desc` as MsgKey;
export const GROUPS: (StyleGroup | 'more')[] = ['boxes', 'cartons', 'shipping', 'flat', 'more'];
/** Where each structure sits in the first word's list (a structure not named here goes last). */
export const STRUCTURE_GROUP: Record<string, StyleGroup | 'more'> = { box: 'boxes', tray: 'boxes', drawer: 'boxes', carton: 'cartons', sleeve: 'cartons', envelope: 'flat', folder: 'flat', cardHolder: 'flat', stand: 'more' };
/** A style whose words are all its structure's own (no word fixed): the structure's entry stands for it. */
export const isAlias = (s: StyleDef) => Object.keys(s.words).length === 0;
