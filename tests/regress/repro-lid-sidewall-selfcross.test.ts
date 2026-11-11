// Card / corrugated tray with a lid folded off the back wall's top edge (grow
// from the wall's e2 at 90°, the usual hinged lid). autoConnect joins the lid's
// side edges to the side walls' top edges; on one side wall the outline then
// crosses itself near the back corner (the top-edge joint's cut-back runs into
// the corner joint's notches). validate() reports nothing.
import { expect, it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { panelNotches, panelOutline } from '../../src/model/geometry';
import { buildPieces } from '../../src/model/pieces';
import { validate } from '../../src/model/validate';
import { flattenContour } from '../../src/geom/vec';
import { selfCrossing } from '../fuzz/fuzz';

const edit = (d: any, f: () => void) => {
  f();
  ops.solve(d);
  ops.autoConnect(d);
};

for (const m of [MATERIALS[0], MATERIALS[1], MATERIALS[2]])
  it(`${m.id}: 100 x 150 tray, 32 high, lid folded off the back wall`, () => {
    const d = ops.createDesign(m);
    const b = ops.addRootPanel(d, 0, 0, 100, 150);
    let t = '', lid = '';
    edit(d, () => (t = ops.addTray(d, b, 32)!));
    edit(d, () => (lid = ops.growPanel(d, `${t}/e2`, 'e2', { height: 150, angle: 90, dir: 'up', kind: 'fold' })!.panelId));
    const seams = Object.values(d.connections).filter((c) => !c.grown && (c.a.panelId === lid || c.b.panelId === lid)).map((c) => `${c.kind} ${c.a.panelId.split('/')[1] ?? 'lid'}.${c.a.edge}~${c.b.panelId.split('/')[1] ?? 'lid'}.${c.b.edge}`);
    const bad: string[] = [];
    for (const id of d.order) {
      const p = d.panels[id];
      const o = panelOutline(p, panelNotches(d, p));
      const sc = selfCrossing(o);
      if (sc) bad.push(`${id.split('/')[1] ?? id}: near (${o[sc[0]].x.toFixed(2)}, ${o[sc[0]].y.toFixed(2)}) / (${o[sc[1]].x.toFixed(2)}, ${o[sc[1]].y.toFixed(2)})`);
    }
    console.log(m.id, 'lid seams', seams, 'crossing', bad, 'validate', validate(d).map((i) => i.key));
    expect(bad).toEqual([]);
    for (const pc of buildPieces(d)) for (const c of pc.contours) if (c.role === 'outer') expect(selfCrossing(flattenContour(c.contour, 0.05))).toBeNull();
  });
