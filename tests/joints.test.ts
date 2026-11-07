import { describe, expect, it } from 'vitest';
import { addDivider, addRootPanel, addSideWalls, connectSeams, createDesign, deletePanel, growPanel, hasSideWalls, leanSupported, movePanel, setConnection, setMaterial, setPanelSize, solve } from '../src/model/ops';
import { MATERIALS, connectionsFor } from '../src/model/materials';
import { findOpenSeams } from '../src/model/seams';
import { panelExtras, panelNotches } from '../src/model/geometry';
import { buildPieces } from '../src/model/pieces';
import { validate } from '../src/model/validate';
import { migrateDesign } from '../src/model/serialize';
import { contourBBox, polygonArea } from '../src/geom/vec';
import { maxOverlap, solidCounter } from './solid';
import type { Design } from '../src/model/types';

const PLY = { ...MATERIALS[3], clearance: 0 };
const CARD = MATERIALS[0];
const CORR = MATERIALS[1];

/** Base on the floor at x 0..W, z -D..0, with four walls. */
function box(material = PLY, W = 80, D = 60, H = 40, kind?: 'finger' | 'fold') {
  const d = createDesign(material);
  const base = addRootPanel(d, 0, 0, W, D);
  const k = kind ?? (material.kind === 'plywood' ? 'finger' : 'fold');
  const walls = [0, 1, 2, 3].map((e) => growPanel(d, base, e, { height: H, angle: 90, dir: 'up', kind: k })!.panelId);
  return { d, base, walls };
}

describe('closing seams and three-panel corners (plywood)', () => {
  it('detects the four wall-to-wall corners and connects them with finger joints', () => {
    const { d, walls } = box();
    const open = findOpenSeams(d);
    expect(open).toHaveLength(4);
    expect(open.every((s) => s.type === 'corner' && s.overlapping)).toBe(true);
    expect(validate(d).filter((i) => i.key === 'val.overlap')).toHaveLength(4);
    for (const w of walls) connectSeams(d, w);
    expect(findOpenSeams(d)).toHaveLength(0);
    expect(Object.values(d.connections).filter((c) => !c.grown && c.kind === 'finger')).toHaveLength(4);
    expect(validate(d)).toEqual([]);
  });

  it('no two panels occupy the same space at a three-panel corner, and the corner is filled', () => {
    const { d, walls } = box();
    for (const w of walls) connectSeams(d, w);
    // corner at x=80, z=0 (front-right), and x=0, z=-60 (back-left)
    expect(maxOverlap(d, [65, 0, -15], [80, 15, 0])).toBe(1);
    expect(maxOverlap(d, [0, 25, -60], [12, 40, -48])).toBe(1);
    const count = solidCounter(d);
    // every point of the corner column and the base corner cube is material
    for (let y = 0.2; y < 40; y += 0.9) {
      expect(count([79, y, -1])).toBe(1);
      expect(count([79.5, y, -2.4])).toBe(1);
    }
  });

  it('joints stay complementary after changes to size, thickness and finger count', () => {
    const { d, base, walls } = box();
    for (const w of walls) connectSeams(d, w);
    setPanelSize(d, base, 100, 70);
    setPanelSize(d, walls[1], undefined, 55);
    setMaterial(d, { ...PLY, thickness: 4 });
    const seam = Object.values(d.connections).find((c) => !c.grown)!;
    setConnection(d, seam.id, { fingers: 9 });
    expect(Object.values(d.connections).every((c) => !c.broken)).toBe(true);
    expect(maxOverlap(d, [85, 0, -15], [100, 25, 0], 0.41)).toBe(1);
    expect(maxOverlap(d, [0, 0, -70], [15, 20, -55], 0.41)).toBe(1);
  });
});

