// Milestone 8: polygon bases, joints at any corner angle.
import { describe, expect, it } from 'vitest';
import { addPolygonPanel, autoConnect, createDesign, deleteVertex, growPanel, insertVertex, isSimplePolygon, moveVertex, regularPolygon } from '../src/model/ops';
import { panelEdges, segLength } from '../src/model/edges';
import { toWorld } from '../src/model/frame';
import { cornerFit, cornerAngle } from '../src/model/seams';
import { panelExtras } from '../src/model/geometry';
import { validate } from '../src/model/validate';
import { MATERIALS } from '../src/model/materials';
import { buildPieces } from '../src/model/pieces';
import type { ConnectionKind, Design, MaterialProfile } from '../src/model/types';
import { maxOverlap, solidCounter } from './solid';
import { pointInPolygon } from '../src/geom/vec';

const [CARD, , CORR4, PLY] = MATERIALS;

function hexTray(m: MaterialProfile, kind: ConnectionKind, r = 60, H = 40) {
  const d = createDesign(m);
  const base = addPolygonPanel(d, 0, 0, regularPolygon(6, r))!;
  const walls = panelEdges(d.panels[base]).map((e) => growPanel(d, base, e.key, { height: H, angle: 90, dir: 'up', kind })!.panelId);
  autoConnect(d);
  return { d, base, walls };
}

const corners = (d: Design) => Object.values(d.connections).filter((c) => !c.grown);

describe('polygon bases', () => {
  it('a regular hexagon has six equal edges with a level bottom edge', () => {
    const d = createDesign(PLY);
    const id = addPolygonPanel(d, 0, 0, regularPolygon(6, 50))!;
    const ring = panelEdges(d.panels[id]);
    expect(ring.map((e) => e.key)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4', 'e5']);
    for (const e of ring) expect(segLength(e)).toBeCloseTo(50, 9);
    expect(ring[0].a.y).toBeCloseTo(0, 9);
    expect(ring[0].b.y).toBeCloseTo(0, 9);
    expect(d.panels[id].w).toBeCloseTo(100, 9);
    expect(d.panels[id].h).toBeCloseTo(50 * Math.sqrt(3), 9);
  });

  it('refuses self-intersecting outlines, accepts either winding', () => {
    const d = createDesign(PLY);
    const bow = [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 50, y: 0 }, { x: 0, y: 50 }];
    expect(isSimplePolygon(bow)).toBe(false);
    expect(addPolygonPanel(d, 0, 0, bow)).toBeNull();
    const cw = [{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 60, y: 0 }];
    const id = addPolygonPanel(d, 0, 0, cw)!;
    expect(panelEdges(d.panels[id])).toHaveLength(3);
  });

  it('vertex edits: move re-angles walls, insert splits an edge id, delete merges', () => {
    const d = createDesign(PLY);
    const id = addPolygonPanel(d, 0, 0, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }])!;
    const w = growPanel(d, id, 'e1', { height: 30, angle: 90, dir: 'up', kind: 'finger' })!.panelId;
    expect(moveVertex(d, id, 2, { x: 120, y: 60 })).toBe(true);
    expect(d.panels[w].w).toBeCloseTo(Math.hypot(20, 60), 9);
    expect(d.panels[w].frame.u[0]).toBeCloseTo(20 / Math.hypot(20, 60), 9);
    // crossing moves are refused
    expect(moveVertex(d, id, 2, { x: -50, y: -30 })).toBe(false);
    const nid = insertVertex(d, id, 0)!;
    expect(nid).toBe('e4');
    expect(panelEdges(d.panels[id]).map((e) => e.key)).toEqual(['e0', 'e4', 'e1', 'e2', 'e3']);
    expect(segLength(panelEdges(d.panels[id])[0])).toBeCloseTo(50, 9);
    expect(deleteVertex(d, id, 1)).toBe(true);
    expect(panelEdges(d.panels[id]).map((e) => e.key)).toEqual(['e0', 'e1', 'e2', 'e3']);
    // a triangle cannot lose a vertex
    const tri = addPolygonPanel(d, 300, 0, [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 40 }])!;
    expect(deleteVertex(d, tri, 0)).toBe(false);
  });

  it('deleting a vertex merges the two edges: a wall on the removed edge moves to the merged edge', () => {
    const d = createDesign(PLY);
    const id = addPolygonPanel(d, 0, 0, regularPolygon(5, 50))!;
    const w = growPanel(d, id, 'e2', { height: 30, angle: 90, dir: 'up', kind: 'finger' })!.panelId;
    // vertex 2 starts edge e2: e1 absorbs it and e2 is gone
    expect(deleteVertex(d, id, 2)).toBe(true);
    expect(panelEdges(d.panels[id]).map((e) => e.key)).toEqual(['e0', 'e1', 'e3', 'e4']);
    const c = Object.values(d.connections).find((x) => x.grown && x.b.panelId === w)!;
    expect(c.a.edge).toBe('e1');
    expect(c.broken).toBe(false);
    expect(d.panels[w].w).toBeCloseTo(segLength(panelEdges(d.panels[id])[1]), 9);
  });
});

