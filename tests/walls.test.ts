// Milestone 11: wall outline editing (free corners, inserted points) and growing from sloped edges.
import { describe, expect, it } from 'vitest';
import { addRootPanel, addWallInsert, autoConnect, createDesign, deleteWallInsert, growPanel, moveWallInsert, setWallCorner } from '../src/model/ops';
import { findEdge, panelEdges, segLength } from '../src/model/edges';
import { edgeWorld } from '../src/model/frame';
import { checkHinge } from '../src/model/hinge';
import { panelNotches } from '../src/model/geometry';
import { validate } from '../src/model/validate';
import { MATERIALS } from '../src/model/materials';
import { maxOverlap } from './solid';
import { v3dot, v3norm, v3sub } from '../src/geom/v3';

const PLY = MATERIALS[3];

function box() {
  const d = createDesign(PLY);
  const base = addRootPanel(d, 0, 0, 120, 80);
  const walls = [0, 1, 2, 3].map((e) => growPanel(d, base, e, { height: 50, angle: 90, dir: 'up', kind: 'finger' })!.panelId);
  autoConnect(d);
  return { d, base, walls };
}

describe('wall outlines', () => {
  it('a gable: one insert on the top edge splits it into two sloped edges', () => {
    const { d, walls } = box();
    const front = walls[0];
    const id = addWallInsert(d, front, 'e2', 0.5, 30)!;
    const ring = panelEdges(d.panels[front]);
    expect(ring.map((e) => e.key)).toEqual(['e0', 'e1', 'e2', id, 'e3']);
    const apex = findEdge(d.panels[front], 'e2')!.b;
    expect(apex).toEqual({ x: 60, y: 80 });
    expect(segLength(findEdge(d.panels[front], 'e2')!)).toBeCloseTo(Math.hypot(60, 30), 9);
    // the attached edge cannot move: bottom corners slide along it only
    setWallCorner(d, front, 'bl', { dx: 5, dy: 9 });
    expect(findEdge(d.panels[front], 'e0')!.a).toEqual({ x: 5, y: 0 });
    setWallCorner(d, front, 'bl', { dx: 0, dy: 0 });
    // points keep their offsets when the height changes, and scale along the width
    d.panels[front].h = 60;
    expect(findEdge(d.panels[front], 'e2')!.b).toEqual({ x: 60, y: 90 });
    deleteWallInsert(d, front, id);
    expect(panelEdges(d.panels[front]).map((e) => e.key)).toEqual(['e0', 'e1', 'e2', 'e3']);
  });

  it('a slanted side edge shortens the corner contact and the corner joint re-lays', () => {
    const { d, walls } = box();
    const corner = () => Object.values(d.connections).find((c) => !c.grown && [c.a.panelId, c.b.panelId].includes(walls[0]) && [c.a.panelId, c.b.panelId].includes(walls[1]))!;
    const before = JSON.stringify(corner().geom);
    // the front wall's top right corner pulled 15 mm down: its right edge is 35 mm long
    setWallCorner(d, walls[0], 'tr', { dx: 0, dy: -15 });
    autoConnect(d);
    expect(segLength(findEdge(d.panels[walls[0]], 'e1')!)).toBeCloseTo(35, 9);
    expect(corner().broken).toBe(false);
    expect(JSON.stringify(corner().geom)).not.toBe(before);
    expect(maxOverlap(d, [100, 0, -82], [122, 54, 2], 0.6)).toBe(1);
  });
});

describe('growing from a sloped edge', () => {
  it('a gable wall carries a roof grown from its sloped edge; the joint re-lays when the gable changes', () => {
    const { d, walls } = box();
    const front = walls[0];
    const ins = addWallInsert(d, front, 'e2', 0.5, 30)!;
    // hinge zones work on the sloped edge
    expect(checkHinge(d, front, 'e2', 90, 80).zone).toBe('ok');
    expect(checkHinge(d, front, 'e2', 5, 80)).toMatchObject({ zone: 'bad', reason: 'onPanel' });
    const r = growPanel(d, front, 'e2', { height: 80, angle: 90, dir: 'up', kind: 'finger' })!;
    autoConnect(d);
    const roof = d.panels[r.panelId];
    expect(roof.w).toBeCloseTo(Math.hypot(60, 30), 9);
    // the roof runs along the slope
    const [A, B] = edgeWorld(d.panels[front], 'e2');
    expect(v3dot(v3norm(v3sub(B, A)), roof.frame.u)).toBeCloseTo(1, 9);
    const c = d.connections[r.connectionId];
    expect(c.broken).toBe(false);
    const fingers = JSON.stringify(panelNotches(d, roof).e0);
    // a steeper gable: the roof gets wider and its fingers re-lay
    moveWallInsert(d, front, ins, { off: 45 });
    autoConnect(d);
    expect(d.panels[r.panelId].w).toBeCloseTo(Math.hypot(60, 45), 9);
    expect(d.connections[r.connectionId].broken).toBe(false);
    expect(JSON.stringify(panelNotches(d, d.panels[r.panelId]).e0)).not.toBe(fingers);
    // the gable and the roof share the volume at most once along their joint
    expect(maxOverlap(d, [58, 40, -20], [122, 100, 1], 0.6)).toBe(1);
    expect(validate(d).filter((i) => i.key === 'val.broken')).toEqual([]);
  });
});
