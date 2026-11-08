// Milestone 14: fold-over (double-wall) reinforcement.
import { describe, expect, it } from 'vitest';
import { addDetail, addFoldOver, addRootPanel, addTray, autoConnect, canFoldOver, createDesign, solve, updateFoldOver } from '../src/model/ops';
import { allFoldOvers, foldOverDims } from '../src/model/foldover';
import { trayWalls } from '../src/model/trays';
import { buildPieces } from '../src/model/pieces';
import { panelExtras } from '../src/model/geometry';
import { validate } from '../src/model/validate';
import { MATERIALS, minWeb } from '../src/model/materials';
import { findEdge, segInward } from '../src/model/edges';
import { toWorld } from '../src/model/frame';
import type { Design } from '../src/model/types';

const [CARD, CORR16, CORR4, PLY] = MATERIALS;

function tray(m = CORR16, H = 60) {
  const d = createDesign(m);
  const base = addRootPanel(d, 0, 0, 150, 100);
  const id = addTray(d, base, H)!;
  autoConnect(d);
  const walls = trayWalls(d, id);
  for (const w of walls) addFoldOver(d, w);
  autoConnect(d);
  return { d, base, walls };
}

describe('fold-over on a corr-1.6 tray', () => {
  it('is offered on card and corrugated free edges only, with lock tabs by default on corrugated', () => {
    const { d, walls } = tray();
    expect(walls.every((w) => d.panels[w].foldOvers?.[0].lock === 'tabs')).toBe(true);
    expect(canFoldOver(d, walls[0], 'e2')).toBe(false); // already has one
    expect(canFoldOver(d, walls[0], 'e0')).toBe(false); // the attached edge
    const ply = createDesign(PLY);
    const b = addRootPanel(ply, 0, 0, 100, 80);
    const t = addTray(ply, b, 40)!;
    expect(canFoldOver(ply, trayWalls(ply, t)[0], 'e2')).toBe(false);
    const card = createDesign(CARD);
    const cb = addRootPanel(card, 0, 0, 100, 80);
    const ct = addTray(card, cb, 40)!;
    addFoldOver(card, trayWalls(card, ct)[0]);
    expect(card.panels[trayWalls(card, ct)[0]].foldOvers![0].lock).toBe('glue');
  });

  it('makes one net with all walls, rims, liners and lock tabs; the export check is clean', () => {
    const { d, walls } = tray();
    expect(buildPieces(d)).toHaveLength(1);
    // only the advice that the default clearance is tight for fold-over tabs (c < 0.75t)
    expect(validate(d).filter((i) => i.key !== 'val.foldClearance')).toEqual([]);
    expect(validate(d).filter((i) => i.key === 'val.foldClearance')).toHaveLength(4);
    // rim strip 2t + fa with a score at each edge, liner h − t, a score at each tab root
    const t = CORR16.thickness;
    for (const w of walls) {
      const f = d.panels[w].foldOvers![0];
      const dims = foldOverDims(d, d.panels[w], f);
      expect(dims.rim).toBeCloseTo(2 * t + CORR16.foldAllowance, 9);
      expect(dims.liner).toBeCloseTo(d.panels[w].h - t, 9);
      expect(dims.lockDepth).toBeCloseTo(t + 4, 9);
      const fo = allFoldOvers(d).find((x) => x.panelId === w)!;
      expect(fo.g.scores).toHaveLength(2 + fo.g.tabs.length);
      expect(fo.g.tabs.length).toBe(2);
    }
  });

  it('liners do not collide at the inside corners (shortened 2t where both walls fold over)', () => {
    const { d } = tray();
    const t = CORR16.thickness;
    for (const fo of allFoldOvers(d)) {
      const L = d.panels[fo.panelId].w;
      expect(fo.g.liner.x0).toBeCloseTo(2 * t, 9);
      expect(L - fo.g.liner.x1).toBeCloseTo(2 * t, 9);
    }
    expect(validate(d).filter((i) => i.key === 'val.linerCollide')).toEqual([]);
    // without the shortening they would: a wall whose neighbours have no fold-over gives way by t only
    const one = createDesign(CORR16);
    const b = addRootPanel(one, 0, 0, 150, 100);
    const tr = addTray(one, b, 60)!;
    autoConnect(one);
    addFoldOver(one, trayWalls(one, tr)[0]);
    const fo = allFoldOvers(one)[0];
    expect(fo.g.liner.x0).toBeCloseTo(t, 9);
  });

  it('lock slots keep at least the minimum web to the base edge', () => {
    const { d, base, walls } = tray();
    const B = d.panels[base];
    for (const w of walls) {
      const c = Object.values(d.connections).find((x) => x.grown && x.b.panelId === w)!;
      const e = findEdge(B, c.a.edge)!;
      const bi = segInward(e);
      const fo = allFoldOvers(d).find((x) => x.panelId === w)!;
      const slots = fo.g.holes.filter((h) => h.panelId === base);
      expect(slots).toHaveLength(2);
      for (const s of slots) {
        const web = Math.min(...s.poly.map((q) => (q.x - e.a.x) * bi.x + (q.y - e.a.y) * bi.y));
        expect(web).toBeGreaterThanOrEqual(minWeb(CORR16) - 1e-9);
      }
    }
    expect(panelExtras(d, B).holes.length).toBeGreaterThanOrEqual(8);
  });

  it('a handle hole cut through a reinforced wall also cuts the liner, aligned', () => {
    const { d, walls } = tray();
    const w = walls[0];
    const W = d.panels[w];
    addDetail(d, w, 'roundrect', 'cut', 75, 40, 40, 12);
    solve(d);
    const fo = allFoldOvers(d).find((x) => x.panelId === w)!;
    expect(fo.g.linerHoles).toHaveLength(1);
    // folded back onto the wall, the liner hole lands on the wall hole: the same world box
    const t = CORR16.thickness;
    const { rim } = foldOverDims(d, W, W.foldOvers![0]);
    const xs = fo.g.linerHoles[0].map((q) => q.x), ys = fo.g.linerHoles[0].map((q) => q.y);
    expect(Math.min(...xs)).toBeCloseTo(55, 1);
    expect(Math.max(...xs)).toBeCloseTo(95, 1);
    // outward distance o = rim + q − t, with q = h − y inward from the top edge
    const h = W.h;
    const yWall = (o: number) => h - (o - rim + t);
    expect(yWall(Math.max(...ys) - h)).toBeCloseTo(34, 1);
    expect(yWall(Math.min(...ys) - h)).toBeCloseTo(46, 1);
    expect(buildPieces(d)).toHaveLength(1);
    expect(toWorld).toBeTruthy();
  });
});

describe('fold-over validation', () => {
  it('flags a low wall, a deep hem, lock tabs on a hem, and flute direction on 4 mm board', () => {
    const d = createDesign(CORR4);
    const b = addRootPanel(d, 0, 0, 150, 100);
    const tr = addTray(d, b, 10)!; // walls 6 mm tall: not taller than 2t
    const w = trayWalls(d, tr)[0];
    addFoldOver(d, w);
    expect(validate(d).some((i) => i.key === 'val.foldShort')).toBe(true);
    const d2 = tray().d;
    const w2 = Object.keys(d2.panels).find((k) => d2.panels[k].foldOvers)!;
    const f = d2.panels[w2].foldOvers![0];
    updateFoldOver(d2, w2, f.id, { depth: 40 });
    const keys = validate(d2).map((i) => i.key);
    expect(keys).toContain('val.hemDeep');
    expect(keys).toContain('val.lockHem');
    // 4 mm board: some fold scores run across the flutes whatever the packing (walls on all four sides)
    const d4 = tray(CORR4, 50).d;
    expect(validate(d4).some((i) => i.key === 'val.flute')).toBe(true);
  });
});

export type { Design };
