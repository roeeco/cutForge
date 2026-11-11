// Milestone 47 (CURVED_WALLS.md §2.2, §4.1, §5.2, §5.4, §5.5): bend patterns on bent walls.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { addPolygonPanel, addRoundedRect, addTray, autoConnect, createDesign, findDetail, setBend, setCornerRadius, setMaterial, setPointCurve, solve } from '../src/model/ops';
import { addDetail } from '../src/model/ops';
import { MATERIALS, bendOf } from '../src/model/materials';
import { bridgeOf, resolveStyle, styleReach, stylesFor } from '../src/model/bendPattern';
import { validate } from '../src/model/validate';
import { fixIssue } from '../src/easy/fix';
import { buildPieces } from '../src/model/pieces';
import { prepareExport } from '../src/export/prepare';
import { bendTestSheet, testRadii } from '../src/export/bendTest';
import { sheetToSvg } from '../src/export/svg';
import { parseProject, serializeProject } from '../src/model/serialize';
import { holeCuts } from '../src/model/outline';
import { flattenContour, pointInPolygon, segDistPoint } from '../src/geom/vec';
import { registerFont, FONTS } from '../src/text/fonts';
import type { Design, Panel } from '../src/model/types';

const [CARD, CORR16, CORR4, PLY] = MATERIALS;

