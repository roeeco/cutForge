// Milestone 48 (CURVED_WALLS.md §4.3, §7.3): strips (in-line nets, closing seams, splitting) and arched lids.
import { describe, expect, it } from 'vitest';
import { addArchedLid, addDetail, addRootPanel, addRoundPanel, addRoundedRect, addTray, autoConnect, createDesign, removeArchedLid, setArchRise, setBend } from '../src/model/ops';
import { MATERIALS, bendOf } from '../src/model/materials';
import { buildPieces, netOverlaps, pieceKeyOf } from '../src/model/pieces';
import { panelToWorld } from '../src/model/bent';
import { findRun, findEdge } from '../src/model/edges';
import { keyDims, stripMax } from '../src/model/strips';
import { archMaxRise } from '../src/model/arch';
import { styleReach } from '../src/model/bendPattern';
import { validate } from '../src/model/validate';
import { parseProject, serializeProject } from '../src/model/serialize';
import { prepareExport } from '../src/export/prepare';
import { sheetsToSvg } from '../src/export/svg';
import { flattenContour, polygonArea } from '../src/geom/vec';
import { v3dot, v3len, v3sub } from '../src/geom/v3';
import type { Design, Panel } from '../src/model/types';

const [CARD, CORR16, , PLY] = MATERIALS;
const NOTES = ['val.split', 'val.bevel', 'val.stripSplit'];
const blocking = (d: Design) => validate(d).filter((i) => !NOTES.includes(i.key));
const bentWalls = (d: Design) => d.order.map((id) => d.panels[id]).filter((p): p is Panel => !!p?.bent);
const seamsOf = (d: Design, W: Panel) => Object.values(d.connections).filter((c) => !c.grown && c.a.panelId === W.id && /\|[se]$/.test(c.id));

function roundedBox(m: typeof CARD, r: number, w = 120, h = 80, height = 40) {
  const d = createDesign(m);
  const base = addRoundedRect(d, 0, 0, w, h, r)!;
  addTray(d, base, height);
  autoConnect(d);
  return { d, base };
}

describe('in-line nets', () => {
  it('a card rounded tray is one net that lies flat: each corner continues one straight wall, glued to the next', () => {
    const { d, base } = roundedBox(CARD, 15);
    const walls = bentWalls(d);
    expect(walls).toHaveLength(4);
    for (const W of walls) {
      const kinds = seamsOf(d, W).map((c) => c.kind).sort();
      expect(kinds).toEqual(['glue', 'inline']);
      const ride = seamsOf(d, W).find((c) => c.kind === 'inline')!;
      expect(ride.rides).toBe(W.id);
      expect(pieceKeyOf(d, W.id)).toBe(base);
      // in the net the corner starts where its wall ends, in line (no fold allowance, no score between them)
      const piece = buildPieces(d).find((p) => p.key === base)!;
      const nW = piece.panels.find((n) => n.panelId === W.id)!, nS = piece.panels.find((n) => n.panelId === ride.b.panelId)!;
      const start = ride.a.edge === 'e3';
      const eS = findEdge(d.panels[ride.b.panelId], start ? 'e1' : 'e3')!;
      const at = (xf: typeof nW.xf, q: { x: number; y: number }) => ({ x: Math.cos(xf.rot) * (xf.mirror ? -q.x : q.x) - Math.sin(xf.rot) * q.y + xf.tx, y: Math.sin(xf.rot) * (xf.mirror ? -q.x : q.x) + Math.cos(xf.rot) * q.y + xf.ty });
      const pw = at(nW.xf, { x: start ? 0 : W.w, y: 0 }), ps = at(nS.xf, start ? eS.a : eS.b);
      expect(Math.hypot(pw.x - ps.x, pw.y - ps.y)).toBeLessThan(0.6);
    }
    // the base and every wall: one piece, lying flat
    expect(buildPieces(d)).toHaveLength(1);
    expect(netOverlaps(d)).toEqual([]);
    expect(blocking(d)).toEqual([]);
    expect(() => sheetsToSvg(prepareExport(d).sheets)).not.toThrow();
  });

  it('corrugated: each corner rides on the wall that keeps its flutes up the wall on the sheet', () => {
    const { d, base } = roundedBox(CORR16, 20);
    const piece = buildPieces(d).find((p) => p.key === base)!;
    expect(buildPieces(d)).toHaveLength(1);
    for (const W of bentWalls(d)) {
      const ride = seamsOf(d, W).find((c) => c.kind === 'inline')!;
      expect(ride).toBeTruthy();
      // its height runs along the sheet's y (the flutes): its net transform turns it by 0 or 180°
      const n = piece.panels.find((x) => x.panelId === W.id)!;
      expect(Math.abs(Math.cos(n.xf.rot))).toBeCloseTo(1, 6);
    }
    expect(netOverlaps(d)).toEqual([]);
    expect(blocking(d)).toEqual([]);
  });

  it('a plywood flex box is one strip: four straight walls and four hinge corners, closed with a puzzle key at the back left', () => {
    const { d, base } = roundedBox(PLY, 30);
    const pieces = buildPieces(d);
    expect(pieces).toHaveLength(2);
    const strip = pieces.find((p) => p.key !== base)!;
    expect(strip.panels).toHaveLength(8);
    expect(strip.panels.filter((n) => d.panels[n.panelId].bent)).toHaveLength(4);
    const seams = Object.values(d.connections).filter((c) => !c.grown && /\|[se]$/.test(c.id));
    expect(seams.filter((c) => c.kind === 'key')).toHaveLength(1);
    expect(seams.filter((c) => c.kind === 'inline')).toHaveLength(7);
    const key = seams.find((c) => c.kind === 'key')!;
    // a key on one side, its socket on the other
    expect(key.geom!.adds).toHaveLength(1);
    expect(key.geom!.cuts).toHaveLength(1);
    expect(key.geom!.adds[0].panelId).not.toBe(key.geom!.cuts![0].panelId);
    // the strip lies in one line: every panel unturned, end to end along x
    for (const n of strip.panels) expect(n.xf.rot).toBe(0);
    // the closing seam is the one furthest to the back left
    const W = d.panels[key.a.panelId];
    const q = key.id.endsWith('|s') ? W.bent!.pts[0].p : W.bent!.pts[W.bent!.pts.length - 1].p;
    for (const c of seams) {
      const V = d.panels[c.a.panelId], p = c.id.endsWith('|s') ? V.bent!.pts[0].p : V.bent!.pts[V.bent!.pts.length - 1].p;
      expect(-p.x + p.y).toBeLessThanOrEqual(-q.x + q.y + 1e-9);
    }
    expect(blocking(d)).toEqual([]);
    // the strip and the base: one outline each on the sheet
    const outers = prepareExport(d).sheets.flatMap((s) => s.contours).filter((c) => c.role === 'outer');
    expect(outers).toHaveLength(2);
  });

  it('a plywood strip longer than the sheet is keyed apart at a seam where the sheet runs out', () => {
    const d = createDesign({ ...PLY, id: 'ply-short', sheetW: 300 });
    const base = addRoundedRect(d, 0, 0, 120, 80, 30)!;
    addTray(d, base, 40);
    autoConnect(d);
    const max = stripMax(d, d.material);
    const pieces = buildPieces(d).filter((p) => p.key !== base);
    expect(pieces.length).toBeGreaterThan(1);
    for (const p of pieces) expect(p.panels.reduce((s, n) => s + d.panels[n.panelId].w, 0)).toBeLessThanOrEqual(max + 1e-6);
    expect(blocking(d)).toEqual([]);
  });
});

