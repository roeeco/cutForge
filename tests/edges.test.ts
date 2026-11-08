// Milestone 7: schema v6 sketches and edge keys.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { addRootPanel, addSideWalls, createDesign, growPanel, hasSideWalls, solve } from '../src/model/ops';
import { edgeNeighbours, panelEdges, segLength, sketchRing } from '../src/model/edges';
import { edgeWorld, toWorld } from '../src/model/frame';
import { checkHinge } from '../src/model/hinge';
import { parseProject } from '../src/model/serialize';
import { MATERIALS } from '../src/model/materials';
import { SCHEMA_VERSION } from '../src/model/types';
import { v3dot, v3norm, v3sub } from '../src/geom/v3';

const PLY = MATERIALS[3];

/** A plywood design with one pentagon base (house shape, sloped roof edges). */
function pentagon() {
  const d = createDesign(PLY);
  const id = addRootPanel(d, 0, 0, 100, 80);
  d.panels[id].sketch = {
    kind: 'poly',
    pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 80 }, { x: 0, y: 50 }],
    edgeIds: ['e0', 'e1', 'e2', 'e3', 'e4'],
  };
  solve(d);
  return { d, id };
}

describe('schema v6', () => {
  it('migrates v5 files: sketches, edge keys, trays', () => {
    const d = parseProject(readFileSync('tests/golden/v5-hand-ply-box.json', 'utf8'));
    expect(d.schemaVersion).toBe(SCHEMA_VERSION);
    expect(d.trays).toEqual({});
    for (const c of Object.values(d.connections)) {
      expect(typeof c.a.edge).toBe('string');
      expect(typeof c.b.edge).toBe('string');
      for (const e of c.geom?.edges ?? []) expect(e.edge).toMatch(/^e\d$/);
    }
    const roots = d.order.filter((id) => !Object.values(d.connections).some((c) => c.grown && c.b.panelId === id));
    for (const id of d.order) expect(d.panels[id].sketch.kind).toBe(roots.includes(id) ? 'poly' : 'wall');
    expect(Object.values(d.connections).some((c) => c.b.edge === 'face')).toBe(true);
  });

  it('new rectangles are 4-point polygon sketches named e0–e3', () => {
    const d = createDesign(PLY);
    const id = addRootPanel(d, 0, 0, 120, 80);
    expect(panelEdges(d.panels[id]).map((e) => [e.key, segLength(e)])).toEqual([['e0', 120], ['e1', 80], ['e2', 120], ['e3', 80]]);
  });
});

describe('edges of a polygon base', () => {
  it('names each edge by key and finds its neighbours', () => {
    const { d, id } = pentagon();
    const ring = panelEdges(d.panels[id]);
    expect(ring.map((e) => e.key)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4']);
    expect(segLength(ring[2])).toBeCloseTo(Math.hypot(50, 30), 9);
    const nb = edgeNeighbours(d.panels[id], 'e2')!;
    expect([nb[0].key, nb[1].key]).toEqual(['e1', 'e3']);
    expect(d.panels[id].w).toBe(100);
    expect(d.panels[id].h).toBe(80);
  });

  it('grows a wall from a sloped edge: width = edge length, standing on the edge', () => {
    const { d, id } = pentagon();
    const r = growPanel(d, id, 'e2', { height: 40, angle: 90, dir: 'up', kind: 'finger' })!;
    const w = d.panels[r.panelId];
    expect(w.w).toBeCloseTo(Math.hypot(50, 30), 9);
    const [A, B] = edgeWorld(d.panels[id], 'e2');
    // the wall's bottom edge runs along the parent edge, and it stands straight up
    expect(v3dot(v3norm(v3sub(B, A)), w.frame.u)).toBeCloseTo(1, 9);
    expect(toWorld(w.frame, 0, 0)).toEqual(A.map((x) => expect.closeTo(x, 9)));
    expect(w.frame.v[1]).toBeCloseTo(1, 9);
    expect(sketchRing(w).map((e) => e.key)).toEqual(['e0', 'e1', 'e2', 'e3']);
  });

  it('side walls go on the neighbouring polygon edges', () => {
    const { d, id } = pentagon();
    expect(hasSideWalls(d, id, 'e3')).toBe(false);
    const made = addSideWalls(d, id, 'e3', 60, 40);
    expect(made).toHaveLength(2);
    const edges = Object.values(d.connections).filter((c) => c.grown).map((c) => c.a.edge).sort();
    expect(edges).toEqual(['e2', 'e4']);
    expect(hasSideWalls(d, id, 'e3')).toBe(true);
  });

  it('hinge zones work on a sloped edge', () => {
    const { d, id } = pentagon();
    expect(checkHinge(d, id, 'e2', 90, 40).zone).toBe('ok');
    expect(checkHinge(d, id, 'e2', 5, 40)).toMatchObject({ zone: 'bad', reason: 'onPanel' });
    expect(checkHinge(d, id, 'e2', 270, 40)).toMatchObject({ zone: 'bad', reason: 'floor' });
    expect(checkHinge(d, id, 'e2', 60, 40)).toMatchObject({ zone: 'support', reason: 'needsWalls', sideWalls: true });
    addSideWalls(d, id, 'e2', 60, 40);
    expect(checkHinge(d, id, 'e2', 60, 40).zone).toBe('ok');
  });
});
