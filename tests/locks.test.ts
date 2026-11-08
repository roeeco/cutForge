// Milestone 13: corrugated through tabs (tab-and-slot that folds under) and flute-aware tab width.
import { describe, expect, it } from 'vitest';
import { addRootPanel, addTray, autoConnect, createDesign, growPanel, setConnection, setTrayKinds } from '../src/model/ops';
import { autoLockDepth, minTabWidth } from '../src/model/seams';
import { findEdge, segDir, segInward } from '../src/model/edges';
import { panelOutline, panelNotches } from '../src/model/geometry';
import { prepareExport } from '../src/export/prepare';
import { flattenContour } from '../src/geom/vec';
import { validate } from '../src/model/validate';
import { MATERIALS } from '../src/model/materials';
import { maxOverlap } from './solid';
import type { Connection, Design, P2 } from '../src/model/types';

const CORR4 = MATERIALS[2];
const t = CORR4.thickness, c = CORR4.clearance;

function tray() {
  const d = createDesign(CORR4);
  const base = addRootPanel(d, 0, 0, 150, 100);
  const id = addTray(d, base, 60)!;
  setTrayKinds(d, id, { tabLen: 'through' });
  autoConnect(d);
  return { d, base, id };
}
const corners = (d: Design, id: string) => Object.values(d.connections).filter((x) => !x.grown && x.trayId === id);
const bbox = (pts: P2[]) => {
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};
/** Tab widths of a tab-and-slot connection, from the owner's notches (the odd segments). */
function tabWidths(d: Design, conn: Connection): number[] {
  const e = conn.geom!.edges.find((x) => x.panelId === conn.a.panelId)!;
  return e.notches.filter((_, i) => i % 2 === 1).map((n) => n.s1 - n.s0);
}

describe('corr-4 tray with through tabs', () => {
  it('slots are (t + c) × (w + c) in the cut file', () => {
    const { d, id } = tray();
    const cs = corners(d, id);
    expect(cs).toHaveLength(4);
    const widths = cs.flatMap((x) => tabWidths(d, x));
    expect(widths.length).toBeGreaterThan(0);
    // every slot in every corner: one side t + c, the other a tab width + c
    for (const x of cs)
      for (const h of x.geom!.holes) {
        const b = bbox(h.poly);
        const [small, big] = [Math.min(b.w, b.h), Math.max(b.w, b.h)];
        expect(small).toBeCloseTo(t + c, 6);
        expect(widths.some((w) => Math.abs(big - (w + c)) < 1e-6)).toBe(true);
      }
    // and the exported file has them (nominal kerf)
    const sheets = prepareExport(d, 'nominal').sheets;
    const holes = sheets.flatMap((s) => s.contours.filter((k) => k.op === 'cut' && k.role === 'hole')).map((k) => bbox(flattenContour(k.contour, 0.01)));
    const slots = holes.filter((b) => Math.abs(Math.min(b.w, b.h) - (t + c)) < 1e-3);
    expect(slots.length).toBe(cs.reduce((n, x) => n + x.geom!.holes.length, 0));
  });

  it('through tabs reach the fold-under length past the receiver, with a score at its far face', () => {
    const { d, id } = tray();
    const lock = autoLockDepth(CORR4);
    expect(lock).toBe(6);
    for (const x of corners(d, id)) {
      const O = d.panels[x.a.panelId];
      const e = findEdge(O, x.a.edge)!;
      const dir = segDir(e), inw = segInward(e);
      // tab notches protrude by the lock depth (corner tabs start at the receiver's outer face)
      const ns = panelNotches(d, O)[e.key];
      expect(ns.filter((n) => Math.abs(n.depth + lock) < 1e-9).length).toBe(tabWidths(d, x).length);
      // one score per tab, on the owner's edge line (the receiver's far face), as long as the tab
      const scores = x.geom!.scores.filter((s) => s.panelId === O.id);
      expect(scores).toHaveLength(tabWidths(d, x).length);
      for (const s of scores) {
        const off = (q: P2) => (q.x - e.a.x) * inw.x + (q.y - e.a.y) * inw.y;
        expect(off(s.a)).toBeCloseTo(0, 9);
        expect(off(s.b)).toBeCloseTo(0, 9);
        const len = Math.abs((s.b.x - s.a.x) * dir.x + (s.b.y - s.a.y) * dir.y);
        expect(tabWidths(d, x).some((w) => Math.abs(w - len) < 1e-9)).toBe(true);
      }
      // the owner's outline really reaches past its edge by the lock depth
      const out = panelOutline(O, panelNotches(d, O)).map((q) => (q.x - e.a.x) * inw.x + (q.y - e.a.y) * inw.y);
      expect(Math.min(...out)).toBeCloseTo(-lock, 6);
    }
    expect(validate(d)).toEqual([]);
  });

  it('tabs on corrugated are at least max(4 mm, 3t) wide', () => {
    const { d, id } = tray();
    expect(minTabWidth(CORR4)).toBe(12);
    for (const x of corners(d, id)) for (const w of tabWidths(d, x)) expect(w).toBeGreaterThanOrEqual(12 - 1e-9);
    // asking for more tabs than fit keeps them wide enough
    const x = corners(d, id)[0];
    setConnection(d, x.id, { tabs: 20 });
    for (const w of tabWidths(d, d.connections[x.id])) expect(w).toBeGreaterThanOrEqual(12 - 1e-9);
  });
});

describe('through tabs on a wall standing on a base', () => {
  it('tabs pass through the base and fold under its underside', () => {
    const d = createDesign(CORR4);
    const base = addRootPanel(d, 0, 0, 150, 100);
    const r = growPanel(d, base, 0, { height: 50, angle: 90, dir: 'up', kind: 'tabslot' })!;
    setConnection(d, r.connectionId, { tabLen: 'through' });
    const conn = d.connections[r.connectionId];
    const W = d.panels[r.panelId];
    const ns = panelNotches(d, W).e0;
    // the tabs reach t through the base and the lock depth beyond
    expect(Math.min(...ns.map((n) => n.depth))).toBeCloseTo(-t - autoLockDepth(CORR4), 9);
    // the score is at the base's underside (t below the wall's bottom edge)
    for (const s of conn.geom!.scores) {
      expect(s.a.y).toBeCloseTo(-t, 9);
      expect(s.b.y).toBeCloseTo(-t, 9);
    }
    for (const h of conn.geom!.holes) {
      const b = bbox(h.poly);
      expect(Math.min(b.w, b.h)).toBeCloseTo(t + c, 6);
    }
    expect(maxOverlap(d, [0, -1, -102], [152, 52, 2], 1.1)).toBe(1);
  });
});
