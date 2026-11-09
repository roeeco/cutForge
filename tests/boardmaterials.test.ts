// Milestone 36: a material for each board.
import { describe, expect, it } from 'vitest';
import { addRootPanel, addTray, autoConnect, createDesign, growPanel, setMaterial, setPanelMaterial, solve } from '../src/model/ops';
import { MATERIALS, matOf, materialsInUse, tOf } from '../src/model/materials';
import { panelNotches } from '../src/model/geometry';
import { validate } from '../src/model/validate';
import { buildPieces, pieceKeyOf } from '../src/model/pieces';
import { pack, pieceCopies, sheetGroups } from '../src/model/pack';
import { prepareExport } from '../src/export/prepare';
import { sheetsToSvg } from '../src/export/svg';
import { migrateDesign, parseProject, serializeProject } from '../src/model/serialize';
import { trayWalls } from '../src/model/trays';
import { maxOverlap } from './solid';
import type { Design, MaterialProfile } from '../src/model/types';

const PLY = { ...MATERIALS[3], clearance: 0 };
const PLY6: MaterialProfile = { ...PLY, id: 'ply-6', nameKey: 'Plywood 6 mm', thickness: 6 };
const CARD = MATERIALS[0];
const CORR = MATERIALS[1];

function box(material = PLY, W = 80, D = 60, H = 40) {
  const d = createDesign(material);
  const base = addRootPanel(d, 0, 0, W, D);
  const k = material.kind === 'plywood' ? 'finger' : 'fold';
  const walls = [0, 1, 2, 3].map((e) => growPanel(d, base, e, { height: H, angle: 90, dir: 'up', kind: k })!.panelId);
  autoConnect(d);
  return { d, base, walls };
}
const grownOf = (d: Design, id: string) => Object.values(d.connections).find((c) => c.grown && c.b.panelId === id)!;

describe('a board in another thickness of plywood', () => {
  it('fingers are as deep as the other board on each side; no overlap; the export check is clean', () => {
    const { d, base, walls } = box();
    const w = walls[0];
    setPanelMaterial(d, [w], PLY6);
    autoConnect(d);
    expect(tOf(d, w)).toBe(6);
    expect(tOf(d, base)).toBe(3);
    const c = grownOf(d, w);
    expect(c.kind).toBe('finger');
    // base side: cut 6 mm deep where the wall's fingers go; the wall: 3 mm deep where the base's go
    const nb = panelNotches(d, d.panels[base])[c.a.edge];
    const nw = panelNotches(d, d.panels[w]).e0;
    expect(Math.max(...nb.map((n) => n.depth))).toBeCloseTo(6, 6);
    expect(Math.max(...nw.map((n) => n.depth))).toBeCloseTo(3, 6);
    expect(Object.values(d.connections).some((x) => x.broken)).toBe(false);
    expect(validate(d)).toEqual([]);
    expect(maxOverlap(d, [-8, -8, -68], [88, 48, 8], 0.45)).toBe(1);
  });

  it('a grown board takes its parent’s material, and the working material does not change it', () => {
    const d = createDesign(PLY);
    const base = addRootPanel(d, 0, 0, 60, 40);
    setPanelMaterial(d, [base], PLY6);
    const w = growPanel(d, base, 0, { height: 30, angle: 90, dir: 'up', kind: 'finger' })!.panelId;
    expect(matOf(d, w).id).toBe('ply-6');
    setMaterial(d, CARD);
    expect(matOf(d, base).id).toBe('ply-6');
    expect(matOf(d, w).id).toBe('ply-6');
    expect(grownOf(d, w).kind).toBe('finger');
    // a board drawn now takes the working material
    const other = addRootPanel(d, 200, 0, 30, 30);
    solve(d);
    expect(matOf(d, other).kind).toBe('card');
  });
});

