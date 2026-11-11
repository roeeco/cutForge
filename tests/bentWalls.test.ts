// Milestone 46 (CURVED_WALLS.md §3.1, §3.2, §3.4, §4.3, §6.2): walls bent along curve runs.
import { describe, expect, it } from 'vitest';
import { addRoundedRect, addRoundPanel, addTray, autoConnect, createDesign, deleteConnection, setTrayKinds, setCornerRadius } from '../src/model/ops';
import { curveRuns, findRun, panelEdges } from '../src/model/edges';
import { MATERIALS, bendOf } from '../src/model/materials';
import { facetsOf, inlineId, panelToLocal, panelToWorld, runPoint } from '../src/model/bent';
import { validate } from '../src/model/validate';
import { parseProject, serializeProject } from '../src/model/serialize';
import { prepareExport } from '../src/export/prepare';
import { sheetsToSvg } from '../src/export/svg';
import { panelExtras, panelOutline, panelNotches } from '../src/model/geometry';
import { pointInPolygon } from '../src/geom/vec';
import { v3len, v3sub } from '../src/geom/v3';
import type { Design } from '../src/model/types';

const [CARD, CORR16, , PLY] = MATERIALS;

const wallsOf = (d: Design, baseId: string) => Object.values(d.connections).filter((c) => c.grown && c.a.panelId === baseId);
const bentOf = (d: Design, baseId: string) => wallsOf(d, baseId).filter((c) => d.panels[c.b.panelId].bent);
const blocking = (d: Design) => validate(d).filter((i) => !['val.split', 'val.bevel'].includes(i.key));

describe('curve runs', () => {
  it('a rounded rectangle has four open runs, each tangent to its straight neighbours; a circle one closed run starting at the back', () => {
    const d = createDesign(PLY);
    const rr = addRoundedRect(d, 0, 0, 100, 60, 15)!;
    const runs = curveRuns(d.panels[rr]);
    expect(runs.map((r) => r.key).sort()).toEqual(['e0^~', 'e1^~', 'e2^~', 'e3^~']);
    for (const r of runs) {
      expect(r.closed).toBe(false);
      expect(r.tanStart && r.tanEnd).toBe(true);
      expect(r.length).toBeCloseTo((Math.PI / 2) * 15, 1);
      expect(r.minR).toBeCloseTo(15, 6);
    }
    expect(findRun(d.panels[rr], 'e1^~')).toMatchObject({ prev: 'e0', next: 'e1' });
    const c = addRoundPanel(d, 300, 0, 80, 80, { shape: 'circle' })!;
    const [run] = curveRuns(d.panels[c]);
    expect(run.closed).toBe(true);
    expect(run.key).toBe('e0^~');
    // the back of the circle (largest local y)
    expect(run.segs[0].a.y).toBeCloseTo(80, 9);
    expect(run.segs[0].a.x).toBeCloseTo(40, 9);
  });

  it('a stadium has two runs of half a turn each', () => {
    const d = createDesign(PLY);
    const s = addRoundPanel(d, 0, 0, 120, 60, { shape: 'stadium' })!;
    const runs = curveRuns(d.panels[s]);
    expect(runs).toHaveLength(2);
    for (const r of runs) expect(r.length).toBeCloseTo(Math.PI * 30, 1);
  });
});

