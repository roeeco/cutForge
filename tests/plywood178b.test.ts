// Milestone 178, part 2 (BOXES_PLYWOOD_PLAN.md §3.2): the entries part 1 left. The showcase (CoinDisplay), the louvred
// box (StevensonScreenBox), the can dispenser (CanStorage), the bottle rack's stack (BottleStack) and jars (SpicesRack,
// PaintStorage), the book cover (Folder) and the clock face (Clock). Each builds clean on plywood 3 and 8 mm at its
// defaults (the book cover on 3 mm: thicker plywood does not bend round its spine), is recognised as itself, has every
// board held by tabs in slots, fingers, half-slots or a bend (none only rests), and is plywood only.
import { describe, expect, it } from 'vitest';
import { defaults, generate, templateById } from '../src/templates/registry';
import { profileById } from '../src/model/boards';
import { MATERIALS } from '../src/model/materials';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/notes';
import { recognise } from '../src/templates/catalogue';
import { recordOf } from '../src/templates/records';
import { makes, type Params } from '../src/templates/types';
import type { Design } from '../src/model/types';

const P3 = profileById('ply-3')!, P8 = profileById('ply-8')!;
const problems = (d: Design) => validate(d).filter((x) => !NOTE_KEYS.has(x.key)).map((x) => x.key);
const onlyResting = (d: Design) =>
  d.order.filter((id) => {
    const cs = Object.values(d.connections).filter((c) => c.a.panelId === id || c.b.panelId === id);
    return cs.length > 0 && cs.every((c) => c.kind === 'slide');
  });

/** name, structure, words, the variant it is, the boards it is made on */
const CASES: [string, string, Params, string, (typeof P3)[]][] = [
  ['showcase', 'showcase', {}, 'showcase', [P3, P8]],
  ['showcase, a big coin leaning far back', 'showcase', { coin: 60, lean: 35 }, 'showcase', [P3, P8]],
  ['louvred box', 'louvreBox', {}, 'louvreBox', [P3, P8]],
  ['can dispenser', 'canDispenser', {}, 'canDispenser', [P3, P8]],
  ['can dispenser for batteries', 'canDispenser', { can: 30, length: 50, cans: 8 }, 'canDispenser', [P3, P8]],
  ['bottle stack', 'bottleStack', {}, 'bottleStack', [P3, P8]],
  ['jar rack', 'jarRack', {}, 'jarRack', [P3, P8]],
  ['jar rack, one row of paint pots', 'jarRack', { rows: 1, jar: 30, jarHeight: 50, jars: 8 }, 'jarRack', [P3, P8]],
  ['book cover', 'bookCover', {}, 'bookCover', [P3]],
  ['clock face', 'clockFace', {}, 'clockFace', [P3, P8]],
];
const NEW_CARDS = ['showcase', 'louvreBox', 'canDispenser', 'bottleStack', 'jarRack', 'bookCover', 'clockFace'];

describe('the rest of §3.2 in plywood (milestone 178, part 2)', () => {
  it('each builds clean on plywood, is recognised as itself, and no board only rests', () => {
    for (const [name, id, w, v, ms] of CASES)
      for (const m of ms) {
        const t = templateById(id)!;
        const d = generate(t, m, { ...defaults(t), ...w });
        expect(problems(d), `${name} ${m.id}`).toEqual([]);
        expect(recognise(d)?.v.id, `${name} ${m.id}`).toBe(v);
        expect(onlyResting(d), `${name} ${m.id}`).toEqual([]);
        for (const b of d.order) expect(Object.values(d.connections).some((c) => c.a.panelId === b || c.b.panelId === b), `${name} ${m.id} ${b}`).toBe(true);
      }
  }, 240_000);

  it('the new cards are plywood only; the book cover only where plywood bends round its spine', () => {
    for (const m of MATERIALS.filter((x) => x.kind !== 'plywood')) for (const id of NEW_CARDS) expect(makes(templateById(id)!, m), `${id} ${m.id}`).toBe(false);
    expect(makes(templateById('bookCover')!, P8)).toBe(false);
  });

  it('the showcase’s coin plate leans back between two cheeks on the base, its hole the coin’s size', () => {
    const t = templateById('showcase')!;
    const d = generate(t, P3, { ...defaults(t), coin: 32 });
    const plate = d.panels['t:plate'];
    expect(plate.frame.v[1]).toBeCloseTo(Math.cos((30 * Math.PI) / 180), 6);
    expect(plate.details.find((x) => x.shape === 'circle')?.w).toBe(32);
    const joined = (a: string, b: string) => Object.values(d.connections).some((c) => [c.a.panelId, c.b.panelId].sort().join() === [a, b].sort().join());
    expect(joined('t:plate', 't:cheek-1') && joined('t:plate', 't:cheek-2') && joined('t:cheek-1', 't:base')).toBe(true);
    expect(joined('t:plate', 't:base')).toBe(false);
  });

  it('the louvred box has slats at 45° front and back, held by its side walls only', () => {
    const t = templateById('louvreBox')!;
    const d = generate(t, P3, defaults(t));
    const slats = d.order.filter((id) => /slat/.test(id));
    expect(slats.length).toBeGreaterThanOrEqual(6);
    for (const id of slats) expect(Math.abs(d.panels[id].frame.v[1])).toBeCloseTo(Math.SQRT1_2, 6);
    const walls = ['t:wall-e1', 't:wall-e3'];
    for (const id of slats) for (const c of Object.values(d.connections).filter((x) => x.a.panelId === id || x.b.panelId === id)) expect(walls).toContain(c.a.panelId === id ? c.b.panelId : c.a.panelId);
  });

  it('the can dispenser’s chutes slope opposite ways; the bottle stack’s beams cross its feet in half-slots', () => {
    const c = generate(templateById('canDispenser')!, P3, defaults(templateById('canDispenser')!));
    const fall = (id: string) => Math.sign(c.panels[id].frame.v[1] * c.panels[id].frame.v[2]);
    expect(fall('t:chute-1')).toBe(-fall('t:chute-2'));
    const s = generate(templateById('bottleStack')!, P3, defaults(templateById('bottleStack')!));
    expect(Object.values(s.connections).filter((x) => x.kind === 'halflap')).toHaveLength(4);
    expect(recordOf(s).cradles).toBe(true);
  });

  it('the book cover is three boards bent on living hinges, its spine the narrowest; the clock’s face is round with hour marks', () => {
    const b = generate(templateById('bookCover')!, P3, defaults(templateById('bookCover')!));
    expect(Object.values(b.connections).filter((c) => c.grown && c.kind === 'fold' && (c.radius ?? 0) > 0)).toHaveLength(2);
    expect(recordOf(b).spine).toBe(true);
    const k = generate(templateById('clockFace')!, P3, defaults(templateById('clockFace')!));
    const face = k.panels['t:face'];
    expect(face.details.filter((x) => x.op === 'engrave' && x.shape === 'roundrect')).toHaveLength(12);
    expect(face.details.filter((x) => x.op === 'engrave' && x.shape === 'path')).toHaveLength(4);
    expect(recordOf(k).disc).toBe(true);
  });
});