describe('hexagon plywood tray built by hand', () => {
  const { d, base, walls } = hexTray(PLY, 'finger');
  const t = PLY.thickness;

  it('six walls, six finger corners at 120°', () => {
    expect(walls).toHaveLength(6);
    const cs = corners(d);
    expect(cs).toHaveLength(6);
    for (const c of cs) {
      expect(c.kind).toBe('finger');
      expect(c.broken).toBe(false);
      const f = cornerFit(d.panels[c.a.panelId], c.a.edge, d.panels[c.b.panelId], c.b.edge)!;
      expect(cornerAngle(f)).toBeCloseTo(120, 6);
    }
  });

  it('each corner occupies the volume at most once', () => {
    expect(maxOverlap(d, [-62, 0, -106], [62, 44, 2], 0.55)).toBe(1);
  });

  it('the corner gap matches t·|cot α|', () => {
    const count = solidCounter(d);
    const expected = t * Math.abs(1 / Math.tan((120 * Math.PI) / 180));
    let worst = 0;
    for (const c of corners(d)) {
      const B = d.panels[c.b.panelId];
      const e = panelEdges(B).find((x) => x.key === c.b.edge)!;
      const dir = { x: e.b.x - e.a.x, y: e.b.y - e.a.y };
      const L = Math.hypot(dir.x, dir.y);
      const inward = { x: -dir.y / L, y: dir.x / L };
      // along B's inner face, away from the corner edge, at several heights
      for (let s = 2; s < L - 2; s += 0.5) {
        let gap = 0;
        for (let x = 0.005; x < 3 * t; x += 0.005) {
          const lx = e.a.x + (dir.x / L) * s + inward.x * x, ly = e.a.y + (dir.y / L) * s + inward.y * x;
          if (count(toWorld(B.frame, lx, ly, t - 0.01)) === 0) gap += 0.005;
        }
        worst = Math.max(worst, gap);
      }
    }
    expect(worst).toBeGreaterThan(expected - 0.03);
    expect(worst).toBeLessThan(expected + 0.03);
  });

  it('passes the export check', () => {
    expect(validate(d)).toEqual([]);
    expect(buildPieces(d)).toHaveLength(7);
    expect(d.panels[base].sketch.kind).toBe('poly');
  });
});

describe('corrugated hexagon tray', () => {
  const { d } = hexTray(CORR4, 'fold');

  it('connects with tab-and-slot corners whose slots are closed holes', () => {
    const cs = corners(d);
    expect(cs).toHaveLength(6);
    for (const c of cs) {
      expect(c.kind).toBe('tabslot');
      expect(c.broken).toBe(false);
      expect(c.geom!.holes.length).toBeGreaterThan(0);
    }
    for (const id of d.order) {
      const p = d.panels[id];
      const outline = buildPieces({ ...d, order: [id] } as Design);
      expect(outline).toBeTruthy();
      for (const h of panelExtras(d, p).holes) expect(h.every((q) => q.x > -50 && q.y > -50)).toBe(true);
    }
    expect(validate(d)).toEqual([]);
  });

  it('is one folded net', () => {
    expect(buildPieces(d)).toHaveLength(1);
    expect(maxOverlap(d, [-62, 0, -106], [62, 44, 2], 0.9)).toBe(1);
  });
});

describe('card hexagon tray', () => {
  it('glue-flap corners at 120°, one net, clean export check', () => {
    const { d } = hexTray(CARD, 'fold');
    for (const c of corners(d)) expect(c.kind).toBe('glue');
    expect(buildPieces(d)).toHaveLength(1);
    expect(validate(d)).toEqual([]);
    const flaps = corners(d).flatMap((c) => c.geom!.flaps3d);
    expect(flaps).toHaveLength(6);
    // each flap lies on the receiving wall's inner face, inside that wall
    for (const f of flaps) {
      const R = d.panels[f.panelId];
      const ring = panelEdges(R).map((e) => e.a);
      expect(f.poly.every((q) => pointInPolygon(q, ring) || q.x >= -1e-6)).toBe(true);
      expect(f.z0).toBeCloseTo(CARD.thickness, 9);
    }
  });
});

describe('acute corners', () => {
  it('a triangular plywood tray (60°) occupies the volume at most once', () => {
    const d = createDesign(PLY);
    const base = addPolygonPanel(d, 0, 0, regularPolygon(3, 60))!;
    for (const e of panelEdges(d.panels[base])) growPanel(d, base, e.key, { height: 30, angle: 90, dir: 'up', kind: 'finger' });
    autoConnect(d);
    expect(corners(d)).toHaveLength(3);
    for (const c of corners(d)) expect(c.kind).toBe('finger');
    expect(maxOverlap(d, [-55, 0, -95], [55, 34, 2], 0.6)).toBe(1);
    expect(validate(d)).toEqual([]);
  });
});
