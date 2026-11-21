// Milestone 173 (BOXES_PLYWOOD_PLAN.md §4 E1, §2.1): the face-glued joint (`laminate`), and the box's lid and base
// words that need it or came with it: a plug lid (UniversalBox's *flat*), a brim lid (*flatbrim*), a handle on the lid
// and a base that overhangs the walls (BasedBox). Plywood only; each builds clean on plywood 3 and 8 mm.
import { describe, expect, it } from 'vitest';
import { profileById } from '../src/model/boards';
import { addFreePanel, autoConnect, createDesign, deleteConnection, solve } from '../src/model/ops';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/notes';
import { findOpenSeams } from '../src/model/seams';
import { serializeProject, parseProject } from '../src/model/serialize';
import { censusBreaks } from '../src/templates/structures/boards';
import type { Design, P2 } from '../src/model/types';

const P3 = profileById('ply-3')!, P8 = profileById('ply-8')!;
const problems = (d: Design) => validate(d).filter((x) => !NOTE_KEYS.has(x.key)).map((x) => x.key);
const rect = (w: number, h: number): P2[] => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];

/** Two boards lying level, the second on the first's top face, offset by (dx, dz). */
function stacked(m = P3, dx = 10, dz = 10, gap = 0): Design {
  const d = createDesign(m);
  const t = m.thickness;
  addFreePanel(d, { id: 'a', frame: { o: [0, 0, 0], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: rect(100, 80) });
  addFreePanel(d, { id: 'b', frame: { o: [dx, t + gap, -dz], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: rect(60, 40) });
  solve(d);
  return d;
}

describe('the face-glued joint (milestone 173, E1)', () => {
  it('two boards face to face are a laminate seam, joined and clean; before, they were *touching and not joined*', () => {
    const d = stacked();
    expect(findOpenSeams(d).map((s) => s.type)).toEqual(['laminate']);
    expect(problems(d)).toEqual(['val.notJoined.faceToFace']);
    autoConnect(d);
    const cs = Object.values(d.connections);
    expect(cs.map((c) => c.kind)).toEqual(['laminate']);
    expect(cs[0].broken).toBe(false);
    expect(problems(d)).toEqual([]);
    // nothing is cut for it; the glue's place on each board
    expect(cs[0].geom!.holes).toEqual([]);
    expect(cs[0].geom!.glueAt!.map((g) => g.panelId).sort()).toEqual(['a', 'b']);
    expect(censusBreaks(d)).toEqual([]);
  });

  it('boards apart, or side by side in one plane, are not glued', () => {
    const d = stacked(P3, 10, 10, 1);
    expect(findOpenSeams(d)).toEqual([]);
    const e = createDesign(P3);
    addFreePanel(e, { id: 'a', frame: { o: [0, 0, 0], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: rect(100, 80) });
    addFreePanel(e, { id: 'b', frame: { o: [100, 0, 0], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: rect(60, 40) });
    solve(e);
    expect(findOpenSeams(e).some((s) => s.type === 'laminate')).toBe(false);
  });

  it('a board over another board’s hole shares only the material round it', () => {
    const d = createDesign(P8);
    // a frame of 100 × 80 with a 80 × 60 window, and a board of 70 × 50 lying in the window's place: no material shared
    addFreePanel(d, { id: 'a', frame: { o: [0, 0, 0], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: rect(100, 80), holes: [[{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 70 }, { x: 10, y: 70 }]] });
    addFreePanel(d, { id: 'b', frame: { o: [15, 8, -15], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: rect(70, 50) });
    solve(d);
    expect(findOpenSeams(d)).toEqual([]);
  });

  it('a laminate joint survives a file round trip, and moving a board off breaks it', () => {
    const d = stacked();
    autoConnect(d);
    const e = parseProject(serializeProject(d));
    solve(e);
    expect(Object.values(e.connections).map((c) => [c.kind, c.broken])).toEqual([['laminate', false]]);
    e.panels.b.frame.o[1] += 2;
    solve(e);
    autoConnect(e);
    expect(Object.values(e.connections)).toEqual([]);
  });

  it('unjoined by hand, the pair is told it lies face to face', () => {
    const d = stacked();
    autoConnect(d);
    deleteConnection(d, Object.keys(d.connections)[0]);
    autoConnect(d);
    expect(problems(d)).toEqual(['val.notJoined.faceToFace']);
  });
});