const buf = (f: string) => {
  const b = readFileSync(`public/fonts/${f}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
beforeAll(() => {
  for (const f of FONTS) registerFont(f.id, buf(`${f.file}-hebrew-400-normal.woff`), buf(`${f.file}-latin-400-normal.woff`));
});

const blocking = (d: Design) => validate(d).filter((i) => !['val.split', 'val.bevel'].includes(i.key));
const bentWalls = (d: Design) => d.order.map((id) => d.panels[id]).filter((p): p is Panel => !!p?.bent);
const geomOf = (d: Design, W: Panel) => Object.values(d.connections).find((c) => c.grown && c.b.panelId === W.id)!.geom!;
const vLines = (d: Design, W: Panel, kind: 'scores' | 'lines') => (geomOf(d, W)[kind] ?? []).filter((s) => s.panelId === W.id && Math.abs(s.a.x - s.b.x) < 1e-9 && s.a.y >= -1e-9);

function roundedBox(m: typeof CARD, r: number, w = 120, h = 80, height = 40) {
  const d = createDesign(m);
  const base = addRoundedRect(d, 0, 0, w, h, r)!;
  addTray(d, base, height);
  autoConnect(d);
  return { d, base };
}

describe('styles', () => {
  it('each material offers its own styles, and Auto takes the first that reaches the curve', () => {
    expect(stylesFor('card')).toEqual(['smooth', 'score', 'perf']);
    expect(stylesFor('corrugated')).toEqual(['smooth', 'kiss', 'perf']);
    expect(stylesFor('plywood')).toEqual(['smooth', 'lattice']);
    expect(resolveStyle(CARD, 'auto', 12).style).toBe('smooth');
    expect(resolveStyle(CARD, undefined, 6).style).toBe('score');
    expect(resolveStyle(CARD, undefined, 3.5).style).toBe('perf');
    expect(resolveStyle(CORR16, undefined, 15).style).toBe('kiss');
    expect(resolveStyle(PLY, undefined, 30).style).toBe('lattice');
    expect(resolveStyle(PLY, undefined, 400).style).toBe('smooth');
    // a style the material does not offer falls back to Auto
    expect(resolveStyle(PLY, 'kiss', 30)).toEqual({ style: 'lattice', auto: true });
    expect(resolveStyle(CARD, 'perf', 30)).toEqual({ style: 'perf', auto: false });
  });

  it('a card box bends smooth at R 15, scored at R 8, and perforated when asked; a style change to plywood falls back to Auto', () => {
    const { d, base } = roundedBox(CARD, 15);
    for (const W of bentWalls(d)) expect(W.bent!.pattern).toMatchObject({ style: 'smooth', auto: true });
    setCornerRadius(d, base, 8);
    for (const W of bentWalls(d)) {
      expect(W.bent!.pattern).toMatchObject({ style: 'score', auto: true });
      expect(vLines(d, W, 'scores').length).toBeGreaterThan(1);
      expect(vLines(d, W, 'lines')).toHaveLength(0);
    }
    expect(blocking(d)).toEqual([]);
    const W0 = bentWalls(d)[0];
    setBend(d, W0.id, { style: 'perf' });
    const W = d.panels[W0.id];
    expect(W.bend).toEqual({ style: 'perf' });
    expect(W.bent!.pattern).toMatchObject({ style: 'perf', auto: false });
    expect(vLines(d, W, 'lines').length).toBeGreaterThan(2);
    expect(vLines(d, W, 'scores')).toHaveLength(0);
    // Auto again: stored as absent
    setBend(d, W.id, { style: 'auto' });
    expect(d.panels[W.id].bend).toBeUndefined();
    // plywood offers no perforation: back to its own Auto (a living hinge)
    setBend(d, W.id, { style: 'perf' });
    setMaterial(d, PLY);
    solve(d);
    expect(d.panels[W.id].bent!.pattern).toMatchObject({ style: 'lattice', auto: true });
  });

  it('a style that reaches less tight than the curve is named, and its Fix sets Auto', () => {
    const { d } = roundedBox(CORR16, 15);
    const W = bentWalls(d)[0];
    expect(W.bent!.pattern?.style).toBe('kiss');
    setBend(d, W.id, { style: 'smooth' });
    const issue = validate(d).find((i) => i.key === 'val.bendStyle' && i.target.kind === 'panel' && i.target.id === W.id)!;
    expect(issue.vars).toMatchObject({ r: 15, reach: bendOf(CORR16).smoothR });
    expect(fixIssue(d, issue)).toBe(true);
    expect(d.panels[W.id].bend).toBeUndefined();
    expect(validate(d).some((i) => i.key === 'val.bendStyle')).toBe(false);
  });
});

describe('line spacing', () => {
  it('follows the curve: R(s)·φ between half and twice the pitch; a set spacing caps it', () => {
    const d = createDesign(PLY);
    const b = addPolygonPanel(d, 0, 0, [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }])!;
    setPointCurve(d, b, 2, true);
    addTray(d, b, 40);
    autoConnect(d);
    const [W] = bentWalls(d);
    const lim = bendOf(PLY), phi = lim.pitch / lim.patternR;
    // the lattice's columns: distinct x positions in the main zone
    const zone = W.bent!.pattern!.zones.reduce((a, z) => (z.lines > a.lines ? z : a));
    const xs = [...new Set(vLines(d, W, 'lines').map((s) => Math.round(s.a.x * 1e6) / 1e6))].filter((x) => x >= zone.s0 && x <= zone.s1).sort((a, c) => a - c);
    expect(xs.length).toBeGreaterThan(10);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    // spacing changes along the curve (tighter where it is tighter) and stays within the clamp
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeGreaterThan(1.5);
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(0.5 * lim.pitch - 0.2);
      expect(g).toBeLessThanOrEqual(2 * lim.pitch + 0.2);
    }
    // at the tightest point the spacing is about R·φ
    expect(Math.min(...gaps)).toBeCloseTo(Math.max(0.5 * lim.pitch, zone.minR * phi), 0);
    // a set spacing: never more than it
    setBend(d, W.id, { pitch: 1.5 });
    const W2 = d.panels[W.id];
    const xs2 = [...new Set(vLines(d, W2, 'lines').map((s) => Math.round(s.a.x * 1e6) / 1e6))].sort((a, c) => a - c);
    const z2 = W2.bent!.pattern!.zones.reduce((a, z) => (z.lines > a.lines ? z : a));
    const in2 = xs2.filter((x) => x >= z2.s0 && x <= z2.s1);
    for (let i = 1; i < in2.length; i++) expect(in2[i] - in2[i - 1]).toBeLessThanOrEqual(1.5 + 0.05);
  });
});

describe('plywood living hinge', () => {
  it('a 3 mm plywood rounded box R 30 gets a living hinge in each corner and is clean; at R 15 it is flagged', () => {
    const { d, base } = roundedBox(PLY, 30);
    const walls = bentWalls(d);
    expect(walls).toHaveLength(4);
    for (const W of walls) {
      expect(W.bent!.pattern).toMatchObject({ style: 'lattice', auto: true });
      const cuts = vLines(d, W, 'lines');
      expect(cuts.length).toBeGreaterThan(10);
      // staggered columns: neighbouring columns' bridges are at different heights
      const cols = [...new Set(cuts.map((s) => s.a.x))].sort((a, b) => a - b);
      const ends = (x: number) => cuts.filter((s) => s.a.x === x).map((s) => Math.round(Math.max(s.a.y, s.b.y) * 100) / 100).sort((a, b) => a - b);
      const mid = cols.length >> 1;
      expect(ends(cols[mid])[0]).not.toBeCloseTo(ends(cols[mid + 1])[0], 0);
    }
    expect(blocking(d)).toEqual([]);
    setCornerRadius(d, base, 15);
    expect(validate(d).filter((i) => i.key === 'val.bendTight')).toHaveLength(4);
  });

  it('every cut keeps a bridge length from the wall’s edges and ends and from a hole on the wall', () => {
    const { d } = roundedBox(PLY, 40, 140, 100, 50);
    const W0 = bentWalls(d)[0];
    addDetail(d, W0.id, 'circle', 'cut', W0.w / 2, 25, 8, 8);
    solve(d);
    const W = d.panels[W0.id];
    const br = bridgeOf(PLY);
    expect(br).toBe(3);
    const cuts = vLines(d, W, 'lines');
    expect(cuts.length).toBeGreaterThan(10);
    const hole = holeCuts(W).flatMap((h) => h.contours.map((c) => flattenContour(c, 0.05)))[0];
    for (const s of cuts) {
      for (const q of [s.a, s.b]) {
        expect(q.x).toBeGreaterThanOrEqual(br - 1e-6);
        expect(q.x).toBeLessThanOrEqual(W.w - br + 1e-6);
        expect(q.y).toBeGreaterThanOrEqual(br - 1e-6);
        expect(q.y).toBeLessThanOrEqual(W.h - br + 1e-6);
      }
      // from the hole: the whole cut stays a bridge away
      let dmin = Infinity;
      for (let i = 0; i < hole.length; i++) dmin = Math.min(dmin, segDistPoint(hole[i], s.a, s.b), segDistPoint(s.a, hole[i], hole[(i + 1) % hole.length]), segDistPoint(s.b, hole[i], hole[(i + 1) % hole.length]));
      expect(dmin).toBeGreaterThanOrEqual(br - 1e-3);
      expect(pointInPolygon({ x: s.a.x, y: (s.a.y + s.b.y) / 2 }, hole)).toBe(false);
    }
  });

  it('a big hole in a hinge zone is named: the wall cannot turn there', () => {
    const { d } = roundedBox(PLY, 30);
    const W0 = bentWalls(d)[0];
    const id = addDetail(d, W0.id, 'rect', 'cut', W0.w / 2, 20, W0.w * 0.7, 30)!;
    solve(d);
    const issue = validate(d).find((i) => i.key === 'val.bendShape');
    expect(issue?.target).toEqual({ kind: 'detail', id });
    // the wall is curved all along: there is nowhere to move it, so the Fix does nothing
    expect(fixIssue(d, issue!)).toBe(false);
    expect(findDetail(d, id)).toBeTruthy();
  });
});

describe('kiss scores', () => {
  it('corrugated 1.6 at R 15: kiss scores on the inside, the strip laid so that face is up, labelled on the guide layer', () => {
    const { d } = roundedBox(CORR16, 15);
    const walls = bentWalls(d);
    for (const W of walls) {
      const info = W.bent!.pattern!;
      expect(info).toMatchObject({ style: 'kiss', face: 1 });
      expect(info.mirror).toBe(W.frame.side !== 1);
      expect(vLines(d, W, 'scores').length).toBeGreaterThan(2);
    }
    expect(blocking(d)).toEqual([]);
    const W = walls[0];
    // in its piece (on its own, or riding on a straight wall in the tray's net, milestone 48) the scored face is up
    const piece = buildPieces(d).find((p) => p.panels.some((n) => n.panelId === W.id))!;
    const n = piece.panels.find((x) => x.panelId === W.id)!;
    expect((W.frame.side === 1) !== !!n.xf.mirror ? 1 : -1).toBe(W.bent!.pattern!.face);
    const prep = prepareExport(d);
    expect(prep.sheets.flatMap((s) => s.contours).filter((c) => c.op === 'guide').length).toBeGreaterThan(0);
    // the outside up: no longer mirrored the other way
    setBend(d, W.id, { face: -1 });
    expect(d.panels[W.id].bent!.pattern).toMatchObject({ face: -1, mirror: d.panels[W.id].frame.side !== -1 });
  });

  it('a strip bending both ways: Auto perforates the other way; kiss asked for is flagged, and its Fix sets Auto', () => {
    // 4 mm corrugated bends only 60 mm round plainly: this S-curve needs a pattern both ways
    const d = createDesign(CORR4);
    const b = addPolygonPanel(d, 0, 0, [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 120, y: 60 }, { x: 60, y: 130 }, { x: 0, y: 130 }])!;
    setPointCurve(d, b, 3, true);
    setPointCurve(d, b, 4, true);
    addTray(d, b, 40);
    autoConnect(d);
    const [W0] = bentWalls(d);
    const auto = W0.bent!.pattern!;
    expect(auto.auto && auto.style).toBe('kiss');
    expect(auto.zones.some((z) => z.sign === 1) && auto.zones.some((z) => z.sign === -1)).toBe(true);
    for (const z of auto.zones) expect(z.style).toBe(z.sign === auto.face ? 'kiss' : 'perf');
    expect(validate(d).some((i) => i.key === 'val.kissTwoWay')).toBe(false);
    setBend(d, W0.id, { style: 'kiss' });
    const W = d.panels[W0.id];
    expect(W.bent!.pattern!.zones.filter((z) => z.sign !== W.bent!.pattern!.face).every((z) => z.style === 'smooth')).toBe(true);
    const issue = validate(d).find((i) => i.key === 'val.kissTwoWay')!;
    expect(issue).toBeTruthy();
    expect(fixIssue(d, issue)).toBe(true);
    expect(d.panels[W0.id].bent!.pattern!.auto).toBe(true);
    expect(validate(d).some((i) => i.key === 'val.kissTwoWay')).toBe(false);
  });
});

describe('export', () => {
  it('kerf-compensated hinge cuts are shortened by the kerf', () => {
    const { d } = roundedBox(PLY, 30);
    const len = (c: { contour: { segs: { a: { x: number; y: number }; b: { x: number; y: number } }[] } }) => c.contour.segs.reduce((s, g) => s + Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y), 0);
    const open = (k: 'nominal' | 'compensated') => prepareExport(d, k).sheets.flatMap((s) => s.contours).filter((c) => c.op === 'cut' && !c.contour.closed);
    const a = open('nominal'), b = open('compensated');
    expect(a.length).toBeGreaterThan(40);
    expect(b).toHaveLength(a.length);
    a.forEach((c, i) => expect(len(c) - len(b[i])).toBeCloseTo(PLY.kerf, 6));
  });

  it('save and load: the choices are kept, the pattern re-made the same', () => {
    const { d } = roundedBox(CARD, 8);
    const W = bentWalls(d)[0];
    setBend(d, W.id, { style: 'perf', pitch: 3 });
    const e = parseProject(serializeProject(d));
    expect(e.panels[W.id].bend).toEqual({ style: 'perf', pitch: 3 });
    expect(vLines(e, e.panels[W.id], 'lines')).toEqual(vLines(d, d.panels[W.id], 'lines'));
    // a bad choice in a file is refused
    const bad = JSON.parse(serializeProject(d));
    bad.design.panels[W.id].bend = { style: 'zigzag' };
    expect(() => parseProject(JSON.stringify(bad))).toThrow();
  });

  it('the bend test: five zones for radii around the limit, each patterned and labelled', () => {
    for (const m of [CARD, CORR16, CORR4, PLY]) {
      const rs = testRadii(m);
      expect(rs).toHaveLength(5);
      expect(rs).toContain(Math.round(bendOf(m).patternR * 2) / 2);
      const sh = bendTestSheet(m, (r) => `R ${r}`);
      const outer = sh.contours.filter((c) => c.role === 'outer');
      expect(outer).toHaveLength(1);
      const lines = sh.contours.filter((c) => c.role === 'line' && c.op !== 'guide');
      expect(lines.length).toBeGreaterThan(10);
      expect(lines.every((c) => c.op === (m.kind === 'plywood' ? 'cut' : 'score'))).toBe(true);
      expect(sh.contours.some((c) => c.op === 'guide')).toBe(true);
      expect(sheetToSvg(sh)).toContain('<svg');
      expect(styleReach(m, 'smooth')).toBe(bendOf(m).smoothR);
    }
  });
});
