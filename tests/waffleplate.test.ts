// Milestone 53: the base plate, its tabs and slots, and the engraved labels.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { kernel } from '../src/sculpt/kernel';
import { addShape, createWaffleDesign, primitiveShape } from '../src/sculpt/ops';
import { waffleResult } from '../src/waffle/pieces';
import { signedDist, poleOfInaccessibility, LABEL_GAP } from '../src/waffle/labels';
import { placeTabs } from '../src/waffle/finish';
import { flattenContour } from '../src/geom/vec';
import { registerFont, FONTS } from '../src/text/fonts';
import { prepareExport } from '../src/export/prepare';
import { sheetsToSvg } from '../src/export/svg';
import { MATERIALS } from '../src/model/materials';
import type { Design } from '../src/model/types';

const buf = (f: string) => {
  const b = readFileSync(`public/fonts/${f}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
beforeAll(async () => {
  await kernel();
  for (const f of FONTS) registerFont(f.id, buf(`${f.file}-hebrew-400-normal.woff`), buf(`${f.file}-latin-400-normal.woff`));
});

const ply = MATERIALS.find((m) => m.kind === 'plywood' && m.thickness === 3) ?? MATERIALS[0];
function sphereOnPlate(): Design {
  const d = createWaffleDesign(ply);
  addShape(d, primitiveShape('sphere', { x: 0, z: 0, w: 140, d: 140 }, 140));
  d.waffle = { turn: 0, a: { spacing: { by: 'count', n: 4 } }, b: { spacing: { by: 'count', n: 4 } }, base: { shape: 'round', margin: 10, flat: 20 } };
  return d;
}
function boxOnPlate(): Design {
  const d = createWaffleDesign(ply);
  addShape(d, primitiveShape('box', { x: 0, z: 0, w: 160, d: 120 }, 70));
  d.waffle = { turn: 0, a: { spacing: { by: 'count', n: 3 } }, b: { spacing: { by: 'count', n: 4 } }, base: { shape: 'rect', margin: 10, flat: 0 } };
  return d;
}

describe('base plate', () => {
  it('a sphere stands on a round plate: every part has tabs through it, the plate a slot for each', () => {
    const d = sphereOnPlate();
    const r = waffleResult(d);
    expect(r.plate).not.toBeNull();
    const plate = r.plate!;
    // round: one outer ring (a circle of the cut-flat sphere's footprint plus the margin) and a slot per tab
    expect(plate.polys.length).toBe(1 + plate.tabs.length);
    expect(plate.tabs.length).toBeGreaterThanOrEqual(r.parts.length);
    expect(r.parts.every((p) => p.held)).toBe(true);
    // the parts stand on the plate: their tabs reach exactly one thickness below its top
    const plateY = Math.min(...r.parts.map((p) => p.bbox.y0));
    expect(plateY).toBeCloseTo(20 - ply.thickness, 6);
    const pieces = r.pieces.map((p) => p.key);
    expect(pieces[0]).toBe('w:base');
    const svg = sheetsToSvg(prepareExport(d).sheets);
    expect(svg).toContain('ENGRAVE');
  });
  it('the plate shapes: rect, round and outline', () => {
    for (const shape of ['rect', 'round', 'outline'] as const) {
      const d = boxOnPlate();
      d.waffle!.base!.shape = shape;
      const p = waffleResult(d).plate!;
      const w = p.bbox.x1 - p.bbox.x0, h = p.bbox.y1 - p.bbox.y0;
      if (shape === 'round') expect(w).toBeCloseTo(2 * (Math.hypot(80, 60) + 10), 0);
      else {
        expect(w).toBeCloseTo(180, 3);
        expect(h).toBeCloseTo(140, 3);
      }
    }
  });
  it('tabs keep clear of B slot mouths', () => {
    const d = boxOnPlate();
    const r = waffleResult(d);
    const t = ply.thickness;
    const slot = t + ply.clearance;
    for (const c of r.crossings)
      for (const key of c.bParts)
        for (const tab of r.plate!.tabs.filter((x) => x.part === key)) {
          const gap = Math.abs(tab.x - c.xb) - tab.w / 2 - slot / 2;
          expect(gap).toBeGreaterThanOrEqual(t + 2 - 1e-6);
        }
    // a 120 mm run gets two tabs, a 40 mm run one
    expect(placeTabs([[[0, 0], [120, 0], [120, 50], [0, 50]]], 0, 3, 3.1, []).length).toBe(2);
    expect(placeTabs([[[0, 0], [40, 0], [40, 50], [0, 50]]], 0, 3, 3.1, []).length).toBe(1);
    // a run shorter than 3t gets none
    expect(placeTabs([[[0, 0], [8, 0], [8, 50], [0, 50]]], 0, 3, 3.1, []).length).toBe(0);
  });
});

describe('labels', () => {
  it('the pole of inaccessibility of a rectangle is its centre', () => {
    const p = poleOfInaccessibility([[[0, 0], [100, 0], [100, 40], [0, 40]]]);
    expect(p.y).toBeCloseTo(20, 0);
    expect(p.d).toBeCloseTo(20, 0);
  });
  it.each([['sphere on a plate', sphereOnPlate], ['box on a plate', boxOnPlate]])('%s: labels stay inside their part, at least 1 mm from every cut', (_n, make) => {
    const r = waffleResult(make());
    let labels = 0;
    for (const p of [...r.parts, r.plate!]) {
      const eng = p.engrave.filter((e) => e.op === 'engrave');
      expect(eng.length, p.label).toBeGreaterThan(0);
      labels += eng.length;
      for (const e of eng) for (const q of flattenContour(e.contour, 0.05)) expect(signedDist(p.polys, q.x, q.y)).toBeGreaterThanOrEqual(LABEL_GAP - 1e-6);
    }
    expect(labels).toBeGreaterThan(0);
    // partner labels: a part with crossings has more engraved shapes than its own label's letters
    const a1 = r.parts.find((p) => p.label === 'A2')!;
    expect(new Set(a1.engrave.map((e) => e.ref?.detailId)).size).toBeGreaterThan(1);
  });
});
