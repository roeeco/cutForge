// Milestone 150 (DIELINE_GENERATOR_ANALYSIS.md §4): presets as records. Every style is recognised back from the design
// it builds, in every board that lists it; a structure's own words are its own variant; and a design made by hand,
// with no template, is still recognised.
import { describe, expect, it } from 'vitest';
import '../src/templates/registry';
import { MATERIALS } from '../src/model/materials';
import { TEMPLATES, defaults, generate, templateById } from '../src/templates/registry';
import { STYLES, chooseStyle, isAlias, styleOf } from '../src/templates/styles';
import { CATALOGUE, recognise, variants } from '../src/templates/catalogue';
import { recordOf, recordKey } from '../src/templates/records';
import { thingsFor } from '../src/guided/things';
import { createDesign, solve } from '../src/model/ops';
import { boxRecipe } from '../src/easy/recipes';
import { makes } from '../src/templates/types';

const BASE = ['card-0.5', 'corr-1.6', 'corr-4', 'ply-3'].map((id) => MATERIALS.find((m) => m.id === id)!);
const BOX = defaults(templateById('box')!);

describe('preset records (milestone 150)', () => {
  it('every variant has a pattern, and no two variants of different cards have the same one', () => {
    const seen = new Map<string, string>();
    for (const { card, v } of variants()) {
      expect(Object.keys(v.match).length, v.id).toBeGreaterThan(0);
      const k = JSON.stringify(Object.entries(v.match).sort());
      if (seen.has(k)) expect(seen.get(k), `${v.id} and ${seen.get(k)}`).toBe(card.id);
      seen.set(k, card.id);
    }
  });

  it('every style is recognised back from the design it builds, in every board that lists it', () => {
    let n = 0;
    for (const m of BASE)
      for (const s of STYLES) {
        if (s.status === 'planned') continue;
        const r = chooseStyle(s, m, BOX, templateById);
        if (!r || styleOf(r.id, r.params)?.id !== s.id) continue;
        const got = recognise(generate(templateById(r.id)!, m, r.params));
        const want = isAlias(s) ? (x: typeof got) => x?.v.structure === s.structure && !x.v.style : (x: typeof got) => x?.v.style === s.id;
        expect(want(got), `${s.id} in ${m.id}: ${got?.v.id}`).toBe(true);
        n++;
      }
    expect(n).toBeGreaterThan(30);
  }, 300_000);

  it("a structure's own words are its own variant (or the style they name)", () => {
    for (const m of BASE)
      for (const t of TEMPLATES) {
        if (t.status === 'planned' || !makes(t, m) || t.id === 'organiser') continue;
        const d = generate(t, m, defaults(t));
        const got = recognise(d);
        const s = styleOf(t.id, d.template!.params);
        if (s && !isAlias(s)) expect(got?.v.style, `${t.id} ${m.id}`).toBe(s.id);
        else expect(got?.v.structure, `${t.id} ${m.id}`).toBe(t.id);
      }
  }, 300_000);

  it('Guided’s things are recognised as the cards they come from (the carton as the snap-lock style it is)', () => {
    for (const m of BASE)
      for (const th of thingsFor(null)) {
        if (!th.can(m) || th.mission) continue;
        const got = recognise(th.start(m));
        const from = CATALOGUE.find((c) => c.variants.some((v) => v.guided?.id === th.id));
        expect(got?.card.id, `${th.id} in ${m.id}`).toBe(from?.id);
      }
  });

  it('a design made by hand (no template) is recognised by what it is', () => {
    const card = BASE[0];
    // Quick build's carton: a tube with a tuck top and a snap-lock bottom
    const c = createDesign(card);
    boxRecipe(c, { kind: 'rect', x0: -40, z0: -30, x1: 40, z1: 30 }, 100, 'carton');
    solve(c);
    expect(c.template).toBeUndefined();
    expect(recognise(c)?.v.id).toBe('tuckSnap');
    // a box drawn on the floor and walled
    const b = createDesign(BASE[3]);
    boxRecipe(b, { kind: 'rect', x0: -50, z0: -40, x1: 50, z1: 40 }, 50);
    solve(b);
    expect(recognise(b)?.card.id).toBe('openBox');
    // a hexagon with a lid that lifts off
    const h = createDesign(card);
    boxRecipe(h, { kind: 'regular', x0: -40, z0: -40, x1: 40, z1: 40, sides: 6 }, 40, 'lid');
    solve(h);
    expect(recordOf(h)).toMatchObject({ body: 'cross', footprint: 'poly', sides: 6, lid: 'liftoff' });
    expect(recognise(h)?.v.id).toBe('hexLid');
    // records are keys: two designs of the same kind at other sizes have the same record
    const b2 = createDesign(BASE[3]);
    boxRecipe(b2, { kind: 'rect', x0: -80, z0: -40, x1: 80, z1: 40 }, 70);
    solve(b2);
    expect(recordKey(recordOf(b2))).toBe(recordKey(recordOf(b)));
  });

  it('a card is never recognised from a planned card', () => {
    expect(CATALOGUE.every((c) => c.status !== 'planned' || c.variants.length > 0)).toBe(true);
  });
});
