// Guided's things and gallery (milestone 106, GUIDED_MODE.md G3).
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/model/materials';
import { validate } from '../src/model/validate';
import { blocking } from '../src/easy/fix';
import { GUIDED_MISSIONS, PLAIN, thingsFor } from '../src/guided/things';
import { guidedMaterial } from '../src/guided/GuidedStart';
import { offered, PLAIN_IDS, PLAIN_THINGS } from '../src/easy/plainThings';
import { mainTray } from '../src/templates/structures/box';
import { boxSize } from '../src/model/boxSize';
import { missionState } from '../src/easy/missions';
import { regenerate } from '../src/templates/registry';
import { thingFacts } from '../src/guided/thing';

const BUILT = MATERIALS.slice(0, 4);
const mat = (id: string) => MATERIALS.find((m) => m.id === id)!;

describe('things', () => {
  it('every thing starts with no blocking issue in every board it can be made in', () => {
    for (const th of [...GUIDED_MISSIONS, ...PLAIN])
      for (const m of BUILT) {
        if (!th.can(m)) continue;
        const d = th.start(m);
        expect(validate(d).filter(blocking).map((i) => i.key), `${th.id} ${m.id}`).toEqual([]);
      }
  });

  it('plain things are boxes sized by the inside, and no template rebuilds them', () => {
    for (const th of PLAIN)
      for (const m of BUILT) {
        if (!th.can(m)) continue;
        const d = th.start(m);
        expect(d.template, th.id).toBeUndefined();
        expect(d.sizeAs).toBe('inside');
        expect(mainTray(d), th.id).not.toBeNull();
        // a change that would rebuild a template does nothing
        expect(regenerate(d, {}).design).toBe(d);
      }
    const box = PLAIN.find((x) => x.id === 'box')!.start(mat('ply-3'));
    const inside = boxSize(box, mainTray(box)!, 'inside')!;
    expect([inside.w, inside.d, inside.h].map((x) => Math.round(x * 10) / 10)).toEqual([120, 80, 45]);
    expect(thingFacts(PLAIN.find((x) => x.id === 'box-lid')!.start(mat('ply-3'))).lid).toBe('liftoff');
  });

  it('a carton cannot start on plywood or thick corrugated, and says why', () => {
    const carton = PLAIN.find((x) => x.id === 'carton')!;
    expect(carton.can(mat('ply-3'))).toBe(false);
    expect(carton.can(mat('corr-4'))).toBe(false);
    expect(carton.can(mat('card-0.5'))).toBe(true);
    expect(carton.why).toBe('g.thing.cartonNo');
  });

  it('the Escape box stays with the other levels (its padlock needs hasps)', () => {
    expect(GUIDED_MISSIONS.map((x) => x.id)).toEqual(['pencil-box', 'dice-tray', 'card-stand', 'game-organiser']);
  });

  it('the shared list of plain things is the gallery’s', () => {
    expect(PLAIN_IDS).toEqual(PLAIN.map((x) => x.id));
    expect(PLAIN_THINGS.map((x) => x.title)).toEqual(PLAIN.map((x) => x.title));
  });

  it('missions start with their objects placed and their goals counted', () => {
    const d = GUIDED_MISSIONS.find((x) => x.id === 'pencil-box')!.start(mat('ply-3'));
    expect(d.mission?.version).toBe(2);
    expect(missionState(d)!.goals.find((g) => g.goal.id === 'fits-pencil')!.ok).toBe(false);
  });
});

describe("a class's list", () => {
  it('no list: every thing', () => {
    expect(thingsFor(undefined).length).toBe(GUIDED_MISSIONS.length + PLAIN.length);
  });
  it('one mission (a list from before 106): that mission and every plain thing', () => {
    expect(thingsFor(['pencil-box']).map((x) => x.id)).toEqual(['pencil-box', ...PLAIN_IDS]);
  });
  it('one mission and one thing: two cards', () => {
    expect(thingsFor(['pencil-box', 'box-lid']).map((x) => x.id)).toEqual(['pencil-box', 'box-lid']);
    expect(offered(['pencil-box', 'box-lid'], 'box')).toBe(false);
  });
});

describe('the board', () => {
  it("the class's profile is the board every thing starts in", () => {
    const profile = { ...mat('ply-3'), id: 'ply-3-class', thickness: 2.8 };
    const m = guidedMaterial({ classMaterial: profile, guidedMaterial: 'card-0.5' });
    expect(m).toBe(profile);
    const d = PLAIN[0].start(m);
    expect(d.material.id).toBe('ply-3-class');
    expect(d.material.thickness).toBe(2.8);
  });
  it('without a class: the one last chosen, else plywood', () => {
    expect(guidedMaterial({ guidedMaterial: 'card-0.5' }).id).toBe('card-0.5');
    expect(guidedMaterial({}).id).toBe('ply-3');
  });
});
