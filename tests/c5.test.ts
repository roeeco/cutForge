// Milestone C5 (SENTENCE_STYLES_PLAN.md): flat pieces — two envelopes, a presentation folder, a gift-card holder.
import { describe, expect, it } from 'vitest';
import '../src/templates/registry';
import { MATERIALS } from '../src/model/materials';
import { defaults, generate, templateById } from '../src/templates/registry';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/fix';
import { pieceCopies } from '../src/model/pack';
import { edgeFeatures } from '../src/model/edgeFeatures';
import { STYLES, chooseStyle, styleListed } from '../src/templates/styles';
import { makes } from '../src/templates/types';
import type { Design } from '../src/model/types';

const CARD = MATERIALS[0];
const blocking = (d: Design) => validate(d).filter((i) => !NOTE_KEYS.has(i.key)).map((i) => i.key);
const make = (id: string, over: Record<string, number | string> = {}) => generate(templateById(id)!, CARD, { ...defaults(templateById(id)!), ...over });

describe('C5: flat pieces', () => {
  it('a diamond envelope: one piece, four pointed flaps folded over the board, nothing blocking', () => {
    const d = make('envelope', { flaps: 'pointed' });
    expect(blocking(d)).toEqual([]);
    expect(pieceCopies(d)).toHaveLength(1);
    const hs = edgeFeatures(d).filter((h) => h.kind === 'flap');
    expect(hs).toHaveLength(4);
    for (const h of hs) {
      expect(h.out.hinged).toHaveLength(1);
      expect(h.out.hinged[0].angle).toBeGreaterThanOrEqual(175);
    }
    // the closing flap folds last (the least turned: it lies on top)
    const top = hs.find((h) => h.edge === 'e2')!.out.hinged[0].angle!;
    expect(Math.min(...hs.map((h) => h.out.hinged[0].angle!))).toBe(top);
  });

  it('a pocket envelope: a long pocket glued at its sides and a closing flap', () => {
    const d = make('envelope', { flaps: 'pocket', width: 100, height: 160 });
    expect(blocking(d)).toEqual([]);
    const base = d.panels['t:base'];
    const pocket = base.edgeFlaps!.find((f) => f.edge === 'e0')!;
    expect(pocket.len).toBeGreaterThan(0.6 * base.h);
  });

  it('a presentation folder: one piece, a pocket on each cover glued at its outer side, slits for a business card', () => {
    const d = make('folder');
    expect(blocking(d)).toEqual([]);
    expect(pieceCopies(d)).toHaveLength(1);
    const pockets = ['t:pocket-left', 't:pocket-right'].map((id) => d.panels[id]);
    // glued on their outer side (the spine side is left short, so the pockets do not meet in the flat)
    for (const p of pockets) expect(p.edgeFlaps).toHaveLength(1);
    expect(pockets[1].lines!.filter((l) => l.type === 'cut')).toHaveLength(2);
  });

  it('a gift-card holder: one piece folded open, four corner slits for the card', () => {
    const d = make('cardHolder');
    expect(blocking(d)).toEqual([]);
    expect(pieceCopies(d)).toHaveLength(1);
    expect(d.panels['t:face-right'].lines!.filter((l) => l.type === 'cut')).toHaveLength(4);
  });

  it('card only: the four styles are listed on card, and no flat piece is made in corrugated or plywood', () => {
    const p0 = defaults(templateById('box')!);
    for (const id of ['diamondEnvelope', 'pocketEnvelope', 'presFolder', 'giftCardHolder']) {
      const s = STYLES.find((x) => x.id === id)!;
      expect(styleListed(s, CARD, p0, templateById), id).toBe(true);
      const r = chooseStyle(s, CARD, p0, templateById)!;
      expect(blocking(generate(templateById(r.id)!, CARD, r.params)), id).toEqual([]);
      for (const m of MATERIALS.filter((x) => x.kind !== 'card')) expect(makes(templateById(s.structure)!, m)).toBe(false);
    }
  });
});
