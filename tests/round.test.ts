// Milestone 45 (CURVED_WALLS.md §3.1, §6.1): rounded corners (`curve: 'round'`) and round bases (a
// circle, a four-centre oval, a stadium), made of exact circular arcs.
import { describe, expect, it } from 'vitest';
import { addRoundedRect, addRoundPanel, addRootPanel, addTray, autoConnect, convertToPoints, createDesign, growPanel, moveVertex, setCornerRadius, setPanelSize, setPointRound, setRoundShape, solve } from '../src/model/ops';
import { isCurveKey, panelEdges, segLength, type EdgeSeg } from '../src/model/edges';
import { ovalRadii, roundPts } from '../src/model/round';
import { MATERIALS, bendDefaults, bendOf } from '../src/model/materials';
import { validate } from '../src/model/validate';
import { parseProject, serializeProject } from '../src/model/serialize';
import { prepareExport } from '../src/export/prepare';
import { sheetsToSvg } from '../src/export/svg';
import { sheetsToDxf } from '../src/export/dxf';
import { polygonArea } from '../src/geom/vec';
import type { Design } from '../src/model/types';

const [CARD, CORR16, CORR4, PLY] = MATERIALS;

const ring = (d: Design, id: string) => panelEdges(d.panels[id]);
const pts = (r: EdgeSeg[]) => r.map((e) => e.a);
const arcs = (r: EdgeSeg[]) => r.filter((e) => isCurveKey(e.key));
const straights = (r: EdgeSeg[]) => r.filter((e) => !isCurveKey(e.key));
const box = (r: EdgeSeg[]) => {
  const p = pts(r);
  return { x0: Math.min(...p.map((q) => q.x)), x1: Math.max(...p.map((q) => q.x)), y0: Math.min(...p.map((q) => q.y)), y1: Math.max(...p.map((q) => q.y)) };
};
/** The largest turn (degrees) between two neighbouring segments: small everywhere on a smooth outline. */
const maxTurn = (r: EdgeSeg[]) => {
  let m = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    const t = Math.atan2((a.b.x - a.a.x) * (b.b.y - b.a.y) - (a.b.y - a.a.y) * (b.b.x - b.a.x), (a.b.x - a.a.x) * (b.b.x - b.a.x) + (a.b.y - a.a.y) * (b.b.y - b.a.y));
    m = Math.max(m, Math.abs((t * 180) / Math.PI));
  }
  return m;
};

describe('round bases', () => {
  it('a circle: every point on one circle, filling its box, smooth all round', () => {
    const d = createDesign(PLY);
    const id = addRoundPanel(d, 0, 0, 80, 80, { shape: 'circle' })!;
    const r = ring(d, id);
    expect(straights(r)).toHaveLength(0);
    for (const q of pts(r)) expect(Math.hypot(q.x - 40, q.y - 40)).toBeCloseTo(40, 9);
    expect(box(r)).toEqual({ x0: 0, x1: 80, y0: 0, y1: 80 });
    expect([d.panels[id].w, d.panels[id].h]).toEqual([80, 80]);
    expect(maxTurn(r)).toBeLessThan(8);
    // its area within the flattening tolerance (0.02 mm)
    expect(Math.abs(polygonArea(pts(r)))).toBeCloseTo(Math.PI * 1600, -1);
    expect(validate(d)).toEqual([]);
  });

  it('a stadium: two straight sides, half-circle ends of half its depth', () => {
    const d = createDesign(PLY);
    const id = addRoundPanel(d, 0, 0, 120, 60, { shape: 'stadium' })!;
    const r = ring(d, id);
    expect(straights(r).map(segLength).sort()).toEqual([60, 60]);
    for (const q of pts(arcs(r))) expect(Math.min(Math.hypot(q.x - 30, q.y - 30), Math.hypot(q.x - 90, q.y - 30))).toBeCloseTo(30, 9);
    expect(box(r)).toEqual({ x0: 0, x1: 120, y0: 0, y1: 60 });
  });

  for (const [w, h] of [[120, 60], [60, 120]])
    it(`a four-centre oval ${w} × ${h}: its two radii meet tangentially and fill its box`, () => {
      const d = createDesign(PLY);
      const id = addRoundPanel(d, 0, 0, w, h, { shape: 'oval', rEnd: 20 })!;
      const r = ring(d, id);
      expect(straights(r)).toHaveLength(0);
      const b = box(r);
      expect(b.x0).toBeCloseTo(0, 9);
      expect(b.y0).toBeCloseTo(0, 9);
      expect(b.x1).toBeCloseTo(w, 9);
      expect(b.y1).toBeCloseTo(h, 9);
      // the radii of the four-centre oval: 20 at the ends, (40² + 30² − 20²) / (2·10) = 105 on the sides
      expect(ovalRadii(60, 30, 20)).toEqual({ r1: 20, r2: 105 });
      const s = d.panels[id].sketch as Extract<Design['panels'][string]['sketch'], { kind: 'poly' }>;
      expect(s.pts.map((q) => q.r).sort((x, y) => x! - y!)).toEqual([20, 20, 105, 105]);
      expect(maxTurn(r)).toBeLessThan(8);
      expect(validate(d)).toEqual([]);
    });

  it('an oval whose end radius reaches half its depth is a stadium; the default end radius is b²/a', () => {
    expect(ovalRadii(60, 30, 40)).toEqual({ r1: 30, r2: Infinity });
    const a = roundPts(120, 60, { shape: 'oval', rEnd: 30 }), b = roundPts(120, 60, { shape: 'stadium' });
    expect(a).toEqual(b);
    const d = createDesign(PLY);
    const id = addRoundPanel(d, 0, 0, 120, 60, { shape: 'oval' })!;
    expect((d.panels[id].sketch as { round?: { rEnd?: number } }).round?.rEnd).toBe(15);
  });

  it('its card: a new size or shape makes it again; a circle stays as wide as it is deep; points edited make it an outline of points', () => {
    const d = createDesign(PLY);
    const id = addRoundPanel(d, 0, 0, 80, 80, { shape: 'circle' })!;
    setPanelSize(d, id, 100, undefined);
    expect([d.panels[id].w, d.panels[id].h]).toEqual([100, 100]);
    setRoundShape(d, id, { shape: 'oval', h: 60 });
    expect([d.panels[id].w, d.panels[id].h].map((x) => Math.round(x * 1e6) / 1e6)).toEqual([100, 60]);
    setRoundShape(d, id, { rEnd: 25 });
    expect((d.panels[id].sketch as { round?: unknown }).round).toEqual({ shape: 'oval', rEnd: 25 });
    expect(convertToPoints(d, id)).toBe(true);
    expect((d.panels[id].sketch as { round?: unknown }).round).toBeUndefined();
    const id2 = addRoundPanel(d, 300, 0, 80, 80, { shape: 'circle' })!;
    moveVertex(d, id2, 0, { x: -5, y: -5 });
    expect((d.panels[id2].sketch as { round?: unknown }).round).toBeUndefined();
  });

  it('save and load keep the shape and the same export', () => {
    const d = createDesign(CARD);
    addRoundPanel(d, 0, 0, 120, 70, { shape: 'oval', rEnd: 22 });
    addRoundedRect(d, 200, 0, 90, 60, 12);
    const back = parseProject(serializeProject(d));
    expect(back.panels).toEqual(d.panels);
    const ex = (x: Design) => sheetsToSvg(prepareExport(x).sheets);
    expect(ex(back)).toBe(ex(d));
    expect(() => sheetsToDxf(prepareExport(d).sheets)).not.toThrow();
  });
});

