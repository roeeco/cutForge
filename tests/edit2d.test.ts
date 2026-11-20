// Milestone 104 (DIELINE_DNA_PLAN.md D0b-2): editing shapes, boards, walls and lines through the sketch engine.
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { MATERIALS } from '../src/model/materials';
import { addLine, addRootPanel, addTray, autoConnect, createDesign, findDetail, updateDetail } from '../src/model/ops';
import { deletePoint, insertPoint, movePoint, setCorners, setSegmentLength, targetOf, writeTarget, type Edit2D } from '../src/sketch/edit2d';
import { shapeRings } from '../src/sketch/cutforge';
import { checkDesign } from '../src/model/check';
import { polygonArea } from '../src/geom/vec';
import type { Design, Detail } from '../src/model/types';

const PLY = MATERIALS[3];
function board(): { d: Design; id: string } {
  const d = createDesign(PLY);
  const id = addRootPanel(d, 0, 0, 200, 140);
  return { d, id };
}
const withShape = (dt: Partial<Detail>) => {
  const { d, id } = board();
  d.panels[id].details.push({ id: 'w', shape: 'rect', op: 'cut', cx: 100, cy: 70, w: 60, h: 40, ...dt } as Detail);
  return { d, id, t: { kind: 'shape', id: 'w', panelId: id } as Edit2D };
};
const ringsOf = (d: Design) => {
  const dt = findDetail(d, 'w')!.detail;
  return shapeRings(targetOf(d, { kind: 'shape', id: 'w', panelId: findDetail(d, 'w')!.panel.id })!.g, dt.cx, dt.cy, dt.rot ?? 0);
};
const area = (rings: { x: number; y: number }[][]) => rings.reduce((s, r) => s + polygonArea(r), 0);

