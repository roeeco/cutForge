// Milestone 97 (SENTENCE_BUILDER_PLAN.md S4): the sentence's text and its line of values.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/model/materials';
import { addable, clausesOf, parts, readout } from '../src/sentence/model';
import { defaults, STRUCTURES, templateById } from '../src/templates/registry';
import { translate } from '../src/i18n';

const PLY = MATERIALS[3];
const box = templateById('box')!;

describe('the sentence as text', () => {
  it('splits a sentence at its slots, in each language', () => {
    for (const lang of ['en', 'he'] as const)
      for (const def of STRUCTURES()) {
        const ps = parts(translate(lang, def.sentence!.main));
        const slots = ps.flatMap((x) => ('slot' in x ? [x.slot] : []));
        expect(slots[0] === 'structure' || slots.includes('structure'), `${def.id} ${lang}`).toBe(true);
        for (const s of slots) expect(s === 'structure' || def.params.some((p) => p.key === s), `${def.id} ${lang} ${s}`).toBe(true);
      }
  });

  it('clauses follow the words: a polygon has its sides, an add-on on has its clause, off is in + more', () => {
    const p = { ...defaults(box), shape: 'poly', lid: 'liftoff' };
    expect(clausesOf(box, PLY, p).map((c) => c.key)).toEqual(['sides', 'lid']);
    expect(addable(box, PLY, p).map((d) => d.key)).toEqual(['spacesBy', 'window', 'finger', 'handles']); // milestone 153: a box has handles too
    expect(clausesOf(box, PLY, { ...p, spacesBy: 'size' }).find((c) => c.key === 'spacesBy')!.text).toBe('sen.add.spaces.size');
  });
});

describe('the line under the sentence', () => {
  it('is measured: each space, the outside, the pieces and the sheet', () => {
    const r = readout(box, PLY, { ...defaults(box), spacesBy: 'count', nx: 3, ny: 2 });
    const keys = r.lines.map((l) => l.key);
    expect(keys).toEqual(['sen.out.space', 'sen.out.outside', 'sen.out.pieces', 'sen.out.sheet']);
    const space = r.lines[0].vars;
    expect(Number(space.w)).toBeCloseTo((160 - 2 * 3) / 3, 0);
    expect(r.lines[1].vars).toEqual({ w: 166, d: 116, h: 48 });
    expect(r.problem).toBeNull();
  });
  it('in size mode it says how many spaces the wanted size makes', () => {
    const r = readout(box, PLY, { ...defaults(box), spacesBy: 'size', sx: 50, sy: 50 });
    expect(r.lines[0].key).toBe('sen.out.spaces');
    expect(Number(r.lines[0].vars.w)).toBeGreaterThanOrEqual(50);
  });
});
