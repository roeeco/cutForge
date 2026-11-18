// Milestone 64 (PACKAGING_PLAN.md §4.2, §4.4–§4.7): curved tray walls round a base's rounded corners.
import { describe, expect, it } from 'vitest';
import { addRootPanel, addRoundedRect, addTray, autoConnect, createDesign, setConnection, setCornerRadius, solve } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { bandOf, bandWorld } from '../src/model/bands';
import { trayCorners, wingBand, wingId } from '../src/model/wings';
import { buildPieces, netOverlaps } from '../src/model/pieces';
import { validate } from '../src/model/validate';
import { fixIssue } from '../src/easy/fix';
import { prepareExport } from '../src/export/prepare';
import { sheetsToSvg } from '../src/export/svg';
import { toWorld } from '../src/model/frame';
import type { Design } from '../src/model/types';
import { idempotence, roundTrip, speedRatio, sweepBack } from './harness';

const [CARD, CORR16, , PLY] = MATERIALS;
const bendKeys = (d: Design) => validate(d).filter((i) => i.key.startsWith('val.bend'));

function roundedTray(m: typeof CARD, r: number, w = 120, h = 80, height = 40) {
  const d = createDesign(m);
  const base = addRoundedRect(d, 0, 0, w, h, r)!;
  const tray = addTray(d, base, height)!;
  autoConnect(d);
  return { d, base, tray };
}
const wings = (d: Design) => Object.values(d.connections).filter((c) => c.wing);

