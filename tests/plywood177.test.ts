// Milestone 177 (BOXES_PLYWOOD_PLAN.md §3.7, engine step E6): stacking feet. A board's stacking edges (feet below it,
// a tongue on its top, src/model/stack.ts); the box's *stackable* word (Crate), the open-front box's (NotesHolder) and
// the rack's (StorageRack); the *Stacking bin* (StackableBin) and the *Sieve stack* (BrickSorter). Each builds clean
// on plywood 3 and 8 mm, is recognised as itself, no board only rests, and two of it stack within the play.
import { describe, expect, it } from 'vitest';
import polygonClipping from 'polygon-clipping';
import { defaults, generate, templateById } from '../src/templates/registry';
import { profileById } from '../src/model/boards';
import { MATERIALS } from '../src/model/materials';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/notes';
import { recognise } from '../src/templates/catalogue';
import { styleById } from '../src/templates/styles';
import { makes, type ParamDef, type Params } from '../src/templates/types';
import { stackFor, stackMinWidth, stackPitch, stackPolys } from '../src/model/stack';
import { panelShape } from '../src/views/three-geom';
import { autoPose } from '../src/views/pose';
import { buildPieces } from '../src/model/pieces';
import { parseProject, serializeProject } from '../src/model/serialize';
import type { Design, Panel } from '../src/model/types';

const P3 = profileById('ply-3')!, P8 = profileById('ply-8')!;
const problems = (d: Design) => validate(d).filter((x) => !NOTE_KEYS.has(x.key)).map((x) => x.key);
const onlyResting = (d: Design) =>
  d.order.filter((id) => {
    const cs = Object.values(d.connections).filter((c) => c.a.panelId === id || c.b.panelId === id);
    return cs.length > 0 && cs.every((c) => c.kind === 'slide');
  });
const words = (st: string): Params => ({ ...styleById(st)!.words, ...(styleById(st)!.sizes ?? {}) });
const build = (id: string, m = P3, w: Params = {}) => {
  const t = templateById(id)!;
  return generate(t, m, { ...defaults(t), ...w });
};

const CASES: [string, string, Params, string][] = [
  ['crate', 'box', words('crate'), 'crate'],
  ['a box that stacks, no handles', 'box', { stack: 'feet' }, 'crate'],
  ['notes box', 'frontOpen', words('stackNotes'), 'stackNotes'],
  ['stacking rack', 'shelf', words('stackRack'), 'stackRack'],
  ['stacking bin', 'stackBin', {}, 'stackBin'],
  ['stacking bin, half', 'stackBin', { front: 0.5 }, 'stackBin'],
  ['sieve stack', 'sieveStack', {}, 'sieveStack'],
  ['sieve stack, 30 mm holes', 'sieveStack', { hole: 30, width: 200, depth: 200 }, 'sieveStack'],
];

/** A board's outline as cut and shown (joints, feet and tongue), as a polygon-clipping polygon moved by (dx, dy). */
function shapeOf(d: Design, p: Panel, dx = 0, dy = 0) {
  const s = panelShape(d, p);
  const ring = (r: { x: number; y: number }[]) => r.map((q) => [q.x + dx, q.y + dy] as [number, number]);
  return s.rings.map((r, i) => [ring(r), ...(i === 0 ? s.holes.map(ring) : [])]);
}
const area = (mp: ReturnType<typeof polygonClipping.intersection>) =>
  mp.reduce((s, poly) => s + poly.reduce((t, r, i) => {
    let a = 0;
    for (let k = 0; k < r.length; k++) a += r[k][0] * r[(k + 1) % r.length][1] - r[(k + 1) % r.length][0] * r[k][1];
    return t + (i ? -1 : 1) * Math.abs(a / 2);
  }, 0), 0);

