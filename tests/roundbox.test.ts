// Milestone 65 (PACKAGING_PLAN.md §4.5, §6.2): round boxes on circles, ovals and stadiums.
import { describe, expect, it } from 'vitest';
import { addRoundPanel, addTray, autoConnect, createDesign, setRoundShape, setTrayCurveKind, setTrayKinds, solve } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { findEdge, panelEdges, segLength } from '../src/model/edges';
import { bandWorld } from '../src/model/bands';
import { trayCorners, wingBands, wingLength } from '../src/model/wings';
import { buildPieces, netOverlaps } from '../src/model/pieces';
import { validate } from '../src/model/validate';
import { prepareExport } from '../src/export/prepare';
import { sheetsToSvg } from '../src/export/svg';
import { toWorld } from '../src/model/frame';
import { addRoundBox, roundedMin } from '../src/easy/recipes';
import type { Design } from '../src/model/types';
import { idempotence, roundTrip, sweepBack } from './harness';

const [CARD, CORR16, , PLY] = MATERIALS;
const wings = (d: Design) => Object.values(d.connections).filter((c) => c.wing);
const issues = (d: Design) => validate(d).filter((i) => i.key !== 'val.tooBig' && i.key !== 'val.split');

function roundBox(m: typeof CARD, shape: 'circle' | 'oval' | 'stadium', w = 100, h = 100, height = 45) {
  const d = createDesign(m);
  const base = addRoundPanel(d, 0, 0, w, h, { shape })!;
  const tray = addTray(d, base, height)!;
  autoConnect(d);
  return { d, base, tray };
}

describe('the seam flat', () => {
  it('walling a circle gives it a flat at the back left, as wide as the material needs, the rest still on the circle', () => {
    for (const [m, w] of [[CARD, 12], [CORR16, 16], [PLY, 20]] as const) {
      const { d, base } = roundBox(m, 'circle');
      const p = d.panels[base];
      expect(p.sketch.kind === 'poly' && p.sketch.round?.seam?.w).toBe(w);
      const seam = findEdge(p, 'seam')!;
      expect(segLength(seam)).toBeCloseTo(w, 6);
      // its middle faces the back left (135°) from the circle's centre
      const c = { x: 50, y: 50 };
      const mid = { x: (seam.a.x + seam.b.x) / 2 - c.x, y: (seam.a.y + seam.b.y) / 2 - c.y };
      expect(Math.atan2(mid.y, mid.x)).toBeCloseTo((3 * Math.PI) / 4, 6);
      // every other point on the circle
      for (const e of panelEdges(p)) if (e.key !== 'seam') expect(Math.hypot(e.a.x - c.x, e.a.y - c.y)).toBeCloseTo(50, 6);
    }
  });

  it('a stadium needs none: its straight sides take walls', () => {
    const { d, base } = roundBox(CARD, 'stadium', 140, 80);
    const p = d.panels[base];
    expect(p.sketch.kind === 'poly' && p.sketch.round?.seam).toBeUndefined();
    expect(wings(d)).toHaveLength(2);
  });
});

