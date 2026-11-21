// The presets as one catalogue (milestone 146, PRESETS_OVERHAUL.md §3, §6). Every ready starting point a student
// can pick (a sentence structure, a named style, a mission, a Guided thing) belongs to exactly one card. A card is
// one thing that looks and works differently from every other card; its variants are the ways of it that differ
// underneath or in footprint (the tuck cartons' bottoms, the lidded box's hexagon). The lists read this file: the
// sentence's first word (`sentenceEntries`), Guided's gallery (`guided/things.ts`) and the missions offered
// (`catalogueMissions`). Nothing is stored: a design's card is worked out from its template, words or mission.
import type { Design, MaterialProfile } from '../model/types';
import type { MsgKey } from '../i18n';
import { foldsAsCarton } from '../model/materials';
import { STRUCTURES, templateById } from './registry';
import { makes, type Params, type TemplateDef } from './types';
import { chooseStyle, isAlias, styleById, styleListed, styleOf, type StyleDef } from './styles';
import { chooseStructure, type Change, type Value } from '../sentence/resolve';
import { MISSIONS, type Mission } from '../easy/missions';
import { fits, recordOf, specificity, type PresetRecord } from './records';

/** Where a card sits in a list (the sentence's group headings: `style.group.<group>`). */
export type CardGroup = 'boxes' | 'cartons' | 'flat' | 'more' | 'shapes';

/** A Guided gallery thing made from a variant: its id (kept for saved class lists), its words and when it is offered. */
export type GuidedEntry = { id: string; title: MsgKey; blurb: MsgKey; words: Params; can?: (m: MaterialProfile) => boolean; why?: MsgKey };

export type Variant = {
  /** Unique across the catalogue: the style's id, the structure's id, or the variant's own. */
  id: string;
  /** The structure (template) it builds; absent for a ready shape. */
  structure?: string;
  /** The named style it is (its words are the style's). */
  style?: string;
  /** Words it fixes when it is not a style (the round box's shape). */
  words?: Params;
  /** Sizes it starts at when picked from another variant of the same card, so the two are never the same thing (a tray is lower than a box). */
  own?: Params;
  /** In the sentence's first word (default: a structure with a word, or a style). */
  sentence?: boolean;
  /** A ready shape (Guided), not a structure. */
  solid?: 'pyramid' | 'diamond';
  /** Its Guided gallery thing, when it has one. */
  guided?: GuidedEntry;
  /** Milestone 150: the records it is (records.ts): `recognise` names a design by the most specific pattern it fits. */
  match: Partial<PresetRecord>;
};

export type Card = {
  id: string;
  title: MsgKey;
  /** Milestone 158: a custom preset's own name (its title is then *Your preset*). */
  name?: string;
  /** Milestone 153: the card as the sentence's first word (*a tuck-end carton*), when it stands for more than one variant. */
  word?: MsgKey;
  group: CardGroup;
  variants: Variant[];
  /** The missions that start from it (the plan's challenges), by mission id. */
  challenges: string[];
  status: 'stable' | 'beta' | 'planned';
  /** Milestone 151: how its pictures look at it (views/illustrate.ts): from where, and how far a tube's bottom flaps hang open. */
  view?: { dir?: 'front34' | 'high' | 'side34'; bottomOpen?: number; /** What its pictures show inside it (milestone 155; paper, milestone 162). */ prop?: 'cup' | 'product' | 'paper' };
};

const BOX_G = { width: 120, depth: 80, height: 45, sizeAs: 'inside' };

