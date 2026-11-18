// Milestone 68 (PACKAGING_PLAN.md §8): glue-free joints and cartons.
import { describe, expect, it } from 'vitest';
import { addRootPanel, addTray, autoConnect, createDesign, setAllJoints, setTrayEnds, solve } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { buildPieces, netOverlaps } from '../src/model/pieces';
import { validate } from '../src/model/validate';
import { prepareExport } from '../src/export/prepare';
import { sheetsToSvg } from '../src/export/svg';
import { constructionSet } from '../src/model/place';
import { closureId } from '../src/model/closures';
import { endId, topLidId, trayRing } from '../src/model/cartons';
import type { Design } from '../src/model/types';
import { toLocal, toWorld } from '../src/model/frame';
import { idempotence, roundTrip } from './harness';

const [CARD, CORR16] = MATERIALS;
const issues = (d: Design) => validate(d).filter((i) => i.key !== 'val.split');

function carton(m: typeof CARD, ends: { top?: 'tuck' | 'seal'; bottom?: 'seal' | 'snap' | 'tuck' } = {}, w = 90, dpt = 60, h = 120) {
  const d = createDesign(m);
  const base = addRootPanel(d, 0, 0, w, dpt);
  const tray = addTray(d, base, h, { base: 'open', ...ends })!;
  autoConnect(d);
  return { d, base, tray };
}

describe('slit locks', () => {
  it('a card tray with slit-lock corners: tongues on each corner flap through slits in the next wall, no glue', () => {
    const d = createDesign(CARD);
    const base = addRootPanel(d, 0, 0, 120, 80);
    addTray(d, base, 50);
    autoConnect(d);
    setAllJoints(d, 'corner', 'lock');
    autoConnect(d);
    const corners = Object.values(d.connections).filter((c) => !c.grown && c.trayId && c.kind === 'lock');
    expect(corners.length).toBe(4);
    for (const c of corners) {
      const g = c.geom!;
      // the flap and its tongue on one wall, a slit in the other
      expect(g.adds.length).toBeGreaterThanOrEqual(2);
      expect(g.lines?.length).toBeGreaterThanOrEqual(1);
    }
    expect(Object.values(d.connections).some((c) => c.kind === 'glue' && !c.grown)).toBe(false);
    expect(issues(d)).toEqual([]);
    expect(netOverlaps(d)).toEqual([]);
    expect(() => sheetsToSvg(prepareExport(d).sheets)).not.toThrow();
  });

  it('corrugated slit locks cut slots as thick as the flap, inside the other wall', () => {
    const d = createDesign(CORR16);
    const base = addRootPanel(d, 0, 0, 160, 100);
    addTray(d, base, 60, { cornerKind: 'lock' });
    autoConnect(d);
    const locks = Object.values(d.connections).filter((c) => c.kind === 'lock');
    expect(locks.length).toBe(4);
    expect(locks.every((c) => c.geom!.holes.length >= 1)).toBe(true);
    expect(validate(d).filter((i) => i.key === 'val.slotEdge')).toEqual([]);
  });
});

