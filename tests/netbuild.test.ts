// Milestone 114 (D2): building in the flat — the ghost where ✓ will put the board, one ✓ for both views, handles in one undo step.
import { describe, expect, it } from 'vitest';
import { addEdgeFlap, addPolygonPanel, addRootPanel, addTray, autoConnect, createDesign, growPanel, regularPolygon, setEdgeFlap, setPanelSize } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { pieceCopies } from '../src/model/pack';
import { panelEdges } from '../src/model/edges';
import { applyX, invertPoint } from '../src/geom/vec';
import { ghostInNet } from '../src/views/netPick';
import { growConfirm, growWith } from '../src/views/ghost';
import { useStore, type GrowOptions } from '../src/store/store';
import type { Design } from '../src/model/types';
import type { Vec2 } from '../src/geom/types';

const CARD = MATERIALS[0];
const G = (over: Partial<GrowOptions> = {}): GrowOptions => ({ height: 50, angle: 90, ...over });

function cardTray(): { d: Design; walls: string[]; base: string } {
  const d = createDesign(CARD);
  const base = addRootPanel(d, 0, 0, 100, 70);
  const walls = ['e0', 'e1', 'e2', 'e3'].map((e) => growPanel(d, base, e, { height: 40, angle: 90, dir: 'up', kind: 'fold' })!.panelId);
  autoConnect(d);
  return { d, walls, base };
}

/** A net's point in a board's own frame (copy coordinates in, the copy's origin added back). */
function inBoard(d: Design, panelId: string, q: Vec2): Vec2 {
  const c = pieceCopies(d).find((x) => x.copy === 0 && x.panels.some((n) => n.panelId === panelId))!;
  const xf = c.panels.find((n) => n.panelId === panelId)!.xf;
  return invertPoint(xf, { x: q.x + c.origin.x, y: q.y + c.origin.y });
}

/** The ghost drawn in the flat against the board ✓ makes, both in the parent's frame. */
function check(d: Design, parent: string, edge: string, grow: GrowOptions) {
  const copy = pieceCopies(d).find((x) => x.copy === 0 && x.panels.some((n) => n.panelId === parent))!;
  const g = ghostInNet(d, copy, parent, edge, grow)!;
  expect(g).toBeTruthy();
  expect(g.own).toBe(false);
  const ghost = g.pts.map((q) => inBoard(d, parent, q));
  const after = JSON.parse(JSON.stringify(d)) as Design;
  const r = growWith(after, parent, edge, grow)!;
  const c2 = pieceCopies(after).find((x) => x.copy === 0 && x.panels.some((n) => n.panelId === r.panelId))!;
  const nx = c2.panels.find((n) => n.panelId === r.panelId)!.xf;
  const made = panelEdges(after.panels[r.panelId]).map((e) => inBoard(after, parent, { x: applyX(nx, e.a).x - c2.origin.x, y: applyX(nx, e.a).y - c2.origin.y }));
  expect(ghost.length).toBe(made.length);
  ghost.forEach((q, i) => {
    expect(q.x).toBeCloseTo(made[i].x, 6);
    expect(q.y).toBeCloseTo(made[i].y, 6);
  });
  return g;
}

describe('building in the flat', () => {
  it('the ghost of a lid off a card tray wall lies where ✓ puts it', () => {
    const { d, walls } = cardTray();
    check(d, walls[2], 'e2', G());
  });

  it('on a hexagon tray’s turned wall, and on part of an edge', () => {
    const d = createDesign(CARD);
    const base = addPolygonPanel(d, 0, 0, regularPolygon(6, 50))!;
    const tray = addTray(d, base, 30)!;
    autoConnect(d);
    const wall = d.order.find((id) => id.startsWith(`${tray}/`) && id.endsWith('e3'))!;
    check(d, wall, 'e2', G({ height: 25 }));
    const { d: d2, walls } = cardTray();
    check(d2, walls[0], 'e2', G({ span: [20, 70] }));
  });

  it('the ghost turns with the height only along its own axis: the same place for 30 and 50 mm', () => {
    const { d, walls } = cardTray();
    const copy = pieceCopies(d)[0];
    const a = ghostInNet(d, copy, walls[1], 'e2', G({ height: 30 }))!, b = ghostInNet(d, copy, walls[1], 'e2', G({ height: 50 }))!;
    expect(a.xf.tx).toBeCloseTo(b.xf.tx, 9);
    expect(a.xf.ty).toBeCloseTo(b.xf.ty, 9);
    expect(a.xf.rot).toBeCloseTo(b.xf.rot, 9);
  });

  it('one ✓ for the stage and the flat: a tray top in Workshop offers what closes the box; a free root edge grows a board', () => {
    // a tray (the Box tool's): its back wall's top, as high as the box is deep, closes the box
    const d = createDesign(CARD);
    const base = addRootPanel(d, 0, 0, 100, 70);
    const tray = addTray(d, base, 40)!;
    autoConnect(d);
    const gc = growConfirm(d, `${tray}/e2`, 'e2', G({ height: 70 }), true)!;
    expect(gc.closesW).toBeTruthy();
    expect(gc.closeAs).toBeTruthy();
    const d2 = createDesign(CARD);
    const b = addRootPanel(d2, 0, 0, 60, 40);
    const gc2 = growConfirm(d2, b, 'e1', G({ height: 30 }), true)!;
    expect(gc2.closesW).toBeNull();
    expect(gc2.disabled).toBe(false);
    useStore.setState({ design: d2, past: [], future: [] });
    gc2.ok();
    expect(useStore.getState().design.order.length).toBe(2);
  });

  it('a flap dragged in the flat is one undo step; Esc leaves the design as it was', () => {
    const d = createDesign(CARD);
    const b = addRootPanel(d, 0, 0, 60, 40);
    addEdgeFlap(d, b, 'e2', 12);
    useStore.setState({ design: d, past: [], future: [] });
    const s = () => useStore.getState();
    for (const len of [14, 18, 22]) s().preview((x) => setEdgeFlap(x, b, 'e2', len));
    s().commit();
    expect(s().design.panels[b].edgeFlaps![0].len).toBe(22);
    expect(s().past.length).toBe(1);
    s().undo();
    expect(s().design.panels[b].edgeFlaps![0].len).toBe(12);
    s().preview((x) => setEdgeFlap(x, b, 'e2', 30));
    s().cancel();
    expect(s().design.panels[b].edgeFlaps![0].len).toBe(12);
  });

  it('a board resized in the flat is one undo step and keeps its joints on their edges', () => {
    const d = createDesign(CARD);
    const b = addRootPanel(d, 0, 0, 60, 40);
    const w = growPanel(d, b, 'e2', { height: 30, angle: 90, dir: 'up', kind: 'fold' })!;
    useStore.setState({ design: d, past: [], future: [] });
    const s = () => useStore.getState();
    for (const v of [70, 80]) s().preview((x) => setPanelSize(x, b, v, undefined));
    s().commit();
    expect(s().design.panels[b].w).toBe(80);
    expect(s().past.length).toBe(1);
    // the grown board follows its edge
    expect(s().design.panels[w.panelId].w).toBeCloseTo(80, 6);
  });
});
