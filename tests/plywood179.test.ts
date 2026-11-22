// Milestone 179 (BOXES_PLYWOOD_PLAN.md §3.3): things that hang on a wall, in plywood. Every wall card hangs by screws
// (keyholes) or on a cleat (a stepped hook glued on its back that drops behind a matching strip screwed to the wall).
// Each builds clean on plywood 3 and 8 mm at its defaults, is recognised as itself, has every board held by tabs in
// slots, fingers or a glued face (none only rests), and is refused off plywood with a reason.
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
/** The boards with no joint but a stop (`slide`): each should be held by tabs, fingers or a glued face at least once. */
const onlyResting = (d: Design) =>
  d.order.filter((id) => {
    const cs = Object.values(d.connections).filter((c) => c.a.panelId === id || c.b.panelId === id);
    return cs.length > 0 && cs.every((c) => c.kind === 'slide');
  });
/** Every board joined to another (a thing of one board, as a pegboard, has none to be joined to). */
const unjoined = (d: Design) => (d.order.length > 1 ? d.order.filter((b) => b !== 't:lid' && !Object.values(d.connections).some((c) => c.a.panelId === b || c.b.panelId === b)) : []);
const words = (st: string): Params => ({ ...styleById(st)!.words, ...(styleById(st)!.sizes ?? {}) });

/** The wall cards that had keyholes before 179, and the word that hangs them on a cleat: [name, structure, words, variant]. */
const CLEATED: [string, string, Params, string][] = [
  ['wall rack', 'wallRack', { hang: 'cleat' }, 'wallRack'],
  ['bin rack', 'binRack', { hang: 'cleat' }, 'binRack'],
  ['wall shelf', 'bookend', { ...words('wallShelf'), hang: 'cleat' }, 'wallShelf'],
  ['pegboard', 'pegboard', { mount: 'cleat' }, 'pegboard'],
];

/** The new cards and their variants: [name, structure, words, variant]. */
const CASES: [string, string, Params, string][] = [
  ['tool holder', 'toolHolder', {}, 'toolHolder'],
  ['tool holder, 2 wide slots', 'toolHolder', { tools: 2, size: 30 }, 'toolHolder'],
  ['tool holder, holes', 'toolHolder', words('toolHoles'), 'toolHoles'],
  ['wrench holder', 'toolHolder', words('wrenchHolder'), 'wrenchHolder'],
  ['pliers holder', 'pliersHolder', {}, 'pliersHolder'],
  ['pliers holder, one bay', 'pliersHolder', { bays: 1 }, 'pliersHolder'],
  ['hooks', 'wallHooks', {}, 'wallHooks'],
  ['one big hook', 'wallHooks', { hooks: 1, mouth: 60 }, 'wallHooks'],
  ['key board', 'wallHooks', words('keyBoard'), 'keyBoard'],
  ['pin row', 'pinRow', {}, 'pinRow'],
  ['pin row, 30°, 2 pins', 'pinRow', { angle: 30, pins: 2 }, 'pinRow'],
  ['roll holder', 'rollHolder', {}, 'rollHolder'],
  ['hopper', 'hopper', {}, 'hopper'],
  ['wall steps', 'wallSteps', {}, 'wallSteps'],
  ['wall steps, 2 with no holes', 'wallSteps', { steps: 2, hole: 0 }, 'wallSteps'],
  ['drill stand', 'drillStand', {}, 'drillStand'],
  ['drill stand, 2 rows of 1', 'drillStand', { rows: 2, columns: 1 }, 'drillStand'],
  ['wall drill box', 'drillStand', words('wallDrillBox'), 'wallDrillBox'],
];
const NEW_CARDS = ['toolHolder', 'pliersHolder', 'wallHooks', 'pinRow', 'rollHolder', 'hopper', 'wallSteps', 'drillStand'];

const check = (name: string, id: string, w: Params, v: string, ms = [P3, P8]) => {
  for (const m of ms) {
    const t = templateById(id)!;
    const d = generate(t, m, { ...defaults(t), ...w });
    expect(problems(d), `${name} ${m.id}`).toEqual([]);
    expect(recognise(d)?.v.id, `${name} ${m.id}`).toBe(v);
    expect(onlyResting(d), `${name} ${m.id}`).toEqual([]);
    expect(unjoined(d), `${name} ${m.id}`).toEqual([]);
  }
};

