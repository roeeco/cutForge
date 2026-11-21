// Milestone 172 (BOXES_PLYWOOD_PLAN.md §2): the owner's shelf picks. The shelf's *Rack* (boxes.py's StorageRack),
// the slanted shelf's words (DisplayShelf), the *Bin rack* (BinTray) and the *Wall rack* (WallRack): each builds clean on
// plywood 3 and 8 mm, is recognised as itself, and every board is held by tabs in slots (none only rests).
import { describe, expect, it } from 'vitest';
import { defaults, generate, templateById } from '../src/templates/registry';
import { profileById } from '../src/model/boards';
import { MATERIALS } from '../src/model/materials';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/notes';
import { recognise } from '../src/templates/catalogue';
import { styleById } from '../src/templates/styles';
import { makes, type ParamDef, type Params } from '../src/templates/types';
import type { Design } from '../src/model/types';

const P3 = profileById('ply-3')!, P8 = profileById('ply-8')!;
const problems = (d: Design) => validate(d).filter((x) => !NOTE_KEYS.has(x.key)).map((x) => x.key);
/** The boards with no joint but a stop (`slide`): each should be held by tabs in slots at least once. */
const onlyResting = (d: Design) =>
  d.order.filter((id) => {
    const cs = Object.values(d.connections).filter((c) => c.a.panelId === id || c.b.panelId === id);
    return cs.length > 0 && cs.every((c) => c.kind === 'slide');
  });

const CASES: [string, string, Params, string][] = [
  ['rack', 'shelf', { ...styleById('rack')!.words, ...styleById('rack')!.sizes }, 'rack'],
  ['slanted, every word', 'slantedShelf', { lip: 20, spaces: 3, back: 'back', slope: 'sloped', tilt: 30 }, 'slantedShelf'],
  ['bin rack', 'binRack', {}, 'binRack'],
  ['bin rack, 1 across, 4 rows, half', 'binRack', { columns: 1, rows: 4, front: 0.5 }, 'binRack'],
  ['wall rack', 'wallRack', {}, 'wallRack'],
  ['wall rack, one shelf', 'wallRack', { shelves: 1 }, 'wallRack'],
];

describe('the owner’s shelf picks (milestone 172)', () => {
  it('each builds clean on plywood 3 and 8 mm, is recognised as itself, and no board only rests', () => {
    for (const m of [P3, P8])
      for (const [name, id, w, v] of CASES) {
        const t = templateById(id)!;
        const d = generate(t, m, { ...defaults(t), ...w });
        expect(problems(d), `${name} ${m.id}`).toEqual([]);
        expect(recognise(d)?.v.id, `${name} ${m.id}`).toBe(v);
        expect(onlyResting(d), `${name} ${m.id}`).toEqual([]);
      }
  }, 180_000);

  it('the rack has full boards at the bottom and top and a pair of rails at each level between', () => {
    const t = templateById('shelf')!;
    const d = generate(t, P3, { ...defaults(t), rails: 'rails', shelves: 4 });
    expect(d.order.filter((id) => /^t:shelf-/.test(id))).toEqual(['t:shelf-1', 't:shelf-4']);
    expect(d.order.filter((id) => /^t:rail-/.test(id))).toHaveLength(4);
  });

  it('the bin rack and the wall rack hang by two keyholes in their backs', () => {
    for (const id of ['binRack', 'wallRack']) {
      const t = templateById(id)!;
      const d = generate(t, P3, defaults(t));
      expect(d.panels['t:back'].details.filter((x) => x.mount === 'keyhole'), id).toHaveLength(2);
    }
  });

  it('the bin rack leans a board out at 45° at the foot of each row', () => {
    const t = templateById('binRack')!;
    const d = generate(t, P3, { ...defaults(t), rows: 3 });
    const slopes = d.order.filter((id) => /^t:slope-/.test(id)).map((id) => d.panels[id].frame.v);
    expect(slopes).toHaveLength(3);
    for (const v of slopes) expect(v[1]).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('the new cards are plywood only; the new words are refused on other boards with a reason', () => {
    for (const m of MATERIALS.filter((x) => x.kind !== 'plywood')) {
      for (const id of ['binRack', 'wallRack']) expect(makes(templateById(id)!, m), `${id} ${m.id}`).toBe(false);
      const sh = templateById('slantedShelf')!;
      for (const key of ['lip', 'spaces', 'back', 'slope']) {
        const def = sh.params.find((x) => x.key === key) as ParamDef;
        const on = def.type === 'choice' ? def.options[1].value : 1;
        expect(def.allowed!(on, defaults(sh), m), `${key} ${m.id}`).toBe(false);
        expect(def.why!(on, defaults(sh), m), `${key} ${m.id}`).toBe('sen.why.plyOnly');
      }
      const rails = templateById('shelf')!.params.find((x) => x.key === 'rails') as ParamDef;
      expect(rails.allowed!('rails', { ...defaults(templateById('shelf')!), shelves: 4 }, m), m.id).toBe(false);
    }
  }, 60_000);

  it('a slanted shelf or shelf saved before 172 builds as it did (no lip, spaces, back, rails)', () => {
    const sh = templateById('slantedShelf')!;
    const { lip: _l, spaces: _s, back: _b, slope: _o, ...old } = defaults(sh);
    const d = generate(sh, P3, old);
    expect(d.order.some((id) => /lip|divider|back/.test(id))).toBe(false);
    const s = templateById('shelf')!;
    const { rails: _r, rail: _w, ...olds } = defaults(s);
    expect(generate(s, P3, olds).order.some((id) => /rail/.test(id))).toBe(false);
  });
});
