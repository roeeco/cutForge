// Milestone 96 (SENTENCE_BUILDER_PLAN.md S3): the carton and the sleeve.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/model/materials';
import { chooseMaterial, chooseStructure } from '../src/sentence/resolve';
import { defaults, generate, STRUCTURES, templateById } from '../src/templates/registry';
import { makes } from '../src/templates/types';
import { prepareExport } from '../src/export/prepare';
import { walk, type WalkFail } from './sentence.walk';

const [CARD, CORR16, CORR4, PLY] = MATERIALS;
const carton = templateById('carton')!, sleeve = templateById('sleeve')!, box = templateById('box')!;
const WALKS = Number(process.env.SENTENCE_WALKS ?? 3), STEPS = Number(process.env.SENTENCE_STEPS ?? 8);

describe('every carton and sleeve the lists allow builds clean', () => {
  it.each([
    ['carton', CARD], ['carton', CORR16], ['sleeve', CARD], ['sleeve', CORR16], ['sleeve', CORR4],
  ] as const)('%s on %s', (id, m) => {
    const def = templateById(id)!;
    const fails: WalkFail[] = [];
    for (let s = 1; s <= WALKS; s++) fails.push(...walk(def, m, s * 104729 + m.thickness * 100, STEPS));
    expect(fails.map((f) => `${f.why} (seed ${f.seed} step ${f.step}) ${JSON.stringify(f.params)}`)).toEqual([]);
  }, 300_000);
});

describe('structures and materials', () => {
  it('plywood lists neither a carton nor a sleeve; thick corrugated no carton', () => {
    expect(STRUCTURES().filter((t) => makes(t, PLY)).map((t) => t.id)).not.toEqual(expect.arrayContaining(['carton']));
    expect(STRUCTURES().filter((t) => makes(t, PLY)).map((t) => t.id)).not.toContain('sleeve');
    expect(makes(carton, CORR4)).toBe(false);
    expect(makes(sleeve, CORR4)).toBe(true);
  });

  it('box → carton → box keeps the sizes and the window', () => {
    const p0 = { ...defaults(box), width: 90, depth: 60, height: 70, window: 'circle' };
    const c = chooseStructure(carton, CARD, p0).params;
    expect([c.width, c.depth, c.height, c.window]).toEqual([90, 60, 70, 'circle']);
    const b = chooseStructure(box, CARD, c).params;
    expect([b.width, b.depth, b.height, b.window]).toEqual([90, 60, 70, 'circle']);
  });

  it('a carton chosen on card becomes a box with a lid that lifts off on plywood', () => {
    const r = chooseMaterial(carton, PLY, { ...defaults(carton), width: 90 }, (id) => templateById(id));
    expect(r.def.id).toBe('box');
    expect(r.params.lid).toBe('liftoff');
    expect(r.params.width).toBe(90);
    expect(r.changes[0]).toMatchObject({ key: 'structure', from: 'carton', to: 'box', why: 'sen.why.structure' });
  });

  it('a thumb notch and no dust flaps change what is cut', () => {
    const cut = (p: Record<string, string | number>) => JSON.stringify(prepareExport(generate(carton, CARD, { ...defaults(carton), ...p }), 'nominal'));
    const plain = cut({});
    expect(cut({ thumb: 'notch' })).not.toBe(plain);
    expect(cut({ dust: 'without' })).not.toBe(plain);
  });

  it('the inside is the size asked for', () => {
    const d = generate(carton, CARD, defaults(carton));
    expect(d.sizeAs).toBe('inside');
  });
});
