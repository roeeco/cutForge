// Milestone 9: Add/Cut shapes on outlines, edge pieces, wall sets, fragments.
import { describe, expect, it } from 'vitest';
import { addDetail, addPolygonPanel, addRootPanel, autoConnect, createDesign, deleteVertex, growPanel, insertVertex, solve, updateDetail } from '../src/model/ops';
import { findEdge, panelEdges, segLength } from '../src/model/edges';
import { ownOutline, holeCuts } from '../src/model/outline';
import { panelNotches } from '../src/model/geometry';
import { buildPieces } from '../src/model/pieces';
import { validate } from '../src/model/validate';
import { MATERIALS } from '../src/model/materials';
import { maxOverlap } from './solid';
import { polygonArea } from '../src/geom/vec';
import type { Design } from '../src/model/types';

const PLY = MATERIALS[3];
const t = PLY.thickness;
const area = (d: Design, id: string) => ownOutline(d.panels[id]).rings.reduce((s, r) => s + polygonArea(r.map((e) => e.a)), 0);
const keys = (d: Design, id: string) => panelEdges(d.panels[id]).map((e) => e.key);

describe('Add and Cut shapes on a panel outline', () => {
  it('a Cut inside is a hole (arcs kept); across the edge it is a notch', () => {
    const d = createDesign(PLY);
    const id = addRootPanel(d, 0, 0, 100, 60);
    addDetail(d, id, 'circle', 'cut', 50, 30, 20, 20);
    solve(d);
    expect(keys(d, id)).toEqual(['e0', 'e1', 'e2', 'e3']);
    expect(holeCuts(d.panels[id])[0].contours[0].segs[0].k).toBe('A');
    // a rectangle across the bottom edge: a notch, and the bottom edge is in two pieces
    const n = addDetail(d, id, 'rect', 'cut', 30, 0, 20, 20)!;
    solve(d);
    // up the notch's left side (segment 3), along its top (2), down its right side (1)
    expect(keys(d, id)).toEqual(['e0#0', `${n}.3`, `${n}.2`, `${n}.1`, 'e0#1', 'e1', 'e2', 'e3']);
    expect(area(d, id)).toBeCloseTo(100 * 60 - 20 * 10, 6);
    expect(holeCuts(d.panels[id]).map((h) => h.dt.id)).not.toContain(n);
    // the pieces are measured from their own start
    const p1 = findEdge(d.panels[id], 'e0#1')!;
    expect(p1.a).toEqual({ x: 40, y: 0 });
    expect(segLength(p1)).toBeCloseTo(60, 9);
    // moving the shape inside turns it back into a hole
    updateDetail(d, n, { cy: 30, cx: 20 });
    solve(d);
    expect(keys(d, id)).toEqual(['e0', 'e1', 'e2', 'e3']);
  });

  it('an Add joins the outline; Cuts win over Adds whatever the order', () => {
    const d = createDesign(PLY);
    const id = addRootPanel(d, 0, 0, 100, 60);
    const c = addDetail(d, id, 'rect', 'cut', 50, 70, 10, 10)!; // drawn first, across the top of the tab
    const a = addDetail(d, id, 'rect', 'add', 50, 65, 40, 10)!; // a tab on top, drawn later
    const h = addDetail(d, id, 'rect', 'cut', 50, 60, 6, 6)!; // inside the panel and the tab: a hole
    solve(d);
    expect(area(d, id)).toBeCloseTo(100 * 60 + 40 * 10 - 10 * 5, 6);
    expect(holeCuts(d.panels[id]).map((x) => x.dt.id)).toEqual([h]);
    // its two sides and its top, which the cut splits in two
    expect(keys(d, id).filter((k) => k.startsWith(a))).toHaveLength(4);
    expect(keys(d, id).some((k) => k.startsWith(c))).toBe(true);
    expect(validate(d).filter((i) => i.key === 'val.holeOutside')).toEqual([]);
    // an Add that misses the panel is flagged
    addDetail(d, id, 'rect', 'add', 300, 300, 10, 10);
    solve(d);
    expect(validate(d).filter((i) => i.key === 'val.holeOutside')).toHaveLength(1);
  });

  it('every straight edge from a shape is growable', () => {
    const d = createDesign(PLY);
    const id = addRootPanel(d, 0, 0, 100, 60);
    const a = addDetail(d, id, 'rect', 'add', 50, 70, 40, 20)!;
    solve(d);
    const top = panelEdges(d.panels[id]).find((e) => e.key.startsWith(a) && Math.abs(e.a.y - 80) < 1e-6)!;
    const r = growPanel(d, id, top.key, { height: 20, angle: 90, dir: 'up', kind: 'finger' })!;
    expect(d.panels[r.panelId].w).toBeCloseTo(40, 6);
  });
});

