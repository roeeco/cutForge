// Milestone 19: adaptive grow — partial width, height snapping, trimming to neighbours.
import { describe, expect, it } from 'vitest';
import { addRootPanel, autoConnect, createDesign, growPanel, parentConnection, seatingOf, solve } from '../src/model/ops';
import { adaptiveSketch, edgeFreeSpans, ghostNeighbours, ghostPanel, heightTargets, spanTargets } from '../src/model/adapt';
import { connectionsFor, MATERIALS } from '../src/model/materials';
import { fromHinge } from '../src/model/hinge';
import { validate } from '../src/model/validate';
import { buildPieces } from '../src/model/pieces';
import { panelEdges } from '../src/model/edges';
import { maxOverlap } from './solid';
import type { Design } from '../src/model/types';

const [CARD, , , PLY] = MATERIALS;
const edit = (d: Design, f: (d: Design) => unknown) => {
  f(d);
  solve(d);
  autoConnect(d);
};
const between = (d: Design, a: string, b: string) => Object.values(d.connections).filter((c) => (c.a.panelId === a && c.b.panelId === b) || (c.a.panelId === b && c.b.panelId === a));

describe('partial width', () => {
  it('a half-width wall on a base edge has fingers only over its span, with no overlap; a second one takes the rest', () => {
    const d = createDesign(PLY);
    const base = addRootPanel(d, 0, 0, 120, 80);
    let w1 = '';
    edit(d, (x) => void (w1 = growPanel(x, base, 'e0', { height: 40, angle: 90, dir: 'up', kind: 'finger', span: [0, 60] })!.panelId));
    expect(d.panels[w1].w).toBe(60);
    const c = parentConnection(d, w1)!;
    expect(c.span).toEqual([0, 60]);
    // the base's notches on e0 stay within [0, 60]
    const notches = c.geom!.edges.find((e) => e.panelId === base && e.edge === 'e0')!.notches;
    expect(Math.max(...notches.map((n) => n.s1))).toBeLessThanOrEqual(60 + 1e-9);
    expect(edgeFreeSpans(d, base, 'e0')).toEqual([[60, 120]]);
    expect(maxOverlap(d, [-1, 0, -10], [121, 41, 1], 0.33)).toBeLessThanOrEqual(1);
    // the other half
    let w2 = '';
    edit(d, (x) => void (w2 = growPanel(x, base, 'e0', { height: 30, angle: 90, dir: 'up', kind: 'finger', span: [60, 120] })!.panelId));
    expect(w2).toBeTruthy();
    expect(d.panels[w2].frame.o[0]).toBeCloseTo(60, 9);
    expect(edgeFreeSpans(d, base, 'e0')).toEqual([]);
    // a third cannot stand there
    expect(growPanel(d, base, 'e0', { height: 30, angle: 90, dir: 'up', kind: 'finger', span: [10, 50] })).toBeNull();
    // the two halves stand side by side in one plane: the export check says so (no joint fits there)
    expect(validate(d).filter((i) => i.pair).map((i) => i.key)).toEqual(['val.notJoined.sideBySide']);
    expect(maxOverlap(d, [-1, 0, -10], [121, 41, 1], 0.33)).toBeLessThanOrEqual(1);
  });

  it('a card wall on part of an edge folds out at its place in the net', () => {
    const d = createDesign(CARD);
    const base = addRootPanel(d, 0, 0, 120, 80);
    let w = '';
    edit(d, (x) => void (w = growPanel(x, base, 'e0', { height: 40, angle: 90, dir: 'up', kind: 'fold', span: [30, 90] })!.panelId));
    const pieces = buildPieces(d);
    expect(pieces).toHaveLength(1);
    const outer = pieces[0].contours.find((c) => c.role === 'outer')!;
    const xs = outer.contour.segs.map((s) => s.a.x);
    // the flap of 60 mm sits between x = 30 and 90 below the base
    const low = outer.contour.segs.filter((s) => s.a.y < -10).map((s) => s.a.x);
    expect(Math.min(...low)).toBeCloseTo(30, 6);
    expect(Math.max(...low)).toBeCloseTo(90, 6);
    void xs;
    void w;
  });

  it('span snap targets: the edge ends and middle, and where other panels meet the edge line', () => {
    const d = createDesign(PLY);
    const base = addRootPanel(d, 0, 0, 120, 80);
    edit(d, (x) => void growPanel(x, base, 'e1', { height: 40, angle: 90, dir: 'up', kind: 'finger' }));
    const ts = spanTargets(d, base, 'e0');
    for (const v of [0, 60, 120, 117]) expect(ts.some((x) => Math.abs(x - v) < 1e-6), `${v}`).toBe(true);
  });
});

