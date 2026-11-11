// More ways for tabs to hold: self-locking (snap) tabs and bolts in captive nuts.
import { describe, expect, it } from 'vitest';
import { addDivider, addRootPanel, addTray, createDesign, setConnection, setMaterial, setTrayKinds, solve } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { validate } from '../src/model/validate';
import { BOLT, boltCount, snapDepth, tabLocks } from '../src/model/seams';
import { buildPieces } from '../src/model/pieces';
import type { Design } from '../src/model/types';
import { polygonArea } from '../src/geom/vec';

const mat = (id: string) => MATERIALS.find((m) => m.id === id)!;

/** A box with a divider across it; the divider's two end joints (tabs into the side walls). */
function box(id: string) {
  const d = createDesign();
  setMaterial(d, mat(id));
  const base = addRootPanel(d, 0, 100, 160, 100);
  addTray(d, base, 50);
  const div = addDivider(d, base, 'e3', 70, 40)!;
  solve(d);
  // its two ends (milestone 44: its joint with the base is an edge on the base's face too, not one of its ends)
  const ends = Object.values(d.connections).filter((c) => !c.grown && c.kind === 'tabslot' && (c.a.panelId === div || c.b.panelId === div) && c.a.panelId !== base && c.b.panelId !== base);
  return { d, base, div, ends };
}
const blocking = (d: Design) => validate(d).filter((i) => !['val.split', 'val.bevel'].includes(i.key)).map((i) => i.key);
const outlineArea = (d: Design, id: string) => {
  const piece = buildPieces(d).find((p) => p.panels.some((x) => x.panelId === id))!;
  return piece.contours.filter((c) => c.role === 'outer').reduce((s, c) => s + Math.abs(polygonArea(c.contour.segs.map((g: any) => g.a))), 0);
};

describe('tab locks offered', () => {
  it('plywood: flush, self-locking, bolts; card and corrugated: flush, through and folded, self-locking', () => {
    expect(tabLocks(mat('ply-3'))).toEqual(['flush', 'snap', 'bolt']);
    expect(tabLocks(mat('card-0.5'))).toEqual(['flush', 'through', 'snap']);
    expect(tabLocks(mat('corr-4'))).toEqual(['flush', 'through', 'snap']);
    // a value already set stays offered
    expect(tabLocks(mat('ply-3'), 'through')).toContain('through');
  });
});

describe('self-locking tabs', () => {
  for (const id of ['ply-3', 'corr-4', 'card-0.5'])
    it(`${id}: tabs pass through, barbs catch behind the far face, a slit lets them flex; the export check stays clean`, () => {
      const { d, div, ends } = box(id);
      expect(ends.length).toBe(2);
      const before = blocking(d);
      const flushArea = outlineArea(d, div);
      const tabDepth = (cid: string) => d.connections[cid].geom!.edges.find((e) => e.panelId === div)!.notches.filter((_, k) => k % 2).map((n) => n.depth);
      const flush = Object.fromEntries(ends.map((c) => [c.id, tabDepth(c.id)]));
      for (const c of ends) setConnection(d, c.id, { tabLen: 'snap' });
      for (const c of ends) {
        const g = d.connections[c.id].geom!;
        const tabs = g.edges.find((e) => e.panelId === div)!.notches.filter((_, k) => k % 2);
        // each tab reaches the snap depth past the far face, with two barbs
        const barbs = g.adds.filter((a) => a.flat && a.panelId === div);
        expect(barbs.length).toBe(2 * tabs.length);
        for (const b of barbs) expect(Math.abs(polygonArea(b.poly))).toBeGreaterThan(0);
        tabDepth(c.id).forEach((v, i) => expect(v).toBeCloseTo(flush[c.id][i] - snapDepth(mat(id)), 6));
        // the slits (or half barbs on a tab too narrow to split)
        const slits = (g.cuts ?? []).filter((k) => k.panelId === div);
        if (slits.length) expect(slits.length).toBe(tabs.length);
      }
      // the piece is bigger by the longer tabs and the barbs
      expect(outlineArea(d, div)).toBeGreaterThan(flushArea);
      expect(blocking(d)).toEqual(before);
    });
});

describe('bolts and captive nuts', () => {
  it('plywood divider ends: a T-slot for the nut in the divider and a screw hole in the wall, at the two end gaps', () => {
    const { d, div, ends } = box('ply-3');
    const before = blocking(d);
    for (const c of ends) setConnection(d, c.id, { tabLen: 'bolt' });
    for (const c of ends) {
      const cc = d.connections[c.id];
      expect(boltCount(cc)).toBe(2);
      const tslots = (cc.geom!.cuts ?? []).filter((k) => k.panelId === div);
      expect(tslots).toHaveLength(2);
      for (const k of tslots) expect(k.poly).toHaveLength(12);
      const other = cc.a.panelId === div ? cc.b.panelId : cc.a.panelId;
      const holes = cc.geom!.holes.filter((h) => h.panelId === other && h.poly.length === 20);
      expect(holes).toHaveLength(2);
      // the screw hole is the screw's size plus the clearance
      const r = Math.hypot(holes[0].poly[0].x - holes[0].poly[10].x, holes[0].poly[0].y - holes[0].poly[10].y) / 2;
      expect(r).toBeCloseTo((BOLT.d + mat('ply-3').clearance) / 2, 6);
    }
    expect(blocking(d)).toEqual(before);
  });

  it('a tray’s corners can be bolted', () => {
    const d = createDesign();
    setMaterial(d, mat('ply-3'));
    const base = addRootPanel(d, 0, 100, 160, 100);
    const tid = addTray(d, base, 60, { cornerKind: 'tabslot' })!;
    setTrayKinds(d, tid, { tabLen: 'bolt' });
    const corners = Object.values(d.connections).filter((c) => c.trayId === tid && !c.grown);
    expect(corners.length).toBe(4);
    for (const c of corners) expect(c.tabLen).toBe('bolt');
    expect(corners.reduce((n, c) => n + boltCount(c), 0)).toBeGreaterThan(0);
  });
});