describe('curved tray walls', () => {
  it('a card rounded tray is five panels: a base and four walls, each corner a band glued to the next wall; one piece that lies flat', () => {
    const { d } = roundedTray(CARD, 15);
    expect(d.order).toHaveLength(5);
    const ws = wings(d);
    expect(ws).toHaveLength(4);
    expect(ws.every((c) => c.kind === 'glue')).toBe(true);
    expect(buildPieces(d)).toHaveLength(1);
    expect(netOverlaps(d)).toEqual([]);
    expect(bendKeys(d)).toEqual([]);
    expect(() => sheetsToSvg(prepareExport(d).sheets)).not.toThrow();
  });

  it('a band leaves one wall where it ends and arrives where the next one starts, round the fillet', () => {
    for (const m of [CARD, PLY]) {
      const { d } = roundedTray(m, 30);
      for (const c of wings(d)) {
        const b = wingBand(d, c)!;
        const B = d.panels[c.b.panelId];
        const end = bandWorld(b, b.T2, 0), start = toWorld(B.frame, 0, 0, 0);
        expect(Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2])).toBeLessThan(1e-6);
        expect(b.phi).toBeCloseTo(Math.PI / 2, 9);
        expect(b.lb).toBeCloseTo((Math.PI / 2) * (b.r + b.k * b.t), 9);
      }
    }
  });

  it('plywood: the walls are one strip round the corners (living hinges), closed with a key at the back left; the base is cut back under the bands', () => {
    const { d, base } = roundedTray(PLY, 30);
    const ws = wings(d);
    expect(ws.map((c) => c.kind).sort()).toEqual(['fold', 'fold', 'fold', 'key']);
    const pieces = buildPieces(d);
    expect(pieces).toHaveLength(2);
    const strip = pieces.find((p) => p.key !== base)!;
    expect(strip.panels).toHaveLength(4);
    // living-hinge slits in each of the three bands in the strip, keyed shut at the fourth
    const b = bandOf(d, ws.find((c) => c.kind === 'fold')!)!;
    expect(b.pattern.id).toBe('slits');
    expect(strip.contours.filter((x) => x.op === 'cut' && x.role === 'line').length).toBeGreaterThan(30);
    // the key's band: slits as the key's wall's open cut lines
    const keyed = ws.find((c) => c.kind === 'key')!;
    expect(d.connections[keyed.id].geom?.lines?.length).toBeGreaterThan(5);
    // the closing corner is the one nearest the back left
    const corners = trayCorners(d, Object.values(d.trays)[0]);
    const closing = corners.find((k) => wingId(k.a, k.b) === keyed.id)!;
    expect(corners.every((k) => -k.c.x + k.c.y <= -closing.c.x + closing.c.y + 1e-9)).toBe(true);
    // the base: cut back at its corners for the bands
    expect(d.connections[ws[0].id].geom?.cuts?.some((x) => x.panelId === base)).toBe(true);
    expect(bendKeys(d)).toEqual([]);
    expect(() => sheetsToSvg(prepareExport(d, 'compensated').sheets)).not.toThrow();
  });

  it('a plywood strip longer than the sheet is keyed apart again; the closing corner can be moved', () => {
    const { d, tray } = roundedTray(PLY, 30, 300, 250, 40);
    const keys = () => wings(d).filter((c) => c.kind === 'key').length;
    expect(keys()).toBeGreaterThan(1);
    for (const p of buildPieces(d)) for (const c of p.contours) expect(c.contour.segs.every((s) => s.a.x < 2000)).toBe(true);
    const small = roundedTray(PLY, 30);
    const t = small.d.trays[small.tray];
    const before = wings(small.d).find((c) => c.kind === 'key')!.id;
    const other = trayCorners(small.d, t).find((k) => wingId(k.a, k.b) !== before)!;
    t.closeAt = other.a;
    solve(small.d);
    expect(wings(small.d).find((c) => c.kind === 'key')!.id).toBe(wingId(other.a, other.b));
    expect(tray).toBeTruthy();
  });

  it('a corner joined by hand keeps its kind; one piece is not offered where the next wall already folds off the base', () => {
    const { d } = roundedTray(CARD, 15);
    const c = wings(d)[0];
    setConnection(d, c.id, { kind: 'butt' });
    expect(d.connections[c.id].kind).toBe('butt');
    setConnection(d, c.id, { kind: 'fold' });
    expect(d.connections[c.id].kind).toBe('butt');
  });

  it('corrugated corners tighter than it bends, even kiss-scored, are named; Fix rounds the base corner to what it needs', () => {
    const { d, base } = roundedTray(CORR16, 6);
    const issues = bendKeys(d);
    expect(issues.length).toBe(4);
    expect(issues.every((i) => i.key === 'val.bendTight')).toBe(true);
    for (let n = 0; n < 4; n++) {
      const i = bendKeys(d)[0];
      if (!i) break;
      expect(fixIssue(d, i)).toBe(true);
    }
    expect(bendKeys(d)).toEqual([]);
    expect(d.order).toHaveLength(5);
    expect(base).toBeTruthy();
  });

  it('every corner radius keeps the same walls and corners; a radius swept up and back returns the design', () => {
    for (const m of [CARD, PLY]) {
      const { d, base } = roundedTray(m, 30);
      const ids = () => [d.order.join(), wings(d).map((c) => c.id).sort().join()].join('/');
      const before = ids();
      for (const r of [40, 60, 8, 3, 30]) {
        setCornerRadius(d, base, r);
        expect(ids()).toBe(before);
      }
      expect(sweepBack(d, (x, v) => setCornerRadius(x, base, v), 30, [40, 60, 8, 3])).toBeNull();
      expect(idempotence(d)).toBeNull();
      expect(roundTrip(d)).toBeNull();
    }
  });

  it('speed: a rounded tray solves within twice the time of the same tray with square corners', () => {
    for (const m of [CARD, PLY]) {
      const sq = createDesign(m);
      addTray(sq, addRootPanel(sq, 0, 0, 120, 80), 40);
      autoConnect(sq);
      const { d } = roundedTray(m, m.kind === 'plywood' ? 30 : 15);
      expect(speedRatio(() => solve(d), () => solve(sq), 15)).toBeLessThan(2);
    }
  });
});