/** The cards in list order (PRESETS_OVERHAUL.md §6; the new cards of milestones 152–153 are added when built). */
export const CATALOGUE: Card[] = [
  // boxes and trays
  {
    id: 'openBox', title: 'card.openBox', word: 'card.openBox.word', group: 'boxes', status: 'stable', challenges: [],
    variants: [
      { id: 'box', structure: 'box', own: { height: 45 }, match: { body: 'cross', lid: 'none' }, guided: { id: 'box', title: 'g.thing.box', blurb: 'g.thing.box.blurb', words: BOX_G } },
      { id: 'tray', structure: 'tray', own: { height: 30 }, match: { body: 'cross', lid: 'none' } },
    ],
  },
  // milestone 162 (beta; BOXES_PRESETS_PLAN.md): boards with no top and no front, on plywood and 4 mm board only
  { id: 'frontOpen', title: 'card.frontOpen', group: 'boxes', status: 'beta', view: { prop: 'paper' }, challenges: [], variants: [{ id: 'frontOpen', structure: 'frontOpen', match: { body: 'cross', lid: 'none', open: 1 } }] },
  // milestone 164 (beta): a box of boards with a plate partway down, pens standing in its holes
  { id: 'penHolder', title: 'card.penHolder', group: 'boxes', status: 'beta', view: { prop: 'cup', dir: 'high' }, challenges: [], variants: [{ id: 'penHolder', structure: 'penHolder', match: { body: 'cross', lid: 'none', plate: true } }] },
  // milestone 164 (beta): a low box of boards whose front is a ramp, for scooping tokens and screws out
  { id: 'scoopTray', title: 'card.scoopTray', group: 'boxes', status: 'beta', view: { dir: 'side34' }, challenges: [], variants: [{ id: 'scoopTray', structure: 'scoopTray', match: { body: 'cross', lid: 'none', ramp: true } }] },
  // milestone 169 (beta): a box of boards whose lid slides out in grooves made by rails on its side walls
  { id: 'slideBox', title: 'card.slideBox', group: 'boxes', status: 'beta', challenges: [], variants: [{ id: 'slideBox', structure: 'slideBox', match: { body: 'cross', lid: 'none', rails: true } }] },
  { id: 'organiser', title: 'card.organiser', group: 'boxes', status: 'stable', view: { dir: 'high' }, challenges: ['pencil-box', 'game-organiser'], variants: [{ id: 'organiser', structure: 'organiser', sentence: false, match: { body: 'cross', lid: 'none', spaces: true } }] },
  {
    id: 'liddedBox', title: 'card.liddedBox', word: 'card.liddedBox.word', group: 'boxes', status: 'stable', challenges: [],
    variants: [
      { id: 'trayLid', structure: 'box', style: 'trayLid', match: { body: 'cross', lid: 'liftoff' }, guided: { id: 'box-lid', title: 'g.thing.boxLid', blurb: 'g.thing.boxLid.blurb', words: { ...BOX_G, lid: 'liftoff' } } },
      { id: 'hexLid', structure: 'box', style: 'hexLid', match: { body: 'cross', lid: 'liftoff', footprint: 'poly', sides: 6 } },
    ],
  },
  {
    id: 'hingedBox', title: 'card.hingedBox', word: 'card.hingedBox.word', group: 'boxes', status: 'stable', challenges: ['escape-box'],
    variants: [
      { id: 'hingedTray', structure: 'box', style: 'hingedTray', match: { body: 'cross', lid: 'hinged' } },
      { id: 'hexBox', structure: 'box', style: 'hexBox', match: { body: 'cross', lid: 'hinged', footprint: 'poly', sides: 6 } },
    ],
  },
  {
    // owner question 12 (milestone 106): the round box is 100 × 100 outside, its inside measured; milestone 155: in the sentence
    id: 'roundBox', title: 'card.roundBox', group: 'boxes', status: 'stable', challenges: [],
    variants: [{ id: 'roundBox', structure: 'box', style: 'roundBox', match: { body: 'cross', footprint: 'round', lid: 'none' }, guided: { id: 'round-box', title: 'g.thing.round', blurb: 'g.thing.round.blurb', words: { width: 100, depth: 100, height: 45, sizeAs: 'inside', shape: 'round' } } }],
  },
  // milestone 155: a tall cup with sides, pencils standing in it; the dice tray (a low hexagon) is a challenge on it
  { id: 'penCup', title: 'card.penCup', group: 'boxes', status: 'stable', challenges: ['dice-tray'], view: { prop: 'cup' }, variants: [{ id: 'penCup', structure: 'box', style: 'penCup', match: { body: 'cross', footprint: 'poly', lid: 'none' } }] },
  { id: 'drawerBox', title: 'card.drawerBox', group: 'boxes', status: 'stable', challenges: [], variants: [{ id: 'drawer', structure: 'drawer', match: { body: 'cross', relation: 'drawer' } }] },
  // milestone 157 (beta): a box whose side walls slope down to a low front
  { id: 'magazineFile', title: 'card.magazineFile', group: 'boxes', status: 'beta', view: { dir: 'side34' }, challenges: [], variants: [{ id: 'magazineFile', structure: 'magazineFile', match: { body: 'cross', lid: 'none', slope: true } }] },
  // cartons
  // milestone 155: a carton with a window and what it holds behind it (before the tuck cartons: of two equally specific, the first)
  { id: 'windowCarton', title: 'card.windowCarton', group: 'cartons', status: 'stable', challenges: [], view: { prop: 'product' }, variants: [{ id: 'windowCarton', structure: 'carton', style: 'windowCarton', match: { body: 'tube', top: 'tuck', window: true } }] },
  {
    id: 'tuckCarton', title: 'card.tuckCarton', word: 'card.tuckCarton.word', group: 'cartons', status: 'stable', view: { bottomOpen: 1.35 }, challenges: [],
    variants: [
      { id: 'carton', structure: 'carton', match: { body: 'tube', top: 'tuck' }, guided: { id: 'carton', title: 'g.thing.carton', blurb: 'g.thing.carton.blurb', words: {}, can: (m) => foldsAsCarton(m, 2), why: 'g.thing.cartonNo' } },
      { id: 'tuckSnap', structure: 'carton', style: 'tuckSnap', match: { body: 'tube', top: 'tuck', bottom: 'snap' } },
      { id: 'rte', structure: 'carton', style: 'rte', match: { body: 'tube', top: 'tuck', bottom: 'tuck' } },
      { id: 'ste', structure: 'carton', style: 'ste', match: { body: 'tube', top: 'tuck', bottom: 'tuckBack' } },
      { id: 'autoBottom', structure: 'carton', style: 'autoBottom', match: { body: 'tube', top: 'tuck', bottom: 'crash' } },
    ],
  },
  { id: 'gableBox', title: 'card.gableBox', group: 'cartons', status: 'stable', challenges: [], variants: [{ id: 'gable', structure: 'carton', style: 'gable', match: { body: 'tube', top: 'roof' } }] },
  {
    id: 'flappedBox', title: 'card.flappedBox', word: 'card.flappedBox.word', group: 'cartons', status: 'stable', view: { bottomOpen: 1.35 }, challenges: [],
    variants: [
      { id: 'sealed', structure: 'carton', style: 'sealed', match: { body: 'tube', top: 'seal', bottom: 'seal' } },
      { id: 'rsc', structure: 'carton', style: 'rsc', match: { body: 'tube', top: 'rsc', bottom: 'rsc' } },
      { id: 'fol', structure: 'carton', style: 'fol', match: { body: 'tube', top: 'full', bottom: 'full' } },
    ],
  },
  { id: 'sleeve', title: 'card.sleeve', group: 'cartons', status: 'stable', challenges: [], variants: [{ id: 'sleeve', structure: 'sleeve', match: { body: 'tube', top: null, bottom: null } }] },
  // milestone 157 (beta): one wrap, its lid tucked in behind the front
  { id: 'mailer', title: 'card.mailer', group: 'cartons', status: 'beta', challenges: [], variants: [{ id: 'mailer', structure: 'mailer', match: { body: 'folded', wrap: true } }] },
  // flat pieces
  {
    id: 'envelope', title: 'card.envelope', word: 'card.envelope.word', group: 'flat', status: 'stable', challenges: [],
    variants: [
      { id: 'envelope', structure: 'envelope', match: { body: 'flat' } },
      { id: 'diamondEnvelope', structure: 'envelope', style: 'diamondEnvelope', match: { body: 'flat', flaps: 'dust,dust,glue,tuck' } },
      { id: 'pocketEnvelope', structure: 'envelope', style: 'pocketEnvelope', match: { body: 'flat', flaps: 'glue,glue,glue,tuck' } },
    ],
  },
  { id: 'folder', title: 'card.folder', group: 'flat', status: 'stable', challenges: [], variants: [{ id: 'folder', structure: 'folder', match: { body: 'folded', boards: 4 } }] },
  { id: 'cardHolder', title: 'card.cardHolder', group: 'flat', status: 'stable', challenges: [], variants: [{ id: 'cardHolder', structure: 'cardHolder', match: { body: 'folded', boards: 2, slits: true } }] },
  // milestone 164 (beta, plywood only): a gabled box with a roof of two boards and a round door
  { id: 'birdHouse', title: 'card.birdHouse', group: 'more', status: 'beta', challenges: [], variants: [{ id: 'birdHouse', structure: 'birdHouse', match: { body: 'cross', lid: 'fixed', roof: true } }] },
  // stands
  {
    id: 'stand', title: 'card.stand', word: 'card.stand.word', group: 'more', status: 'stable', view: { dir: 'side34' }, challenges: ['card-stand'],
    variants: [
      { id: 'stand', structure: 'stand', match: { body: 'stand', lean: true } },
      // milestone 155: one support and a slot as thick as a phone
      { id: 'phoneStand', structure: 'stand', style: 'phoneStand', match: { body: 'stand', lean: true, supports: 1 } },
    ],
  },
  // milestone 157 (beta): a tall box with slanted baffles between its side walls and a way out at the bottom
  { id: 'diceTower', title: 'card.diceTower', group: 'more', status: 'beta', challenges: [], variants: [{ id: 'diceTower', structure: 'diceTower', match: { body: 'cross', lid: 'none', baffles: true } }] },
  // milestone 165 (beta): slotted boards, no box and no base, on plywood and 4 mm board only
  { id: 'laptopStand', title: 'card.laptopStand', group: 'more', status: 'beta', view: { dir: 'side34' }, challenges: [], variants: [{ id: 'laptopStand', structure: 'laptopStand', match: { body: 'slot', crossing: true } }] },
  { id: 'gridInsert', title: 'card.gridInsert', group: 'more', status: 'beta', view: { dir: 'high' }, challenges: [], variants: [{ id: 'gridInsert', structure: 'gridInsert', match: { body: 'slot', crossing: true, grid: true } }] },
  { id: 'shelf', title: 'card.shelf', group: 'more', status: 'beta', challenges: [], variants: [{ id: 'shelf', structure: 'shelf', match: { body: 'slot', shelves: true } }] },
  { id: 'bottleRack', title: 'card.bottleRack', group: 'more', status: 'beta', challenges: [], variants: [{ id: 'bottleRack', structure: 'bottleRack', match: { body: 'slot', shelves: true, holes: true } }] },
  // milestone 166 (beta): boards at a slant held in angled slots, on plywood and 4 mm board only
  { id: 'deskSign', title: 'card.deskSign', group: 'more', status: 'beta', challenges: [], variants: [{ id: 'deskSign', structure: 'deskSign', match: { body: 'slot', slant: true } }] },
  { id: 'slantedShelf', title: 'card.slantedShelf', group: 'more', status: 'beta', view: { dir: 'side34' }, challenges: [], variants: [{ id: 'slantedShelf', structure: 'slantedShelf', match: { body: 'slot', slant: true, tiers: true } }] },
  // milestone 166 (beta): half of a box of boards, its front and one side open
  { id: 'bookend', title: 'card.bookend', group: 'more', status: 'beta', challenges: [], variants: [{ id: 'bookend', structure: 'bookend', match: { body: 'cross', lid: 'none', open: 2 } }] },
  // milestone 156: inserts, one strip folded on parallel creases (the strip builder)
  {
    id: 'insert', title: 'card.insert', word: 'card.insert.word', group: 'more', status: 'stable', challenges: [],
    variants: [
      { id: 'insert', structure: 'insert', match: { body: 'folded', strip: true } },
      { id: 'uLiner', structure: 'insert', style: 'uLiner', match: { body: 'folded', strip: true, folds: '+90,+90' } },
      { id: 'zProfile', structure: 'insert', style: 'zProfile', match: { body: 'folded', strip: true, folds: '+90,-90' } },
      { id: 'angleGuard', structure: 'insert', style: 'angleGuard', match: { body: 'folded', strip: true, folds: '+90' } },
      { id: 'accordionPad', structure: 'insert', style: 'accordionPad', match: { body: 'folded', strip: true, accordion: true } },
    ],
  },
  // ready shapes (Guided; the Shapes way in makes its own)
  { id: 'pyramid', title: 'card.pyramid', group: 'shapes', status: 'stable', challenges: [], variants: [{ id: 'pyramid', solid: 'pyramid', match: { body: 'solid', solid: 'pyramid' }, guided: { id: 'pyramid', title: 'g.thing.pyramid', blurb: 'g.thing.pyramid.blurb', words: {} } }] },
  { id: 'diamond', title: 'card.diamond', group: 'shapes', status: 'stable', challenges: [], variants: [{ id: 'diamond', solid: 'diamond', match: { body: 'solid', solid: 'diamond' }, guided: { id: 'diamond', title: 'g.thing.diamond', blurb: 'g.thing.diamond.blurb', words: {} } }] },
];