describe('the wall cards (milestone 179)', () => {
  it('each builds clean on plywood 3 and 8 mm, is recognised as itself, and no board only rests', () => {
    for (const [name, id, w, v] of CASES) check(name, id, w, v);
  }, 240_000);

  it('each hangs on a cleat as well, and is still itself', () => {
    for (const [name, id, w, v] of CASES) {
      if (id === 'drillStand' && v === 'drillStand') continue;
      for (const m of [P3, P8]) {
        const t = templateById(id)!, def = t.params.find((x) => x.key === 'hang') as ParamDef;
        const p = { ...defaults(t), ...w };
        // a back too low for a cleat at these sizes says so (a drill stand on 8 mm plywood)
        if (!def.allowed!('cleat', p, m)) {
          expect(def.why!('cleat', p, m), `${name} ${m.id}`).toBe('sen.why.cleatRoom');
          continue;
        }
        check(`${name} on a cleat`, id, { ...w, hang: 'cleat' }, v === 'drillStand' ? 'wallDrillBox' : v, [m]);
      }
    }
  }, 240_000);

  it('the new cards are plywood only', () => {
    for (const m of MATERIALS.filter((x) => x.kind !== 'plywood')) for (const id of NEW_CARDS) expect(makes(templateById(id)!, m), `${id} ${m.id}`).toBe(false);
  });
});

describe('hang by screws or on a cleat (milestone 179)', () => {
  it('each wall card hangs on a cleat clean on plywood 3 and 8 mm, and is still itself', () => {
    for (const [name, id, w, v] of CLEATED) check(name, id, w, v);
  }, 240_000);

  it('a cleat is two steps glued face to face on the back, the same two on the wall, and a stand-off at the foot', () => {
    const t = templateById('wallRack')!;
    const d = generate(t, P3, { ...defaults(t), hang: 'cleat' });
    const item = d.order.filter((id) => d.panels[id].cleat === 'item'), wall = d.order.filter((id) => d.panels[id].cleat === 'wall');
    expect(item).toEqual(['t:cleat-1', 't:cleat-2', 't:stud-1', 't:stud-2']);
    expect(wall).toEqual(['t:wall-cleat-1', 't:wall-cleat-2']);
    const glued = (a: string, b: string) => Object.values(d.connections).some((c) => c.kind === 'laminate' && [c.a.panelId, c.b.panelId].sort().join() === [a, b].sort().join());
    expect(glued('t:cleat-1', 't:back') && glued('t:cleat-2', 't:cleat-1') && glued('t:stud-1', 't:back') && glued('t:stud-2', 't:stud-1') && glued('t:wall-cleat-1', 't:wall-cleat-2')).toBe(true);
    // the wall cleat is not joined to the thing: it is screwed to the wall, and the hook drops behind its front layer
    expect(Object.values(d.connections).some((c) => wall.includes(c.a.panelId) !== wall.includes(c.b.panelId))).toBe(false);
    expect(d.panels['t:wall-cleat-1'].details.filter((x) => x.shape === 'circle')).toHaveLength(2);
    expect(d.panels['t:back'].details.some((x) => x.mount === 'keyhole')).toBe(false);
    const r = recordOf(d);
    expect(r.hang).toBe(true);
    expect(r.cleat).toBe(true);
    // the hook layer is as wide as the wall cleat's and reaches lower than the spacer by the step
    const P = (id: string) => d.panels[id];
    expect(P('t:cleat-2').h - P('t:cleat-1').h).toBeCloseTo(P('t:wall-cleat-1').h - P('t:wall-cleat-2').h, 6);
  });

  it('a wall card saved before 179 (no hang word) builds as it did', () => {
    for (const id of ['wallRack', 'binRack']) {
      const t = templateById(id)!;
      const { hang: _h, ...old } = defaults(t);
      const a = generate(t, P3, old), b = generate(t, P3, defaults(t));
      const same = (x: Design) => JSON.stringify(x.panels).replace(/"id":"x_\w+"/g, '');
      expect(same(a), id).toBe(same(b));
      expect(JSON.stringify(a.connections), id).toBe(JSON.stringify(b.connections));
      expect(b.order.some((x) => b.panels[x].cleat), id).toBe(false);
    }
  });

  it('a cleat is refused off plywood with a reason', () => {
    for (const m of MATERIALS.filter((x) => x.kind !== 'plywood')) {
      const t = templateById('bookend')!;
      if (!makes(t, m)) continue;
      const def = t.params.find((x) => x.key === 'hang') as ParamDef;
      expect(def.allowed!('cleat', defaults(t), m), m.id).toBe(false);
      expect(def.why!('cleat', defaults(t), m), m.id).toBe('sen.why.plyOnly');
    }
  });
});