describe('stacking feet (milestone 177)', () => {
  it('each builds clean on plywood 3 and 8 mm, is recognised as itself, no board only rests, and every wall stacks', () => {
    for (const m of [P3, P8])
      for (const [name, id, w, v] of CASES) {
        const d = build(id, m, w);
        expect(problems(d), `${name} ${m.id}`).toEqual([]);
        expect(recognise(d)?.v.id, `${name} ${m.id}`).toBe(v);
        expect(onlyResting(d), `${name} ${m.id}`).toEqual([]);
        const st = Object.values(d.panels).filter((p) => p.stack);
        expect(st.length, `${name} ${m.id}`).toBeGreaterThanOrEqual(3);
        for (const p of st) expect(stackPolys(p), `${name} ${m.id} ${p.id}`).toHaveLength(3);
        expect(autoPose(d).stack, name).toBe(2);
      }
  }, 240_000);

  it('two stack: the feet stand on the walls below, the tongues between them, within the play and no further', () => {
    for (const m of [P3, P8])
      for (const [name, id, w] of CASES) {
        const d = build(id, m, w);
        const pitch = stackPitch(d)!;
        for (const p of Object.values(d.panels).filter((x) => x.stack)) {
          // the same board on the box above is in the same plane, `pitch` higher (boards stand upright from y = 0)
          const below = shapeOf(d, p) as never;
          const play = p.stack!.play;
          expect(area(polygonClipping.intersection(below, shapeOf(d, p, 0, pitch) as never)), `${name} ${m.id} ${p.id}`).toBeLessThan(1e-3);
          // slid along the board by less than the play it is still clear; by more, a tongue meets a foot
          for (const s of [-0.9, 0.9]) expect(area(polygonClipping.intersection(below, shapeOf(d, p, s * play, pitch) as never)), `${name} ${p.id} ${s}`).toBeLessThan(1e-3);
          for (const s of [-1.5, 1.5]) expect(area(polygonClipping.intersection(below, shapeOf(d, p, s * play, pitch) as never)), `${name} ${p.id} ${s}`).toBeGreaterThan(1e-3);
        }
      }
  }, 240_000);

  it('the cut has the feet and tongues: each wall piece reaches below and above the board it was', () => {
    const d = build('box', P3, words('crate'));
    const wall = d.panels['t:wall-e1'];
    const piece = buildPieces(d).find((x) => x.key === wall.id)!;
    const ys = piece.contours.filter((c) => c.role === 'outer').flatMap((c) => c.contour.segs.flatMap((sg) => [sg.a.y, sg.b.y]));
    const s = wall.stack!;
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(wall.h + s.h + (s.h - s.play), 3);
  });

  it('the feet are boxes.py’s proportions, kept to 3 to 8 mm plywood; the least box that takes them', () => {
    expect(stackFor(P3)).toMatchObject({ h: 6, w: 12, inset: 3 });
    expect(stackFor(P8)).toMatchObject({ h: 12, w: 24, inset: 8 });
    expect(stackMinWidth(stackFor(P8))).toBeLessThan(100);
    // too small: refused with its reason
    const bin = templateById('stackBin')!;
    expect(bin.accepts!(P8, { ...defaults(bin), width: 70 })).toBe('sen.why.stackRoom');
    expect(bin.limits!(P8, defaults(bin)).width.min).toBeGreaterThan(70);
  });

  it('the sieve has a grid of rounded holes in its floor; the bin leans a board out at 45° across its open front', () => {
    const s = build('sieveStack');
    const holes = s.panels['t:base'].details.filter((x) => x.op === 'cut');
    expect(holes.length).toBeGreaterThanOrEqual(16);
    expect(new Set(holes.map((x) => `${x.w}x${x.h}`))).toEqual(new Set(['15x15']));
    const b = build('stackBin');
    expect(b.panels['t:wall-e0']).toBeUndefined();
    expect(b.panels['t:slope'].frame.v[1]).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('a board’s stacking edges survive saving, and a bad one is dropped on loading', () => {
    const d = build('box', P3, words('crate'));
    const back = parseProject(serializeProject(d));
    expect(back.panels['t:wall-e1'].stack).toEqual(d.panels['t:wall-e1'].stack);
    const raw = JSON.parse(serializeProject(d));
    const doc = raw.design ?? raw;
    doc.panels['t:wall-e1'].stack = { h: 'x' };
    expect(parseProject(JSON.stringify(raw)).panels['t:wall-e1'].stack).toBeUndefined();
  });

  it('the new cards are plywood only; the stacking words are refused on other boards with a reason', () => {
    for (const m of MATERIALS.filter((x) => x.kind !== 'plywood')) {
      for (const id of ['stackBin', 'sieveStack']) expect(makes(templateById(id)!, m), `${id} ${m.id}`).toBe(false);
      for (const [id, w] of [['box', {}], ['frontOpen', {}], ['shelf', { rails: 'rails', shelves: 4 }]] as const) {
        const t = templateById(id)!;
        if (!makes(t, m)) continue;
        const def = t.params.find((x) => x.key === 'stack') as ParamDef;
        const p = { ...defaults(t), ...w };
        expect(def.allowed!('feet', p, m), `${id} ${m.id}`).toBe(false);
        expect(def.why!('feet', p, m), `${id} ${m.id}`).toBe('sen.why.plyOnly');
      }
    }
  }, 60_000);

  it('a box, open-front box or rack saved before 177 builds as it did (no stacking edges); a lid or grips take the word away', () => {
    for (const id of ['box', 'tray', 'frontOpen', 'shelf']) {
      const t = templateById(id)!;
      const { stack: _s, ...old } = defaults(t);
      expect(Object.values(generate(t, P3, old).panels).some((p) => p.stack), id).toBe(false);
    }
    const box = templateById('box')!;
    const def = box.params.find((x) => x.key === 'stack') as ParamDef;
    expect(def.allowed!('feet', { ...defaults(box), lid: 'liftoff' }, P3)).toBe(false);
    expect(def.why!('feet', { ...defaults(box), lid: 'liftoff' }, P3)).toBe('sen.why.stackLid');
    expect(def.allowed!('feet', { ...defaults(box), handles: 'grips' }, P3)).toBe(false);
    const shelf = templateById('shelf')!;
    const sd = shelf.params.find((x) => x.key === 'stack') as ParamDef;
    expect(sd.allowed!('feet', defaults(shelf), P3)).toBe(false);
    expect(sd.why!('feet', defaults(shelf), P3)).toBe('sen.why.stackRack');
  }, 60_000);
});