export const cardById = (id: string) => CATALOGUE.find((c) => c.id === id);

/** Every variant with its card. */
export function variants(): { card: Card; v: Variant }[] {
  return CATALOGUE.flatMap((card) => card.variants.map((v) => ({ card, v })));
}

/** The card a variant is on, by the variant's id. */
export const cardOfVariant = (id: string) => variants().find((x) => x.v.id === id);

// ---------------------------------------------------------------------------
// The sentence's first word

/** A first-word value: a structure's id or `style:<id>` (the sentence's values, unchanged since milestone C1). */
export const valueOf = (v: Variant): Value | null => (v.style ? (isAlias(styleById(v.style)!) ? v.structure! : `style:${v.style}`) : v.structure && !v.words ? v.structure : null);

/** The variant a first-word value is. */
export function variantOfValue(value: Value): { card: Card; v: Variant } | undefined {
  const k = String(value);
  if (k.startsWith('style:')) return variants().find((x) => x.v.style === k.slice(6));
  // a structure's own entry (a structure whose words name an alias style is that entry too)
  return variants().find((x) => x.v.structure === k && !x.v.words && (!x.v.style || isAlias(styleById(x.v.style)!)));
}

/** Is a variant in the sentence's list at all (before the material and words are asked)? */
function inSentence(v: Variant): boolean {
  if (v.sentence === false || v.solid) return false;
  if (v.style) return !isAlias(styleById(v.style)!);
  const def = v.structure ? templateById(v.structure) : undefined;
  return !!def?.word && !v.words;
}

