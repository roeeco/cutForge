// Quick build Divider on a low box: a line that does not run wall to wall plans a standing panel of
// height 0 (recipes.ts dividerHeight: round(lowest wall top - t - DIVIDER_GAP)); the ghost shows a
// 0 mm panel, while ✓ (dividerLine -> addPlacedPanel) makes it MIN_PANEL = 5 mm tall.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../../src/model/materials';
import { createDesign } from '../../src/model/ops';
import { boxRecipe, dividerLine, planDividerLine } from '../../src/easy/recipes';

describe('repro: divider plan height on a low box', () => {
  it('card box 100 x 60, 6 mm tall, diagonal line', () => {
    const d = createDesign(MATERIALS[0]);
    const { baseId } = boxRecipe(d, { kind: 'rect', x0: 0, z0: 0, x1: 100, z1: 60 }, 6)!;
    const a = { x: 20, y: 15 }, b = { x: 70, y: 40 };
    const plan = planDividerLine(d, baseId, a, b, 40)!;
    const made = dividerLine(d, baseId, a, b, 40)!;
    // milestone 44: the line makes a divider; what the ghost shows is what ✓ makes
    expect(plan.kind).toBe('divider');
    expect(plan.kind === 'divider' ? plan.height : -1).toBe(d.panels[made.id].h);
  });
});
