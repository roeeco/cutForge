// Outline editing: auto-curve points, snapping a dragged point, grid and smart snapping toggles.
import { describe, expect, it } from 'vitest';
import { addRootPanel, autoConnect, createDesign, curveBlocked, growPanel, moveVertex, pointCurve, setPointCurve, solve } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { isCurveKey, panelEdges, segLength, sketchRing } from '../src/model/edges';
import { edgeHasRoom } from '../src/model/adapt';
import { findOpenSeams } from '../src/model/seams';
import { outlineTargets, snapOutlinePoint } from '../src/model/snap';
import { buildPieces } from '../src/model/pieces';
import { validate } from '../src/model/validate';
import { parseProject, serializeProject } from '../src/model/serialize';
import { gridSnap, useStore } from '../src/store/store';
import { polygonArea } from '../src/geom/vec';

const PLY = MATERIALS[3];
const CARD = MATERIALS[0];

const dir = (e: { a: { x: number; y: number }; b: { x: number; y: number } }) => Math.atan2(e.b.y - e.a.y, e.b.x - e.a.x);

describe('auto-curve points', () => {
  it('a base corner becomes a smooth curve through it; its edges are flattened, the others stay', () => {
    const d = createDesign(PLY);
    const b = addRootPanel(d, 0, 0, 100, 60);
    const before = polygonArea(sketchRing(d.panels[b]).map((e) => e.a));
    expect(setPointCurve(d, b, 2, true)).toBe(true);
    const p = d.panels[b];
    expect(pointCurve(d, b, 2)).toBe(true);
    const ring = sketchRing(p);
    // the two edges at vertex 2 are curves, the other two straight
    expect(ring.filter((e) => !isCurveKey(e.key)).map((e) => e.key).sort()).toEqual(['e0', 'e3']);
    expect(ring.filter((e) => e.key.startsWith('e1~')).length).toBeGreaterThan(4);
    // smooth through the point (it was a 90° corner): the flattened segments either side turn by a few degrees only
    const i = ring.findIndex((e) => e.key === 'e2~0');
    const turn = Math.abs(dir(ring[i]) - dir(ring[i - 1]));
    expect(Math.min(turn, 2 * Math.PI - turn)).toBeLessThan((8 * Math.PI) / 180);
    // it bulges out at the corner's side: the panel's box still holds the whole outline, from 0
    expect(Math.min(...ring.map((e) => e.a.x))).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.min(...ring.map((e) => e.a.y))).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.max(...ring.map((e) => e.a.x))).toBeLessThanOrEqual(p.w + 1e-9);
    expect(Math.max(...ring.map((e) => e.a.y))).toBeLessThanOrEqual(p.h + 1e-9);
    expect(Math.abs(polygonArea(ring.map((e) => e.a)) - before)).toBeGreaterThan(1);
    // and back to a corner
    expect(setPointCurve(d, b, 2, false)).toBe(true);
    expect(sketchRing(d.panels[b]).every((e) => !isCurveKey(e.key))).toBe(true);
  });

  it('curves are not growable or joined, and export as one piece', () => {
    const d = createDesign(PLY);
    const b = addRootPanel(d, 0, 0, 100, 60);
    setPointCurve(d, b, 1, true);
    const curved = panelEdges(d.panels[b]).filter((e) => isCurveKey(e.key));
    expect(curved.length).toBeGreaterThan(8);
    expect(curved.some((e) => edgeHasRoom(d, b, e.key))).toBe(false);
    expect(growPanel(d, b, curved[3].key, { height: 30, angle: 90, dir: 'up', kind: 'finger' })).toBeNull();
    // a wall on the straight edge opposite is fine, and nothing joins the curve
    growPanel(d, b, 'e3', { height: 30, angle: 90, dir: 'up', kind: 'finger' });
    autoConnect(d);
    expect(findOpenSeams(d).some((s) => isCurveKey(s.a.edge) || isCurveKey(s.b.edge))).toBe(false);
    expect(Object.values(d.connections).some((c) => isCurveKey(c.a.edge) || isCurveKey(c.b.edge))).toBe(false);
    expect(validate(d)).toEqual([]);
    expect(buildPieces(d)).toHaveLength(2);
  });

  it('a point beside a joined edge cannot be curved', () => {
    const d = createDesign(PLY);
    const b = addRootPanel(d, 0, 0, 100, 60);
    growPanel(d, b, 'e1', { height: 30, angle: 90, dir: 'up', kind: 'finger' });
    expect(curveBlocked(d, b, 1)).toBe('joined');
    expect(curveBlocked(d, b, 2)).toBe('joined');
    expect(curveBlocked(d, b, 0)).toBeNull();
    expect(setPointCurve(d, b, 2, true)).toBe(false);
    expect(pointCurve(d, b, 2)).toBe(false);
  });

  it("a wall's top corner as a curve: the attached bottom stays straight", () => {
    const d = createDesign(CARD);
    const b = addRootPanel(d, 0, 0, 80, 60);
    const w = growPanel(d, b, 'e0', { height: 50, angle: 90, dir: 'up', kind: 'fold' })!.panelId;
    expect(setPointCurve(d, w, 'tr', true)).toBe(true);
    const ring = sketchRing(d.panels[w]);
    expect(ring.find((e) => e.key === 'e0')).toBeTruthy();
    expect(ring.some((e) => e.key.startsWith('e1~')) && ring.some((e) => e.key.startsWith('e2~'))).toBe(true);
    expect(Object.values(d.connections).every((c) => !c.broken)).toBe(true);
    expect(validate(d)).toEqual([]);
    // a curve with no offset keeps its corner entry; moving the vertex keeps the curve
    expect(d.panels[w].sketch).toMatchObject({ corners: { tr: { dx: 0, dy: 0, curve: 'auto' } } });
  });

  it('moving a curve point keeps it a curve; it survives save and load', () => {
    const d = createDesign(PLY);
    const b = addRootPanel(d, 0, 0, 100, 60);
    setPointCurve(d, b, 2, true);
    moveVertex(d, b, 2, { x: 110, y: 70 });
    expect(pointCurve(d, b, 2)).toBe(true);
    const back = parseProject(serializeProject(d));
    solve(back);
    expect(pointCurve(back, b, 2)).toBe(true);
    expect(sketchRing(back.panels[b]).map((e) => e.key)).toEqual(sketchRing(d.panels[b]).map((e) => e.key));
  });
});