describe('round boxes', () => {
  it('a circle in each material: one wall on the flat, its band all round and back to its own start', () => {
    for (const [m, kind] of [[CARD, 'glue'], [CORR16, 'glue'], [PLY, 'key']] as const) {
      const { d } = roundBox(m, 'circle');
      expect(d.order).toHaveLength(2);
      const ws = wings(d);
      expect(ws).toHaveLength(1);
      const c = ws[0];
      expect(c.a.panelId).toBe(c.b.panelId);
      expect(c.kind).toBe(kind);
      // the circle's arcs are one band, between the flat's two creases
      const bs = wingBands(d, c);
      expect(bs).toHaveLength(1);
      const k = trayCorners(d, Object.values(d.trays)[0])[0];
      expect(k.parts.map((p) => p.kind)).toEqual(['crease', 'arc', 'crease']);
      // the band ends where the wall starts (3D), and is as long as the circle less the flat, at the neutral line
      const W = d.panels[c.a.panelId], b = bs[0];
      const end = bandWorld(b, b.T2, 0), start = toWorld(W.frame, 0, 0, 0);
      expect(Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2])).toBeLessThan(1e-6);
      expect(wingLength(d, c)).toBeCloseTo(b.phi * (b.r + b.k * b.t), 9);
      expect(b.phi).toBeGreaterThan(5.5);
      expect(issues(d)).toEqual([]);
      expect(netOverlaps(d)).toEqual([]);
      expect(() => sheetsToSvg(prepareExport(d).sheets)).not.toThrow();
    }
  });

  it('card: glue teeth under the band, folded onto the base, none where they would lie on it in the net', () => {
    const { d, base } = roundBox(CARD, 'circle');
    const c = wings(d)[0];
    const g = d.connections[c.id].geom!;
    const teeth = g.adds.filter((a) => a.poly.some((q) => q.y < -1));
    expect(teeth.length).toBeGreaterThan(10);
    expect(g.flaps3d.filter((f) => f.panelId === base)).toHaveLength(teeth.length);
    // one piece: base, wall, strip
    expect(buildPieces(d)).toHaveLength(1);
  });

  it('corrugated: walls standing in by a web hold their band with tabs through slots that follow the curve, inside the base', () => {
    const { d, base, tray } = roundBox(CORR16, 'circle', 120, 120);
    setTrayKinds(d, tray, { wallKind: 'tabslot' });
    setTrayCurveKind(d, tray, 'tabslot');
    autoConnect(d);
    const c = wings(d)[0];
    const slots = d.connections[c.id].geom!.holes.filter((h) => h.panelId === base);
    expect(slots.length).toBeGreaterThan(4);
    expect(validate(d).filter((i) => i.key === 'val.slotEdge')).toEqual([]);
  });

  it('plywood: the strip is keyed shut on its wall; the base cut back under the band so it wraps round', () => {
    const { d, base } = roundBox(PLY, 'circle', 120, 120);
    const c = wings(d)[0];
    expect(c.kind).toBe('key');
    expect(d.connections[c.id].geom!.cuts!.some((x) => x.panelId === base)).toBe(true);
    expect(buildPieces(d)).toHaveLength(2);
    expect(wingBands(d, c)[0].pattern.id).toBe('slits');
  });

  it('ovals and stadiums: a band per arc, joined end to end', () => {
    for (const m of [CARD, PLY]) {
      const ov = roundBox(m, 'oval', 160, 100);
      const bs = wingBands(ov.d, wings(ov.d)[0]);
      expect(bs.length).toBe(5);
      for (let i = 1; i < bs.length; i++) {
        const a = bandWorld(bs[i - 1], bs[i - 1].T2, 0), b = bandWorld(bs[i], bs[i].T1, 0);
        expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(1e-6);
        expect(bs[i].pos).toBeCloseTo(bs[i - 1].pos! + bs[i - 1].lb, 9);
      }
      expect(issues(ov.d)).toEqual([]);
      const st = roundBox(m, 'stadium', 160, 100);
      expect(wings(st.d).map((c) => wingBands(st.d, c).length)).toEqual([1, 1]);
      expect(issues(st.d)).toEqual([]);
    }
  });

  it('a round box solves to itself, saves and reopens, and resized and back returns the same design', () => {
    for (const m of [CARD, PLY]) {
      const { d, base } = roundBox(m, 'circle');
      expect(idempotence(d)).toBeNull();
      expect(roundTrip(d)).toBeNull();
      expect(sweepBack(d, (x, v) => setRoundShape(x, base, { w: v }), 100, [140, 80, 200])).toBeNull();
      solve(d);
    }
  });
});

describe('Quick build: the Round box', () => {
  it('a square drag is a circle, a longer one an oval; both no tighter than the walls bend', () => {
    for (const m of [CARD, PLY]) {
      const min = roundedMin(m, 45);
      const d = createDesign(m);
      const c = addRoundBox(d, -50, -50, 50, 52, min)!;
      const p = d.panels[c];
      expect(p.sketch.kind === 'poly' && p.sketch.round?.shape).toBe('circle');
      const o = addRoundBox(d, 100, -40, 260, 40, min)!;
      const q = d.panels[o];
      expect(q.sketch.kind === 'poly' && q.sketch.round?.shape).toBe('oval');
      expect(q.sketch.kind === 'poly' && q.sketch.round!.rEnd!).toBeGreaterThanOrEqual(min - 1e-6);
      // too small: grown to twice the radius
      const s = addRoundBox(d, 300, 0, 310, 10, min)!;
      expect(d.panels[s].w).toBeGreaterThanOrEqual(2 * min - 1e-6);
    }
  });
});
