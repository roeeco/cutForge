// Milestone 157 (PRESETS_OVERHAUL.md §7): the presets that needed engine work. A magazine file's side walls slope down
// to its low front and keep their joints; a dice tower's baffles are joined to its walls at their slant; a mailer is one
// wrap whose lid tucks in behind the front. Each cuts clean in every board it is offered in, and is recognised as its card.
import { describe, expect, it } from 'vitest';
import '../src/templates/registry';
import { MATERIALS } from '../src/model/materials';
import { defaults, generate, templateById } from '../src/templates/registry';
import { makes } from '../src/templates/types';
import { validate } from '../src/model/validate';
import { entryChoice, recognise } from '../src/templates/catalogue';
import { recordOf } from '../src/templates/records';
import { trayRing } from '../src/model/cartons';
import { autoPose, posedDisplay } from '../src/views/pose';
import * as THREE from 'three';
import { toWorld } from '../src/model/frame';

const BASE = ['card-0.5', 'corr-1.6', 'corr-4', 'ply-3'].map((id) => MATERIALS.find((m) => m.id === id)!);
const build = (id: string, m: (typeof BASE)[number], p = {}) => generate(templateById(id)!, m, { ...defaults(templateById(id)!), ...p });

describe('presets that needed engine work (milestone 157)', () => {
  for (const id of ['magazineFile', 'diceTower', 'mailer'])
    it(`${id} cuts clean wherever it is offered, and is its own card`, () => {
      let n = 0;
      for (const m of BASE) {
        if (!makes(templateById(id)!, m)) continue;
        const d = build(id, m);
        expect(Object.values(d.connections).filter((c) => c.broken).length, `${id} ${m.id}`).toBe(0);
        expect(validate(d).map((x) => x.key), `${id} ${m.id}`).toEqual([]);
        expect(recognise(d)?.card.id, `${id} ${m.id}`).toBe(id);
        n++;
      }
      expect(n).toBeGreaterThanOrEqual(id === 'mailer' ? 3 : 4);
    });

  it('a magazine file: its front is low, its side walls slope to it, its back keeps its height', () => {
    for (const m of BASE) {
      const d = build('magazineFile', m, { height: 240, front: 80 });
      const t = Object.values(d.trays!)[0];
      const w = Object.fromEntries(trayRing(d, t).map((r) => [r.edge, d.panels[r.wall]]));
      expect(w.e0.h, m.id).toBeCloseTo(80, 0);
      expect(w.e2.h, m.id).toBeGreaterThan(220);
      expect(recordOf(d).slope, m.id).toBe(true);
      // a lower front is still clean
      expect(validate(build('magazineFile', m, { front: 50 })).map((x) => x.key), m.id).toEqual([]);
    }
  });

  it('a dice tower: as many slanted baffles as asked, each joined to both side walls, and a way out at the bottom', () => {
    for (const m of BASE)
      for (const n of [2, 3, 4]) {
        const d = build('diceTower', m, { baffles: n });
        const t = Object.values(d.trays!)[0];
        const ring = trayRing(d, t);
        const sides = [ring.find((r) => r.edge === 'e1')!.wall, ring.find((r) => r.edge === 'e3')!.wall];
        const baffles = Object.keys(d.panels).filter((id) => id.includes('baffle'));
        expect(baffles.length, `${m.id} ${n}`).toBe(n);
        for (const b of baffles)
          for (const s of sides) expect(Object.values(d.connections).some((c) => !c.broken && ((c.a.panelId === b && c.b.panelId === s) || (c.b.panelId === b && c.a.panelId === s))), `${m.id} ${b} ${s}`).toBe(true);
        expect(recordOf(d)).toMatchObject({ body: 'cross', baffles: true, window: true });
        expect(validate(d).map((x) => x.key), `${m.id} ${n}`).toEqual([]);
      }
  });

  it('a mailer: one wrap of seven boards, its tuck just behind the front, between the side walls', () => {
    for (const m of BASE.filter((x) => x.kind !== 'plywood')) {
      const d = build('mailer', m);
      expect(recordOf(d)).toMatchObject({ body: 'folded', wrap: true, boards: 7 });
      const front = Object.values(d.panels).find((p) => p.id.endsWith(':front'))!;
      const tuck = Object.values(d.panels).find((p) => p.id.endsWith(':tuck'))!;
      // both upright, facing the same way; the tuck inside the front by its thickness and the clearance
      const gap = Math.abs(front.frame.o[2] - tuck.frame.o[2]);
      expect(gap, m.id).toBeGreaterThanOrEqual(m.thickness);
      expect(gap, m.id).toBeLessThan(2 * m.thickness + 1);
      expect(tuck.w, m.id).toBeLessThan(front.w - 2 * m.thickness);
    }
    // plywood does not fold: a box with a hinged lid instead
    expect(makes(templateById('mailer')!, BASE[3])).toBe(false);
    expect(templateById('mailer')!.fallbackWords).toEqual({ lid: 'hinged' });
  });

  it('picked in the sentence from another card, each starts clean at the sizes it carries over', () => {
    for (const m of BASE)
      for (const from of [defaults(templateById('box')!), defaults(templateById('carton')!), { ...defaults(templateById('box')!), width: 300, depth: 300, height: 300 }, { ...defaults(templateById('box')!), width: 5, depth: 5, height: 5 }])
        for (const id of ['magazineFile', 'diceTower', 'mailer']) {
          const r = entryChoice(id, m, from, 'box');
          if (!r) continue;
          const d = generate(templateById(r.id)!, m, r.params);
          expect(validate(d).map((x) => x.key), `${id} in ${m.id} from ${JSON.stringify(from)}: ${JSON.stringify(r.params)}`).toEqual([]);
        }
  }, 120_000);

  it('a dice tower fits its baffles to any height and depth it can have, as many as there is room for', () => {
    const tower = templateById('diceTower')!;
    for (const m of BASE)
      for (const depth of [50, 85, 120])
        for (const height of [120, 200, 300]) {
          const p = { ...defaults(tower), width: 80, depth, height };
          const most = tower.limits!(m, p).baffles.max!;
          expect(most, `${m.id} ${depth} ${height}`).toBeGreaterThanOrEqual(2);
          for (const baffles of [2, most]) {
            const d = generate(tower, m, { ...p, baffles });
            expect(validate(d).map((x) => x.key), `${m.id} ${depth}×${height} ${baffles}`).toEqual([]);
            expect(Object.keys(d.panels).filter((k) => k.includes('baffle')).length).toBe(baffles);
          }
        }
    // short and deep: fewer than four
    expect(tower.limits!(BASE[3], { ...defaults(tower), depth: 120, height: 120 }).baffles.max).toBeLessThan(4);
  }, 120_000);

  it('none of them is recognised as a plain open box', () => {
    for (const m of BASE) for (const id of ['magazineFile', 'diceTower']) expect(recognise(build(id, m))?.card.id).not.toBe('openBox');
  });

  it('their pictures: the mailer with its lid opened, the dice tower with the walls before its baffles drawn as a ghost', () => {
    const m = BASE[1];
    const d = build('mailer', m);
    const pose = autoPose(d);
    expect(pose.lidOpen).toBeGreaterThan(90);
    const shown = posedDisplay(d, pose);
    const lid = d.panels['t:lid'];
    const at = (xf: Map<string, THREE.Matrix4>) => new THREE.Vector3(...toWorld(lid.frame, lid.w / 2, lid.h / 2, 0)).applyMatrix4(xf.get(lid.id) ?? new THREE.Matrix4()).y;
    // shut, the lid lies on the walls; opened, its middle is well above them
    expect(at(shown.xf)).toBeGreaterThan(at(posedDisplay(d, {}).xf) + 20);
    const t = build('diceTower', m);
    const ghost = autoPose(t).ghost ?? [];
    expect(ghost.sort()).toEqual(['t:wall-e0', 't:wall-e1']);
    // a plain box has none of it
    expect(autoPose(build('box', m)).ghost).toBeUndefined();
    expect(autoPose(build('box', m)).lidOpen).toBeUndefined();
  });
});