describe('a shape', () => {
  it.each([0, 30])('a rect cut-out: one corner dragged, the others stay (turned %i°)', (rot) => {
    const { d, t } = withShape({ rot });
    const tg = targetOf(d, t)!;
    const corners = Object.fromEntries(Object.entries(tg.g.pts).map(([k, q]) => [k, tg.toBoard(q)]));
    const to = { x: corners.p2.x + 10, y: corners.p2.y + 6 };
    const e = produce(d, (x) => void expect(movePoint(x, t, 'p2', to)).toBe(true));
    const dt = findDetail(e, 'w')!.detail;
    expect(dt.shape).toBe('polygon');
    expect(dt.sketch).toBeTruthy();
    const after = targetOf(e, t)!;
    for (const k of ['p0', 'p1', 'p3']) {
      const q = after.toBoard(after.g.pts[k]);
      expect(q.x).toBeCloseTo(corners[k].x, 9);
      expect(q.y).toBeCloseTo(corners[k].y, 9);
    }
    const moved = after.toBoard(after.g.pts.p2);
    expect(moved.x).toBeCloseTo(to.x, 9);
    expect(moved.y).toBeCloseTo(to.y, 9);
  });

  it('a rounded rectangle keeps its radius as corners; a circle stays round', () => {
    const r = withShape({ shape: 'roundrect', r: 8 });
    const g = targetOf(r.d, r.t)!.g;
    expect(Object.values(g.pts).every((q) => q.r === 8)).toBe(true);
    const c = withShape({ shape: 'circle', w: 40, h: 40 });
    expect(Math.abs(area(ringsOf(c.d)) / (Math.PI * 400) - 1)).toBeLessThan(0.005);
  });

  it('a fillet made on its corners is kept through saving and opening, and a resize', () => {
    const { d, t } = withShape({});
    const e = produce(d, (x) => void expect(setCorners(x, t, ['p0', 'p1', 'p2', 'p3'], 'round', 6)).toBe(0));
    const saved = JSON.parse(JSON.stringify(e));
    checkDesign(saved);
    const dt = findDetail(saved, 'w')!.detail;
    expect(Object.values(dt.sketch!.pts).every((q) => q.r === 6)).toBe(true);
    const bigger = produce(saved as Design, (x) => void updateDetail(x, 'w', { w: 120, h: 80 }));
    const rings = ringsOf(bigger);
    const xs = rings.flat().map((q) => q.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(120, 6);
  });

  it('+ adds a point, Delete removes one; never fewer than three', () => {
    const { d, t } = withShape({});
    let id: string | null = null;
    const e = produce(d, (x) => void (id = insertPoint(x, t, 'g0')));
    expect(id).toBeTruthy();
    expect(Object.keys(targetOf(e, t)!.g.pts)).toHaveLength(5);
    const f = produce(e, (x) => void expect(deletePoint(x, t, id!)).toBe(true));
    expect(Object.keys(targetOf(f, t)!.g.pts)).toHaveLength(4);
    const tri = withShape({ shape: 'polygon', path: { polys: [[{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0, y: 0.5 }]] } });
    expect(produce(tri.d, (x) => void expect(deletePoint(x, tri.t, 'p0')).toBe(false))).toBe(tri.d);
  });
});

describe('a board', () => {
  it('a typed length moves only the far end; every edge keeps its id', () => {
    const { d, id } = board();
    const t: Edit2D = { kind: 'board', id, panelId: id };
    const ids0 = (d.panels[id].sketch as { edgeIds: string[] }).edgeIds;
    const e = produce(d, (x) => void expect(setSegmentLength(x, t, ids0[0], 150)).toBe(true));
    const s = e.panels[id].sketch as { edgeIds: string[]; pts: { x: number; y: number }[] };
    expect(s.edgeIds).toEqual(ids0);
    const xs = s.pts.map((q) => q.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(200, 6);
    expect(s.pts.some((q) => Math.abs(q.x - 150) < 1e-6 || Math.abs(q.x - 50) < 1e-6)).toBe(true);
  });

  it('an edit that opens the outline is refused, nothing changed', () => {
    const { d, id } = board();
    const t: Edit2D = { kind: 'board', id, panelId: id };
    const g = targetOf(d, t)!.g;
    delete g.segs[g.order[1]];
    g.order.splice(1, 1);
    let ok = true;
    expect(produce(d, (x) => void (ok = writeTarget(x, t, g)))).toBe(d);
    expect(ok).toBe(false);
  });

  it("a wall's top corner moves; its bottom corners do not", () => {
    const d = createDesign(PLY);
    const base = addRootPanel(d, 0, 0, 120, 80);
    addTray(d, base, 50);
    autoConnect(d);
    const wall = Object.values(d.connections).find((c) => c.grown && c.a.panelId === base)!.b.panelId;
    const t: Edit2D = { kind: 'board', id: wall, panelId: wall };
    const W = d.panels[wall];
    const e = produce(d, (x) => void expect(movePoint(x, t, 'tr', { x: W.w, y: W.h + 12 })).toBe(true));
    expect((e.panels[wall].sketch as { corners?: Record<string, { dy: number }> }).corners?.tr?.dy).toBeCloseTo(12, 6);
    expect(produce(d, (x) => void expect(movePoint(x, t, 'bl', { x: 5, y: 0 })).toBe(false))).toBe(d);
  });
});

describe('a line', () => {
  it('a point moved keeps the line\'s type and group', () => {
    const { d, id } = board();
    const lid = addLine(d, id, [{ x: 20, y: 20 }, { x: 100, y: 20 }, { x: 160, y: 60 }], 'perf', 'grp')!;
    const t: Edit2D = { kind: 'line', id: lid, panelId: id };
    const e = produce(d, (x) => void expect(movePoint(x, t, 'q1', { x: 100, y: 40 })).toBe(true));
    const ln = e.panels[id].lines!.find((l) => l.id === lid)!;
    expect(ln.type).toBe('perf');
    expect(ln.group).toBe('grp');
    expect(ln.pts[1]).toEqual({ x: 100, y: 40 });
    expect(ln.pts).toHaveLength(3);
  });
});
