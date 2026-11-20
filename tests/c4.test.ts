// Milestone C4 (SENTENCE_STYLES_PLAN.md): the gable top box and the one-piece hexagon box.
import { describe, expect, it } from 'vitest';
import '../src/templates/registry';
import { MATERIALS } from '../src/model/materials';
import { defaults, generate, templateById } from '../src/templates/registry';
import { chooseStructure, listOf } from '../src/sentence/resolve';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/fix';
import { pieceCopies } from '../src/model/pack';
import { toWorld } from '../src/model/frame';
import { STYLES, chooseStyle, styleListed, styleOf } from '../src/templates/styles';
import type { Design } from '../src/model/types';

const CARD = MATERIALS[0], CORR = MATERIALS[1];
const blocking = (d: Design) => validate(d).filter((i) => !NOTE_KEYS.has(i.key)).map((i) => i.key);

describe('C4', () => {
  const carton = templateById('carton')!;
  const gableParams = (over: Record<string, number | string> = {}) => ({ ...chooseStructure(carton, CARD, defaults(carton)).params, top: 'gable', bottom: 'tuck', ...over });

  it('a gable top box builds clean, one piece, its two roofs with a handle slot each', () => {
    const d = generate(carton, CARD, gableParams());
    expect(blocking(d)).toEqual([]);
    expect(pieceCopies(d)).toHaveLength(1);
    const roofs = Object.values(d.panels).filter((p) => p.details.some((x) => x.shape === 'roundrect'));
    expect(roofs).toHaveLength(2);
  });

  it('the handle slots line up in 3D (within 0.5 mm)', () => {
    const d = generate(carton, CARD, gableParams({ width: 90, depth: 70, height: 110 }));
    const roofs = Object.values(d.panels).filter((p) => p.details.some((x) => x.shape === 'roundrect'));
    const centre = roofs.map((p) => {
      const h = p.details.find((x) => x.shape === 'roundrect')!;
      return toWorld(p.frame, h.cx, h.cy, d.material.thickness / 2);
    });
    // seen along the ridge: the same place across the box and the same height
    const dx = Math.abs(centre[0][0] - centre[1][0]), dy = Math.abs(centre[0][1] - centre[1][1]), dz = Math.abs(centre[0][2] - centre[1][2]);
    const along = [dx, dy, dz].sort((a, b) => a - b);
    expect(along[0]).toBeLessThan(0.5);
    expect(along[1]).toBeLessThan(25);
  });

  it('at other sizes: wherever the sentence offers a gable top, it builds clean (a shallow box, whose roofs would overlap the peaks in the flat, is not offered one)', () => {
    let offered = 0;
    for (const [w, dp, h] of [[60, 50, 80], [100, 70, 100], [80, 40, 60], [70, 60, 140]]) {
      const p = gableParams({ width: w, depth: dp, height: h });
      if (!listOf(carton, CARD, p, 'top').includes('gable')) continue;
      offered++;
      expect(blocking(generate(carton, CARD, p)), `${w}×${dp}×${h}`).toEqual([]);
    }
    expect(offered).toBeGreaterThanOrEqual(2);
    expect(listOf(carton, CARD, gableParams({ width: 80, depth: 40, height: 60 }), 'top')).not.toContain('gable');
  });

  it('the gable style is listed from the sentence’s first words (a box of 160 × 110 × 45)', () => {
    const style = STYLES.find((x) => x.id === 'gable')!;
    const p0 = defaults(templateById('box')!);
    expect(styleListed(style, CARD, p0, templateById)).toBe(true);
    const r = chooseStyle(style, CARD, p0, templateById)!;
    expect(r.params.top).toBe('gable');
    expect(blocking(generate(carton, CARD, r.params))).toEqual([]);
  });

  it('a style that cannot be made at the sizes there are starts at its structure’s own, and says so', () => {
    // a shallow box: no gable top at 30 mm deep
    const style = STYLES.find((x) => x.id === 'gable')!;
    const r = chooseStyle(style, CARD, { ...defaults(templateById('box')!), depth: 30, height: 40 }, templateById)!;
    expect(r.params.top).toBe('gable');
    expect(Number(r.params.depth)).toBeGreaterThanOrEqual(50);
    expect(r.changes.some((c) => c.key === 'depth')).toBe(true);
  });

  it('card only; the gable style names a carton with a gable top', () => {
    const p = chooseStructure(carton, CORR, defaults(carton)).params;
    expect(listOf(carton, CORR, p, 'top')).not.toContain('gable');
    expect(styleOf('carton', gableParams())?.id).toBe('gable');
  });

  it('a one-piece hexagon box: six sides and a hinged lid, on card; not listed in corrugated', () => {
    const style = STYLES.find((s) => s.id === 'hexBox')!;
    const box = templateById('box')!;
    const p0 = defaults(box);
    expect(styleListed(style, CARD, p0, templateById)).toBe(true);
    const r = chooseStyle(style, CARD, p0, templateById)!;
    const d = generate(templateById(r.id)!, CARD, r.params);
    expect(blocking(d)).toEqual([]);
    expect(pieceCopies(d)).toHaveLength(1);
    expect(styleListed(style, CORR, p0, templateById)).toBe(false);
  });
});
