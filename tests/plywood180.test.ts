// Milestone 180 (BOXES_PLYWOOD_PLAN.md E7): boxes of boards on any footprint. A tray whose base has inside corners
// fingers them as corners seen from inside (`Tray.insideCorners`); the chamfered box (boxes.py's AngledBox), the coffin
// box (Coffin), the tetromino boxes (Tetris) and the star box each build clean on plywood 3 and 8 mm, are recognised
// as themselves, and no board only rests; none is offered on other boards.
import { describe, expect, it } from 'vitest';
import { defaults, generate, templateById } from '../src/templates/registry';
import { profileById } from '../src/model/boards';
import { MATERIALS } from '../src/model/materials';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/notes';
import { recognise } from '../src/templates/catalogue';
import { recordOf } from '../src/templates/records';
import { makes, type Params } from '../src/templates/types';
import { addPolygonPanel, addTray, createDesign, solve } from '../src/model/ops';
import { boxRecipe } from '../src/easy/recipes';
import { boxSize } from '../src/model/boxSize';
import { mainTray } from '../src/templates/structures/box';
import { censusBreaks } from '../src/templates/structures/boards';
import { chamferOutline, growOutline, starOutline, tetrominoOutline } from '../src/templates/structures/boardOutlines';
import type { Design } from '../src/model/types';

const P3 = profileById('ply-3')!, P8 = profileById('ply-8')!;
const problems = (d: Design) => validate(d).filter((x) => !NOTE_KEYS.has(x.key)).map((x) => x.key);
const onlyResting = (d: Design) =>
  d.order.filter((id) => {
    const cs = Object.values(d.connections).filter((c) => c.a.panelId === id || c.b.panelId === id);
    return cs.length > 0 && cs.every((c) => c.kind === 'slide');
  });

const CASES: [string, string, Params][] = [
  ['chamfered', 'chamferBox', {}],
  ['chamfered, pointed ends', 'chamferBox', { endWalls: 2 }],
  ['chamfered, four end walls, outside', 'chamferBox', { endWalls: 4, sizeAs: 'outside' }],
  ['coffin', 'coffinBox', {}],
  ['coffin, plain lid', 'coffinBox', { cross: 'none' }],
  ['tetromino L', 'tetrominoBox', {}],
  ['tetromino T', 'tetrominoBox', { piece: 'T' }],
  ['tetromino S', 'tetrominoBox', { piece: 'S' }],
  ['tetromino Z', 'tetrominoBox', { piece: 'Z' }],
  ['star', 'starBox', {}],
  ['star, four points', 'starBox', { points: 4 }],
  ['star, eight points', 'starBox', { points: 8, radius: 120 }],
];

/** An L-shaped base (one inside corner), walled. */
function lBox(insideCorners?: 'finger') {
  const d = createDesign(P3);
  const b = addPolygonPanel(d, 0, 0, [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 60 }, { x: 60, y: 60 }, { x: 60, y: 120 }, { x: 0, y: 120 }])!;
  addTray(d, b, 50, insideCorners ? { insideCorners } : undefined);
  solve(d);
  return d;
}

describe('inside corners fingered (milestone 180)', () => {
  it('a tray asked to finger its inside corners does: both walls reach on to where their inner faces meet', () => {
    const d = lBox('finger');
    expect(problems(d)).toEqual([]);
    const kinds = Object.values(d.connections).filter((c) => !c.grown).map((c) => c.kind);
    expect(kinds.every((k) => k === 'finger'), kinds.join()).toBe(true);
    // the two walls at the inside corner each reach one board past it
    const ext = d.order.map((id) => d.panels[id].ext).filter(Boolean);
    expect(ext).toHaveLength(2);
    for (const e of ext) expect(Math.max(e!.s, e!.e)).toBeCloseTo(3, 6);
  });

  it('a tray that does not ask keeps the joint it had there (one wall across, the other stopped at its face)', () => {
    const d = lBox();
    expect(Object.values(d.connections).filter((c) => !c.grown).map((c) => c.kind)).toContain('slide');
    expect(d.order.map((id) => d.panels[id].ext).filter(Boolean)).toHaveLength(1);
  });

  it('the outline footprint fingers inside corners on plywood', () => {
    const d = createDesign(P8);
    boxRecipe(d, { kind: 'outline', pts: tetrominoOutline('T', 60) }, 50);
    solve(d);
    expect(problems(d)).toEqual([]);
    expect(onlyResting(d)).toEqual([]);
    expect(Object.values(d.connections).every((c) => c.kind === 'finger')).toBe(true);
  });

  it('an outline grown by the walls’ thickness is the inside the walls leave', () => {
    const pts = chamferOutline(200, 100, 3);
    const d = createDesign(P3);
    boxRecipe(d, { kind: 'outline', pts: growOutline(pts, 3) }, 50);
    solve(d);
    const s = boxSize(d, mainTray(d)!, 'inside')!;
    expect(s.w).toBeCloseTo(200, 3);
    expect(s.d).toBeCloseTo(100, 3);
  });
});

