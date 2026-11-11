// A cut sticker with nested outlines (smile, flower) is reported as val.shapesOverlap against itself
// (validate.ts shapeIssues pairs contours of the same detail); its Fix (fitShape) returns true and the
// issue stays, so Quick build's Ready badge can never go green.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../../src/model/materials';
import { addRootPanel, createDesign } from '../../src/model/ops';
import { stickerRecipe } from '../../src/easy/recipes';
import { stickerById } from '../../src/easy/stickers';
import { validate } from '../../src/model/validate';
import { fixIssue } from '../../src/easy/fix';

describe('repro: cut sticker overlaps itself', () => {
  it('smile sticker cut out on a 100 x 100 plywood panel', () => {
    const d = createDesign(MATERIALS[3]);
    const p = addRootPanel(d, 0, 0, 100, 100);
    const id = stickerRecipe(d, p, stickerById('smile').polys, 50, 50, 30, 'cut')!;
    const ov = validate(d).filter((i) => i.key === 'val.shapesOverlap');
    // actual: one issue, targeting the sticker itself (no other shape on the panel)
    expect.soft(ov).toEqual([]);
    if (ov.length) {
      expect(ov[0].target.id).toBe(id);
      const ok = fixIssue(d, ov[0]);
      expect({ ok, still: validate(d).some((i) => i.key === 'val.shapesOverlap') }).toEqual({ ok: true, still: false });
    }
  });
});

describe('stencils', () => {
  it('a cut-out smile is a stencil whose Fix engraves it; an engraved one is fine', () => {
    const d = createDesign(MATERIALS[3]);
    const p = addRootPanel(d, 0, 0, 100, 100);
    const id = stickerRecipe(d, p, stickerById('smile').polys, 50, 50, 30, 'cut')!;
    const st = validate(d).find((i) => i.key === 'val.stencilShape')!;
    expect(st?.target.id).toBe(id);
    expect(fixIssue(d, st)).toBe(true);
    expect(validate(d).some((i) => i.key === 'val.stencilShape')).toBe(false);
  });
  it('cut-out text "O" still reports val.stencil', async () => {
    const { addText } = await import('../../src/model/ops');
    const { loadFonts } = await import('../bugs-output/gen');
    await loadFonts();
    const d = createDesign(MATERIALS[3]);
    const p = addRootPanel(d, 0, 0, 100, 100);
    addText(d, p, 50, 50, 'O', 'cut', 'rubik', 20);
    expect(validate(d).some((i) => i.key === 'val.stencil')).toBe(true);
  });
  it('two copies of an arrayed cut circle that overlap are still reported', async () => {
    const { addDetail } = await import('../../src/model/ops');
    const d = createDesign(MATERIALS[3]);
    const p = addRootPanel(d, 0, 0, 100, 100);
    const id = addDetail(d, p, 'circle', 'cut', 50, 50, 20, 20)!;
    d.panels[p].details.find((x) => x.id === id)!.array = { nx: 2, ny: 1, dx: 10, dy: 0 };
    expect(validate(d).some((i) => i.key === 'val.shapesOverlap')).toBe(true);
  });
});
