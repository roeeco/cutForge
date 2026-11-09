// Milestone 28: placed and construction panels (model).
import { describe, expect, it } from 'vitest';
import { addPlacedPanel, addRootPanel, autoConnect, createDesign, deletePanel, growPanel, movePanel, rotatePanel, setConstruction, setPanelSize, solve } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { toLocal, toWorld } from '../src/model/frame';
import { buildPieces } from '../src/model/pieces';
import { prepareExport } from '../src/export/prepare';
import { validate } from '../src/model/validate';
import { panelExtras } from '../src/model/geometry';
import { outlineTargets } from '../src/model/snap';
import { parseProject, serializeProject } from '../src/model/serialize';
import { isConstruction } from '../src/model/place';
import { foldDisplay } from '../src/views/foldView';
import type { Design, V3 } from '../src/model/types';

const PLY = { ...MATERIALS[3], clearance: 0 };

function box() {
  const d = createDesign(PLY);
  const base = addRootPanel(d, 0, 0, 80, 60);
  const walls = [0, 1, 2, 3].map((e) => growPanel(d, base, e, { height: 40, angle: 90, dir: 'up', kind: 'finger' })!.panelId);
  autoConnect(d);
  return { d, base, walls };
}
const corners = (d: Design, id: string): V3[] => {
  const p = d.panels[id];
  return [[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]].map(([x, y]) => toWorld(p.frame, x, y, 0));
};
const inHost = (d: Design, host: string, id: string) => corners(d, id).map((w) => {
  const l = toLocal(d.panels[host].frame, w);
  return [Math.round(l.x * 1e6) / 1e6, Math.round(l.y * 1e6) / 1e6];
});
const conns = (d: Design, a: string, b: string) => Object.values(d.connections).filter((c) => (c.a.panelId === a && c.b.panelId === b) || (c.a.panelId === b && c.b.panelId === a));

describe('placed panels follow their host', () => {
  it('a flat panel and a standing one on a wall follow it when the base moves and turns, and when the wall grows', () => {
    const { d, base, walls } = box();
    const w = walls[0];
    const flat = addPlacedPanel(d, { host: w, face: 1, x: 10, y: 8, rot: 0, pose: 'flat' }, 20, 12)!;
    const shelf = addPlacedPanel(d, { host: w, face: 1, x: 6, y: 24, rot: 0, pose: 'standing' }, 30, 15)!;
    autoConnect(d);
    const f0 = inHost(d, w, flat), s0 = inHost(d, w, shelf);
    // the flat panel lies on the wall's inner face, the shelf stands out of it
    expect(f0).toEqual([[10, 8], [30, 8], [30, 20], [10, 20]]);
    movePanel(d, base, 37, -12);
    rotatePanel(d, base, 30);
    expect(inHost(d, w, flat)).toEqual(f0);
    expect(inHost(d, w, shelf)).toEqual(s0);
    setPanelSize(d, w, undefined, 70);
    expect(inHost(d, w, flat)).toEqual(f0);
    // in the fold view they ride with their host
    const { xf } = foldDisplay(d, 0.3);
    expect(xf.get(flat)!.equals(xf.get(w)!)).toBe(true);
  });

  it('deleting the host drops them to the floor in place, keeping their pose', () => {
    const { d, walls } = box();
    const w = walls[0];
    const flat = addPlacedPanel(d, { host: w, face: 1, x: 10, y: 8, rot: 0, pose: 'flat' }, 20, 12)!;
    const shelf = addPlacedPanel(d, { host: walls[1], face: 1, x: 10, y: 20, rot: 0, pose: 'standing' }, 30, 15)!;
    const top = addPlacedPanel(d, { host: flat, face: 1, x: 2, y: 2, rot: 0, pose: 'flat' }, 5, 5)!;
    const centre = (id: string) => toWorld(d.panels[id].frame, d.panels[id].w / 2, d.panels[id].h / 2);
    const c0 = centre(flat);
    const s0 = toWorld(d.panels[shelf].frame, 0, 0);
    deletePanel(d, w);
    deletePanel(d, walls[1]);
    expect(d.panels[flat].place).toMatchObject({ host: null, pose: 'flat' });
    // flat on the floor, its centre where it was seen from above
    for (const q of corners(d, flat)) expect(q[1]).toBeCloseTo(0, 6);
    const c1 = centre(flat);
    expect(c1[0]).toBeCloseTo(c0[0], 6);
    expect(c1[2]).toBeCloseTo(c0[2], 6);
    // standing stays standing, its bottom line on the floor
    expect(d.panels[shelf].place).toMatchObject({ host: null, pose: 'standing' });
    const s1 = toWorld(d.panels[shelf].frame, 0, 0);
    expect(s1[1]).toBeCloseTo(0, 6);
    expect(s1[0]).toBeCloseTo(s0[0], 6);
    expect(s1[2]).toBeCloseTo(s0[2], 6);
    expect(Math.abs(d.panels[shelf].frame.v[1])).toBeCloseTo(1, 6);
    // panels placed on them keep following them
    expect(d.panels[top].place?.host).toBe(flat);
    expect(inHost(d, flat, top)).toEqual([[2, 2], [7, 2], [7, 7], [2, 7]]);
  });
});