describe('closing seams and splitting', () => {
  it('a plywood circle is closed with a puzzle key; moving its closing seam keeps its shapes where they are on the box', () => {
    const d = createDesign(PLY);
    const base = addRoundPanel(d, 0, 0, 100, 100, { shape: 'circle' })!;
    addTray(d, base, 40);
    autoConnect(d);
    const [W0] = bentWalls(d);
    const c = Object.values(d.connections).find((x) => x.grown && x.b.panelId === W0.id)!;
    expect(c.geom!.adds.filter((a) => a.panelId === W0.id && a.flat)).toHaveLength(1);
    const id = addDetail(d, W0.id, 'circle', 'cut', W0.w * 0.3, 20, 6, 6)!;
    const before = panelToWorld(d.panels[W0.id], W0.w * 0.3, 20);
    const start0 = panelToWorld(d.panels[W0.id], 0, 0);
    setBend(d, W0.id, { seamAt: 0.25 });
    const W = d.panels[W0.id];
    expect(W.bend?.seamAt).toBe(0.25);
    // the strip starts a quarter round further
    const start = panelToWorld(W, 0, 0);
    expect(v3len(v3sub(start, start0))).toBeGreaterThan(30);
    const dt = W.details.find((x) => x.id === id)!;
    expect(v3len(v3sub(panelToWorld(W, dt.cx, dt.cy), before))).toBeLessThan(1);
    // back again
    setBend(d, W.id, { seamAt: null });
    expect(d.panels[W.id].bend).toBeUndefined();
    expect(v3len(v3sub(panelToWorld(d.panels[W.id], 0, 0), start0))).toBeLessThan(1e-6);
    expect(blocking(d)).toEqual([]);
  });

  it('a 600 mm circumference on a 500 mm card sheet is cut in two, joined by a puzzle key', () => {
    const d = createDesign(CARD);
    // the wall's outer face: 600 / π across (teeth stand it on the base's edge)
    const dia = 600 / Math.PI;
    const base = addRoundPanel(d, 0, 0, dia, dia, { shape: 'circle' })!;
    addTray(d, base, 40);
    autoConnect(d);
    const [W] = bentWalls(d);
    expect(W.w).toBeGreaterThan(stripMax(d, CARD));
    expect(W.w).toBeLessThan(2 * stripMax(d, CARD));
    expect(keyDims(CARD, W.h)).not.toBeNull();
    const parts = buildPieces(d).filter((p) => p.key.startsWith(W.id));
    expect(parts).toHaveLength(2);
    // each part fits the sheet along it
    for (const p of parts) {
      const xs = p.contours.filter((c) => c.role === 'outer').flatMap((c) => flattenContour(c.contour, 0.1).map((q) => q.x));
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(CARD.sheetW);
    }
    const keys = validate(d).map((i) => i.key);
    expect(keys).toContain('val.stripSplit');
    expect(blocking(d)).toEqual([]);
  });
});

