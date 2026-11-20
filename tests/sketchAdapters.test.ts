// Milestone 102 (DIELINE_DNA_PLAN.md D0b-1): boards and shapes as sketch graphs, and back.
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import '../src/templates/registry';
import { MATERIALS } from '../src/model/materials';
import { addRootPanel, createDesign, parentConnection } from '../src/model/ops';
import { boardGraph, graphBoard, graphShape, shapeGraph, shapeRings } from '../src/sketch/cutforge';
import { splitSeg, movePts } from '../src/sketch/ops';
import { prepareExport } from '../src/export/prepare';
import { cardTray, closedBox, corrDividers, linesBoard, plyBox, plyLean, v6CardGable, v6CorrFoldover, v6PlyHexThrough } from './goldenDesigns';
import { polygonArea } from '../src/geom/vec';
import type { Design, Detail } from '../src/model/types';

const DESIGNS: [string, () => Design][] = [
  ['plyBox', plyBox], ['cardTray', cardTray], ['plyLean', plyLean], ['corrDividers', corrDividers], ['hex', v6PlyHexThrough],
  ['foldover', v6CorrFoldover], ['gable', v6CardGable], ['closedBox', () => closedBox(MATERIALS[0], 'tuck')], ['lines', linesBoard],
];

describe('a board as a graph', () => {
  it.each(DESIGNS)('%s: every root board round-trips with its points, ids and cut', (_n, make) => {
    const d = make();
    for (const id of d.order) {
      const p = d.panels[id];
      const g = boardGraph(p, !!parentConnection(d, id));
      if (!g) continue;
      const back = produce(d, (x) => void expect(graphBoard(x, id, g)).toBe(true));
      const s0 = p.sketch as Extract<typeof p.sketch, { kind: 'poly' }>, s1 = back.panels[id].sketch as typeof s0;
      expect(s1.edgeIds).toEqual(s0.edgeIds);
      expect(s1.pts.length).toBe(s0.pts.length);
      s1.pts.forEach((q, i) => {
        expect(q.x).toBeCloseTo(s0.pts[i].x, 9);
        expect(q.y).toBeCloseTo(s0.pts[i].y, 9);
        expect(q.curve ?? null).toBe(s0.pts[i].curve ?? null);
      });
      expect(JSON.stringify(prepareExport(back, 'nominal'))).toBe(JSON.stringify(prepareExport(d, 'nominal')));
    }
  });

  it('a split edge keeps its id on the first piece; the second gets a new one', () => {
    const d = createDesign(MATERIALS[3]);
    const id = addRootPanel(d, 0, 0, 100, 60);
    const g = boardGraph(d.panels[id])!;
    const e0 = d.panels[id].sketch.kind === 'poly' ? d.panels[id].sketch.edgeIds[0] : '';
    const mid = splitSeg(g, e0, 0.5)!;
    movePts(g, [mid], 0, -10);
    const back = produce(d, (x) => void expect(graphBoard(x, id, g)).toBe(true));
    const s = back.panels[id].sketch as Extract<Design['panels'][string]['sketch'], { kind: 'poly' }>;
    expect(s.pts).toHaveLength(5);
    expect(s.edgeIds).toContain(e0);
    expect(new Set(s.edgeIds).size).toBe(5);
    expect(s.edgeIds.filter((x) => !(d.panels[id].sketch as typeof s).edgeIds.includes(x))).toHaveLength(1);
  });

  it('an outline that is not one closed loop is refused, nothing changed', () => {
    const d = createDesign(MATERIALS[3]);
    const id = addRootPanel(d, 0, 0, 100, 60);
    const g = boardGraph(d.panels[id])!;
    delete g.segs[g.order[0]];
    g.order.shift();
    let ok = true;
    const after = produce(d, (x) => void (ok = graphBoard(x, id, g)));
    expect(ok).toBe(false);
    expect(after).toBe(d);
  });
});

describe('a shape as a graph', () => {
  const sets = (rings: { x: number; y: number }[][]) => rings.flat().map((q) => `${q.x.toFixed(6)},${q.y.toFixed(6)}`).sort();
  const shapes: Detail[] = [
    { id: 'a', shape: 'polygon', op: 'cut', cx: 40, cy: 30, w: 30, h: 20, path: { polys: [[{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0.2, y: 0.5 }, { x: -0.5, y: 0.5 }]] } },
    { id: 'b', shape: 'polygon', op: 'cut', cx: 40, cy: 30, w: 30, h: 20, rot: 30, path: { polys: [[{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0.5, y: 0.5 }, { x: -0.5, y: 0.2 }]] } },
    { id: 'c', shape: 'path', op: 'engrave', cx: 50, cy: 50, w: 40, h: 40, path: { polys: [[{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0.5, y: 0.5 }, { x: -0.5, y: 0.5 }], [{ x: -0.25, y: -0.25 }, { x: -0.25, y: 0.25 }, { x: 0.25, y: 0.25 }, { x: 0.25, y: -0.25 }]] } },
  ];
  it.each(shapes.map((s) => [s.id, s] as const))('%s: round-trips to the same outline in the same place', (_id, dt) => {
    const d = createDesign(MATERIALS[3]);
    const pid = addRootPanel(d, 0, 0, 120, 100);
    d.panels[pid].details.push(structuredClone(dt));
    const g = shapeGraph(dt)!;
    const before = shapeRings(g, dt.cx, dt.cy, dt.rot ?? 0);
    const back = produce(d, (x) => void expect(graphShape(x, dt.id, g)).toBe(true));
    const nd = back.panels[pid].details[0];
    expect(sets(shapeRings(shapeGraph(nd)!, nd.cx, nd.cy, nd.rot ?? 0))).toEqual(sets(before));
    expect(nd.cx).toBeCloseTo(dt.cx, 9);
    expect(nd.w).toBeCloseTo(dt.w, 9);
  });

  it('a rectangle, a rounded rectangle and a circle become graphs; a hole stays a hole', () => {
    const area = (dt: Detail) => shapeRings(shapeGraph(dt)!, 0, 0).reduce((s, r) => s + polygonArea(r), 0);
    expect(area({ id: 'r', shape: 'rect', op: 'cut', cx: 0, cy: 0, w: 30, h: 20 })).toBeCloseTo(600, 6);
    // (arcs are flattened to chords within 0.02 mm, a little inside the true corner)
    expect(area({ id: 'rr', shape: 'roundrect', op: 'cut', cx: 0, cy: 0, w: 30, h: 20, r: 5 })).toBeCloseTo(600 - (4 - Math.PI) * 25, 0);
    expect(Math.abs(area({ id: 'c', shape: 'circle', op: 'cut', cx: 0, cy: 0, w: 20, h: 20 }) / (Math.PI * 100) - 1)).toBeLessThan(0.005);
    expect(area(shapes[2])).toBeCloseTo(1600 - 400, 6);
    expect(shapeGraph({ id: 't', shape: 'text', op: 'engrave', cx: 0, cy: 0, w: 10, h: 5, text: { value: 'a', font: 'rubik', size: 5 } })).toBeNull();
  });
});