describe('snapping a dragged outline point', () => {
  it('to a neighbouring floor panel corner, onto its edge, and in line with its own points', () => {
    const d = createDesign(PLY);
    const a = addRootPanel(d, 0, 0, 100, 60);
    addRootPanel(d, 103, 0, 50, 40);
    solve(d);
    const A = d.panels[a];
    // the outline's local axes: world x along u; find where the neighbour's corner is in A's coordinates
    const tg = outlineTargets(d, a, A.sketch.kind === 'poly' ? A.sketch.pts[1] : { x: 0, y: 0 });
    const nb = tg.corners.filter((q) => q.x > 100.5);
    expect(nb.length).toBeGreaterThan(0);
    const corner = nb.sort((p, q) => p.x - q.x || p.y - q.y)[0];
    // near the corner: lands on it
    const c = snapOutlinePoint(tg, { x: corner.x - 0.6, y: corner.y + 0.4 }, 1.5);
    expect(c.kind).toBe('corner');
    expect(c.p).toEqual(corner);
    // near the neighbour's left edge, away from its corners: onto the edge
    const e = snapOutlinePoint(tg, { x: 102.4, y: 20.7 }, 1.5);
    expect(e.kind).toBe('edge');
    expect(e.p.x).toBeCloseTo(103, 6);
    expect(e.p.y).toBeCloseTo(20.7, 6);
    // far from anything else: x in line with its own point (100, 60)
    const al = snapOutlinePoint(tg, { x: 99.3, y: -25 }, 1.5);
    expect(al.kind).toBe('align');
    expect(al.p.x).toBe(100);
    expect(al.fixed).toEqual({ x: true, y: false });
  });

  it("does not snap to itself or along its own edges", () => {
    const d = createDesign(PLY);
    const a = addRootPanel(d, 0, 0, 100, 60);
    const A = d.panels[a];
    const moving = A.sketch.kind === 'poly' ? A.sketch.pts[1] : { x: 0, y: 0 };
    const tg = outlineTargets(d, a, moving);
    expect(tg.corners.some((q) => q.x === moving.x && q.y === moving.y)).toBe(false);
    expect(tg.edges).toHaveLength(2);
  });
});

describe('grid and smart snapping toggles', () => {
  it('grid off (or Alt) leaves positions at 0.01 mm; on, they round to the step', () => {
    const prefs = useStore.getState().viewPrefs;
    useStore.getState().setPrefs({ grid: true, gridStep: 5 });
    expect(gridSnap(12.3)).toBe(10);
    expect(gridSnap(12.3, { altKey: true })).toBe(12.3);
    useStore.getState().setPrefs({ grid: false });
    expect(gridSnap(12.345)).toBe(12.35);
    useStore.getState().setPrefs(prefs);
  });
});

void segLength;