export type EntryChoice = { id: string; params: Params; changes: Change[] };

/**
 * What picking a first-word entry makes from the sentence as it is (`current` is the value the word shows now):
 * a style's words, or the structure with the shared words kept; a variant with sizes of its own (`own`) starts at
 * them when picked from another variant of its card, with a note for each size that changed. Null when this
 * material cannot make it.
 */
export function entryChoice(value: Value, m: MaterialProfile, p: Params, current?: Value): EntryChoice | null {
  const k = String(value);
  if (k.startsWith('style:')) {
    const s = styleById(k.slice(6));
    return s ? chooseStyle(s, m, p, templateById) : null;
  }
  const def = templateById(k);
  if (!def || !makes(def, m)) return null;
  const at = variantOfValue(value), from = current !== undefined ? variantOfValue(current) : undefined;
  const own = at?.v.own && from && from.card.id === at.card.id && from.v.id !== at.v.id ? at.v.own : undefined;
  const r = chooseStructure(def, m, own ? { ...p, ...own } : p);
  const sizes: Change[] = own ? Object.keys(own).filter((x) => x in p && String(p[x]) !== String(r.params[x])).map((x) => ({ key: x, from: p[x], to: r.params[x], why: 'sen.why.ownSize' as MsgKey })) : [];
  return { id: def.id, params: r.params, changes: [...sizes, ...r.changes] };
}