/** Plywood base with finger walls on all four edges. */
function box() {
  const d = createDesign(PLY);
  const base = addRootPanel(d, 0, 0, 120, 80);
  const walls = [0, 1, 2, 3].map((e) => growPanel(d, base, e, { height: 40, angle: 90, dir: 'up', kind: 'finger' })!.panelId);
  autoConnect(d);
  return { d, base, walls };
}

describe('walls follow the cut base', () => {
  it('L-notch: the walls on the cut edges get shorter, the new edges can grow walls', () => {
    const { d, base, walls } = box();
    const n = addDetail(d, base, 'rect', 'cut', 120, 80, 60, 40)!; // removes x 90–120, y 60–80
    solve(d);
    autoConnect(d);
    expect(d.panels[walls[1]].w).toBeCloseTo(60, 6);
    expect(d.panels[walls[2]].w).toBeCloseTo(90, 6);
    const shapeEdges = panelEdges(d.panels[base]).filter((e) => e.key.startsWith(n));
    expect(shapeEdges).toHaveLength(2);
    for (const c of Object.values(d.connections)) expect(c.broken).toBe(false);
    expect(maxOverlap(d, [0, 0, -82], [122, 44, 2], 0.7)).toBe(1);
  });

  it('a notch in the middle of a walled edge splits the wall; the fingers re-lay on both parts', () => {
    const { d, base, walls } = box();
    const front = walls[0];
    addDetail(d, front, 'circle', 'cut', 100, 20, 8, 8); // a hole that belongs on the right half
    const n = addDetail(d, base, 'rect', 'cut', 60, 0, 20, 30)!;
    solve(d);
    autoConnect(d);
    expect(keys(d, base).filter((k) => k.startsWith('e0'))).toEqual(['e0#0', 'e0#1']);
    const second = `${front}~1`;
    expect(d.panels[second]).toBeTruthy();
    expect(d.panels[front].w).toBeCloseTo(50, 6);
    expect(d.panels[second].w).toBeCloseTo(50, 6);
    expect(d.panels[second].h).toBe(d.panels[front].h);
    // the hole moved to the wall whose part contains its centre
    expect(d.panels[front].details).toHaveLength(0);
    expect(d.panels[second].details[0].cx).toBeCloseTo(100 - 70, 9);
    // both base joints are laid out on their own piece
    const grown = Object.values(d.connections).filter((c) => c.grown && (c.b.panelId === front || c.b.panelId === second));
    expect(grown.map((c) => c.a.edge).sort()).toEqual(['e0', 'e0#1']);
    for (const c of grown) {
      expect(c.broken).toBe(false);
      expect(c.kind).toBe('finger');
    }
    expect(panelNotches(d, d.panels[base])['e0#0'].length).toBeGreaterThan(0);
    expect(panelNotches(d, d.panels[base])['e0#1'].length).toBeGreaterThan(0);
    expect(panelNotches(d, d.panels[second]).e0.length).toBeGreaterThan(0);
    // the new shape edges grow nothing by themselves; the split wall joins its corner
    expect(Object.values(d.connections).filter((c) => !c.grown && (c.a.panelId === second || c.b.panelId === second)).length).toBeGreaterThan(0);
    expect(maxOverlap(d, [0, 0, -82], [122, 44, 2], 0.7)).toBe(1);
    expect(validate(d).filter((i) => i.key === 'val.broken' || i.key === 'val.overlap')).toEqual([]);
    // removing the notch merges the set back: the derived wall had a shape, so it is kept and flagged
    d.panels[base].details = d.panels[base].details.filter((x) => x.id !== n);
    solve(d);
    expect(d.panels[second].broken).toBe(true);
    expect(validate(d).some((i) => i.key === 'val.orphan')).toBe(true);
  });

  it('a derived wall with no shapes goes away when its piece does', () => {
    const { d, base, walls } = box();
    const n = addDetail(d, base, 'rect', 'cut', 60, 0, 20, 30)!;
    solve(d);
    expect(d.panels[`${walls[0]}~1`]).toBeTruthy();
    updateDetail(d, n, { cy: 40 }); // into the middle: a hole now
    solve(d);
    expect(d.panels[`${walls[0]}~1`]).toBeUndefined();
    expect(d.panels[walls[0]].w).toBeCloseTo(120, 6);
  });

  it('a notch at a jointed corner re-lays the corner fingers, or flags too little contact', () => {
    const { d, walls } = box();
    // a notch in the front wall's right edge, near the top
    addDetail(d, walls[0], 'rect', 'cut', 120, 30, 10, 12);
    solve(d);
    autoConnect(d);
    const corner = Object.values(d.connections).find((c) => !c.grown && [c.a.panelId, c.b.panelId].includes(walls[0]) && [c.a.panelId, c.b.panelId].includes(walls[1]))!;
    expect(corner.broken).toBe(false);
    expect(maxOverlap(d, [100, 0, -82], [122, 44, 2], 0.5)).toBe(1);
    // nearly all of that edge cut away: too little contact left
    addDetail(d, walls[0], 'rect', 'cut', 120, 21.5, 10, 37);
    solve(d);
    autoConnect(d);
    const c2 = Object.values(d.connections).find((c) => !c.grown && [c.a.panelId, c.b.panelId].includes(walls[0]) && [c.a.panelId, c.b.panelId].includes(walls[1]));
    expect(c2?.broken && c2.thin).toBe(true);
    expect(validate(d).some((i) => i.key === 'val.littleContact')).toBe(true);
  });
});

