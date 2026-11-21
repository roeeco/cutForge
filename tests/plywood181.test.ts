// Milestone 181 (BOXES_PLYWOOD_PLAN.md E8): walls bent round living hinges on any outline. The U box (boxes.py's UBox),
// the rounded polygon box (RoundedRegularBox), the rounded trapezoid box (RoundedTrapezoidBox, with chosen corners) and
// the heart box (HeartBox) each build clean on the plywood that bends (3 and 4 mm), are recognised as themselves, and
// no board only rests; each band develops to its turn times its neutral radius; none is offered on thick plywood or
// other boards.
import { describe, expect, it } from 'vitest';
import { defaults, generate, templateById } from '../src/templates/registry';
import { profileById } from '../src/model/boards';
import { MATERIALS } from '../src/model/materials';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/notes';
import { recognise } from '../src/templates/catalogue';
import { recordOf } from '../src/templates/records';
import { makes, type Params } from '../src/templates/types';
import { allBands } from '../src/model/bands';
import { wingBands } from '../src/model/wings';
import { boxLid } from '../src/easy/lid';
import { mainTray } from '../src/templates/structures/box';
import { censusBreaks } from '../src/templates/structures/boards';
import { bendsRound, heartOutline, heartSide } from '../src/templates/structures/boardBends';
import type { Band } from '../src/model/bands';
import type { Design } from '../src/model/types';

const P3 = profileById('ply-3')!, P4 = profileById('ply-4')!;
const problems = (d: Design) => validate(d).filter((x) => !NOTE_KEYS.has(x.key)).map((x) => x.key);
const onlyResting = (d: Design) =>
  d.order.filter((id) => {
    const cs = Object.values(d.connections).filter((c) => c.a.panelId === id || c.b.panelId === id);
    return cs.length > 0 && cs.every((c) => c.kind === 'slide');
  });
const build = (id: string, m = P3, w: Params = {}) => generate(templateById(id)!, m, { ...defaults(templateById(id)!), ...w });
/** Every band of a design: folds with a radius and the bands round a tray's rounded corners. */
const bands = (d: Design): Band[] => [...allBands(d).filter((b) => !b.wing), ...Object.values(d.connections).filter((c) => c.wing).flatMap((c) => wingBands(d, c))];

const CASES: [string, string, Params][] = [
  ['U box', 'uBox', {}],
  ['U box, outside', 'uBox', { sizeAs: 'outside', radius: 40 }],
  ['rounded pentagon', 'roundPolyBox', {}],
  ['rounded hexagon', 'roundPolyBox', { corners: 6 }],
  ['rounded trapezoid', 'roundTrapBox', {}],
  ['trapezoid, back corners rounded', 'roundTrapBox', { rounded: 'back' }],
  ['trapezoid, front corners rounded', 'roundTrapBox', { rounded: 'front' }],
  ['heart', 'heartBox', {}],
  ['heart, no lid, outside', 'heartBox', { lid: 'none', sizeAs: 'outside' }],
];

describe('walls bent round any outline (milestone 181)', () => {
  it('each builds clean on plywood 3 and 4 mm, is recognised as itself, and no board only rests', () => {
    for (const m of [P3, P4])
      for (const [name, id, w] of CASES) {
        const d = build(id, m, w);
        expect(problems(d), `${name} ${m.id}`).toEqual([]);
        expect(recognise(d)?.v.id, `${name} ${m.id}`).toBe(id);
        expect(onlyResting(d), `${name} ${m.id}`).toEqual([]);
        expect(censusBreaks(d), `${name} ${m.id}`).toEqual([]);
      }
  }, 240_000);

  it('a rounded octagon on 3 mm; on 4 mm its corners bend too wide for its sides at that size, so it is not offered there', () => {
    const t = templateById('roundPolyBox')!;
    const corners = t.params.find((x) => x.key === 'corners')!;
    expect(problems(build('roundPolyBox', P3, { corners: 8 }))).toEqual([]);
    expect(corners.allowed!(8, defaults(t), P3)).toBe(true);
    expect(corners.allowed!(8, defaults(t), P4)).toBe(false);
  }, 60_000);

  it('each band develops to its turn times its neutral radius, and the bands turn as far as the rounded corners do', () => {
    const turn = (d: Design) => bands(d).reduce((s, b) => s + b.phi, 0);
    for (const [name, id, w, want] of [
      ['pentagon', 'roundPolyBox', {}, 2 * Math.PI],
      ['trapezoid', 'roundTrapBox', {}, 2 * Math.PI],
      ['heart', 'heartBox', { lid: 'none' }, 2 * Math.PI],
      ['U box', 'uBox', {}, Math.PI],
    ] as [string, string, Params, number][]) {
      const d = build(id, P3, w);
      const bs = bands(d);
      expect(bs.length, name).toBeGreaterThan(0);
      for (const b of bs) expect(b.lb, name).toBeCloseTo(b.phi * (b.r + b.k * b.t), 6);
      expect(turn(d), name).toBeCloseTo(want, 3);
    }
    // only the two back corners: they turn by what the trapezoid turns there
    const back = build('roundTrapBox', P3, { rounded: 'back' });
    const F = 180, B = 110, D = 110;
    const side = Math.atan2(D, (F - B) / 2);
    // the back corners' insides are 180° less the front's (`side`): each turns by `side`
    expect(turn(back)).toBeCloseTo(2 * side, 3);
  }, 60_000);

  it('their records: rounded corners on a polygon, a trapezoid and a heart; a U box’s base bends up', () => {
    expect(recordOf(build('roundPolyBox'))).toMatchObject({ footprint: 'poly', sides: 5, rounded: true, lid: 'none' });
    expect(recordOf(build('roundTrapBox'))).toMatchObject({ footprint: 'free', sides: 4, rounded: true });
    expect(recordOf(build('heartBox'))).toMatchObject({ footprint: 'concave', rounded: true, lid: 'liftoff' });
    expect(recordOf(build('uBox'))).toMatchObject({ footprint: 'rect', lid: 'none', bends: true });
    // a box with its corners rounded (the box's own shape) is still an open box
    expect(recognise(build('box', P3, { shape: 'rounded' }))?.card.id).toBe('openBox');
  }, 60_000);

  it('a heart: its lid drops in; its width is the width asked for', () => {
    const d = build('heartBox', P3, { sizeAs: 'outside' });
    expect(boxLid(d, mainTray(d)!)).toMatchObject({ kind: 'liftoff' });
    const l = heartSide(180, 18);
    const h = heartOutline(l, 18);
    const lobe = Math.SQRT1_2 * (l - h.r) + h.r;
    expect(2 * lobe).toBeCloseTo(180, 3);
  });

  it('they are made on plywood that bends: 3 and 4 mm; not on thicker plywood, card or corrugated', () => {
    expect(['ply-3', 'ply-4', 'ply-5', 'ply-6', 'ply-8'].map((id) => bendsRound(profileById(id)!))).toEqual([true, true, false, false, false]);
    for (const m of [...MATERIALS.filter((x) => x.kind !== 'plywood'), profileById('ply-8')!]) for (const [, id] of CASES) expect(makes(templateById(id)!, m), `${id} ${m.id}`).toBe(false);
  });
});