/**
 * A key that is the same for two choices exactly when they build the same design: the structure (or the one it
 * builds the same as, `sameAs`) and every word it has, defaults filled in.
 */
export function choiceKey(id: string, params: Params): string {
  const def = templateById(id);
  if (!def) return id;
  const same = def.sameAs?.(params);
  const to = (same && templateById(same.id)) || def;
  const p = same ? same.params : params;
  return JSON.stringify([to.id, to.params.map((d) => String(p[d.key] ?? d.default))]);
}

const choices = new Map<string, EntryChoice | null>();
function cachedChoice(value: Value, m: MaterialProfile, p: Params, current: Value | undefined): EntryChoice | null {
  const key = JSON.stringify([value, m.id, m.kind, m.thickness, p, current ?? null]);
  if (!choices.has(key)) {
    if (choices.size > 600) choices.clear();
    choices.set(key, entryChoice(value, m, p, current));
  }
  return choices.get(key)!;
}

export type Candidate = { value: Value; card: Card; v: Variant; choice: EntryChoice; key: string };

/** Every first-word entry this material can make from these words, before the same designs are made one (for the tests). */
export function sentenceCandidates(m: MaterialProfile, p: Params, current?: Value): Candidate[] {
  const structs = new Set(STRUCTURES().filter((x) => makes(x, m)).map((x) => x.id));
  const out: Candidate[] = [];
  for (const g of SENTENCE_GROUPS)
    for (const card of CATALOGUE) {
      if (card.group !== g || card.status === 'planned') continue;
      for (const v of card.variants) {
        if (!inSentence(v)) continue;
        const value = valueOf(v);
        if (value === null) continue;
        if (v.style) {
          if (!styleListed(styleById(v.style)!, m, p, templateById)) continue;
        } else if (!structs.has(v.structure!)) continue;
        const choice = cachedChoice(value, m, p, current);
        if (choice) out.push({ value, card, v, choice, key: choiceKey(choice.id, choice.params) });
      }
    }
  return out;
}