describe('folds and glue flaps (card and corrugated)', () => {
  it('a folded tray is one piece with score lines on the folds', () => {
    const { d } = box(CORR);
    const pieces = buildPieces(d);
    expect(pieces).toHaveLength(1);
    const p = pieces[0];
    expect(p.panels).toHaveLength(5);
    const scores = p.contours.filter((c) => c.op === 'score');
    expect(scores).toHaveLength(4);
    const outer = p.contours.filter((c) => c.role === 'outer');
    expect(outer).toHaveLength(1);
    const bb = contourBBox(outer[0].contour);
    const al = CORR.foldAllowance;
    expect(bb.w).toBeCloseTo(80 + 2 * (40 + al), 6);
    expect(bb.h).toBeCloseTo(60 + 2 * (40 + al), 6);
  });

  it('closes the tray corners with glue flaps: walls are cut back and carry a flap', () => {
    const { d, walls } = box(CARD);
    const open = findOpenSeams(d);
    expect(open).toHaveLength(4);
    for (const w of walls) connectSeams(d, w);
    const glue = Object.values(d.connections).filter((c) => c.kind === 'glue');
    expect(glue).toHaveLength(4);
    const owner = d.panels[glue[0].a.panelId];
    expect(walls.reduce((n, w) => n + panelExtras(d, d.panels[w]).adds.length, 0)).toBe(4);
    expect(panelExtras(d, owner).scores.length).toBe(panelExtras(d, owner).adds.length);
    expect(panelNotches(d, owner)[glue[0].a.edge][0].depth).toBeCloseTo(CARD.thickness, 9);
    // the flaps stay part of the one folded piece
    const pieces = buildPieces(d);
    expect(pieces).toHaveLength(1);
    expect(pieces[0].contours.filter((c) => c.op === 'score')).toHaveLength(8);
    expect(validate(d)).toEqual([]);
  });

  it('folds and glue flaps are offered at angles; slots only at 90°', () => {
    expect(connectionsFor(CARD, 45)).toEqual(['fold', 'glue']);
    expect(connectionsFor(CARD, 90)).toContain('tabslot');
    expect(connectionsFor(PLY, 30)).toEqual(['lean']);
    expect(connectionsFor(PLY, 90)).toEqual(['finger', 'tabslot', 'butt']);
  });

  it('a glue flap on a grown panel folds onto the parent face', () => {
    const d = createDesign(CARD);
    const base = addRootPanel(d, 0, 0, 60, 40);
    const r = growPanel(d, base, 0, { height: 30, angle: 60, dir: 'up', kind: 'glue' })!;
    const c = d.connections[r.connectionId];
    expect(c.broken).toBe(false);
    expect(c.geom!.flaps3d[0].panelId).toBe(base);
    expect(buildPieces(d)).toHaveLength(2);
  });
});

describe('tabs and slots', () => {
  it('a tab-and-slot wall stands in from the edge; its tabs fill the slots exactly', () => {
    const d = createDesign(PLY);
    const base = addRootPanel(d, 0, 0, 100, 60);
    const r = growPanel(d, base, 0, { height: 40, angle: 90, dir: 'up', kind: 'tabslot' })!;
    const c = d.connections[r.connectionId];
    expect(c.offset).toBeGreaterThanOrEqual(3);
    const slots = panelExtras(d, d.panels[base]).holes;
    expect(slots.length).toBeGreaterThanOrEqual(2);
    for (const s of slots) {
      const bb = contourBBox({ closed: true, segs: s.map((a, i) => ({ k: 'L' as const, a, b: s[(i + 1) % s.length] })) });
      expect(bb.h).toBeCloseTo(3, 6); // thickness, clearance 0
      expect(bb.minY).toBeGreaterThanOrEqual(2); // interior slot: web to the edge
    }
    expect(maxOverlap(d, [0, 0, -10], [100, 8, 0], 0.43)).toBe(1);
    // with clearance the slots grow by it once
    setMaterial(d, { ...PLY, clearance: 0.2 });
    const s0 = panelExtras(d, d.panels[base]).holes[0];
    const xs = s0.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(3.2, 6);
  });
});