describe('cartons', () => {
  it('an open base: the base is never cut; the walls are one strip folded off each other, glued at one corner', () => {
    const { d, base, tray } = carton(CARD);
    expect(constructionSet(d).has(base)).toBe(true);
    const ring = trayRing(d, d.trays[tray]);
    expect(ring).toHaveLength(4);
    const corners = Object.values(d.connections).filter((c) => !c.grown && c.trayId === tray);
    expect(corners.filter((c) => c.kind === 'fold')).toHaveLength(3);
    expect(corners.filter((c) => c.kind === 'glue')).toHaveLength(1);
    const pieces = buildPieces(d);
    expect(pieces).toHaveLength(1);
    expect(pieces[0].panels.map((n) => n.panelId).sort()).toEqual(ring.map((r) => r.wall).sort());
    expect(netOverlaps(d)).toEqual([]);
    expect(issues(d)).toEqual([]);
  });

  it('a reverse tuck carton: a tuck lid folded off the back wall at the top, a tuck flap at the bottom; one piece, one glue seam', () => {
    const { d, tray } = carton(CARD, { top: 'tuck', bottom: 'tuck' });
    const lid = topLidId(d.trays[tray]);
    expect(d.panels[lid]).toBeTruthy();
    expect(d.connections[closureId(lid)]?.kind).toBe('closure');
    expect(d.connections[endId(d.trays[tray], 'bottom')]?.geom?.adds.length).toBe(3);
    const pieces = buildPieces(d);
    expect(pieces).toHaveLength(1);
    expect(Object.values(d.connections).filter((c) => !c.grown && c.trayId === tray && c.kind === 'glue')).toHaveLength(1);
    expect(netOverlaps(d)).toEqual([]);
    expect(issues(d)).toEqual([]);
    expect(() => sheetsToSvg(prepareExport(d).sheets)).not.toThrow();
  });

  for (const bottom of ['tuck', 'snap', 'seal'] as const)
    it(`${bottom} bottom: every flap folded in 3D stays inside the box (a tuck flap's lip ran out past the back wall)`, () => {
      const { d, base, tray } = carton(CARD, { top: 'tuck', bottom });
      const B = d.panels[base];
      // the box's outside along the base's plane: its outline grown by the walls (and a hair)
      const lim = { x0: -1, x1: B.w + 1, y0: -1, y1: B.h + 1 };
      const flaps = d.connections[endId(d.trays[tray], 'bottom')]!.geom!.flaps3d;
      expect(flaps.length).toBeGreaterThan(0);
      for (const f of flaps) {
        const P = d.panels[f.panelId];
        for (const q of f.poly)
          for (const z of [f.z0, f.z1]) {
            const w = toWorld(P.frame, q.x, q.y, z);
            const l = toLocal(B.frame, w);
            expect(l.x, `${bottom} flap on ${P.name}`).toBeGreaterThanOrEqual(lim.x0);
            expect(l.x).toBeLessThanOrEqual(lim.x1);
            expect(l.y).toBeGreaterThanOrEqual(lim.y0);
            expect(l.y).toBeLessThanOrEqual(lim.y1);
          }
      }
    });

  it('a tuck top with a snap-lock bottom: four shaped bottom flaps, one piece', () => {
    const { d, tray } = carton(CARD, { top: 'tuck', bottom: 'snap' });
    const g = d.connections[endId(d.trays[tray], 'bottom')].geom!;
    expect(g.adds).toHaveLength(4);
    expect(g.flaps3d).toHaveLength(4);
    expect(buildPieces(d)).toHaveLength(1);
    expect(netOverlaps(d)).toEqual([]);
    expect(issues(d)).toEqual([]);
  });

  it('seal ends: four flaps at the top and four at the bottom', () => {
    const { d, tray } = carton(CORR16, { top: 'seal', bottom: 'seal' }, 160, 100, 120);
    for (const end of ['top', 'bottom'] as const) expect(d.connections[endId(d.trays[tray], end)].geom!.adds).toHaveLength(4);
    expect(issues(d)).toEqual([]);
  });

  it('back to a cut base: the base is cut again, the walls fold off it, the bottom closure goes', () => {
    const { d, base, tray } = carton(CARD, { top: 'tuck', bottom: 'snap' });
    // the cut base's net (330 mm tall) is longer than the card sheet: kept whole here (milestone 69 splits it otherwise)
    d.split = 'never';
    setTrayEnds(d, tray, { base: 'cut' });
    expect(constructionSet(d).has(base)).toBe(false);
    expect(d.connections[endId(d.trays[tray], 'bottom')]).toBeUndefined();
    expect(d.trays[tray].wallKind).toBe('fold');
    expect(buildPieces(d)).toHaveLength(1);
    solve(d);
  });

  it('cartons solve to themselves and save and reopen', () => {
    for (const ends of [{ top: 'tuck', bottom: 'snap' }, { top: 'seal', bottom: 'tuck' }] as const) {
      const { d } = carton(CARD, ends);
      expect(idempotence(d)).toBeNull();
      expect(roundTrip(d)).toBeNull();
    }
  });
});