/**
 * The sentence's first-word list for this material and these words: each card's variants in catalogue order, by
 * group (*Boxes and trays*, *Cartons*, *Flat pieces*, *More*), each design once. Two entries that would build the
 * same design (a carton whose words are the snap-lock style's), or the same named style at other sizes, are one
 * entry: the one the word shows now, else the named style, else the first.
 */
export function sentenceEntries(m: MaterialProfile, p: Params, current?: Value): Value[] {
  const listed = sentenceCandidates(m, p, current);
  const keep = new Map<string, Candidate>();
  // the same: the same design, or the same named style at other sizes (a carton on 4 mm board is the RSC)
  const same = (e: Candidate) => {
    const s = styleOf(e.choice.id, e.choice.params);
    return s && !isAlias(s) ? `style:${s.id}` : e.key;
  };
  for (const e of listed) {
    const had = keep.get(same(e));
    const named = (x: Candidate) => !!x.v.style;
    if (!had) keep.set(same(e), e);
    else if (e.value === current || (had.value !== current && named(e) && !named(had))) keep.set(same(e), e);
  }
  const kept = new Set([...keep.values()].map((e) => e.value));
  const once = listed.filter((e) => kept.has(e.value));
  // milestone 153: one entry per card (PRESETS_OVERHAUL.md §3 rule 1): the one the word shows now, else the card's
  // first; its other variants are a word away (the sentence's own words) and on the design card's Kind switch
  const byCard = new Map<string, Candidate>();
  for (const e of once) if (!byCard.has(e.card.id) || e.value === current) byCard.set(e.card.id, e);
  const shown = new Set([...byCard.values()].map((e) => e.value));
  lastKinds.clear();
  for (const e of once) if (shown.has(e.value)) lastKinds.set(String(e.value), once.filter((x) => x.card.id === e.card.id).map((x) => x.v));
  return once.filter((e) => shown.has(e.value)).map((e) => e.value);
}

