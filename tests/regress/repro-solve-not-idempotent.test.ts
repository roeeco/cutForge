// A corrugated tray on a concave 8-point base: the design right after the edit
// (solve + autoConnect, as the store does) differs from the same design solved
// once more, so a saved file re-opens (parseProject runs solve) with different
// joint geometry and tray fixes than were on screen / exported.
import { expect, it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { parseProject, serializeProject } from '../../src/model/serialize';
import { diff } from '../bugs-model/fuzz';

const BASE = [{ x: 98, y: 0 }, { x: 62, y: 62 }, { x: 0, y: 65 }, { x: -45, y: 45 }, { x: -100, y: 0 }, { x: -23, y: -23 }, { x: 0, y: -52 }, { x: 23, y: -23 }];

it('corr-1.6 concave tray: solve twice gives a different design', () => {
  const d = ops.createDesign(MATERIALS[1]);
  const b = ops.addPolygonPanel(d, 0, 0, BASE)!;
  ops.solve(d);
  ops.autoConnect(d);
  const t = ops.addTray(d, b, 79)!;
  ops.solve(d);
  ops.autoConnect(d);
  const states = [JSON.parse(JSON.stringify(d))];
  for (let i = 0; i < 4; i++) {
    ops.solve(d);
    states.push(JSON.parse(JSON.stringify(d)));
  }
  console.log('fixes per extra solve:', states.map((s) => JSON.stringify(s.trays[t].fixes) + ' ' + JSON.stringify(s.trays[t].fixPlan)));
  console.log('first diff:', diff(states[0], states[1]));
  expect(diff(states[0], states[1])).toBeNull();
  expect(diff(states[0], parseProject(serializeProject(states[0])))).toBeNull();
});