describe('vertex insert and delete on a walled base', () => {
  it('insert splits the wall (shapes go to the half with their centre); delete merges them back', () => {
    const d = createDesign(PLY);
    const base = addPolygonPanel(d, 0, 0, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }])!;
    const w = growPanel(d, base, 'e0', { height: 30, angle: 90, dir: 'up', kind: 'finger' })!.panelId;
    addDetail(d, w, 'circle', 'cut', 20, 15, 6, 6);
    addDetail(d, w, 'rect', 'cut', 80, 15, 6, 6);
    const nid = insertVertex(d, base, 0, 0.5)!;
    autoConnect(d);
    const w2 = Object.values(d.connections).find((c) => c.grown && c.a.edge === nid)!.b.panelId;
    expect(d.panels[w].w).toBeCloseTo(50, 9);
    expect(d.panels[w2].w).toBeCloseTo(50, 9);
    expect(d.panels[w].details.map((x) => x.shape)).toEqual(['circle']);
    expect(d.panels[w2].details.map((x) => [x.shape, x.cx])).toEqual([['rect', 30]]);
    expect(maxOverlap(d, [0, 0, -62], [102, 34, 2], 0.6)).toBe(1);
    // drag the new vertex out to make a bent front, then delete it: one wall again with both shapes
    expect(deleteVertex(d, base, 1)).toBe(true);
    autoConnect(d);
    expect(d.panels[w2]).toBeUndefined();
    expect(d.panels[w].w).toBeCloseTo(100, 9);
    expect(d.panels[w].details.map((x) => [x.shape, Math.round(x.cx)])).toEqual([['circle', 20], ['rect', 80]]);
  });
});

describe('fragments', () => {
  it('a cut that splits a panel makes two pieces with a warning', () => {
    const d = createDesign(PLY);
    const id = addRootPanel(d, 0, 0, 100, 60);
    addDetail(d, id, 'rect', 'cut', 50, 30, 10, 80);
    solve(d);
    expect(ownOutline(d.panels[id]).rings).toHaveLength(2);
    const pieces = buildPieces(d);
    expect(pieces.map((p) => [p.key, p.frag])).toEqual([
      [id, { i: 1, n: 2 }],
      [`${id}@2`, { i: 2, n: 2 }],
    ]);
    expect(validate(d).filter((i) => i.key === 'val.split')).toHaveLength(1);
  });

  it('a sliver is flagged', () => {
    const d = createDesign(PLY);
    const id = addRootPanel(d, 0, 0, 100, 60);
    addDetail(d, id, 'rect', 'cut', 50, 30.5, 120, 59); // leaves 1 mm strips top and bottom... and splits
    solve(d);
    expect(validate(d).some((i) => i.key === 'val.sliver')).toBe(true);
  });
});