describe('height snapping', () => {
  it("a lid grown from one wall snaps to reach the opposite wall's outer face", () => {
    const d = createDesign(PLY);
    const base = addRootPanel(d, 0, 0, 120, 80);
    const walls = [0, 1, 2, 3].map((e) => growPanel(d, base, e, { height: 50, angle: 90, dir: 'up', kind: 'finger' })!.panelId);
    autoConnect(d);
    const back = walls[2];
    const g = ghostPanel(d, back, 'e2', { height: 70, angle: 90, dir: 'up', kind: 'finger', offset: 0, seating: seatingOf('finger') })!;
    const ts = heightTargets(d, g, new Set([back]));
    expect(ts.some((h) => Math.abs(h - 80) < 1e-6)).toBe(true);
    // grown at that height it meets the front wall at a corner and is joined there
    let lid = '';
    edit(d, (x) => void (lid = growPanel(x, back, 'e2', { height: 80, angle: 90, dir: 'up', kind: 'finger' })!.panelId));
    expect(between(d, lid, walls[0]).map((c) => c.broken)).toEqual([false]);
  });

  it("a new wall's height snaps to its neighbour's top", () => {
    const d = createDesign(PLY);
    const base = addRootPanel(d, 0, 0, 120, 80);
    edit(d, (x) => void growPanel(x, base, 'e1', { height: 37, angle: 90, dir: 'up', kind: 'finger' }));
    const g = ghostPanel(d, base, 'e0', { height: 60, angle: 90, dir: 'up', kind: 'finger', offset: 0, seating: 'overlap' })!;
    expect(heightTargets(d, g, new Set([base])).some((h) => Math.abs(h - 37) < 1e-6)).toBe(true);
  });
});

describe('adapting to what the ghost meets', () => {
  /** A box with a back wall 80 and front wall 40 high, and a roof sloping from the back wall's top to the front wall's top. */
  function roofed() {
    const d = createDesign(PLY);
    const base = addRootPanel(d, 0, 0, 120, 80);
    const front = growPanel(d, base, 'e0', { height: 40, angle: 90, dir: 'up', kind: 'finger' })!.panelId;
    const back = growPanel(d, base, 'e2', { height: 80, angle: 90, dir: 'up', kind: 'finger' })!.panelId;
    autoConnect(d);
    const slope = (Math.atan2(40, 80) * 180) / Math.PI;
    const g = fromHinge(90 - slope);
    const kind = connectionsFor(PLY, g.angle)[0];
    const roof = growPanel(d, back, 'e2', { height: Math.hypot(80, 40), angle: g.angle, dir: g.dir, kind })!.panelId;
    autoConnect(d);
    return { d, base, front, back, roof };
  }

  it('a wall grown under a sloped roof gets a gable that meets the roof, and is joined to it automatically', () => {
    const { d, base, roof } = roofed();
    const spec = { height: 110, angle: 90, dir: 'up' as const, kind: 'finger' as const, offset: 0, seating: 'overlap' as const };
    const g = ghostPanel(d, base, 'e1', spec)!;
    const sk = adaptiveSketch(d, g, ghostNeighbours(d, base));
    expect(sk).not.toBeNull();
    // the top slopes: lower at the front (local x = 0) than at the back
    expect(sk!.corners!.tl!.dy).toBeLessThan(sk!.corners!.tr?.dy ?? 0);
    let wall = '';
    edit(d, (x) => void (wall = growPanel(x, base, 'e1', { ...spec, sketch: sk })!.panelId));
    const cs = between(d, wall, roof);
    expect(cs.length).toBeGreaterThanOrEqual(1);
    expect(cs.every((c) => !c.broken)).toBe(true);
    expect(validate(d).filter((i) => i.pair)).toEqual([]);
    expect(maxOverlap(d, [100, 30, -82], [121, 95, 2], 0.5)).toBeLessThanOrEqual(1);
  });

  it('with nothing in the way (or adapting switched off) the ghost stays a plain rectangle', () => {
    const { d, base } = roofed();
    const g = ghostPanel(d, base, 'e1', { height: 30, angle: 90, dir: 'up', kind: 'finger', offset: 0, seating: 'overlap' })!;
    expect(adaptiveSketch(d, g, ghostNeighbours(d, base))).toBeNull();
    let wall = '';
    edit(d, (x) => void (wall = growPanel(x, base, 'e1', { height: 110, angle: 90, dir: 'up', kind: 'finger' })!.panelId));
    expect(panelEdges(d.panels[wall]).map((e) => e.key)).toEqual(['e0', 'e1', 'e2', 'e3']);
  });
});

describe('span targets for growing on part of an edge (milestone 35)', () => {
  it('a shape’s corner on the base, thirds and quarters, and the opposite wall’s span mirrored', async () => {
    const { addRootPanel, addDetail, createDesign, growPanel } = await import('../src/model/ops');
    const { spanTargets } = await import('../src/model/adapt');
    const { MATERIALS } = await import('../src/model/materials');
    const d = createDesign(MATERIALS[3]);
    const b = addRootPanel(d, 0, 0, 120, 80);
    addDetail(d, b, 'rect', 'cut', 50, 40, 20, 10);
    // a wall on part of the back edge (e2 runs from (120, 80) to (0, 80))
    growPanel(d, b, 'e2', { height: 30, angle: 90, dir: 'up', kind: 'tabslot', span: [10, 45] });
    const tg = spanTargets(d, b, 'e0');
    // the shape's corners (40, 60) and centre (50) along the front edge
    expect(tg).toContain(40);
    expect(tg).toContain(60);
    expect(tg).toContain(50);
    expect(tg).toContain(40);
    expect(tg).toContain(30); // a quarter of 120
    expect(tg.some((x) => Math.abs(x - 80) < 1e-6)).toBe(true); // two thirds
    // the back wall stands on [10, 45] from (120, 80): x 110 … 75 — its mirror on the front edge
    expect(tg.some((x) => Math.abs(x - 110) < 1e-6)).toBe(true);
    expect(tg.some((x) => Math.abs(x - 75) < 1e-6)).toBe(true);
  });
});
