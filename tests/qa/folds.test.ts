// The owner's report of 20 November (during the fix round): "Quick build notes many errors when creating primitives
// and folding them; the dieline looks great". A 4-to-8 loft folded with four "run into each other" problems and a cone
// with 24 "too short to join": faces that meet only at a corner of the shape (the loft's top corners, the cone's tip)
// were taken as boards colliding or left unjoined. Card bends there: `meetAtCorner` in validate.ts.
import { beforeAll, describe, expect, it } from 'vitest';
import { kernel } from '../../src/sculpt/kernel';
import { addShape, createWaffleDesign, primitiveShape, PRIMITIVES } from '../../src/sculpt/ops';
import { polyOf } from '../../src/make/run';
import { reassemble } from '../../src/model/reassemble';
import { validate } from '../../src/model/validate';
import { MATERIALS } from '../../src/model/materials';

beforeAll(async () => {
  await kernel();
});

describe('every shape tile folds from card with nothing to fix', () => {
  for (const kind of PRIMITIVES)
    it(kind, () => {
      const d = createWaffleDesign();
      d.material = { ...MATERIALS[0] };
      addShape(d, primitiveShape(kind, { x: 0, z: 0, w: 40, d: 40 }, 40));
      const P = polyOf(d, { as: 'fold' })!;
      reassemble(d, P, { as: 'fold' });
      expect(validate(d).map((i) => i.key)).toEqual([]);
    });
});
