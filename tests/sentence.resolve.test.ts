// Milestone 94 (SENTENCE_BUILDER_PLAN.md S1): the contract and the resolver.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/model/materials';
import { choose, chooseMaterial, chooseStructure, largestOk, resolve, type Change } from '../src/sentence/resolve';
import { defaults, templateById } from '../src/templates/registry';
import type { Params, TemplateDef } from '../src/templates/types';

const [CARD, , , PLY] = MATERIALS;
// a made-up structure that exercises every rule: kind → size → lid (only on wide things) → colour (not on plywood)
const toy: TemplateDef = {
  id: 'toy', version: 1, name: 'tpl.organiser', description: 'tpl.organiser.desc', materials: ['card', 'corrugated', 'plywood'],
  params: [
    { key: 'kind', label: 'tpl.lid', type: 'choice', options: [{ value: 'tall', label: 'tpl.lid' }, { value: 'flat', label: 'tpl.lid' }], default: 'tall' },
    { key: 'width', label: 'tpl.width', type: 'number', unit: 'mm', min: 10, max: 300, default: 100 },
    { key: 'lid', label: 'tpl.lid', type: 'choice', options: [{ value: 'none', label: 'tpl.lid' }, { value: 'big', label: 'tpl.lid' }], default: 'big', allowed: (v, p) => v === 'none' || Number(p.width) >= 80, why: () => 'sen.why.spaceSmall', addon: { off: 'none' } },
    { key: 'count', label: 'tpl.slots', type: 'int', min: 1, max: 10, default: 4 },
    { key: 'colour', label: 'tpl.lid', type: 'choice', options: [{ value: 'red', label: 'tpl.lid' }, { value: 'blue', label: 'tpl.lid' }], default: 'red', allowed: (v, _p, m) => m.kind !== 'plywood' || v === 'blue' },
  ],
  limits: (_m, p) => ({ count: { max: Math.floor(Number(p.width) / 20), why: 'sen.why.spaceSmall' }, width: { max: p.kind === 'flat' ? 120 : 300 } }),
  generate: () => undefined,
};
const start: Params = { kind: 'tall', width: 100, lid: 'big', count: 4, colour: 'red' };
const ok = (r: ReturnType<typeof choose>) => {
  if ('refused' in r) throw new Error('refused');
  return r;
};

describe('the resolver', () => {
  it('a change re-checks only the words after it', () => {
    // narrowing the width drops the lid (later) and lowers the count (later); the kind (earlier) is untouched
    const r = ok(choose(toy, CARD, start, 'width', 60));
    expect(r.params.kind).toBe('tall');
    expect(r.params.lid).toBe('none');
    expect(r.params.count).toBe(3);
    expect(r.changes.map((c) => c.key)).toEqual(['lid', 'count']);
  });

  it('a changed earlier word re-checks the numbers after it, and says so once', () => {
    const r = ok(choose(toy, CARD, { ...start, width: 200, count: 9 }, 'kind', 'flat'));
    expect(r.params.width).toBe(120);
    expect(r.params.count).toBe(6);
    const byKey = (k: string) => r.changes.filter((c: Change) => c.key === k);
    expect(byKey('width')).toHaveLength(1);
    expect(byKey('count')).toHaveLength(1);
  });

  it('a later word no longer allowed takes its fallback, with a reason', () => {
    const r = ok(choose(toy, CARD, start, 'width', 50));
    const c = r.changes.find((x) => x.key === 'lid')!;
    expect(c).toEqual({ key: 'lid', from: 'big', to: 'none', why: 'sen.why.spaceSmall' });
  });

  it('a typed number past its limit is refused with its range', () => {
    const r = choose(toy, CARD, start, 'count', 7);
    expect(r).toEqual({ refused: { min: 1, max: 5, why: 'sen.why.spaceSmall' } });
    expect(choose(toy, CARD, start, 'width', 5)).toHaveProperty('refused');
  });

  it('choosing the current value changes nothing, and resolve agrees', () => {
    const r = ok(choose(toy, CARD, start, 'width', 100));
    expect(r.changes).toEqual([]);
    expect(resolve(toy, CARD, r.params)).toEqual(resolve(toy, CARD, start));
  });

  it('lists hold only what is allowed; a choice not offered changes nothing', () => {
    const ws = resolve(toy, PLY, start);
    expect(ws.find((w) => w.key === 'colour')!.options).toEqual(['blue']);
    expect(ok(choose(toy, PLY, start, 'colour', 'red')).params).toBe(start);
  });

  it('a material change re-checks every word', () => {
    const r = chooseMaterial(toy, PLY, start, () => undefined);
    expect(r.params.colour).toBe('blue');
    expect(r.changes.map((c) => c.key)).toEqual(['colour']);
  });

  it('a structure the material cannot make becomes its fallback, keeping shared words', () => {
    const cardOnly: TemplateDef = { ...toy, id: 'cardOnly', canMake: (m) => m.kind === 'card', fallback: () => 'toy' };
    const r = chooseMaterial(cardOnly, PLY, { ...start, width: 90 }, (id) => (id === 'toy' ? toy : undefined));
    expect(r.def.id).toBe('toy');
    expect(r.params.width).toBe(90);
    expect(r.changes[0]).toMatchObject({ key: 'structure', from: 'cardOnly', to: 'toy' });
    expect(chooseStructure(toy, CARD, { width: 70, other: 3 }).params).toEqual({ kind: 'tall', width: 70, lid: 'none', count: 3, colour: 'red' });
  });

  it('bisection finds the largest value that works, within its step, and caches it', () => {
    let builds = 0;
    const v = largestOk('t1', 10, 300, (x) => (builds++, x <= 173), 8, 1);
    expect(v).toBeLessThanOrEqual(173);
    expect(v).toBeGreaterThan(173 - 290 / 2 ** 6 - 1); // six halvings of the range, then down to the step
    expect(builds).toBeLessThanOrEqual(8);
    expect(largestOk('t1', 10, 300, () => false)).toBe(v);
  });
});

describe('the two templates on the contract', () => {
  const org = templateById('organiser')!, stand = templateById('stand')!;
  it('the organiser: fewer dividers fit a narrower box', () => {
    const p = defaults(org);
    const r = ok(choose(org, PLY, { ...p, dividersX: 8 }, 'width', 60));
    expect(Number(r.params.dividersX)).toBeLessThan(8);
    expect(r.changes.some((c) => c.key === 'dividersX')).toBe(true);
    const range = resolve(org, PLY, r.params).find((w) => w.key === 'dividersX')!;
    expect(range.max).toBe(r.params.dividersX);
  });
  it('the stand: as many slots as the base holds', () => {
    const p = defaults(stand);
    const max = resolve(stand, PLY, p).find((w) => w.key === 'slots')!.max!;
    expect(max).toBeGreaterThanOrEqual(Number(p.slots));
    expect(choose(stand, PLY, p, 'slots', max + 1)).toHaveProperty('refused');
  });
});
