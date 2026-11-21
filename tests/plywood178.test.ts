// Milestone 178 (BOXES_PLYWOOD_PLAN.md §3.2): the rest of the boxes.py designs that today's engine and the board kit
// can make, in plywood. Each builds clean on plywood 3 and 8 mm at its defaults, is recognised as itself, has every
// board held by tabs in slots, fingers or half-slots (none only rests), and is refused off plywood with a reason.
import { describe, expect, it } from 'vitest';
import { defaults, generate, templateById } from '../src/templates/registry';
import { profileById } from '../src/model/boards';
import { MATERIALS } from '../src/model/materials';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/notes';
import { recognise } from '../src/templates/catalogue';
import { recordOf } from '../src/templates/records';
import { styleById } from '../src/templates/styles';
import { makes, type ParamDef, type Params } from '../src/templates/types';
import type { Design } from '../src/model/types';

const P3 = profileById('ply-3')!, P8 = profileById('ply-8')!;
const problems = (d: Design) => validate(d).filter((x) => !NOTE_KEYS.has(x.key)).map((x) => x.key);
/** The boards with no joint but a stop (`slide`): each should be held by tabs, fingers or half-slots at least once. */
const onlyResting = (d: Design) =>
  d.order.filter((id) => {
    const cs = Object.values(d.connections).filter((c) => c.a.panelId === id || c.b.panelId === id);
    return cs.length > 0 && cs.every((c) => c.kind === 'slide');
  });
const words = (st: string): Params => ({ ...styleById(st)!.words, ...(styleById(st)!.sizes ?? {}) });

/** name, structure, words, the variant it is */
const CASES: [string, string, Params, string][] = [
  ['divider tray', 'dividerTray', {}, 'dividerTray'],
  ['divider tray, 5 dividers', 'dividerTray', { dividers: 5 }, 'dividerTray'],
  ['scoop organiser', 'scoopOrganiser', {}, 'scoopOrganiser'],
  ['scoop organiser, 2 spaces', 'scoopOrganiser', { spaces: 2 }, 'scoopOrganiser'],
  ['scoop tray, both ends', 'scoopTray', words('scoopBoth'), 'scoopBoth'],
  ['compartment box', 'slideBox', words('compartmentBox'), 'compartmentBox'],
  ['compartment box, 5 spaces', 'slideBox', { parts: 5 }, 'compartmentBox'],
  ['uneven file', 'magazineFile', words('unevenFile'), 'unevenFile'],
];

/** The new structures (cards of their own), and the new words on existing ones: [structure, key, value off plywood]. */
const NEW_CARDS = ['dividerTray', 'scoopOrganiser'];
const NEW_WORDS: [string, string, string | number][] = [
  ['scoopTray', 'scoops', 'both'],
  ['slideBox', 'parts', 3],
  ['magazineFile', 'uneven', 'uneven'],
];

describe('the rest of §3.2 in plywood (milestone 178)', () => {
  it('each builds clean on plywood 3 and 8 mm, is recognised as itself, and no board only rests', () => {
    for (const m of [P3, P8])
      for (const [name, id, w, v] of CASES) {
        const t = templateById(id)!;
        const d = generate(t, m, { ...defaults(t), ...w });
        expect(problems(d), `${name} ${m.id}`).toEqual([]);
        expect(recognise(d)?.v.id, `${name} ${m.id}`).toBe(v);
        expect(onlyResting(d), `${name} ${m.id}`).toEqual([]);
      }
  }, 240_000);

  it('the new cards are plywood only; the new words are refused off plywood with a reason', () => {
    for (const m of MATERIALS.filter((x) => x.kind !== 'plywood')) {
      for (const id of NEW_CARDS) expect(makes(templateById(id)!, m), `${id} ${m.id}`).toBe(false);
      for (const [id, key, on] of NEW_WORDS) {
        const t = templateById(id)!;
        if (!makes(t, m)) continue;
        const def = t.params.find((x) => x.key === key) as ParamDef;
        expect(def.allowed!(on, defaults(t), m), `${id}.${key} ${m.id}`).toBe(false);
        expect(def.why!(on, defaults(t), m), `${id}.${key} ${m.id}`).toBe('sen.why.plyOnly');
      }
    }
  }, 60_000);

  it('a design saved before 178 builds as it did (no scoops, parts or uneven word)', () => {
    for (const [id, key] of NEW_WORDS) {
      const t = templateById(id)!;
      const { [key]: _x, ...old } = defaults(t);
      const a = generate(t, P3, old), b = generate(t, P3, defaults(t));
      // (a shape's id is new each build)
      const same = (x: Design) => JSON.stringify(x.panels).replace(/"id":"x_\w+"/g, '');
      expect(same(a), id).toBe(same(b));
      expect(JSON.stringify(a.connections), id).toBe(JSON.stringify(b.connections));
    }
  }, 60_000);

  it('a loose divider crosses the front and back walls in half-slots and does not touch the base', () => {
    const t = templateById('dividerTray')!;
    const d = generate(t, P3, defaults(t));
    for (const id of ['t:divider-1', 't:divider-2']) {
      const cs = Object.values(d.connections).filter((c) => c.a.panelId === id || c.b.panelId === id);
      expect(cs.map((c) => c.kind), id).toEqual(['halflap', 'halflap']);
      expect(cs.some((c) => c.a.panelId === 't:base' || c.b.panelId === 't:base'), id).toBe(false);
    }
  });

  it('two-sided scoops face each other; the uneven file slopes on all four walls', () => {
    const s = generate(templateById('scoopTray')!, P3, { ...defaults(templateById('scoopTray')!), scoops: 'both' });
    expect(recordOf(s).bothEnds).toBe(true);
    expect(recordOf(generate(templateById('scoopTray')!, P3, defaults(templateById('scoopTray')!))).bothEnds).toBeUndefined();
    const u = generate(templateById('magazineFile')!, P3, { ...defaults(templateById('magazineFile')!), uneven: 'uneven' });
    const sloped = ['t:wall-e0', 't:wall-e1', 't:wall-e2', 't:wall-e3'].filter((id) => {
      const sk = u.panels[id].sketch;
      return sk.kind === 'wall' && Object.values(sk.corners ?? {}).some((c) => c.dy < -5);
    });
    expect(sloped).toHaveLength(4);
  });
});
