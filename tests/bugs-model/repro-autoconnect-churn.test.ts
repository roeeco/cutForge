// A notch cut into a tray wall at its corner (splitting the wall's side edge)
// makes autoConnect unstable: every run deletes an automatic seam on the split
// edge (seamStillFits says it no longer fits) and findOpenSeams immediately
// finds it again, so each edit (store: solve + autoConnect) re-creates it under
// a new id. On corrugated the re-made seam is broken every time.
import { expect, it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { seamStillFits } from '../../src/model/seams';

const edit = (d: any, f: () => void) => {
  f();
  ops.solve(d);
  ops.autoConnect(d);
};

for (const m of MATERIALS)
  it(`${m.id}: corner notch on a tray wall`, () => {
    const d = ops.createDesign(m);
    const b = ops.addRootPanel(d, 0, 0, 160, 220);
    let t = '';
    edit(d, () => (t = ops.addTray(d, b, 40)!));
    // a 32 x 15 notch straddling wall e1's start side edge (x = -20 .. 12)
    edit(d, () => void ops.addDetail(d, `${t}/e1`, 'rect', 'cut', -4, 25, 32, 15));
    const ids = Object.keys(d.connections).sort();
    const unfit = Object.values(d.connections).filter((c) => !c.grown && c.auto !== false && !seamStillFits(d, c)).map((c) => `${c.kind} ${c.a.panelId}.${c.a.edge} ~ ${c.b.panelId}.${c.b.edge}`);
    edit(d, () => {}); // any later edit
    expect(unfit).toEqual([]);
    expect(Object.keys(d.connections).sort()).toEqual(ids); // actual: one seam re-created with a new id
  });