describe('rounded corners', () => {
  it('a rounded rectangle: straight sides shortened by r at each end, quarter arcs of r', () => {
    const d = createDesign(PLY);
    const id = addRoundedRect(d, 0, 0, 100, 60, 15)!;
    const r = ring(d, id);
    expect(straights(r).map((e) => [e.key, Math.round(segLength(e) * 1e9) / 1e9])).toEqual([
      ['e0', 70],
      ['e1', 30],
      ['e2', 70],
      ['e3', 30],
    ]);
    expect(box(r)).toEqual({ x0: 0, x1: 100, y0: 0, y1: 60 });
    // the arc of the corner at the start of e1 (100, 0) is keyed e1^~n, centred 15 in from both sides
    for (const e of r.filter((x) => x.key.startsWith('e1^~'))) expect(Math.hypot(e.a.x - 85, e.a.y - 15)).toBeCloseTo(15, 9);
  });

  it('corners too big for their edge are made smaller so their arcs meet', () => {
    const d = createDesign(PLY);
    const id = addRoundedRect(d, 0, 0, 40, 20, 15)!;
    // the short sides take two arcs of at most 10 each: a stadium
    expect(straights(ring(d, id)).map(segLength).sort()).toEqual([20, 20]);
  });

  it('one corner rounded, then all of them changed; a corner again', () => {
    const d = createDesign(PLY);
    const id = addRootPanel(d, 0, 0, 100, 60);
    expect(setPointRound(d, id, 2, 20)).toBe(true);
    expect(arcs(ring(d, id)).length).toBeGreaterThan(0);
    expect(straights(ring(d, id)).map(segLength).sort((x, y) => x - y)).toEqual([40, 60, 80, 100]);
    setCornerRadius(d, id, 10);
    expect(straights(ring(d, id)).map(segLength).sort((x, y) => x - y)).toEqual([50, 60, 90, 100]);
    setPointRound(d, id, 2, null);
    expect(arcs(ring(d, id))).toHaveLength(0);
  });

  it('a corner beside a wall can be rounded: the wall stays on its (shorter) edge', () => {
    const d = createDesign(PLY);
    const id = addRootPanel(d, 0, 0, 100, 60);
    const w = growPanel(d, id, 0, { height: 40, angle: 90, dir: 'up', kind: 'finger' })!.panelId;
    expect(setPointRound(d, id, 1, 15)).toBe(true);
    solve(d);
    expect(d.panels[w].w).toBeCloseTo(85, 9);
  });

  it('a tray on a rounded rectangle stands walls on its straight sides only; a circle gets none yet (curved walls: milestone 46)', () => {
    const d = createDesign(CORR16);
    const rr = addRoundedRect(d, 0, 0, 120, 80, 15)!;
    addTray(d, rr, 40);
    autoConnect(d);
    const walls = (id: string) => Object.values(d.connections).filter((c) => c.grown && c.a.panelId === id);
    expect(walls(rr)).toHaveLength(4);
    const c = addRoundPanel(d, 300, 0, 80, 80, { shape: 'circle' })!;
    addTray(d, c, 40);
    expect(walls(c)).toHaveLength(0);
  });
});

describe('bend limits', () => {
  it('each material has starting values from the study; its own replace them', () => {
    expect(bendOf(CARD)).toMatchObject({ smoothR: 10, patternR: 4 });
    expect(bendOf(CORR16)).toMatchObject({ smoothR: 25, patternR: 8 });
    expect(bendOf(CORR4)).toMatchObject({ smoothR: 60, patternR: 20 });
    expect(bendOf(PLY)).toMatchObject({ smoothR: 150, patternR: 30 });
    expect(bendOf({ ...PLY, bend: { ...bendDefaults('plywood', 3), patternR: 22 } }).patternR).toBe(22);
  });
});
