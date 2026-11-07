// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { addDetail, addRootPanel, createDesign, growPanel } from '../src/model/ops';
import { registerFont, FONTS } from '../src/text/fonts';
import { outlineText, visualOrder } from '../src/text/outline';
import { importSvg } from '../src/io/svgImport';
import { prepareExport } from '../src/export/prepare';
import { offsetContour } from '../src/export/offset';
import { sheetToSvg } from '../src/export/svg';
import { sheetsToDxf } from '../src/export/dxf';
import { pack, pieceCopies, placedRect } from '../src/model/pack';
import { validate } from '../src/model/validate';
import { MATERIALS } from '../src/model/materials';
import { contourBBox, rectContour, circleContour, contourArea } from '../src/geom/vec';
import { buildPieces } from '../src/model/pieces';
import { parseProject, serializeProject } from '../src/model/serialize';

const buf = (f: string) => {
  const b = readFileSync(`public/fonts/${f}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
beforeAll(() => {
  for (const f of FONTS) registerFont(f.id, buf(`${f.file}-hebrew-400-normal.woff`), buf(`${f.file}-latin-400-normal.woff`));
});

describe('text', () => {
  it('lays out mixed Hebrew, English and numbers in visual order', () => {
    // Unicode bidi: numbers after Latin letters join the left-to-right run
    expect(visualOrder('שלום abc 123')).toBe('abc 123 םולש');
    expect(visualOrder('שלום 123')).toBe('123 םולש');
    expect(visualOrder('קופסה של Dana')).toBe('Dana לש הספוק');
    expect(visualOrder('כיתה ז3 (2026)')).toBe('(2026) 3ז התיכ');
    expect(visualOrder('Box 7')).toBe('Box 7');
  });

  it('outlines text in every bundled font with no missing glyphs', () => {
    for (const f of FONTS) {
      const o = outlineText('שלום Hello 42', f.id, 10)!;
      expect(o.missing).toEqual([]);
      expect(o.polys.length).toBeGreaterThan(10);
      expect(o.maxX - o.minX).toBeGreaterThan(30);
    }
  });

  it('text exports as outlines in visual order, with no font references', () => {
    const d = createDesign();
    const p = addRootPanel(d, 0, 0, 160, 60);
    addDetail(d, p, 'rect', 'engrave', 80, 30, 10, 10, 'xt');
    const dt = d.panels[p].details[0];
    Object.assign(dt, { shape: 'text', text: { value: 'שלום 123', font: 'rubik', size: 10 } });
    const prep = prepareExport(d);
    const eng = prep.sheets[0].contours.filter((c) => c.op === 'engrave');
    expect(eng.length).toBeGreaterThanOrEqual(7);
    expect(eng.every((c) => c.contour.closed)).toBe(true);
    const svg = sheetToSvg(prep.sheets[0]);
    expect(svg).not.toMatch(/<text|font-family|@font-face/);
    expect(sheetsToDxf(prep.sheets)).not.toMatch(/\nTEXT\n|\nMTEXT\n|STYLE/);
    // visual order: the digits come first (leftmost), the Hebrew word last (rightmost)
    const xs = eng.map((c) => contourBBox(c.contour));
    const minX = Math.min(...xs.map((b) => b.minX)), maxX = Math.max(...xs.map((b) => b.maxX));
    // visual order: the leftmost glyph is the narrow "1", the rightmost is the wide "ש"
    const left = xs.reduce((a, b) => (b.minX < a.minX ? b : a)), right = xs.reduce((a, b) => (b.maxX > a.maxX ? b : a));
    expect(left.w).toBeLessThan(4);
    expect(right.w).toBeGreaterThan(5);
    expect(maxX - minX).toBeGreaterThan(30);
    expect(validate(d).filter((i) => i.key === 'val.textFailed')).toEqual([]);
  });

  it('flags cut-through letters with closed middles', () => {
    const d = createDesign();
    const p = addRootPanel(d, 0, 0, 160, 60);
    addDetail(d, p, 'rect', 'cut', 80, 30, 10, 10, 'xt');
    Object.assign(d.panels[p].details[0], { shape: 'text', text: { value: 'BOX', font: 'rubik', size: 12 } });
    expect(validate(d).map((i) => i.key)).toContain('val.stencil');
  });
});

describe('SVG import', () => {
  it('imports closed shapes with transforms and arcs', () => {
    const r = importSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><g transform="translate(10 0)"><rect x="0" y="0" width="40" height="50"/><path d="M60 25 a15 15 0 1 0 30 0 a15 15 0 1 0 -30 0 Z"/></g></svg>`);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.polys).toHaveLength(2);
    expect(r.w).toBeCloseTo(90, 6);
    expect(r.h).toBeCloseTo(50, 6);
  });
  it('drops open lines with a note and refuses files with nothing closed', () => {
    const ok = importSvg(`<svg xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="0" x2="10" y2="10"/><circle cx="5" cy="5" r="5"/></svg>`);
    expect('error' in ok ? ok.error : ok.problems).toContain('openDropped');
    expect(importSvg(`<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10 10 L20 0"/></svg>`)).toEqual({ error: 'noClosed' });
    expect(importSvg(`<svg xmlns="http://www.w3.org/2000/svg"><text>hi</text></svg>`)).toEqual({ error: 'textDropped' });
    expect(importSvg('not an svg')).toEqual({ error: 'notSvg' });
  });
  it('imported shapes scale to their box and export as closed paths', () => {
    const r = importSvg(`<svg xmlns="http://www.w3.org/2000/svg"><polygon points="0,0 20,0 10,20"/></svg>`);
    if ('error' in r) throw new Error(r.error);
    const d = createDesign();
    const p = addRootPanel(d, 0, 0, 100, 100);
    addDetail(d, p, 'rect', 'cut', 50, 50, 30, 30, 'xi');
    Object.assign(d.panels[p].details[0], { shape: 'path', path: { polys: r.polys } });
    const hole = buildPieces(d)[0].contours.find((c) => c.ref?.detailId === 'xi')!;
    const bb = contourBBox(hole.contour);
    expect([bb.w, bb.h].map((x) => +x.toFixed(6))).toEqual([30, 30]);
    expect(parseProject(serializeProject(d)).panels[p].details[0].path!.polys).toHaveLength(1);
  });
});

