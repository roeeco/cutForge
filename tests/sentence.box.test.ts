// Milestone 95 (SENTENCE_BUILDER_PLAN.md S2): the box, the tray and spaces.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/model/materials';
import { choose, resolve } from '../src/sentence/resolve';
import { defaults, generate, templateById } from '../src/templates/registry';
import { compartments } from '../src/easy/objects';
import { mainTray, spaceSize } from '../src/templates/structures/box';
import { boxSize } from '../src/model/boxSize';
import { setMaterial } from '../src/model/ops';
import { produce } from 'immer';
import { walk, type WalkFail } from './sentence.walk';

const box = templateById('box')!, tray = templateById('tray')!;
// a few walks in the ordinary suite; SENTENCE_WALKS and SENTENCE_STEPS run more (S7 runs 2000 steps)
const WALKS = Number(process.env.SENTENCE_WALKS ?? 3), STEPS = Number(process.env.SENTENCE_STEPS ?? 8);
const ok = (r: ReturnType<typeof choose>) => {
  if ('refused' in r) throw new Error('refused ' + JSON.stringify(r.refused));
  return r;
};

describe.each(MATERIALS.map((m) => [m.id, m] as const))('every sentence the lists allow builds clean: %s', (_id, m) => {
  it.each([['box'], ['tray']])('%s', (id) => {
    const def = templateById(id)!;
    const fails: WalkFail[] = [];
    for (let s = 1; s <= WALKS; s++) fails.push(...walk(def, m, s * 7919 + m.thickness * 1000, STEPS));
    expect(fails.map((f) => `${f.why} (seed ${f.seed} step ${f.step}) ${JSON.stringify(f.params)}`)).toEqual([]);
  }, 300_000);
});

describe.each(MATERIALS.map((m) => [m.id, m] as const))('every card stand the lists allow builds clean: %s', (_id, m) => {
  it('stand', () => {
    const def = templateById('stand')!;
    const fails: WalkFail[] = [];
    for (let s = 1; s <= WALKS; s++) fails.push(...walk(def, m, s * 6151 + m.thickness * 100, STEPS));
    expect(fails.map((f) => `${f.why} (seed ${f.seed} step ${f.step}) ${JSON.stringify(f.params)}`)).toEqual([]);
  }, 300_000);
});

describe('spaces', () => {
  const m = MATERIALS[3];
  const base = (d: ReturnType<typeof generate>) => d.trays[mainTray(d)!].baseId;

  it('count mode: the measured spaces are the formula’s, to 0.1 mm', () => {
    const p = { ...defaults(box), spacesBy: 'count', nx: 3, ny: 2 };
    const d = generate(box, m, p);
    const tr = mainTray(d)!;
    const ins = boxSize(d, tr, 'inside')!;
    const cs = compartments(d, base(d));
    expect(cs).toHaveLength(6);
    for (const c of cs) {
      expect(c.x1 - c.x0).toBeCloseTo(spaceSize(ins.w, m.thickness, 3), 1);
      expect(c.y1 - c.y0).toBeCloseTo(spaceSize(ins.d, m.thickness, 2), 1);
    }
  });

  it('size mode: spaces at least as big as asked, as many as fit', () => {
    const p = { ...defaults(box), spacesBy: 'size', sx: 50, sy: 50 };
    const d = generate(box, m, p);
    const cs = compartments(d, base(d));
    expect(cs.length).toBeGreaterThan(1);
    for (const c of cs) {
      expect(c.x1 - c.x0).toBeGreaterThanOrEqual(50 - 0.05);
      expect(c.y1 - c.y0).toBeGreaterThanOrEqual(50 - 0.05);
    }
  });

  it('shrinking the box lowers a count it can no longer hold, with a note', () => {
    const p = { ...defaults(box), spacesBy: 'count', nx: 12, ny: 2 };
    const r = ok(choose(box, m, p, 'width', 50));
    expect(Number(r.params.nx)).toBeLessThan(12);
    expect(r.changes.find((c) => c.key === 'nx')?.why).toBe('sen.why.spaceSmall');
  });

  it('round and many-sided boxes offer a count only', () => {
    const ws = resolve(box, m, { ...defaults(box), shape: 'poly' });
    expect(ws.find((w) => w.key === 'spacesBy')!.options).toEqual(['none', 'count']);
  });
});

describe('the box', () => {
  it('inside sizes survive a change of material', () => {
    const d = generate(box, MATERIALS[0], defaults(box));
    const tr = mainTray(d)!;
    const before = boxSize(d, tr, 'inside')!;
    expect(before.w).toBeCloseTo(160, 6);
    const after = produce(d, (x) => void setMaterial(x, MATERIALS[2]));
    const s = boxSize(after, tr, 'inside')!;
    expect(s.w).toBeCloseTo(160, 6);
    expect(s.d).toBeCloseTo(110, 6);
  });

  it('plywood offers no crease to crease; every hidden option has a reason', () => {
    for (const m of MATERIALS)
      for (const def of [box, tray]) {
        const p = defaults(def);
        for (const w of resolve(def, m, p)) {
          const pd = def.params.find((x) => x.key === w.key)!;
          if (pd.type !== 'choice' || !w.shown) continue;
          for (const o of pd.options.map((x) => x.value).filter((v) => !w.options!.includes(v))) expect(pd.why?.(o, p, m), `${def.id}.${w.key}=${o} on ${m.id}`).toBeTruthy();
        }
      }
    expect(resolve(box, MATERIALS[3], defaults(box)).find((w) => w.key === 'sizeAs')!.options).not.toContain('crease');
  });

  it('a regenerated box keeps the boards by role, so shapes stay on them', () => {
    const d = generate(box, MATERIALS[3], { ...defaults(box), lid: 'liftoff', spacesBy: 'count', nx: 2, ny: 1 });
    expect(Object.keys(d.panels).every((id) => id.startsWith('t:'))).toBe(true);
    const again = generate(box, MATERIALS[3], { ...defaults(box), lid: 'liftoff', spacesBy: 'count', nx: 2, ny: 1, height: 50 });
    expect(Object.keys(again.panels).sort()).toEqual(Object.keys(d.panels).sort());
  });
});