describe('a round box', () => {
  it('corrugated 1.6, R 40: one closed wall of length 2π(R − t + k·t) at its outer face, tabs and slots matching, the export check clean', () => {
    const d = createDesign(CORR16);
    const base = addRoundPanel(d, 0, 0, 80, 80, { shape: 'circle' })!;
    addTray(d, base, 50);
    autoConnect(d);
    const [c] = bentOf(d, base);
    expect(wallsOf(d, base)).toHaveLength(1);
    expect(c.kind).toBe('tabslot');
    const W = d.panels[c.b.panelId];
    const t = CORR16.thickness, k = bendOf(CORR16).k;
    // the wall stands a web in (its slots need material outside them): its outer face is at R − offset
    const R = 40 - c.offset;
    expect(W.w).toBeCloseTo(2 * Math.PI * (R - t + k * t), 2);
    expect(W.bent?.closed).toBe(true);
    // its outer face lies on the circle R all round (each facet's ends)
    const ctr = d.panels[base].frame.o;
    for (const f of facetsOf(W)) {
      const p = panelToWorld(W, f.s0, 0, 0);
      expect(Math.hypot(p[0] - (ctr[0] + 40), p[2] - (ctr[2] - 40))).toBeCloseTo(R, 6);
    }
    // tabs: as many as slots, each slot as long as its tab along the curve plus the clearance
    const tabs = c.geom!.edges.find((e) => e.panelId === W.id)!.notches;
    expect(tabs.length).toBeGreaterThan(2);
    expect(c.geom!.holes).toHaveLength(tabs.length);
    const outline = panelOutline(d.panels[base], panelNotches(d, d.panels[base]));
    for (const h of c.geom!.holes) expect(h.poly.every((q) => pointInPolygon(q, outline))).toBe(true);
    for (const n of tabs) expect(n.depth).toBeCloseTo(-d.material.thickness, 9);
    // the closing seam: a glue flap past the strip's end
    expect(c.geom!.adds.filter((a) => a.panelId === W.id)).toHaveLength(1);
    expect(blocking(d)).toEqual([]);
    expect(() => sheetsToSvg(prepareExport(d).sheets)).not.toThrow();
  });

  it('a card circle has glue teeth folded onto the base, tapered round the curve; plywood wraps round its base (cut back under the wall)', () => {
    const d = createDesign(CARD);
    const base = addRoundPanel(d, 0, 0, 80, 80, { shape: 'circle' })!;
    addTray(d, base, 40);
    autoConnect(d);
    const [c] = bentOf(d, base);
    expect(c.kind).toBe('teeth');
    const teeth = c.geom!.adds.filter((a) => a.panelId === c.b.panelId && a.poly.some((q) => q.y < 0));
    expect(teeth.length).toBeGreaterThan(5);
    // a tooth's tip is narrower than its root
    for (const tth of teeth) {
      const root = Math.abs(tth.poly[1].x - tth.poly[0].x), tip = Math.abs(tth.poly[2].x - tth.poly[3].x);
      expect(tip).toBeLessThan(root);
    }
    expect(c.geom!.flaps3d.filter((f) => f.panelId === base)).toHaveLength(teeth.length);

    const p = createDesign(PLY);
    const pb = addRoundPanel(p, 0, 0, 160, 160, { shape: 'circle' })!;
    addTray(p, pb, 40);
    autoConnect(p);
    const [pc] = bentOf(p, pb);
    expect(pc.kind).toBe('wrap');
    // the wall is full height, standing on nothing: the base sits inside it
    expect(p.panels[pc.b.panelId].h).toBe(40);
    expect(panelExtras(p, p.panels[pb]).cuts.length).toBeGreaterThan(0);
    // its length at the neutral line, half way through
    expect(p.panels[pc.b.panelId].w).toBeCloseTo(2 * Math.PI * (80 - 1.5), 2);
    // a plywood strip edge to edge: no closing flap
    expect(pc.geom!.adds).toHaveLength(0);
  });

  it('save and load: the bend is derived, not saved, and comes back the same', () => {
    const d = createDesign(CORR16);
    const base = addRoundPanel(d, 0, 0, 80, 80, { shape: 'circle' })!;
    addTray(d, base, 50);
    autoConnect(d);
    const text = serializeProject(d);
    expect(text).not.toContain('"facets"');
    const back = parseProject(text);
    const [c] = bentOf(back, base);
    const W = back.panels[c.b.panelId], W0 = d.panels[c.b.panelId];
    expect(W.w).toBeCloseTo(W0.w, 9);
    expect(W.bent?.facets.length).toBe(W0.bent?.facets.length);
    expect(sheetsToSvg(prepareExport(back).sheets)).toBe(sheetsToSvg(prepareExport(d).sheets));
  });

  it('panelToLocal undoes panelToWorld on a bent wall', () => {
    const d = createDesign(CORR16);
    const base = addRoundPanel(d, 0, 0, 80, 80, { shape: 'circle' })!;
    addTray(d, base, 50);
    const W = d.panels[bentOf(d, base)[0].b.panelId];
    for (const x of [3, W.w / 3, W.w / 2, W.w - 4])
      for (const y of [5, 30]) {
        const l = panelToLocal(W, panelToWorld(W, x, y, 0.8), 1.6);
        expect(l.x).toBeCloseTo(x, 1);
        expect(l.y).toBeCloseTo(y, 6);
      }
  });
});

