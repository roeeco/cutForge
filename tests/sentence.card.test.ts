// Milestone 99 (SENTENCE_BUILDER_PLAN.md S6): the preset card after Start follows the sentence's rules.
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { MATERIALS } from '../src/model/materials';
import { choose } from '../src/sentence/resolve';
import { changeMaterial, defaults, generate, regenerate, templateById } from '../src/templates/registry';
import { setDividerOffset } from '../src/model/ops';
import { dividerRow } from '../src/model/dividers';
import type { Design } from '../src/model/types';
import type { Params } from '../src/templates/types';

const [CARD, , , PLY] = MATERIALS;
const box = templateById('box')!;
/** What the card does with a change: the sentence's checks, then the design regenerated. */
function onCard(d: Design, key: string, v: number | string) {
  const c = choose(templateById(d.template!.id)!, d.material, d.template!.params, key, v);
  if ('refused' in c) return { refused: c.refused };
  return { design: regenerate(d, c.params).design, changes: c.changes };
}

describe('the preset card after Start', () => {
  it('a change that drops a later choice says so', () => {
    const d = generate(box, PLY, { ...defaults(box), spacesBy: 'count', nx: 12, ny: 1 } as Params);
    const r = onCard(d, 'width', 60);
    if (!('design' in r)) throw new Error('refused');
    expect(r.changes.find((c) => c.key === 'nx')).toBeTruthy();
    expect(Number(r.design!.template!.params.nx)).toBeLessThan(12);
  });

  it('a number past its end is refused with its range, and the design is untouched', () => {
    const d = generate(box, PLY, { ...defaults(box), spacesBy: 'count' } as Params);
    const r = onCard(d, 'nx', 99);
    expect(r).toHaveProperty('refused');
  });

  it('a name engraved after Start survives a size change', () => {
    const d = generate(box, PLY, defaults(box));
    const named = produce(d, (x) => void x.panels['t:wall-e0'].details.push({ id: 'name', shape: 'text', op: 'engrave', cx: 40, cy: 20, w: 30, h: 8, text: { value: 'Noa', font: 'rubik', size: 8 } }));
    const r = onCard(named, 'width', 180);
    if (!('design' in r)) throw new Error('refused');
    expect(r.design!.panels['t:wall-e0'].details.map((x) => x.id)).toContain('name');
  });

  it('a moved divider survives a size change', () => {
    const d = generate(box, PLY, { ...defaults(box), spacesBy: 'count', nx: 3, ny: 1 } as Params);
    const at = (x: Design) => dividerRow(x, 't:div-1')!.pos;
    const moved = produce(d, (x) => void setDividerOffset(x, 't:div-1', at(d) + 8));
    const r = onCard(moved, 'height', 50);
    if (!('design' in r)) throw new Error('refused');
    expect(at(r.design!)).toBeCloseTo(at(moved), 6);
  });

  it('a carton changed to plywood in the drawer becomes a box with a lid that lifts off, keeping its sizes', () => {
    const d = generate(templateById('carton')!, CARD, { ...defaults(templateById('carton')!), width: 90 } as Params);
    const r = changeMaterial(d, PLY).design;
    expect(r.template!.id).toBe('box');
    expect(r.template!.params.lid).toBe('liftoff');
    expect(r.template!.params.width).toBe(90);
    expect(r.material.id).toBe(PLY.id);
  });
});
