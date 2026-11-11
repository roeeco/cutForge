// A panel placed on a tray wall keeps pointing at the wall after the tray's
// reconciliation removes it (its base edge went away): `place.host` names a
// panel that no longer exists, the panel stays frozen where it was and can no
// longer be moved (movePanel bails out when the host frame is missing).
// deletePanel drops hosted panels to the floor; reconcileTrays does not.
import { expect, it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { parseProject, serializeProject } from '../../src/model/serialize';

const edit = (d: any, f: () => void) => {
  f();
  ops.solve(d);
  ops.autoConnect(d);
};

it('a Cut across the whole back edge removes the wall a panel stands on', () => {
  const d = ops.createDesign(MATERIALS[3]);
  const b = ops.addRootPanel(d, 0, 0, 120, 80);
  let t = '', q = '';
  edit(d, () => (t = ops.addTray(d, b, 40)!));
  const wall = `${t}/e2`;
  // a small panel standing on the wall's inner face
  edit(d, () => (q = ops.addPlacedPanel(d, { host: wall, face: 1, x: 20, y: 10, rot: 0, pose: 'standing', side: 1 }, 30, 15)!));
  expect(d.panels[q].place!.host).toBe(wall);
  // a cut band through the whole back edge: edge e2 is gone, and so is its wall
  edit(d, () => void ops.addDetail(d, b, 'rect', 'cut', 60, 80, 140, 20));
  expect(d.panels[wall]).toBeUndefined();
  const host = d.panels[q].place!.host;
  expect(host === null || !!d.panels[host]).toBe(true); // actual: host is the deleted wall's id
  const before = JSON.stringify(d.panels[q].frame);
  edit(d, () => ops.movePanel(d, q, 10, 0));
  expect(JSON.stringify(d.panels[q].frame)).not.toBe(before); // actual: the move is ignored
  void parseProject(serializeProject(d));
});

it('the fuzzer’s path: deleting a base vertex moves a wall onto a curved edge, reconcile drops it', () => {
  const d = ops.createDesign(MATERIALS[3]);
  const b = ops.addRootPanel(d, -64, -130, 217, 122);
  let t = '', q = '';
  edit(d, () => void ops.setPointCurve(d, b, 0, true));
  edit(d, () => (t = ops.addTray(d, b, 27)!));
  edit(d, () => (q = ops.addPlacedPanel(d, { host: `${t}/e1`, face: -1, x: 10, y: 5, rot: 0, pose: 'standing', side: -1 }, 89, 20)!));
  edit(d, () => void ops.deleteVertex(d, b, 1));
  const host = d.panels[q].place!.host;
  expect(host === null || !!d.panels[host]).toBe(true);
});