describe('a rounded-rectangle tray', () => {
  it('card: straight walls fold from the base, the corners are bent walls with teeth, glued in line to their neighbours', () => {
    const d = createDesign(CARD);
    const base = addRoundedRect(d, 0, 0, 100, 60, 15)!;
    addTray(d, base, 40);
    autoConnect(d);
    const straight = wallsOf(d, base).filter((c) => !d.panels[c.b.panelId].bent);
    expect(straight).toHaveLength(4);
    expect(straight.every((c) => c.kind === 'fold')).toBe(true);
    const bent = bentOf(d, base);
    expect(bent).toHaveLength(4);
    expect(bent.every((c) => c.kind === 'teeth')).toBe(true);
    // each corner is glued at both ends to the straight wall beside it (a flap behind it)
    for (const c of bent) {
      for (const at of ['s', 'e'] as const) {
        const s = d.connections[inlineId(c.b.panelId, at)];
        expect(s?.kind).toBe('glue');
        expect(s.geom!.adds).toHaveLength(1);
        expect(s.geom!.flaps3d[0].panelId).toBe(s.b.panelId);
      }
    }
    // the corner's ends meet its neighbours' ends: in line at the tangent points
    const c = bent.find((x) => x.a.edge === 'e1^~')!;
    const W = d.panels[c.b.panelId];
    const right = d.panels[wallsOf(d, base).find((x) => x.a.edge === 'e1')!.b.panelId];
    const below = d.panels[wallsOf(d, base).find((x) => x.a.edge === 'e0')!.b.panelId];
    expect(v3len(v3sub(panelToWorld(W, 0, 10), panelToWorld(below, below.w, 10)))).toBeLessThan(1e-6);
    expect(v3len(v3sub(panelToWorld(W, W.w, 10), panelToWorld(right, 0, 10)))).toBeLessThan(0.05);
    expect(blocking(d)).toEqual([]);
    expect(() => sheetsToSvg(prepareExport(d).sheets)).not.toThrow();
  });

  it('the tray card’s curved joint changes every bent wall; an unjoined in-line seam stays unjoined', () => {
    const d = createDesign(CORR16);
    const base = addRoundedRect(d, 0, 0, 120, 80, 30)!;
    addTray(d, base, 40);
    autoConnect(d);
    const tray = Object.values(d.trays)[0];
    expect(bentOf(d, base).every((c) => c.kind === 'teeth')).toBe(true);
    setTrayKinds(d, tray.id, { curveKind: 'wrap' });
    expect(bentOf(d, base).every((c) => c.kind === 'wrap')).toBe(true);
    const W = bentOf(d, base)[0].b.panelId;
    deleteConnection(d, inlineId(W, 's'));
    autoConnect(d);
    expect(d.connections[inlineId(W, 's')]).toBeUndefined();
    expect(d.connections[inlineId(W, 'e')]).toBeDefined();
  });

  it('plywood: a glue edge (the base inside the wall), and a check that names the missing living hinge', () => {
    const d = createDesign(PLY);
    const base = addRoundedRect(d, 0, 0, 160, 120, 40)!;
    addTray(d, base, 40);
    autoConnect(d);
    const bent = bentOf(d, base);
    expect(bent.every((c) => c.kind === 'wrap')).toBe(true);
    // fingers on the straight walls, which stand like the bent ones (outer faces flush with the base's edge)
    expect(wallsOf(d, base).filter((c) => !d.panels[c.b.panelId].bent).every((c) => c.kind === 'finger')).toBe(true);
    const keys = validate(d).map((i) => i.key);
    expect(keys.filter((k) => k === 'val.bendHinge')).toHaveLength(4);
    // tighter than a living hinge reaches: named as impossible
    setCornerRadius(d, base, 15);
    expect(validate(d).filter((i) => i.key === 'val.bendTight')).toHaveLength(4);
  });

  it('runPoint follows the base outline: the wall’s outer face at offset 0 is the outline itself', () => {
    const d = createDesign(CARD);
    const base = addRoundedRect(d, 0, 0, 100, 60, 15)!;
    addTray(d, base, 40);
    const W = d.panels[bentOf(d, base)[0].b.panelId];
    const ring = panelEdges(d.panels[base]);
    const p = runPoint(W.bent!, 0, 0);
    expect(ring.some((e) => Math.hypot(e.a.x - p.x, e.a.y - p.y) < 1e-9)).toBe(true);
  });
});
