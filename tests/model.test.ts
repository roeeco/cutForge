import { describe, expect, it } from 'vitest';
import { addDetail, addRootPanel, createDesign, growPanel, setPanelSize, setMaterial, setConnection } from '../src/model/ops';
import { fingerCount, fingerNotches, panelNotches, panelOutline } from '../src/model/geometry';
import { edgeWorld, toWorld } from '../src/model/frame';
import { MATERIALS } from '../src/model/materials';
import { polygonArea } from '../src/geom/vec';
import type { Design } from '../src/model/types';

const close = (a: number[], b: number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 9));

function box(): { d: Design; base: string; wall: string; cid: string } {
  const d = createDesign();
  const base = addRootPanel(d, 0, 0, 100, 60);
  const r = growPanel(d, base, 0, { height: 40, angle: 90, dir: 'up', kind: 'finger' })!;
  return { d, base, wall: r.panelId, cid: r.connectionId };
}

describe('grow panel', () => {
  it('stands a wall at 90° on the parent edge with material inside the fold', () => {
    const { d, base, wall } = box();
    const w = d.panels[wall];
    expect(w.w).toBe(100);
    const [A, B] = edgeWorld(d.panels[base], 0);
    close(toWorld(w.frame, 0, 0), A);
    close(toWorld(w.frame, 100, 0), B);
    close(toWorld(w.frame, 0, 40), [A[0], 40, A[2]]);
    // base edge 0 runs along +X at z=0; base interior is -Z, so wall material points -Z
    close(toWorld(w.frame, 0, 0, 3), [A[0], 0, A[2] - 3]);
  });

  it('keeps the wall attached when the base is resized, and a wall width edit resizes the base', () => {
    const { d, base, wall } = box();
    setPanelSize(d, base, 150, undefined);
    expect(d.panels[wall].w).toBe(150);
    setPanelSize(d, wall, 120, 50);
    expect(d.panels[base].w).toBe(120);
    expect(d.panels[wall].w).toBe(120);
    expect(d.panels[wall].h).toBe(50);
  });

  it('down direction starts the wall at the top of the parent material', () => {
    const d = createDesign();
    const base = addRootPanel(d, 0, 0, 80, 50);
    const r = growPanel(d, base, 1, { height: 30, angle: 90, dir: 'down', kind: 'finger' })!;
    const w = d.panels[r.panelId];
    const [A] = edgeWorld(d.panels[base], 1);
    close(toWorld(w.frame, 0, 0), [A[0], 3, A[2]]);
    close(toWorld(w.frame, 0, 30), [A[0], 3 - 30, A[2]]);
    close(toWorld(w.frame, 0, 0, 3), [A[0] - 3, 3, A[2]]);
  });
});

describe('finger joints', () => {
  it('uses an odd finger count', () => {
    for (const L of [20, 37, 100, 333]) expect(fingerCount({ fingers: null } as any, L, 3) % 2).toBe(1);
    expect(fingerCount({ fingers: 4 } as any, 100, 3)).toBe(5);
  });

  it('parent and child notches are complementary (with clearance applied once)', () => {
    const { parent, child } = fingerNotches(100, 5, 3, 0);
    const cover = [...parent, ...child].map((n) => [n.s0, n.s1]).sort((a, b) => a[0] - b[0]);
    expect(cover[0][0]).toBe(0);
    for (let i = 1; i < cover.length; i++) expect(cover[i][0]).toBeCloseTo(cover[i - 1][1], 12);
    expect(cover[cover.length - 1][1]).toBe(100);
    const withC = fingerNotches(100, 5, 3, 0.2);
    expect(withC.parent[0].s1 - withC.parent[0].s0).toBeCloseTo(20.2, 9);
    expect(withC.child[1].s1 - withC.child[1].s0).toBeCloseTo(20, 9);
  });

  it('cuts the outlines so the two pieces fill the corner exactly once', () => {
    const { d, base, wall } = box();
    d.material.clearance = 0;
    const t = d.material.thickness;
    const bo = panelOutline(d.panels[base], panelNotches(d, d.panels[base]));
    const wo = panelOutline(d.panels[wall], panelNotches(d, d.panels[wall]));
    const lostBase = 100 * 60 - polygonArea(bo);
    const lostWall = 100 * 40 - polygonArea(wo);
    expect(lostBase + lostWall).toBeCloseTo(100 * t, 6); // the t x 100 overlap strip
    expect(polygonArea(bo)).toBeGreaterThan(0);
    expect(polygonArea(wo)).toBeGreaterThan(0);
  });

  it('regenerates both sides when thickness or finger count change', () => {
    const { d, base, wall, cid } = box();
    setMaterial(d, { ...MATERIALS[3], thickness: 6, clearance: 0 });
    const lost = 100 * 60 - polygonArea(panelOutline(d.panels[base], panelNotches(d, d.panels[base]))) + (100 * 40 - polygonArea(panelOutline(d.panels[wall], panelNotches(d, d.panels[wall]))));
    expect(lost).toBeCloseTo(600, 6);
    setConnection(d, cid, { fingers: 7 });
    expect(panelNotches(d, d.panels[wall])[0].length).toBe(4);
    expect(panelNotches(d, d.panels[base])[0].length).toBe(3);
  });

  it('falls back to a butt edge on materials without finger joints', () => {
    const { d, cid } = box();
    setMaterial(d, MATERIALS[0]);
    expect(d.connections[cid].kind).toBe('butt');
  });
});

describe('details', () => {
  it('adds a circle cutout that stays round when resized', () => {
    const { d, base } = box();
    const id = addDetail(d, base, 'circle', 'cut', 50, 30, 10, 10)!;
    expect(d.panels[base].details[0]).toMatchObject({ id, w: 10, h: 10 });
  });
});
