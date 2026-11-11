// A plywood corner set to "Butt" (offered in the joint menu and in the
// design-wide Corners choice) keeps both walls at full length: they occupy the
// same t x t column at the corner, so the box cannot be assembled. Other corner
// kinds (fingers, tabs) are fine. validate() is silent.
import { expect, it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { validate } from '../../src/model/validate';
import { allowedKinds } from '../../src/model/jointDefaults';
import { maxOverlap, solidCounter } from '../solid';

const edit = (d: any, f: () => void) => {
  f();
  ops.solve(d);
  ops.autoConnect(d);
};

it('plywood tray with butt corners', () => {
  const d = ops.createDesign(MATERIALS[3]);
  const b = ops.addRootPanel(d, 0, 0, 80, 43);
  let t = '';
  edit(d, () => (t = ops.addTray(d, b, 31)!));
  const corner = Object.values(d.connections).find((c) => !c.grown)!;
  expect(allowedKinds(d, corner)).toContain('butt');
  edit(d, () => ops.setConnection(d, corner.id, { kind: 'butt' }));
  expect(d.connections[corner.id].kind).toBe('butt');
  expect(validate(d)).toEqual([]);
  // the corner column of walls e0 / e1 (x = 80, z = 0), above the base
  expect(solidCounter(d)([78.5, 15, -1.5])).toBe(1); // actual: 2
});

it('same through setAllJoints(corner, butt)', () => {
  const d = ops.createDesign(MATERIALS[3]);
  const b = ops.addRootPanel(d, 0, 0, 80, 43);
  edit(d, () => void ops.addTray(d, b, 31));
  edit(d, () => void ops.setAllJoints(d, 'corner', 'butt'));
  expect(maxOverlap(d, [-4, 4, -47], [84, 35, 4], 0.5)).toBe(1); // actual: 2
});
