// Milestone 113 (D1): the Net view's picking — every edge of a net with what it is, in copy coordinates.
import { describe, expect, it } from 'vitest';
import { addPolygonPanel, addRootPanel, addTray, autoConnect, createDesign, growPanel, regularPolygon } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { pieceCopies } from '../src/model/pack';
import { foldChips, netEdges } from '../src/views/netPick';
import { cartonDesign } from '../src/templates/structures/carton';
import type { Design } from '../src/model/types';
import type { Vec2 } from '../src/geom/types';

const CARD = MATERIALS[0];

/** A card base with four walls grown as folds and glued at the corners. */
function plainTray(): { d: Design; base: string; walls: string[] } {
  const d = createDesign(CARD);
  const base = addRootPanel(d, 0, 0, 100, 70);
  const walls = ['e0', 'e1', 'e2', 'e3'].map((e) => growPanel(d, base, e, { height: 40, angle: 90, dir: 'up', kind: 'fold' })!.panelId);
  autoConnect(d);
  return { d, base, walls };
}

/** Distance from a point to a segment. */
const dist = (p: Vec2, a: Vec2, b: Vec2) => {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};

describe('net picking', () => {
  it('a card tray: one piece; each wall top free, each wall bottom a fold, the base edges folds, the sides glued', () => {
    const { d, base, walls } = plainTray();
    const copies = pieceCopies(d);
    expect(copies).toHaveLength(1);
    const es = netEdges(d, copies[0]);
    for (const w of walls) {
      expect(es.find((e) => e.panelId === w && e.key === 'e2')!.free).toBe(true);
      expect(es.find((e) => e.panelId === w && e.key === 'e0')!.foldId).toBeTruthy();
      for (const k of ['e1', 'e3']) {
        const e = es.find((x) => x.panelId === w && x.key === k)!;
        expect(e.free).toBe(false);
        expect(e.jointId).toBeTruthy();
      }
    }
    for (const k of ['e0', 'e1', 'e2', 'e3']) expect(es.find((e) => e.panelId === base && e.key === k)!.foldId).toBeTruthy();
  });

  it('every edge lies on the piece outline or on a fold crease, in copy coordinates', () => {
    const { d } = plainTray();
    const c = pieceCopies(d)[0];
    const segs = c.contours.filter((x) => x.role === 'outer' || x.ref?.foldId).flatMap((x) => x.contour.segs);
    const near = (p: Vec2) => Math.min(...segs.map((s) => dist(p, s.a, s.b)));
    for (const e of netEdges(d, c)) {
      // fold edges lie on the crease (half a thickness in), free edges on the outline
      expect(near(e.a), `${e.panelId} ${e.key}`).toBeLessThan(CARD.thickness);
      expect(near(e.b), `${e.panelId} ${e.key}`).toBeLessThan(CARD.thickness);
    }
  });

  it('a carton is one piece and its glue seam is joined, not free', () => {
    const d = cartonDesign(CARD, 'tuck', 'snap');
    const copies = pieceCopies(d);
    expect(copies).toHaveLength(1);
    const es = netEdges(d, copies[0]);
    const joined = es.filter((e) => e.jointId);
    expect(joined.length).toBeGreaterThan(0);
    expect(joined.every((e) => !e.free)).toBe(true);
  });

  it('a hexagon card tray: its turned walls have edges too, their tops free', () => {
    const d = createDesign(CARD);
    const base = addPolygonPanel(d, 0, 0, regularPolygon(6, 50))!;
    addTray(d, base, 30);
    autoConnect(d);
    const all = pieceCopies(d).flatMap((c) => netEdges(d, c));
    const tops = all.filter((e) => e.key === 'e2' && e.free);
    expect(tops.length).toBe(6);
  });

  it('one chip per fold, with its angle', () => {
    const { d } = plainTray();
    const c = pieceCopies(d)[0];
    const chips = foldChips(d, c);
    const folds = new Set(netEdges(d, c).filter((e) => e.foldId).map((e) => e.foldId));
    expect(chips).toHaveLength(folds.size);
    for (const ch of chips) expect(ch.angle).toBe(90);
  });
});
