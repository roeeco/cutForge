// Milestone 10: extrude a base into a tray.
import { describe, expect, it } from 'vitest';
import { addDetail, addPolygonPanel, addRootPanel, addTray, autoConnect, createDesign, deletePanel, insertVertex, regularPolygon, setCustomHeight, setPanelSize, setTrayHeight, solve, wallIt } from '../src/model/ops';
import { shortEdges, trayWalls } from '../src/model/trays';
import { panelEdges } from '../src/model/edges';
import { buildPieces } from '../src/model/pieces';
import { validate } from '../src/model/validate';
import { MATERIALS } from '../src/model/materials';
import { maxOverlap } from './solid';
import type { Design } from '../src/model/types';

const [CARD, CORR16, CORR4, PLY] = MATERIALS;
const corners = (d: Design, tray: string) => Object.values(d.connections).filter((c) => !c.grown && c.trayId === tray);

describe('extrude', () => {
  it('a card hexagon tray: six walls folded from the base, glue-flap corners, one net', () => {
    const d = createDesign(CARD);
    const base = addPolygonPanel(d, 0, 0, regularPolygon(6, 60))!;
    const tray = addTray(d, base, 40)!;
    autoConnect(d);
    const walls = trayWalls(d, tray);
    expect(walls).toHaveLength(6);
    expect(walls).toEqual(['e0', 'e1', 'e2', 'e3', 'e4', 'e5'].map((k) => `${tray}/${k}`));
    for (const w of walls) expect(d.panels[w].h).toBeCloseTo(40 - CARD.thickness, 9);
    expect(Object.values(d.connections).filter((c) => c.grown).every((c) => c.kind === 'fold')).toBe(true);
    expect(corners(d, tray).map((c) => c.kind)).toEqual(Array(6).fill('glue'));
    expect(buildPieces(d)).toHaveLength(1);
    expect(validate(d)).toEqual([]);
  });

  it('corrugated corners are tab-and-slot, plywood corners fingers', () => {
    for (const [m, wall, corner] of [[CORR4, 'fold', 'tabslot'], [CORR16, 'fold', 'tabslot'], [PLY, 'finger', 'finger']] as const) {
      const d = createDesign(m);
      const base = addPolygonPanel(d, 0, 0, regularPolygon(6, 60))!;
      const tray = addTray(d, base, 45)!;
      autoConnect(d);
      expect(Object.values(d.connections).filter((c) => c.grown).every((c) => c.kind === wall)).toBe(true);
      expect(corners(d, tray).map((c) => c.kind)).toEqual(Array(6).fill(corner));
      expect(validate(d)).toEqual([]);
      expect(maxOverlap(d, [-62, 0, -106], [62, 48, 2], 0.9)).toBe(1);
    }
  });

  it('push-pull on one wall changes them all; a wall can keep its own height', () => {
    const d = createDesign(PLY);
    const base = addRootPanel(d, 0, 0, 120, 80);
    const tray = addTray(d, base, 40)!;
    const walls = trayWalls(d, tray);
    setPanelSize(d, walls[1], undefined, 55);
    expect(d.trays[tray].height).toBe(55);
    for (const w of walls) expect(d.panels[w].h).toBe(55);
    setCustomHeight(d, walls[2], true);
    setPanelSize(d, walls[2], undefined, 30);
    expect(d.panels[walls[2]].h).toBe(30);
    expect(d.trays[tray].height).toBe(55);
    setTrayHeight(d, tray, 60);
    expect(d.panels[walls[0]].h).toBe(60);
    expect(d.panels[walls[2]].h).toBe(30);
    setCustomHeight(d, walls[2], false);
    expect(d.panels[walls[2]].h).toBe(60);
  });

  it('deleting a wall opens its edge; Wall it closes it again', () => {
    const d = createDesign(CARD);
    const base = addRootPanel(d, 0, 0, 120, 80);
    const tray = addTray(d, base, 40)!;
    deletePanel(d, `${tray}/e2`);
    autoConnect(d);
    expect(d.trays[tray].openEdges).toEqual(['e2']);
    expect(trayWalls(d, tray)).toHaveLength(3);
    wallIt(d, tray, 'e2');
    autoConnect(d);
    expect(d.trays[tray].openEdges).toEqual([]);
    expect(trayWalls(d, tray)).toHaveLength(4);
    expect(buildPieces(d)).toHaveLength(1);
  });
});

describe('trays follow their base', () => {
  it('L-notch: walls shorten, two new walls appear, and the inside corner is joined', () => {
    const d = createDesign(PLY);
    const base = addRootPanel(d, 0, 0, 120, 80);
    const tray = addTray(d, base, 40)!;
    autoConnect(d);
    const n = addDetail(d, base, 'rect', 'cut', 120, 80, 60, 40)!; // removes x 90–120, y 60–80
    solve(d);
    autoConnect(d);
    const walls = trayWalls(d, tray);
    expect(walls).toHaveLength(6);
    const shapeWalls = walls.filter((w) => w.includes(`/${n}.`));
    expect(shapeWalls).toHaveLength(2);
    expect(d.panels[`${tray}/e1`].w).toBeCloseTo(60, 6);
    expect(d.panels[`${tray}/e2`].w).toBeCloseTo(90, 6);
    // the inside corner: the two new walls are joined, one reaches across the corner gap
    const inner = Object.values(d.connections).find((c) => !c.grown && shapeWalls.includes(c.a.panelId) && shapeWalls.includes(c.b.panelId));
    expect(inner).toBeTruthy();
    expect(inner!.broken).toBe(false);
    expect(shapeWalls.some((w) => (d.panels[w].ext?.s ?? 0) > 0)).toBe(true);
    expect(maxOverlap(d, [0, 0, -82], [122, 44, 2], 0.5)).toBe(1);
    expect(validate(d)).toEqual([]);
  });

  it('inserting a vertex on the base splits a tray wall', () => {
    const d = createDesign(CARD);
    const base = addPolygonPanel(d, 0, 0, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }])!;
    const tray = addTray(d, base, 30)!;
    insertVertex(d, base, 0);
    autoConnect(d);
    expect(trayWalls(d, tray)).toHaveLength(5);
    expect(buildPieces(d)).toHaveLength(1);
  });

  it('edges shorter than 5 mm stay open and are counted', () => {
    const d = createDesign(CARD);
    const base = addPolygonPanel(d, 0, 0, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 3, y: 60 }, { x: 0, y: 57 }])!;
    const tray = addTray(d, base, 30)!;
    expect(shortEdges(d, d.trays[tray])).toEqual(['e3']);
    expect(trayWalls(d, tray)).toHaveLength(4);
    expect(panelEdges(d.panels[base])).toHaveLength(5);
  });
});