/** The variants each entry of a list stood for (milestone 153), by the entry's value: the last list's. */
const lastKinds = new Map<string, Variant[]>();

/**
 * How the sentence's list names an entry (milestone 153): a card that stands for more than one variant there by its
 * own word (*a tuck-end carton*) with its kinds under it; the word the sentence shows now, and a lone variant, by
 * their own.
 */
export function entryLabel(value: Value, current?: Value): { card?: MsgKey; kinds?: Variant[] } {
  const kinds = lastKinds.get(String(value));
  const at = variantOfValue(value);
  if (!at || !kinds || kinds.length < 2 || value === current || !at.card.word) return {};
  return { card: at.card.word, kinds };
}

/** The groups of the sentence's first word, in order. */
export const SENTENCE_GROUPS: CardGroup[] = ['boxes', 'cartons', 'flat', 'more'];

/** A first-word entry's group heading key. */
export const entryGroupKey = (value: Value): MsgKey => `style.group.${variantOfValue(value)?.card.group ?? 'more'}` as MsgKey;

// ---------------------------------------------------------------------------
// Guided's gallery and the missions

/** The Guided things made from variants, in catalogue order: their entry, the structure or shape they make. */
export function guidedEntries(): { card: Card; v: Variant; g: GuidedEntry }[] {
  return variants().flatMap(({ card, v }) => (v.guided && card.status !== 'planned' ? [{ card, v, g: v.guided }] : []));
}

/** Can this material make a Guided entry? */
export function guidedCan(v: Variant, g: GuidedEntry, m: MaterialProfile): boolean {
  if (v.solid) return g.can ? g.can(m) : true;
  const def = templateById(v.structure!);
  return !!def && makes(def, m) && (g.can ? g.can(m) : true);
}

/** The missions on the catalogue's cards, in the missions' own order. */
export function catalogueMissions(): Mission[] {
  const on = new Set(CATALOGUE.filter((c) => c.status !== 'planned').flatMap((c) => c.challenges));
  return MISSIONS.filter((ms) => on.has(ms.id));
}

// ---------------------------------------------------------------------------
// A design's card

/**
 * The variant a design is (milestone 150): the most specific pattern its record fits; of equally specific ones, the
 * one its template's words name (a box and a tray are the same record), else the first. Null when none fits.
 */
export function recognise(d: Design): { card: Card; v: Variant } | null {
  const r = recordOf(d);
  const fitting = variants().filter((x) => x.card.status !== 'planned' && fits(r, x.v.match));
  if (!fitting.length) return null;
  const top = Math.max(...fitting.map((x) => specificity(x.v.match)));
  const best = fitting.filter((x) => specificity(x.v.match) === top);
  const def = d.template && templateById(d.template.id);
  const named = def ? variantOfWords(def, d.template!.params) : null;
  return best.find((x) => named && x.v.id === named.v.id) ?? best[0];
}