describe('arched lid', () => {
  const box = (m: typeof CARD, w = 160, depth = 100) => {
    const d = createDesign(m);
    const b = addRootPanel(d, 0, 0, w, depth);
    const tid = addTray(d, b, 60)!;
    autoConnect(d);
    return { d, tid };
  };

  it('corrugated: both end walls follow the rise, the lid is the arc’s developed length, and its far edge is joined to the follower', () => {
    const { d, tid } = box(CORR16);
    const lid = addArchedLid(d, tid, 30)!;
    expect(lid).toBeTruthy();
    const a = d.trays[tid].arch!;
    expect(a.rise).toBe(30);
    const L = d.panels[a.lead], F = d.panels[a.follow], P = d.panels[lid];
    // the short end walls
    expect(L.w).toBeCloseTo(100, 6);
    expect(F.sketch.kind === 'wall' && F.sketch.match).toBe(L.id);
    // both apexes 30 above the top corners, at the same height
    const top = (W: Panel) => Math.max(...findRun(W, 'e2~')!.segs.map((e) => e.a.y)) - W.h;
    expect(top(L)).toBeCloseTo(30, 6);
    expect(top(F)).toBeCloseTo(30, 6);
    // the lid: bent over the leader's arch, its length the arch at its neutral line
    const run = findRun(L, 'e2~')!;
    const c = 100, R = (c * c / 4 + 30 * 30) / 60, theta = 2 * Math.asin(c / (2 * R));
    expect(P.bent).toBeTruthy();
    expect(P.w).toBeCloseTo(run.length + bendOf(CORR16).k * CORR16.thickness * theta, 0);
    // its underside lies on the arch at its apex
    const apexL = panelToWorld(L, L.w / 2, L.h + 30);
    const under = panelToWorld(P, P.w / 2, 0, CORR16.thickness);
    expect(Math.abs(under[1] - apexL[1])).toBeLessThan(0.2);
    // it spans from the leader's inner face to the follower's
    const far = panelToWorld(P, P.w / 2, P.h, 0);
    const toF = v3sub(far, panelToWorld(P, P.w / 2, 0, 0));
    expect(v3len(toF)).toBeCloseTo(Math.abs(v3dot(v3sub(F.frame.o, L.frame.o), [1, 0, 0])) - 2 * CORR16.thickness, 1);
    const fc = d.connections[`${tid}|arch`];
    expect(fc.kind).toBe('teeth');
    expect(fc.broken).toBeFalsy();
    expect(fc.geom!.adds.length).toBeGreaterThan(2);
    expect(fc.geom!.flaps3d.every((f) => f.panelId === F.id)).toBe(true);
    expect(blocking(d)).toEqual([]);
    // a higher arch follows on both walls and the lid
    const w0 = P.w;
    setArchRise(d, tid, 40);
    expect(top(d.panels[a.follow])).toBeCloseTo(40, 6);
    expect(d.panels[lid].w).toBeGreaterThan(w0);
  });

  it('the rise is clamped so the arch is no tighter than the material bends; plywood gets a living hinge; save, load and removal', () => {
    const { d, tid } = box(PLY, 160, 50);
    const lid = addArchedLid(d, tid, 100)!;
    const a = d.trays[tid].arch!;
    const reach = styleReach(PLY, 'lattice');
    expect(a.rise).toBeCloseTo(archMaxRise(50, reach), 6);
    expect(findRun(d.panels[a.lead], 'e2~')!.minR).toBeCloseTo(reach, 1);
    expect(d.panels[lid].bent!.pattern!.style).toBe('lattice');
    expect(d.connections[`${tid}|arch`].kind).toBe('butt');
    const e = parseProject(serializeProject(d));
    expect(e.trays[tid].arch).toEqual(a);
    expect(e.panels[lid].w).toBeCloseTo(d.panels[lid].w, 6);
    expect(removeArchedLid(d, tid)).toBe(true);
    expect(d.panels[lid]).toBeUndefined();
    expect(d.trays[tid].arch).toBeUndefined();
    const L = d.panels[a.lead], F = d.panels[a.follow];
    expect(L.sketch.kind === 'wall' && L.sketch.arch).toBeFalsy();
    expect(F.sketch.kind === 'wall' && F.sketch.match).toBeFalsy();
    expect(d.connections[`${tid}|arch`]).toBeUndefined();
    expect(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }])).toBeGreaterThan(0);
  });
});
