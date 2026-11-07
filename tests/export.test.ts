import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addDetail, addRootPanel, connectSeams, createDesign, growPanel } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { prepareExport } from '../src/export/prepare';
import { sheetToSvg, sheetsToSvg } from '../src/export/svg';
import { sheetsToDxf } from '../src/export/dxf';
import { contourBBox } from '../src/geom/vec';

function hasPython() {
  try {
    execFileSync('python3', ['-c', 'import ezdxf, svgpathtools']);
    return true;
  } catch {
    return false;
  }
}

function sample() {
  const d = createDesign();
  const base = addRootPanel(d, 0, 0, 50, 50);
  addDetail(d, base, 'circle', 'cut', 25, 25, 10, 10);
  addDetail(d, base, 'roundrect', 'engrave', 25, 10, 20, 6);
  return d;
}

describe('export preparation', () => {
  it('places a 50 x 50 panel at true size on the sheet', () => {
    const p = prepareExport(sample());
    expect(p.sheets).toHaveLength(1);
    const outer = p.sheets[0].contours.find((c) => c.role === 'outer')!;
    const bb = contourBBox(outer.contour);
    expect(bb.w).toBeCloseTo(50, 9);
    expect(bb.h).toBeCloseTo(50, 9);
    const hole = p.sheets[0].contours.find((c) => c.role === 'hole')!;
    expect(contourBBox(hole.contour).w).toBeCloseTo(10, 9);
  });

  it('writes an SVG with mm page size matching the viewBox', () => {
    const svg = sheetToSvg(prepareExport(sample()).sheets[0]);
    expect(svg).toContain('width="600mm" height="400mm" viewBox="0 0 600 400"');
    expect(svg).toContain('stroke="#FF0000"');
    expect(svg).toContain('stroke="#000000"');
    expect(svg).toMatch(/ A5 5 0 /);
  });

  it.skipIf(!hasPython())('passes an independent reader check (ezdxf, svgpathtools)', () => {
    const d = sample();
    const wall = growPanel(d, d.order[0], 0, { height: 30, angle: 90, dir: 'up', kind: 'finger' });
    expect(wall).not.toBeNull();
    const prep = prepareExport(d);
    const dir = mkdtempSync(join(tmpdir(), 'cutforge-'));
    const dxfPath = join(dir, 'out.dxf'), svgPath = join(dir, 'out.svg');
    writeFileSync(dxfPath, sheetsToDxf(prep.sheets));
    writeFileSync(svgPath, sheetsToSvg(prep.sheets));
    const r = JSON.parse(execFileSync('python3', ['tests/py/check_exports.py', dxfPath, svgPath]).toString());
    expect(r.dxf.insunits).toBe(4);
    expect(r.dxf.layers).toEqual(expect.arrayContaining(['CUT', 'ENGRAVE', 'SCORE', 'GUIDE']));
    const polys = r.dxf.entities.filter((e: any) => e.type === 'POLYLINE');
    expect(polys.every((e: any) => e.closed)).toBe(true);
    const circle = r.dxf.entities.find((e: any) => e.type === 'CIRCLE');
    expect(circle.r).toBeCloseTo(5, 6);
    expect(circle.layer).toBe('CUT');
    // rounded rect keeps its arcs as bulges
    expect(polys.find((e: any) => e.layer === 'ENGRAVE').bulges).toBe(4);
    expect(r.svg.width).toBe('600mm');
    expect(r.svg.paths.every((p: any) => p.closed)).toBe(true);
    expect(r.svg.paths.some((p: any) => p.arcs === 2)).toBe(true);
    expect(r.svg.strokes).toEqual(['#000000', '#FF0000']);
    // the 50 mm base with fingers on one edge: SVG and DXF agree on its size
    const widths = r.svg.paths.map((p: any) => +(p.bbox[2] - p.bbox[0]).toFixed(6));
    expect(widths).toContain(50);
  });

  it.skipIf(!hasPython())('a folded card tray exports one closed cut outline with fold and flap score lines', () => {
    const d = createDesign(MATERIALS[0]);
    const base = addRootPanel(d, 0, 0, 80, 60);
    const walls = [0, 1, 2, 3].map((e) => growPanel(d, base, e, { height: 30, angle: 90, dir: 'up', kind: 'fold' })!.panelId);
    for (const w of walls) connectSeams(d, w);
    const prep = prepareExport(d);
    const dir = mkdtempSync(join(tmpdir(), 'cutforge-'));
    const dxfPath = join(dir, 'tray.dxf'), svgPath = join(dir, 'tray.svg');
    writeFileSync(dxfPath, sheetsToDxf(prep.sheets));
    writeFileSync(svgPath, sheetsToSvg(prep.sheets));
    const r = JSON.parse(execFileSync('python3', ['tests/py/check_exports.py', dxfPath, svgPath]).toString());
    const cut = r.dxf.entities.filter((e: any) => e.layer === 'CUT');
    expect(cut).toHaveLength(1);
    expect(cut[0].closed).toBe(true);
    const score = r.dxf.entities.filter((e: any) => e.layer === 'SCORE');
    expect(score).toHaveLength(8); // 4 folds + 4 glue flap folds
    expect(score.every((e: any) => e.type === 'LINE')).toBe(true);
    expect(r.svg.strokes).toEqual(['#0000FF', '#FF0000']);
    expect(r.svg.paths.filter((p: any) => p.closed)).toHaveLength(1);
  });
});