describe('joints', () => {
  it('a standing panel on a plywood base gets tabs and slots; a flat one makes no joint and no message', () => {
    const d = createDesign(PLY);
    const base = addRootPanel(d, 0, 0, 100, 80);
    const s = addPlacedPanel(d, { host: base, face: 1, x: 20, y: 40, rot: 0, pose: 'standing' }, 60, 30)!;
    autoConnect(d);
    const c = conns(d, s, base);
    expect(c).toHaveLength(1);
    expect(c[0].kind).toBe('tabslot');
    expect(panelExtras(d, d.panels[base]).holes.length).toBeGreaterThan(0);
    const f = addPlacedPanel(d, { host: base, face: 1, x: 10, y: 5, rot: 0, pose: 'flat' }, 30, 20)!;
    autoConnect(d);
    expect(conns(d, f, base)).toEqual([]);
    expect(validate(d)).toEqual([]);
    expect(buildPieces(d)).toHaveLength(3);
  });

  it('a standing panel’s bottom edge stands on the face, not in it', () => {
    const d = createDesign(PLY);
    const base = addRootPanel(d, 0, 0, 100, 80);
    const s = addPlacedPanel(d, { host: base, face: 1, x: 20, y: 40, rot: 0, pose: 'standing' }, 60, 30)!;
    for (const q of corners(d, s)) expect(q[1]).toBeGreaterThanOrEqual(3 - 1e-9);
  });
});

describe('construction panels', () => {
  it('are missing from pieces and export but are snap targets; switched real, they get their joints', () => {
    const { d, base, walls } = box();
    const other = addRootPanel(d, 200, 0, 50, 50);
    solve(d);
    setConstruction(d, walls[2], true);
    expect(d.panels[base].construction).toBe(true);
    expect(walls.every((w) => isConstruction(d, w))).toBe(true);
    expect(Object.values(d.connections).filter((c) => !c.grown)).toEqual([]);
    expect(buildPieces(d).map((p) => p.key)).toEqual([other]);
    const ex = prepareExport(d);
    expect(ex.sheets.flatMap((s) => s.contours).every((c) => c.ref?.pieceKey?.startsWith(other))).toBe(true);
    expect(validate(d)).toEqual([]);
    // still a snap target for a panel next to it
    const t = outlineTargets(d, other, { x: -1000, y: -1000 });
    expect(t.corners.length).toBeGreaterThan(4);
    autoConnect(d);
    expect(Object.values(d.connections).filter((c) => !c.grown)).toEqual([]);
    // real again: joints come back
    setConstruction(d, base, false);
    autoConnect(d);
    expect(Object.values(d.connections).filter((c) => !c.grown)).toHaveLength(4);
    expect(Object.values(d.connections).every((c) => c.geom && !c.broken)).toBe(true);
    expect(buildPieces(d)).toHaveLength(6);
  });

  it('a panel placed on a construction panel is real and not joined to it', () => {
    const d = createDesign(PLY);
    const g = addRootPanel(d, 0, 0, 100, 80);
    setConstruction(d, g, true);
    const s = addPlacedPanel(d, { host: g, face: 1, x: 20, y: 40, rot: 0, pose: 'standing' }, 60, 30)!;
    autoConnect(d);
    expect(conns(d, s, g)).toEqual([]);
    expect(buildPieces(d).map((p) => p.key)).toEqual([s]);
  });
});

describe('files', () => {
  it('placed and construction panels survive save and load; a design without them saves neither', () => {
    const { d, walls } = box();
    const f = addPlacedPanel(d, { host: walls[0], face: 1, x: 10, y: 8, rot: 15, pose: 'flat' }, 20, 12)!;
    setConstruction(d, walls[3], true);
    const back = parseProject(serializeProject(d));
    expect(back.panels[f].place).toEqual({ host: walls[0], face: 1, x: 10, y: 8, rot: 15, pose: 'flat' });
    expect(Object.values(back.panels).filter((p) => p.construction)).toHaveLength(1);
    const plain = box().d;
    expect(serializeProject(plain)).not.toContain('"place"');
    expect(serializeProject(plain)).not.toContain('"construction"');
  });
});
