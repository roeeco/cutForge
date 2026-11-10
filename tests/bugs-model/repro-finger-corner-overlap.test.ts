// Plywood tray, a corner finger joint given more fingers than fit (finger width
// below the board thickness): at the bottom of the corner, the base and both
// walls occupy the same material (~0.35 mm). Default 3 mm ply, 29 mm tray,
// 11 fingers on one corner (the Fingers stepper allows 3..99). validate() is silent.
import { expect, it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { validate } from '../../src/model/validate';
import { solidCounter, maxOverlap } from '../solid';

const edit = (d: any, f: () => void) => {
  f();
  ops.solve(d);
  ops.autoConnect(d);
};

it('11 fingers on a 29 mm plywood tray corner', () => {
  const d = ops.createDesign(MATERIALS[3]);
  const b = ops.addRootPanel(d, 0, 0, 100, 60);
  edit(d, () => void ops.addTray(d, b, 29));
  const corner = Object.values(d.connections).find((x) => !x.grown)!; // walls e0|e1, the corner at x = 100, z = 0
  edit(d, () => ops.setConnection(d, corner.id, { fingers: 11 }));
  expect(d.connections[corner.id].broken).toBe(false);
  expect(validate(d)).toEqual([]);
  // a point inside the corner column, inside the base's thickness: three solids
  expect(solidCounter(d)([98.5, 2.8, -1.5])).toBe(1); // actual: 3 (base + both walls)
  expect(maxOverlap(d, [96, 0, -4], [101, 4, 1], 0.1)).toBe(1);
});

it('control: 9 fingers is fine', () => {
  const d = ops.createDesign(MATERIALS[3]);
  const b = ops.addRootPanel(d, 0, 0, 100, 60);
  edit(d, () => void ops.addTray(d, b, 29));
  const corner = Object.values(d.connections).find((x) => !x.grown)!;
  edit(d, () => ops.setConnection(d, corner.id, { fingers: 9 }));
  expect(maxOverlap(d, [96, 0, -4], [101, 4, 1], 0.1)).toBe(1);
});