describe('kerf modes', () => {
  it('acceptance: 50×50 with Ø10 hole and 0.2 kerf → 50.2×50.2 and Ø9.8 compensated, unchanged nominal', () => {
    const d = createDesign({ ...MATERIALS[3], kerf: 0.2 });
    const p = addRootPanel(d, 0, 0, 50, 50);
    addDetail(d, p, 'circle', 'cut', 25, 25, 10, 10);
    for (const [mode, outer, hole] of [['nominal', 50, 10], ['compensated', 50.2, 9.8]] as const) {
      const prep = prepareExport(d, mode);
      expect(prep.errors).toEqual([]);
      const cs = prep.sheets[0].contours;
      const o = contourBBox(cs.find((c) => c.role === 'outer')!.contour);
      const h = cs.find((c) => c.role === 'hole')!.contour;
      expect(o.w).toBeCloseTo(outer, 9);
      expect(o.h).toBeCloseTo(outer, 9);
      expect(contourBBox(h).w).toBeCloseTo(hole, 9);
      // arcs stay arcs
      expect(h.segs.every((s) => s.k === 'A')).toBe(true);
    }
  });
  it('offsets finger-jointed outlines (inner corners trimmed, outer corners rounded)', () => {
    const d = createDesign({ ...MATERIALS[3], kerf: 0.2 });
    const base = addRootPanel(d, 0, 0, 80, 60);
    growPanel(d, base, 0, { height: 40, angle: 90, dir: 'up', kind: 'finger' });
    const prep = prepareExport(d, 'compensated');
    expect(prep.errors).toEqual([]);
    const nominal = prepareExport(d, 'nominal');
    const a0 = nominal.sheets[0].contours.filter((c) => c.role === 'outer').map((c) => contourArea(c.contour));
    const a1 = prep.sheets[0].contours.filter((c) => c.role === 'outer').map((c) => contourArea(c.contour));
    a1.forEach((a, i) => expect(a).toBeGreaterThan(a0[i]));
  });
  it('blocks a compensated export that collapses a shape, naming the piece', () => {
    expect(offsetContour(circleContour(0, 0, 0.05), -0.1)).toBeNull();
    expect(offsetContour(rectContour(0, 0, 0.1, 5), -0.1)).toBeNull();
    const d = createDesign({ ...MATERIALS[3], kerf: 0.6 }); // shapes are at least Ø0.5
    const p = addRootPanel(d, 0, 0, 50, 50);
    addDetail(d, p, 'circle', 'cut', 25, 25, 0.3, 0.3);
    expect(prepareExport(d, 'compensated').errors).toEqual([{ pieceKey: p, panelId: p }]);
  });
});