/** A variant's trade code, when its style has one the owner has checked (`StyleDef.codeChecked`). */
export function tradeCode(v: Variant): string | null {
  const s = v.style ? styleById(v.style) : undefined;
  return s?.code && s.codeChecked ? s.code : null;
}

/**
 * The card (and variant) a design was started from: its mission's card; else what its record is (milestone 150: a
 * design made by hand is recognised too); else its template's words. Null for a design that is none of them.
 */
export function cardOfDesign(d: Design | Pick<Design, 'template' | 'mission'>): { card: Card; v?: Variant } | null {
  if (d.mission) {
    const card = CATALOGUE.find((c) => c.challenges.includes(d.mission!.id));
    if (card) return { card };
  }
  if ('order' in d && d.order.length) {
    const r = recognise(d as Design);
    if (r) return r;
  }
  if (!d.template) return null;
  const def = templateById(d.template.id);
  if (!def) return null;
  return variantOfWords(def, d.template.params);
}

/** The variant a structure's words are: its style's, else a words variant they match, else the structure's own. */
export function variantOfWords(def: TemplateDef, p: Params): { card: Card; v: Variant } | null {
  const style: StyleDef | null = styleOf(def.id, p);
  const all = variants().filter((x) => x.v.structure === def.id);
  const byStyle = style && all.find((x) => x.v.style === style.id);
  if (byStyle) return byStyle;
  const byWords = all.find((x) => x.v.words && Object.entries(x.v.words).every(([k, w]) => String(p[k]) === String(w)));
  if (byWords) return byWords;
  return all.find((x) => !x.v.style && !x.v.words) ?? null;
}

/**
 * The variants a design's card offers it as a switch (milestone 151): those of its own card on its own structure
 * that the sentence would list for these words, its own among them; fewer than two, none.
 */
const siblingCache = new Map<string, { value: Value; v: Variant; params: Params }[]>();
export function siblingsOf(d: Design): { value: Value; v: Variant; params: Params }[] {
  const def = d.template && templateById(d.template.id);
  if (!def || !d.template) return [];
  const m = d.material, p = d.template.params;
  const key = JSON.stringify([def.id, m.id, m.kind, m.thickness, p]);
  const hit = siblingCache.get(key);
  if (hit) return hit;
  const at = variantOfWords(def, p);
  const own = at ? valueOf(at.v) : null;
  const out: { value: Value; v: Variant; params: Params }[] = [];
  if (at && own !== null) {
    const seen = new Set<string>();
    for (const v of at.card.variants) {
      if (v.structure !== def.id || !inSentence(v)) continue;
      const value = valueOf(v);
      if (value === null) continue;
      // listed for these words (the sentence's own test), its own always
      if (value !== own && v.style && !styleListed(styleById(v.style)!, m, p, templateById)) continue;
      const c = cachedChoice(value, m, p, own);
      if (!c || c.id !== def.id) continue;
      // each design once: a structure entry that is a listed style is that style
      const s = styleOf(c.id, c.params);
      const k = s && !isAlias(s) ? `style:${s.id}` : choiceKey(c.id, c.params);
      if (seen.has(k) && value !== own) continue;
      seen.add(k);
      out.push({ value, v, params: c.params });
    }
  }
  // the structure's own entry when a named style of it is there too and is the same design: the style stands for it
  const res = out.length >= 2 ? out.filter((x, i) => !(x.value === def.id && out.some((y, j) => j !== i && y.v.style && styleOf(def.id, x.params)?.id === y.v.style))) : [];
  if (siblingCache.size > 200) siblingCache.clear();
  siblingCache.set(key, res.length >= 2 ? res : []);
  return siblingCache.get(key)!;
}
