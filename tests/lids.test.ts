// Lids (milestone 71, PACKAGING_PLAN.md §6.3): telescoping lids and arched lids. Matched walls: matchedWalls.test.ts.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/model/materials';
import { addArchedLid, addLid, addRootPanel, addTray, autoConnect, createDesign, setPanelSize } from '../src/model/ops';
import { lidGap, lidOn } from '../src/model/lid';
import { archLids } from '../src/model/closures';
import { allBands, bandCrossings } from '../src/model/bands';
import { buildPieces } from '../src/model/pieces';
import { validate } from '../src/model/validate';
import { toWorld } from '../src/model/frame';
import type { Design } from '../src/model/types';
import { roundBoxDesign, roundedTray } from './goldenDesigns';
import { idempotence, roundTrip } from './harness';
import { panelShape } from '../src/views/three-geom';

const [CARD, CORR16, CORR4, PLY] = MATERIALS;

function box(m: (typeof MATERIALS)[number], w = 120, dp = 80, h = 60) {
  const d = createDesign(m);
  const base = addRootPanel(d, 0, 0, w, dp);
  const tray = addTray(d, base, h)!;
  autoConnect(d);
  return { d, base, tray };
}
const issues = (d: Design) => validate(d).map((i) => i.key);

describe('telescoping lids', () => {
  for (const m of [CARD, CORR16, PLY])
    it(`${m.id}: a lid over a box: its outline the box's grown by the wall and the clearance, on top, following the box`, () => {
      const { d, base, tray } = box(m);
      const lt = addLid(d, tray)!;
      expect(lt).toBeTruthy();
      expect(addLid(d, tray)).toBeNull();
      expect(addLid(d, lt)).toBeNull();
      expect(lidOn(d, tray)?.id).toBe(lt);
      const lid = d.panels[d.trays[lt].baseId];
      const g = lidGap(d, d.trays[tray]);
      expect(g).toBeCloseTo(m.thickness + m.clearance, 9);
      expect(lid.w).toBeCloseTo(120 + 2 * g, 9);
      expect(lid.h).toBeCloseTo(80 + 2 * g, 9);
      // above the box's walls
      const B = d.panels[base];
      const yLid = toWorld(lid.frame, 0, 0, 0)[1], yTop = toWorld(B.frame, 0, 0, 0)[1] + 60;
      expect(yLid).toBeGreaterThan(yTop);
      // the box grows: the lid follows
      setPanelSize(d, base, 140, undefined);
      expect(d.panels[d.trays[lt].baseId].w).toBeCloseTo(140 + 2 * g, 9);
      expect(issues(d).filter((k) => k === 'val.overlap' || k === 'val.collide')).toEqual([]);
      expect(idempotence(d)).toBeNull();
      expect(roundTrip(d)).toBeNull();
    });

  it('a round box’s lid is round, grown by the gap, its walls on a seam flat and a band all round', () => {
    const d = roundBoxDesign(CORR4, 'circle', 120, 120);
    const tray = Object.keys(d.trays)[0];
    const lt = addLid(d, tray)!;
    const lid = d.panels[d.trays[lt].baseId];
    const g = lidGap(d, d.trays[tray]);
    expect(lid.sketch.kind === 'poly' && lid.sketch.round?.shape).toBe('circle');
    expect(lid.w).toBeCloseTo(120 + 2 * g, 6);
    expect(Object.values(d.connections).some((c) => c.wing && c.trayId === lt)).toBe(true);
    expect(issues(d).filter((k) => k === 'val.overlap' || k === 'val.collide')).toEqual([]);
    expect(idempotence(d)).toBeNull();
  });

  it('a rounded box’s lid keeps rounded corners, their radius grown by the gap', () => {
    const d = roundedTray(CARD, 20);
    const tray = Object.keys(d.trays)[0];
    const lt = addLid(d, tray)!;
    const lid = d.panels[d.trays[lt].baseId];
    const g = lidGap(d, d.trays[tray]);
    const rs = lid.sketch.kind === 'poly' ? lid.sketch.pts.filter((q) => q.curve === 'round').map((q) => q.r) : [];
    expect(rs.length).toBeGreaterThan(0);
    for (const r of rs) expect(r).toBeCloseTo(20 + g, 9);
  });
});

describe('arched lids', () => {
  for (const m of [CARD, CORR16, CORR4, PLY])
    for (const [w, dp, h] of [
      [120, 80, 60],
      [150, 120, 50],
    ])
      it(`${m.id} ${w} × ${dp} × ${h}: folded off the back wall with a radius, across, and down into the front wall; the end walls cut to the arch`, () => {
        const { d, tray } = box(m, w, dp, h);
        const lid = addArchedLid(d, tray)!;
        expect(lid).toBeTruthy();
        const [a] = archLids(d);
        expect(a.lid).toBe(lid);
        const bands = allBands(d).filter((b) => b.parent === lid || b.child === lid);
        expect(bands).toHaveLength(2);
        for (const b of bands) expect(b.fits).toBe(true);
        // the end walls are cut where the bands cross them
        expect(bands.flatMap((b) => bandCrossings(d, b)).map((x) => x.panelId).sort()).toEqual([...a.sides, ...a.sides].sort());
        // no closure: the arch closes with its own flap
        expect(Object.values(d.connections).some((c) => c.kind === 'closure')).toBe(false);
        expect(issues(d)).toEqual([]);
        if (m.kind !== 'plywood') expect(buildPieces(d)).toHaveLength(1);
        expect(idempotence(d)).toBeNull();
        expect(roundTrip(d)).toBeNull();
      });

  for (const m of [CARD, PLY])
    it(`${m.id}: the end walls are cut back past the box's faces at the arch, leaving no sliver or stick`, () => {
      const { d, tray } = box(m, 120, 80, 60);
      addArchedLid(d, tray);
      const [a] = archLids(d);
      for (const id of a.sides) {
        const p = d.panels[id];
        // under the arch (its top 10 mm) nothing stands at the wall's sides: a column as wide as the
        // material (0.5 mm × 37.5 mm on card; on plywood a 3 mm stick cut off as its own piece) stood there
        const t = m.thickness;
        const out = panelShape(d, p).rings.flat().filter((q) => q.y > p.h - 10 && (q.x < 1.5 * t || q.x > p.w - 1.5 * t));
        expect(out, p.name).toEqual([]);
      }
      expect(buildPieces(d).filter((pc) => pc.frag)).toEqual([]);
    });

  it('a box too low for the material’s bend and a flap: refused, nothing changed', () => {
    const { d, tray } = box(PLY, 150, 120, 40);
    const before = JSON.stringify(d);
    expect(addArchedLid(d, tray)).toBeNull();
    expect(JSON.stringify(d)).toBe(before);
  });
});