describe('boxes on any footprint (milestone 180)', () => {
  it('each builds clean on plywood 3 and 8 mm, is recognised as itself, and no board only rests', () => {
    for (const m of [P3, P8])
      for (const [name, id, w] of CASES) {
        const t = templateById(id)!;
        const d = generate(t, m, { ...defaults(t), ...w });
        expect(problems(d), `${name} ${m.id}`).toEqual([]);
        expect(recognise(d)?.v.id, `${name} ${m.id}`).toBe(id);
        expect(onlyResting(d), `${name} ${m.id}`).toEqual([]);
        expect(censusBreaks(d), `${name} ${m.id}`).toEqual([]);
      }
  }, 240_000);

  it('their records: a chamfered box and a coffin are free polygons, a tetromino concave, a star a star', () => {
    const rec = (id: string, w: Params = {}) => recordOf(generate(templateById(id)!, P3, { ...defaults(templateById(id)!), ...w }));
    expect(rec('chamferBox')).toMatchObject({ footprint: 'free', sides: 8, lid: 'none' });
    expect(rec('coffinBox')).toMatchObject({ footprint: 'free', sides: 6, lid: 'liftoff' });
    expect(rec('tetrominoBox')).toMatchObject({ footprint: 'concave', sides: 6 });
    expect(rec('tetrominoBox').star).toBeUndefined();
    expect(rec('starBox')).toMatchObject({ footprint: 'concave', sides: 10, star: true });
    // a box's polygon is a regular one stretched to its width and depth: still a polygon
    expect(rec('box', { shape: 'poly', sides: 6 })).toMatchObject({ footprint: 'poly', sides: 6 });
  }, 60_000);

  it('the outlines: a chamfered box wider than deep, a star’s points alternating in and out', () => {
    const c = chamferOutline(200, 100, 3);
    expect(c).toHaveLength(8);
    expect(Math.max(...c.map((q) => q.x)) - Math.min(...c.map((q) => q.x))).toBeCloseTo(200, 6);
    expect(Math.max(...c.map((q) => q.y)) - Math.min(...c.map((q) => q.y))).toBeCloseTo(100, 6);
    const s = starOutline(5, 80);
    expect(s.map((q) => Math.round(Math.hypot(q.x, q.y)))).toEqual([80, 40, 80, 40, 80, 40, 80, 40, 80, 40]);
    expect(tetrominoOutline('S', 40)).toHaveLength(8);
  });

  it('they are plywood only', () => {
    for (const m of MATERIALS.filter((x) => x.kind !== 'plywood')) for (const [, id] of CASES) expect(makes(templateById(id)!, m), `${id} ${m.id}`).toBe(false);
  });

  it('five end walls on 3 mm plywood; on 8 mm their 150° corners would leave slivers, so four at most', () => {
    const t = templateById('chamferBox')!;
    expect(problems(generate(t, P3, { ...defaults(t), endWalls: 5 }))).toEqual([]);
    expect(t.limits!(P3, defaults(t)).endWalls.max).toBe(5);
    expect(t.limits!(P8, defaults(t)).endWalls.max).toBe(4);
  }, 60_000);

  it('a chamfered box narrower than its ends is refused with a reason', () => {
    const t = templateById('chamferBox')!;
    expect(t.accepts!(P3, { ...defaults(t), width: 100, depth: 100 })).toBe('sen.why.chamferWide');
    expect(t.limits!(P3, defaults(t)).width.min).toBeGreaterThan(100);
  });
});