describe('a card tray with one wall in corrugated', () => {
  it('the fold becomes the wall-to-base kind for the pair, the wall is its own piece, switching back restores the fold', () => {
    const d = createDesign(CARD);
    const base = addRootPanel(d, 0, 0, 80, 60);
    const tray = addTray(d, base, 30)!;
    autoConnect(d);
    const walls = trayWalls(d, tray);
    expect(buildPieces(d)).toHaveLength(1);
    const w = walls[0];
    const changed = setPanelMaterial(d, [w], CORR);
    autoConnect(d);
    const c = grownOf(d, w);
    expect(c.kind).not.toBe('fold');
    expect(c.pref).toBe('fold');
    expect(changed.some((x) => x.id === c.id && x.from === 'fold' && x.to === c.kind)).toBe(true);
    expect(pieceKeyOf(d, w)).toBe(w);
    expect(buildPieces(d)).toHaveLength(2);
    // its corners use joints the pair allows (no fold, the corrugated wall's own choice)
    expect(Object.values(d.connections).every((x) => !x.broken)).toBe(true);
    setPanelMaterial(d, [w], null);
    autoConnect(d);
    expect(grownOf(d, w).kind).toBe('fold');
    expect(buildPieces(d)).toHaveLength(1);
    expect(d.materials).toBeUndefined();
  });
});

describe('packing and files per material', () => {
  it('boards of two materials go on separate sheets, each that material’s size', () => {
    const d = createDesign(PLY);
    const a = addRootPanel(d, 0, 0, 100, 80);
    const b = addRootPanel(d, 200, 0, 100, 80);
    const big: MaterialProfile = { ...CORR, id: 'corr-big', sheetW: 900, sheetH: 700 };
    setPanelMaterial(d, [b], big);
    const pl = pack(d);
    const keyA = pieceCopies(d).find((c) => c.pieceKey === a)!.key, keyB = pieceCopies(d).find((c) => c.pieceKey === b)!.key;
    expect(pl[keyA].mat).toBeUndefined();
    expect(pl[keyB].mat).toBe('corr-big');
    expect(pl[keyA].sheet).toBe(0);
    expect(pl[keyB].sheet).toBe(0);
    const groups = sheetGroups(d, pl);
    expect(groups.map((g) => [g.mat, g.sheets])).toEqual([
      ['ply-3', 1],
      ['corr-big', 1],
    ]);
    const prep = prepareExport(d);
    expect(prep.materials.map((m) => [m.mat, m.sheets.length, m.sheets[0].w, m.sheets[0].h])).toEqual([
      ['ply-3', 1, 600, 400],
      ['corr-big', 1, 900, 700],
    ]);
    expect(prep.materials[1].sheets[0].contours.every((c) => c.ref?.pieceKey?.startsWith(b))).toBe(true);
    expect(materialsInUse(d).map((m) => [m.id, m.count])).toEqual([
      ['ply-3', 1],
      ['corr-big', 1],
    ]);
  });

  it('a design with one material exports exactly as before', () => {
    const { d } = box();
    const before = sheetsToSvg(prepareExport(d).sheets);
    const w = Object.keys(d.panels)[1];
    setPanelMaterial(d, [w], PLY6);
    setPanelMaterial(d, [w], null);
    autoConnect(d);
    expect(sheetsToSvg(prepareExport(d).sheets)).toBe(before);
    expect(d.materials).toBeUndefined();
    expect(Object.values(d.panels).some((p) => 'material' in p)).toBe(false);
  });
});

describe('saving', () => {
  it('save and load keep the overrides; a v7 file loads unchanged', () => {
    const { d, walls } = box();
    setPanelMaterial(d, [walls[1]], PLY6);
    const back = parseProject(serializeProject(d));
    expect(back.panels[walls[1]].material).toBe('ply-6');
    expect(back.materials?.['ply-6'].thickness).toBe(6);
    expect(sheetsToSvg(prepareExport(back).sheets)).toBe(sheetsToSvg(prepareExport(d).sheets));
    const v7 = JSON.parse(JSON.stringify(box().d));
    v7.schemaVersion = 7;
    const m = migrateDesign(v7);
    expect(m.materials).toBeUndefined();
    expect(sheetsToSvg(prepareExport(m).sheets)).toBe(sheetsToSvg(prepareExport(v7 as Design).sheets));
  });
});
