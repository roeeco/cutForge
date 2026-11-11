// Plywood tray on a plain rectangle; one wall given its own material
// (milestone 36: setPanelMaterial, e.g. a card or corrugated window wall). The
// two corners of that wall become tab-and-slot (mixed materials), and the two
// plywood walls that own those corners get outlines that cross themselves at the
// bottom corner (the corner tab notches and the bottom finger notches collide).
import { expect, it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { trayWalls } from '../../src/model/trays';
import { panelNotches, panelOutline } from '../../src/model/geometry';
import { buildPieces } from '../../src/model/pieces';
import { flattenContour } from '../../src/geom/vec';
import { validate } from '../../src/model/validate';
import { selfCrossing } from '../bugs-model/fuzz';

const edit = (d: any, f: () => void) => {
  f();
  ops.solve(d);
  ops.autoConnect(d);
};

for (const other of [MATERIALS[0], MATERIALS[1], MATERIALS[2]])
  it(`plywood 100 x 100 tray, wall e3 made ${other.id}`, () => {
    const d = ops.createDesign(MATERIALS[3]);
    const b = ops.addRootPanel(d, 0, 0, 100, 100);
    let t = '';
    edit(d, () => (t = ops.addTray(d, b, 40)!));
    const walls = trayWalls(d, t);
    edit(d, () => void ops.setPanelMaterial(d, [walls[3]], other));
    const bad: string[] = [];
    for (const w of walls) {
      const p = d.panels[w];
      const o = panelOutline(p, panelNotches(d, p));
      const sc = selfCrossing(o);
      if (sc) bad.push(`${w.split('/')[1]}: segs ${sc} at (${o[sc[0]].x.toFixed(2)}, ${o[sc[0]].y.toFixed(2)})`);
    }
    console.log(other.id, bad, 'corners', Object.values(d.connections).filter((c) => !c.grown).map((c) => c.kind), 'validate', validate(d).map((i) => i.key));
    expect(bad).toEqual([]);
    for (const pc of buildPieces(d)) for (const c of pc.contours) if (c.role === 'outer') expect(selfCrossing(flattenContour(c.contour, 0.05))).toBeNull();
  });

for (const n of [5, 6, 7, 8])
  for (const other of [MATERIALS[0], MATERIALS[1], MATERIALS[2]])
    it(`plywood ${n}-gon tray, one wall made ${other.id}`, () => {
      const d = ops.createDesign(MATERIALS[3]);
      const b = ops.addPolygonPanel(d, 0, 0, ops.regularPolygon(n, 70))!;
      let t = '';
      edit(d, () => (t = ops.addTray(d, b, 40)!));
      const walls = trayWalls(d, t);
      edit(d, () => void ops.setPanelMaterial(d, [walls[1]], other));
      for (const w of trayWalls(d, t)) {
        const p = d.panels[w];
        expect(selfCrossing(panelOutline(p, panelNotches(d, p))), w).toBeNull();
      }
      for (const pc of buildPieces(d)) for (const c of pc.contours) if (c.role === 'outer') expect(selfCrossing(flattenContour(c.contour, 0.05))).toBeNull();
    });
