// Milestone C1 (SENTENCE_STYLES_PLAN.md): named styles are sets of the sentence's words.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/model/materials';
import { choose } from '../src/sentence/resolve';
import { defaults, generate, templateById } from '../src/templates/registry';
import { STYLES, chooseStyle, isAlias, styleById, styleListed, styleOf } from '../src/templates/styles';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/fix';
import { walk } from './sentence.walk';
import type { Params } from '../src/templates/types';
import { en } from '../src/i18n/en';

const BOX: Params = defaults(templateById('box')!);
const WALKS = Number(process.env.STYLE_WALKS ?? 1), STEPS = Number(process.env.STYLE_STEPS ?? 8);

describe('named styles (C1)', () => {
  it('every style has its words, a structure that exists, and its name, word and line in English', () => {
    for (const s of STYLES) {
      expect(templateById(s.structure), s.id).toBeTruthy();
      for (const k of Object.keys(s.words)) expect(templateById(s.structure)!.params.some((p) => p.key === k), `${s.id}.${k}`).toBe(true);
      for (const key of [`style.${s.id}`, `style.${s.id}.word`, `style.${s.id}.desc`]) expect((en as Record<string, string>)[key], key).toBeTruthy();
    }
  });

  it('choosing a style gives words that are that style, in every material that lists it', () => {
    for (const m of MATERIALS)
      for (const s of STYLES) {
        if (!styleListed(s, m, BOX, templateById)) continue;
        const r = chooseStyle(s, m, BOX, templateById)!;
        expect(styleOf(r.id, r.params)?.id, `${s.id} ${m.id}`).toBe(s.id);
      }
  }, 120_000);

  it('a word changed after a style names the style it now is, or none', () => {
    const m = MATERIALS[0];
    const r = chooseStyle(styleById('rte')!, m, BOX, templateById)!;
    const def = templateById(r.id)!;
    const a = choose(def, m, r.params, 'bottom', 'snap');
    expect('refused' in a).toBe(false);
    if ('refused' in a) return;
    expect(styleOf('carton', a.params)?.id).toBe('tuckSnap');
    const b = choose(def, m, a.params, 'bottom', 'seal');
    if ('refused' in b) throw new Error('refused');
    expect(styleOf('carton', b.params)).toBeNull();
    // the most specific wins: a six-sided box with a lift-off lid is the hexagon style, not *Tray + lid*
    expect(styleOf('box', { ...BOX, shape: 'poly', sides: 6, lid: 'liftoff' })?.id).toBe('hexLid');
    expect(styleOf('box', { ...BOX, shape: 'poly', sides: 5, lid: 'liftoff' })?.id).toBe('trayLid');
    expect(styleOf('box', { ...BOX, lid: 'none' })).toBeNull();
    // a style with no words of its own is its structure
    expect(isAlias(styleById('openSleeve')!)).toBe(true);
    expect(styleOf('sleeve', defaults(templateById('sleeve')!))?.id).toBe('openSleeve');
  }, 120_000);

  it('every listed style builds with nothing blocking, in each material that lists it', () => {
    for (const m of MATERIALS)
      for (const s of STYLES) {
        if (!styleListed(s, m, BOX, templateById)) continue;
        const r = chooseStyle(s, m, BOX, templateById)!;
        const d = generate(templateById(r.id)!, m, r.params);
        expect(validate(d).filter((i) => !NOTE_KEYS.has(i.key)).map((i) => i.key), `${s.id} ${m.id}`).toEqual([]);
      }
  }, 120_000);

  it('plywood lists no carton or sleeve; card lists every carton', () => {
    const ply = MATERIALS.find((m) => m.kind === 'plywood')!;
    const card = MATERIALS.find((m) => m.kind === 'card')!;
    const on = (m: typeof ply) => STYLES.filter((s) => styleListed(s, m, BOX, templateById)).map((s) => s.id);
    expect(on(ply).filter((id) => ['carton', 'sleeve'].includes(styleById(id)!.structure))).toEqual([]);
    expect(on(ply)).toEqual(expect.arrayContaining(['openTray', 'trayLid', 'hexLid']));
    expect(on(card)).toEqual(expect.arrayContaining(['rte', 'tuckSnap', 'sealed', 'openSleeve', 'hingedTray']));
  }, 120_000);

  it('random walks that start from each style stay clean', () => {
    const fails: string[] = [];
    // one material per style by default (the first that lists it); STYLE_WALKS and STYLE_STEPS run longer
    for (const s of STYLES) {
      const mats = MATERIALS.filter((m) => styleListed(s, m, BOX, templateById));
      for (const m of process.env.STYLE_WALKS ? mats : mats.slice(0, 1)) {
        const r = chooseStyle(s, m, BOX, templateById)!;
        for (let k = 1; k <= WALKS; k++) fails.push(...walk(templateById(r.id)!, m, k * 4099 + s.id.length * 31 + m.thickness * 10, STEPS, r.params).map((f) => `${s.id} ${m.id} ${f.why}`));
      }
    }
    expect(fails).toEqual([]);
  }, 600_000);
});
