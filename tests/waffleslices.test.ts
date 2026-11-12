// Milestone 51: slices, sections and parts; waffle pieces in the cut plan and export.
import { beforeAll, describe, expect, it } from 'vitest';
import { kernel, type Kernel } from '../src/sculpt/kernel';
import { addShape, createWaffleDesign, primitiveShape, type Primitive } from '../src/sculpt/ops';
import { deriveWaffle, defaultCount, familyPositions } from '../src/waffle/derive';
import { wafflePieces } from '../src/waffle/pieces';
import { prepareExport } from '../src/export/prepare';
import { sheetsToSvg } from '../src/export/svg';
import { sheetsToDxf } from '../src/export/dxf';
import { pieceCopies } from '../src/model/pack';
import type { Design, WaffleSpec } from '../src/model/types';

let k: Kernel;
beforeAll(async () => {
  k = await kernel();
});

function one(kind: Primitive, w: number, h: number, dd = w, patch: Record<string, unknown> = {}): Design {
  const d = createWaffleDesign();
  addShape(d, { ...primitiveShape(kind, { x: 0, z: 0, w, d: dd }, h), ...patch });
  return d;
}
const spec = (na: number, nb: number): WaffleSpec => ({ turn: 0, a: { spacing: { by: 'count', n: na } }, b: { spacing: { by: 'count', n: nb } } });

describe('families', () => {
  it('defaults: one slice per 35 mm, 3 to 9, centred in equal bands', () => {
    expect(defaultCount(50)).toBe(3);
    expect(defaultCount(210)).toBe(6);
    expect(defaultCount(900)).toBe(9);
    const p = familyPositions('a', { spacing: { by: 'count', n: 4 } }, [-40, 40]);
    expect(p.map((x) => x.at)).toEqual([-30, -10, 10, 30]);
    expect(p.map((x) => x.id)).toEqual(['a1', 'a2', 'a3', 'a4']);
    const g = familyPositions('b', { spacing: { by: 'gap', mm: 25 } }, [-40, 40]);
    expect(g.map((x) => x.at)).toEqual([-25, 0, 25]);
  });
});

describe('sections', () => {
  it('a box gives rectangles the size of its cross-section', () => {
    const d = one('box', 120, 60, 80);
    d.waffle = spec(3, 4);
    const m = deriveWaffle(k, d);
    expect(m.slices.length).toBe(7);
    const a = m.parts.filter((p) => p.fam === 'a');
    const b = m.parts.filter((p) => p.fam === 'b');
    expect(a.length).toBe(3);
    expect(b.length).toBe(4);
    // family A runs along x: 120 × 60; B along z: 80 × 60
    for (const p of a) expect(p.area).toBeCloseTo(120 * 60, 3);
    for (const p of b) expect(p.area).toBeCloseTo(80 * 60, 3);
  });
  it('a cylinder gives rectangles of its chord', () => {
    const d = one('cylinder', 100, 50);
    d.waffle = spec(3, 3);
    const m = deriveWaffle(k, d);
    const mid = m.parts.find((p) => p.label === 'A2')!;
    expect(mid.at).toBeCloseTo(0, 6);
    expect(mid.area).toBeCloseTo(100 * 50, -1);
  });
  it('a sphere gives circles; the middle one its full radius', () => {
    const d = one('sphere', 100, 100);
    d.waffle = spec(3, 3);
    const m = deriveWaffle(k, d);
    expect(m.parts.length).toBe(6);
    const mid = m.parts.find((p) => p.label === 'B2')!;
    expect(Math.abs(mid.area - Math.PI * 2500) / (Math.PI * 2500)).toBeLessThan(0.002);
  });
  it('a torus: slices through the hole give two parts, A2·1 and A2·2', () => {
    // a 24 mm tube: the end slices (40 mm out) still cut it in one piece
    const d = one('torus', 120, 24, 120, { size: [120, 24, 120], tube: 24 });
    d.waffle = spec(3, 3);
    const m = deriveWaffle(k, d);
    const mid = m.parts.filter((p) => p.sliceLabel === 'A2');
    expect(mid.map((p) => p.label)).toEqual(['A2·1', 'A2·2']);
    expect(m.parts.filter((p) => p.sliceLabel === 'A1').length).toBe(1);
    expect(m.parts.length).toBe(1 + 2 + 1 + 1 + 2 + 1);
  });
  it('tiny bits are left out and counted', () => {
    // a tall thin box's slices are 2 mm wide: narrower than 2t everywhere
    const d = one('box', 2, 60, 80);
    d.waffle = spec(1, 3);
    const m = deriveWaffle(k, d);
    expect(m.parts.filter((p) => p.fam === 'a').length).toBe(0);
    expect(m.tiny).toBeGreaterThan(0);
  });
});

describe('pieces and export', () => {
  it('a sphere’s slices export as circles within 0.05 mm of the true radius, as arcs in SVG and DXF', () => {
    const R = 50;
    const d = one('sphere', 2 * R, 2 * R);
    d.waffle = spec(3, 3);
    const pieces = wafflePieces(d);
    expect(pieces.map((p) => p.key).sort()).toEqual(['w:A1', 'w:A2', 'w:A3', 'w:B1', 'w:B2', 'w:B3']);
    const m = deriveWaffle(k, d);
    for (const p of pieces) {
      const at = m.parts.find((x) => x.key === p.key)!.at;
      const r = Math.sqrt(R * R - at * at);
      const outer = p.contours.find((c) => c.role === 'outer')!.contour;
      // every curved stretch is an arc of the circle the plane cuts from the sphere; the only straight
      // edges are the slots' (milestone 52), upright or level
      expect(outer.segs.filter((s) => s.k === 'A').length).toBeGreaterThan(3);
      for (const s of outer.segs) {
        if (s.k === 'A') expect(Math.abs(s.r - r)).toBeLessThan(0.05);
        else expect(Math.min(Math.abs(s.a.x - s.b.x), Math.abs(s.a.y - s.b.y))).toBeLessThan(0.05);
      }
    }
    const prep = prepareExport(d);
    const svg = sheetsToSvg(prep.sheets);
    expect((svg.match(/ A/g) ?? []).length).toBeGreaterThanOrEqual(12);
    const dxf = sheetsToDxf(prep.sheets);
    // closed outlines are polylines whose arcs are bulges (group 42)
    expect(dxf).toMatch(/\n42\n/);
  });
  it('waffle pieces go through copies and packing like any piece', () => {
    const d = one('box', 120, 60, 80);
    d.waffle = spec(2, 2);
    d.pieces['w:A1'] = { quantity: 2 };
    const copies = pieceCopies(d);
    expect(copies.map((c) => c.key).sort()).toEqual(['w:A1#0', 'w:A1#1', 'w:A2#0', 'w:B1#0', 'w:B2#0']);
    expect(copies.every((c) => c.mat === d.material.id)).toBe(true);
  });
});
