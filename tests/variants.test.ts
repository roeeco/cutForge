// Milestone 151: the variant switch on the design card offers the other ways of the same thing (its card's variants on
// its structure that the sentence lists for its words), and picking one makes that variant.
import { describe, expect, it } from 'vitest';
import '../src/templates/registry';
import { MATERIALS } from '../src/model/materials';
import { defaults, generate, regenerate, templateById } from '../src/templates/registry';
import { chooseStyle, styleById } from '../src/templates/styles';
import { recognise, siblingsOf } from '../src/templates/catalogue';

const CARD = MATERIALS.find((m) => m.id === 'card-0.5')!;
const C16 = MATERIALS.find((m) => m.id === 'corr-1.6')!;
const BOX = defaults(templateById('box')!);
const styled = (id: string, m = CARD) => {
  const r = chooseStyle(styleById(id)!, m, BOX, templateById)!;
  return generate(templateById(r.id)!, m, r.params);
};

describe('the variant switch (milestone 151)', () => {
  it('a tuck carton offers the other tuck cartons, itself among them', () => {
    const d = styled('rte');
    const ids = siblingsOf(d).map((s) => s.v.id);
    expect(ids).toEqual(expect.arrayContaining(['ste', 'rte', 'tuckSnap']));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('picking one makes that variant, keeping the sizes', () => {
    const d = styled('rte');
    const to = siblingsOf(d).find((s) => s.v.id === 'tuckSnap')!;
    const r = regenerate(d, to.params);
    expect(recognise(r.design)?.v.id).toBe('tuckSnap');
    for (const k of ['width', 'depth', 'height']) expect(r.design.template!.params[k]).toBe(d.template!.params[k]);
  });

  it('a lidded box offers its hexagon; a box with flaps its shipping and full-overlap flaps; a lone variant offers none', () => {
    expect(siblingsOf(styled('trayLid', C16)).map((s) => s.v.id)).toEqual(expect.arrayContaining(['trayLid', 'hexLid']));
    const flaps = siblingsOf(generate(templateById('carton')!, C16, { ...defaults(templateById('carton')!), top: 'rsc', bottom: 'rsc' })).map((s) => s.v.id);
    expect(flaps).toEqual(expect.arrayContaining(['rsc', 'sealed']));
    expect(siblingsOf(styled('gable'))).toEqual([]);
    // a design with no template has none
    const free = styled('rte');
    delete free.template;
    expect(siblingsOf(free)).toEqual([]);
  });
});
