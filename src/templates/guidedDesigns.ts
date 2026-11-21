// The designs Guided's plain things and ready shapes start as (milestones 106 and 128), from the catalogue's Guided
// entries (milestone 146). Apart from catalogue.ts so the welcome screen's lists do not load the shape reassembler;
// Guided (guided/things.ts) and the presets' contact sheet (dev/PresetsDev.tsx) both start them from here.
import { CARD_FOLD_MAX, MATERIALS } from '../model/materials';
import { createDesign } from '../model/ops';
import { reassemble } from '../model/reassemble';
import { solidPoly } from '../model/solids';
import type { Design, MaterialProfile } from '../model/types';
import { defaults, generate, templateById } from './registry';
import type { GuidedEntry, Variant } from './catalogue';

/**
 * A plain thing's design: its structure with its words, then detached from the template (owner question 6):
 * nothing later rebuilds it from the words (a change of board, the class's profile, a fix), so Build's sizes
 * stay. Its sizes stay stated as the inside, and its boards keep their stable names.
 */
export function plainDesign(structure: string, g: GuidedEntry, m: MaterialProfile): Design {
  const t = templateById(structure)!;
  const d = generate(t, m, { ...defaults(t), ...g.words });
  delete d.template;
  d.sizeAs = 'inside';
  return d;
}

/** A ready shape (milestone 128, SHAPES_TO_DIELINES_PLAN.md R9): always folded from card, its net made at once (no kernel). */
export function solidDesign(kind: 'pyramid' | 'diamond', m: MaterialProfile): Design {
  const card = m.kind === 'card' && m.thickness <= CARD_FOLD_MAX ? m : MATERIALS[0];
  const d = createDesign(card);
  const solid = kind === 'pyramid' ? { kind, w: 100, h: 80, n: 4 } : { kind, w: 100, h: 80, n: 8 };
  reassemble(d, solidPoly(solid), { as: 'fold', solid });
  return d;
}

/** A Guided entry's design in this material. */
export const guidedDesign = (v: Variant, g: GuidedEntry, m: MaterialProfile): Design => (v.solid ? solidDesign(v.solid, m) : plainDesign(v.structure!, g, m));
