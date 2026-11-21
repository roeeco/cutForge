// Milestone 156 (DIELINE_GENERATOR_ANALYSIS.md §3.1): the strip and wrap builders, and the insert built on them.
import { describe, expect, it } from 'vitest';
import '../src/templates/registry';
import { MATERIALS } from '../src/model/materials';
import { createDesign } from '../src/model/ops';
import { addStrip, addWrap } from '../src/model/builders';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/fix';
import { prepareExport } from '../src/export/prepare';
import { toWorld } from '../src/model/frame';
import { defaults, generate, templateById } from '../src/templates/registry';
import { chooseStyle, styleById } from '../src/templates/styles';
import { recognise } from '../src/templates/catalogue';
import { recordOf } from '../src/templates/records';
import type { Design } from '../src/model/types';

const CARD = MATERIALS.find((m) => m.id === 'card-0.5')!;
const C16 = MATERIALS.find((m) => m.id === 'corr-1.6')!;
const C4 = MATERIALS.find((m) => m.id === 'corr-4')!;
const blocking = (d: Design) => validate(d).filter((i) => !NOTE_KEYS.has(i.key)).map((i) => i.key);
const pieces = (d: Design) => prepareExport(d).sheets.flatMap((s) => s.contours.filter((c) => c.role === 'outer')).length;
const centre = (d: Design, id: string) => toWorld(d.panels[id].frame, d.panels[id].w / 2, d.panels[id].h / 2, 0);

describe('the strip builder (milestone 156)', () => {
  it('folds each panel off the one before, up or down as asked: U, Z, L and an accordion', () => {
    for (const m of [CARD, C16]) {
      const u = createDesign(m), z = createDesign(m), l = createDesign(m), acc = createDesign(m);
      const U = addStrip(u, { widths: [30, 60, 30], length: 120, bends: [90, 90] })!;
      const Z = addStrip(z, { widths: [30, 60, 30], length: 120, bends: [90, -90] })!;
      const L = addStrip(l, { widths: [40, 40], length: 120, bends: [90] })!;
      const A = addStrip(acc, { widths: [20, 20, 20, 20, 20], length: 120, bends: [60, -60, 60, -60] })!;
      expect([U.length, Z.length, L.length, A.length]).toEqual([3, 3, 2, 5]);
      // the U's last panel folds back over its first; the Z's away from it
      expect(Math.abs(centre(u, U[2])[2] - centre(u, U[0])[2])).toBeLessThan(Math.abs(centre(z, Z[2])[2] - centre(z, Z[0])[2]));
      for (const d of [u, z, l, acc]) {
        expect(blocking(d), m.id).toEqual([]);
        expect(pieces(d)).toBe(1);
      }
    }
  });

  it('refuses a strip that does not add up', () => {
    expect(addStrip(createDesign(CARD), { widths: [30, 60], length: 120, bends: [90, 90] })).toBeNull();
    expect(addStrip(createDesign(CARD), { widths: [30, -1], length: 120, bends: [90] })).toBeNull();
  });
});

describe('the wrap builder (milestone 156)', () => {
  it('a wrapper: a base lying flat, walls folded off both its edges, flanges on its ends glued to them; one clean piece', () => {
    for (const m of [CARD, C16]) {
      const d = createDesign(m);
      const w = addWrap(d, { length: 120, root: 1, sections: [{ depth: 40, bend: 0 }, { depth: 80, bend: 90, flanges: 40 }, { depth: 40, bend: 90 }] })!;
      expect(w.sections.length).toBe(3);
      expect(w.flanges.length).toBe(2);
      // the root lies flat; the walls stand on its two edges
      expect(Math.abs(d.panels[w.sections[1]].frame.v[1])).toBeLessThan(1e-9);
      expect(Object.values(d.connections).filter((c) => c.kind === 'glue').length).toBeGreaterThanOrEqual(4);
      expect(blocking(d), m.id).toEqual([]);
      expect(pieces(d)).toBe(1);
    }
  });
});

describe('the insert (milestone 156)', () => {
  it('every profile builds clean on card and corrugated, and is recognised as its style', () => {
    for (const m of [CARD, C16, C4])
      for (const id of ['uLiner', 'zProfile', 'angleGuard', 'accordionPad']) {
        const r = chooseStyle(styleById(id)!, m, defaults(templateById('insert')!), templateById)!;
        const d = generate(templateById(r.id)!, m, r.params);
        expect(blocking(d), `${id} ${m.id}`).toEqual([]);
        expect(pieces(d), `${id} ${m.id}`).toBe(1);
        expect(recordOf(d).strip, id).toBe(true);
        expect(recognise(d)?.v.id, `${id} ${m.id}`).toBe(id);
      }
  });
});