describe('leaning plywood panels and side walls', () => {
  function stand(withWalls: boolean, wallsFor = 30) {
    const d = createDesign(PLY);
    const base = addRootPanel(d, 0, 0, 100, 80);
    if (withWalls) addSideWalls(d, base, 0, wallsFor, 60);
    const r = growPanel(d, base, 0, { height: 60, angle: 30, dir: 'up', kind: 'lean' })!;
    return { d, base, lean: r.panelId };
  }

  it('without side walls the panel is flagged unsupported', () => {
    const { d, base, lean } = stand(false);
    expect(hasSideWalls(d, base, 0)).toBe(false);
    expect(leanSupported(d, lean)).toBe(false);
    expect(validate(d).map((i) => i.key)).toContain('val.unsupported');
  });

  it('side walls get angled slots that fit the thickness plus clearance', () => {
    const { d, base, lean } = stand(true);
    expect(hasSideWalls(d, base, 0)).toBe(true);
    expect(leanSupported(d, lean)).toBe(true);
    expect(validate(d)).toEqual([]);
    expect(maxOverlap(d, [90, 0, -80], [100, 40, 0], 0.45)).toBe(1);
    // with clearance: slot is (t + c) wide, and runs at 30° to the base
    setMaterial(d, { ...PLY, clearance: 0.2 });
    const wall = Object.values(d.connections).find((c) => !c.grown && c.kind === 'tabslot')!.b.panelId;
    const slot = panelExtras(d, d.panels[wall]).holes[0];
    expect(slot).toHaveLength(4);
    const sides = slot.map((p, i) => {
      const q = slot[(i + 1) % 4];
      return { len: Math.hypot(q.x - p.x, q.y - p.y), ang: (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI };
    });
    const short = Math.min(...sides.map((s) => s.len));
    expect(short).toBeCloseTo(3.2, 6);
    const long = sides.find((s) => s.len > short + 1)!;
    expect(Math.abs(((long.ang % 180) + 180) % 180)).toBeCloseTo(30, 4);
  });

  it('changing the lean angle moves the slots with it', () => {
    const { d, lean } = stand(true, 60); // walls tall enough for steeper angles
    const c = Object.values(d.connections).find((x) => x.grown && x.b.panelId === lean)!;
    setConnection(d, c.id, { angle: 45 });
    expect(leanSupported(d, lean)).toBe(true);
    expect(maxOverlap(d, [90, 0, -80], [100, 60, 0], 0.45)).toBe(1);
  });

  it('deleting a side wall flags the leaning panel as unsupported', () => {
    const { d, lean } = stand(true);
    const wall = Object.values(d.connections).find((c) => !c.grown && c.kind === 'tabslot')!.b.panelId;
    deletePanel(d, wall);
    expect(leanSupported(d, lean)).toBe(false);
    expect(validate(d).map((i) => i.key)).toContain('val.unsupported');
  });
});

describe('dividers and half-laps', () => {
  function organiser(material = PLY) {
    const { d, base, walls } = box(material, 120, 90, 40);
    for (const w of walls) connectSeams(d, w);
    const a = addDivider(d, base, 0, 40, 30)!; // parallel to the front wall
    const b = addDivider(d, base, 3, 60, 30)!; // parallel to the left wall, crossing a
    return { d, base, walls, a, b };
  }

  it('plywood dividers pass through wall and base slots and cross with half-laps', () => {
    const { d, a, b } = organiser();
    const kinds = Object.values(d.connections).filter((c) => c.a.panelId === a || c.b.panelId === a || c.a.panelId === b).map((c) => c.kind);
    expect(kinds.filter((k) => k === 'halflap')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'tabslot').length).toBeGreaterThanOrEqual(4);
    expect(validate(d)).toEqual([]);
    expect(maxOverlap(d, [0, 0, -90], [120, 45, 0], 0.9)).toBe(1);
  });

  it('half-laps and slots follow a divider when it moves', () => {
    const { d, a } = organiser();
    const grown = Object.values(d.connections).find((c) => c.grown && c.b.panelId === a)!;
    const hl = Object.values(d.connections).find((c) => c.kind === 'halflap')!;
    const before = JSON.stringify(hl.geom);
    setConnection(d, grown.id, { offset: 25 });
    expect(JSON.stringify(d.connections[hl.id].geom)).not.toBe(before);
    expect(d.connections[hl.id].broken).toBe(false);
    expect(validate(d)).toEqual([]);
    expect(maxOverlap(d, [0, 0, -90], [120, 45, 0], 0.9)).toBe(1);
  });

  it('corrugated dividers have no wall slots; they slide in with clearance', () => {
    const { d, walls, a } = organiser(CORR);
    for (const w of walls) expect(panelExtras(d, d.panels[w]).holes).toHaveLength(0);
    const ends = Object.values(d.connections).filter((c) => !c.grown && c.a.panelId === a && c.kind !== 'halflap');
    expect(ends.map((c) => c.kind)).toEqual(['slide', 'slide']);
    expect(panelNotches(d, d.panels[a])[1][0].depth).toBeCloseTo(CORR.thickness + CORR.clearance, 9);
  });
});

describe('broken seams', () => {
  it('keeps the last valid joint and flags it when panels stop meeting', () => {
    const d = createDesign(PLY);
    const base = addRootPanel(d, 0, 0, 80, 60);
    const w1 = growPanel(d, base, 0, { height: 40, angle: 90, dir: 'up', kind: 'finger' })!.panelId;
    const other = addRootPanel(d, 200, 0, 50, 50);
    solve(d);
    // join two independent panels: a wall standing on another root panel... simulate by a seam on the existing box
    const w2 = growPanel(d, base, 1, { height: 40, angle: 90, dir: 'up', kind: 'finger' })!.panelId;
    connectSeams(d, w2);
    const seam = Object.values(d.connections).find((c) => !c.grown)!;
    expect(seam.broken).toBe(false);
    const geom = JSON.stringify(seam.geom);
    setPanelSize(d, w1, undefined, 40); // still meets
    // move the box: seam still meets (everything moves together)
    movePanel(d, base, 10, 0);
    expect(d.connections[seam.id].broken).toBe(false);
    // break it: shrink the shared edge to nothing by changing the angle of one wall
    const c2 = Object.values(d.connections).find((c) => c.grown && c.b.panelId === w2)!;
    d.connections[c2.id].kind = 'butt';
    d.connections[c2.id].offset = 10;
    solve(d);
    expect(d.connections[seam.id].broken).toBe(true);
    expect(JSON.stringify(d.connections[seam.id].geom)).toBe(geom);
    expect(validate(d).map((i) => i.key)).toContain('val.broken');
    void other;
  });
});

describe('project migration', () => {
  it('upgrades a version 1 project', () => {
    const v1: any = createDesign(PLY);
    v1.schemaVersion = 1;
    const base = addRootPanel(v1, 0, 0, 50, 50);
    v1.connections.c1 = { id: 'c1', kind: 'finger', a: { panelId: base, edge: 0 }, b: { panelId: base, edge: 0 }, angle: 90, dir: 'up', fingers: null };
    const d: Design = migrateDesign(v1);
    expect(d.schemaVersion).toBe(2);
    expect(d.connections.c1).toMatchObject({ grown: true, offset: 0, tabs: null, flap: null });
  });
});

void polygonArea;
