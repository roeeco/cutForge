// Quick build: Box with a hexagon footprint, then Wall / lid on one wall's top edge (wallRecipe at the
// height quickWallHeight proposes, then quickGuard, as the stage does). The lid collides with the
// two angled walls next to the far ones (val.collide, blocking, no Quick build fix); on a rectangle
// footprint the same steps give no issue.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../../src/model/materials';
import { createDesign } from '../../src/model/ops';
import { boxRecipe, quickWallHeight, wallRecipe } from '../../src/easy/recipes';
import { quickGuard } from '../../src/easy/guard';
import { validate } from '../../src/model/validate';
import { blocking } from '../../src/easy/fix';

describe('repro: lid on a hexagonal Quick build box', () => {
  for (const sides of [5, 6, 7, 8])
  for (const mat of MATERIALS)
    it(`${mat.id} ${sides}-gon`, () => {
      const d = createDesign(mat);
      const { baseId } = boxRecipe(d, { kind: 'regular', x0: 0, z0: 0, x1: 200, z1: 200, sides }, 40)!;
      expect(validate(d).filter((i) => i.key === 'val.collide')).toEqual([]);
      const wall = d.order.find((id) => id.endsWith('/e1'))!;
      const before = JSON.parse(JSON.stringify(d));
      const lid = wallRecipe(d, wall, 'e2', quickWallHeight(d, wall, 'e2', 40));
      quickGuard(before, d);
      expect(lid).toBeTruthy();
      // nothing blocking about the lid (a net too big for the sheet is another matter)
      const hits = validate(d).filter((i) => blocking(i) && (i.target.id === lid || i.pair?.includes(lid!))).map((i) => `${i.key} ${i.pair ?? i.target.id}`);
      expect(hits).toEqual([]); // actual: the lid collides with two walls of the base `baseId`
      void baseId;
    });
});