describe('packing', () => {
  it('acceptance: a piece with quantity 30 packs without overlaps, within margins, respecting grain', () => {
    const d = createDesign(MATERIALS[3]); // grain along x: no rotation
    const p = addRootPanel(d, 0, 0, 70, 120);
    d.pieces[p].quantity = 30;
    const copies = pieceCopies(d);
    const pl = pack(d, copies);
    expect(Object.keys(pl)).toHaveLength(30);
    const rects = copies.map((c) => placedRect(pl[c.key], c.w, c.h));
    expect(Object.values(pl).every((x) => x.rot === 0)).toBe(true);
    for (const r of rects) {
      expect(r.x0).toBeGreaterThanOrEqual(d.sheetMargin - 1e-9);
      expect(r.y0).toBeGreaterThanOrEqual(d.sheetMargin - 1e-9);
      expect(r.x1).toBeLessThanOrEqual(d.material.sheetW - d.sheetMargin + 1e-9);
      expect(r.y1).toBeLessThanOrEqual(d.material.sheetH - d.sheetMargin + 1e-9);
    }
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (a.sheet !== b.sheet) continue;
        const sep = a.x1 + d.sheetSpacing <= b.x0 + 1e-9 || b.x1 + d.sheetSpacing <= a.x0 + 1e-9 || a.y1 + d.sheetSpacing <= b.y0 + 1e-9 || b.y1 + d.sheetSpacing <= a.y0 + 1e-9;
        expect(sep).toBe(true);
      }
    expect(validate(d).filter((i) => i.key === 'val.piecesOverlap' || i.key === 'val.offSheet')).toEqual([]);
    // allowing rotation can only use as many or fewer sheets
    const sheets = new Set(Object.values(pl).map((x) => x.sheet)).size;
    d.allowRotate = true;
    expect(new Set(Object.values(pack(d)).map((x) => x.sheet)).size).toBeLessThanOrEqual(sheets);
  });

  it('keeps manual placements and packs the rest around them; flags overlaps and off-sheet pieces', () => {
    const d = createDesign(MATERIALS[3]);
    const p = addRootPanel(d, 0, 0, 100, 100);
    d.pieces[p].quantity = 3;
    d.placements[`${p}#1`] = { sheet: 0, x: 5, y: 295, rot: 0, manual: true };
    const pl = pack(d);
    expect(pl[`${p}#1`]).toEqual(d.placements[`${p}#1`]);
    expect(validate(d).filter((i) => i.key === 'val.piecesOverlap')).toEqual([]);
    d.placements[`${p}#2`] = { sheet: 0, x: 50, y: 290, rot: 0, manual: true };
    expect(validate(d).map((i) => i.key)).toContain('val.piecesOverlap');
    d.placements[`${p}#2`] = { sheet: 0, x: 550, y: 10, rot: 0, manual: true };
    expect(validate(d).map((i) => i.key)).toContain('val.offSheet');
  });

  it('a folded net packs as one unit', () => {
    const d = createDesign(MATERIALS[0]);
    const base = addRootPanel(d, 0, 0, 60, 40);
    for (const e of [0, 1, 2, 3]) growPanel(d, base, e, { height: 20, angle: 90, dir: 'up', kind: 'fold' });
    d.pieces[base].quantity = 4;
    expect(pieceCopies(d)).toHaveLength(4);
  });
});

describe('validation', () => {
  it('flags overlapping cut-outs (double cut lines), including array copies', () => {
    const d = createDesign();
    const p = addRootPanel(d, 0, 0, 100, 60);
    addDetail(d, p, 'circle', 'cut', 30, 30, 10, 10);
    expect(validate(d)).toEqual([]);
    addDetail(d, p, 'rect', 'cut', 34, 30, 10, 10);
    expect(validate(d).map((i) => i.key)).toContain('val.shapesOverlap');
  });
});
