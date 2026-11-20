// The owner's report of 20 November (during the fix round): an open box with rounded corners built in card, then
// changed to plywood, became "a ridiculous object". Its walls kept card's fold off the base, so on plywood each wall
// was a living hinge and the net lay over itself, and its corners were tighter than plywood bends. Fixed in
// `setMaterial` (ops.ts, `toNewBoard`).
import { describe, expect, it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { addBoxBase } from '../../src/easy/recipes';
import { validate } from '../../src/model/validate';
import { buildPieces } from '../../src/model/pieces';
import type { MaterialProfile } from '../../src/model/types';
import { settle } from './promises';

const [CARD, CORR16, CORR4, PLY] = MATERIALS;

function roundedBox(m: MaterialProfile) {
  const d = ops.createDesign(m);
  const b = addBoxBase(d, { kind: 'rounded', x0: 0, z0: 0, x1: 150, z1: 100, r: 15, height: 45 } as never)!;
  ops.addTray(d, b, 45);
  settle(d);
  return d;
}
/** The same box made in the new board from the start: the change should end where it does. */
const shape = (d: ReturnType<typeof roundedBox>) => ({
  walls: Object.values(d.connections).filter((c) => c.grown).map((c) => c.kind).sort(),
  pieces: buildPieces(d).length,
  issues: [...new Set(validate(d).map((i) => i.key))],
});

describe('a rounded open box keeps making sense through a change of board', () => {
  for (const from of [CARD, CORR16, CORR4])
    it(`${from.id} → plywood ends as a box made in plywood`, () => {
      const d = roundedBox(from);
      ops.setMaterial(d, PLY);
      settle(d);
      expect(shape(d)).toEqual(shape(roundedBox(PLY)));
    });
  for (const to of [CARD, CORR16])
    it(`plywood → ${to.id} → plywood comes back`, () => {
      const d = roundedBox(PLY);
      const start = shape(d);
      ops.setMaterial(d, to);
      settle(d);
      expect(shape(d).issues).toEqual([]);
      ops.setMaterial(d, PLY);
      settle(d);
      expect(shape(d)).toEqual(start);
    });
});
