// The fold overhaul of 19 November: the owner's report, each part reproduced.
//  1. Dividers came out about two thicknesses short of the folded box.
//  2. A folded net left a thickness of gap at the side walls; corners were not flush.
//  3. The engine kept edges exposed (walls reaching past their neighbours) instead of butting one board's edge under the other.
//  4. A card lid's rims folded inwards like the box's walls, so the lid came out mirrored and did not fit a box that is not symmetric.
import { describe, expect, it } from 'vitest';
import { addRootPanel, addTray, autoConnect, createDesign, setConnection, solve } from '../src/model/ops';
import { boxRecipe, dividerLine } from '../src/easy/recipes';
import { MATERIALS } from '../src/model/materials';
import { buildPieces, creaseOf, faceOf } from '../src/model/pieces';
import { creaseDepths } from '../src/model/crease';
import { flattenContour, IDENTITY } from '../src/geom/vec';
import { migrateDesign } from '../src/model/serialize';
import { solidCounter } from './solid';
import type { Design, P2 } from '../src/model/types';

const [CARD, CORR16, CORR4, PLY] = MATERIALS;
const FOLDING = [CARD, CORR16, CORR4];

function tray(m: (typeof MATERIALS)[number], W = 160, D = 110, H = 50) {
  const d = createDesign(m);
  const b = addRootPanel(d, 0, 0, W, D);
  solve(d);
  const t = addTray(d, b, H)!;
  autoConnect(d);
  return { d, b, t };
}

const scoresOf = (d: Design, panelId?: string) =>
  buildPieces(d)
    .flatMap((p) => p.contours)
    .filter((c) => c.op === 'score' && (!panelId || c.ref?.panelId === panelId))
    .map((c) => flattenContour(c.contour));
const outerOf = (d: Design, key: string) => flattenContour(buildPieces(d).find((p) => p.key === key)!.contours.find((c) => c.role === 'outer')!.contour);

describe('a crease folds in the middle of its corner', () => {
  for (const m of FOLDING)
    it(`${m.id}: the base folds up between scores one thickness inside its outer size (inside + t), the walls H − t/2 past them`, () => {
      const { d, b } = tray(m);
      const t = m.thickness;
      // the base's own scores: two along x (front, back), two along y (sides)
      const s = scoresOf(d).filter((q) => q.length === 2);
      const horiz = s.filter((q) => Math.abs(q[0].y - q[1].y) < 1e-9 && q[0].y > -1 && q[0].y < 111).map((q) => q[0].y).sort((a, z) => a - z);
      const vert = s.filter((q) => Math.abs(q[0].x - q[1].x) < 1e-9 && q[0].x > -1 && q[0].x < 161).map((q) => q[0].x).sort((a, z) => a - z);
      expect(horiz[0]).toBeCloseTo(t / 2, 6);
      expect(horiz[horiz.length - 1]).toBeCloseTo(110 - t / 2, 6);
      expect(vert[0]).toBeCloseTo(t / 2, 6);
      expect(vert[vert.length - 1]).toBeCloseTo(160 - t / 2, 6);
      // the net: no strip outside the base, the front wall's top H − t/2 beyond its score
      const out = outerOf(d, b);
      expect(Math.min(...out.map((q) => q.y))).toBeCloseTo(-(50 - t), 6);
      expect(t / 2 + (50 - t)).toBeCloseTo(50 - t / 2, 9);
    });

  it('the crease lies where the two mid-planes meet, at any angle', () => {
    const d = createDesign(CORR4);
    const b = addRootPanel(d, 0, 0, 100, 80);
    solve(d);
    const tr = addTray(d, b, 40)!;
    autoConnect(d);
    const w = Object.values(d.connections).find((c) => c.grown && c.trayId === tr)!;
    const k = creaseDepths(d, d.panels[b], w.a.edge, d.panels[w.b.panelId], w.b.edge)!;
    expect(k.sP).toBeCloseTo(2, 9);
    expect(k.sC).toBeCloseTo(-2, 9);
  });

  it('a fold allowance is only extra length: a strip that wide, the score in its middle', () => {
    const d = createDesign({ ...CARD, id: 'my-card', foldAllowance: 0.4 });
    const b = addRootPanel(d, 0, 0, 100, 80);
    solve(d);
    addTray(d, b, 40);
    autoConnect(d);
    expect(Math.min(...outerOf(d, b).map((q) => q.y))).toBeCloseTo(-(0.4 + 39.5), 6);
    const front = scoresOf(d).filter((q) => Math.abs(q[0].y - q[1].y) < 1e-9 && q[0].y < 1 && q[0].y > -1).map((q) => q[0].y);
    expect(front).toContain(0.25 - 0.2);
  });
});

describe('dividers fit the folded box', () => {
  for (const m of FOLDING)
    it(`${m.id}: a divider's body is as long as the folded box is inside`, () => {
      const { d, b } = tray(m);
      const r = dividerLine(d, b, { x: 80, y: 20 }, { x: 80, y: 90 }, 40)!;
      solve(d);
      autoConnect(d);
      const t = m.thickness;
      // inside of the folded box along y: score to score less one thickness (each wall's half on either side)
      const vs = scoresOf(d).filter((q) => Math.abs(q[0].y - q[1].y) < 1e-9 && Math.abs(q[1].x - q[0].x) > 100).map((q) => q[0].y);
      const inside = Math.max(...vs.filter((y) => y < 111)) - Math.min(...vs.filter((y) => y > -1)) - t;
      // the divider's body: its outline where no tab reaches (its top edge)
      const div = outerOf(d, r.id);
      const top = Math.max(...div.map((q) => q.y));
      const xs = div.filter((q) => Math.abs(q.y - top) < 1e-9).map((q) => q.x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(inside, 6);
      expect(inside).toBeCloseTo(110 - 2 * t, 6);
    });
});

describe('corners are flush, one board butting under the other', () => {
  for (const m of [...FOLDING, PLY])
    it(`${m.id}: no wall reaches past the base's outline`, () => {
      const { d } = tray(m);
      const cnt = solidCounter(d);
      const t = m.thickness;
      // a ring just outside the 160 × 110 outline, at mid-height of the walls
      for (const y of [10, 25, 45])
        for (let s = -3; s <= 163; s += 0.5) {
          expect(cnt([s, y, 0.05 + t * 0.01])).toBe(0);
          expect(cnt([s, y, -110.05])).toBe(0);
        }
      for (const y of [10, 25, 45])
        for (let s = -113; s <= 3; s += 0.5) {
          expect(cnt([-0.05, y, s])).toBe(0);
          expect(cnt([160.05, y, s])).toBe(0);
        }
    });

  for (const m of FOLDING)
    it(`${m.id}: the net's side walls start on the base's edge line (no jogs at the base's corners)`, () => {
      const { d, b } = tray(m);
      const out = outerOf(d, b);
      // the base's front edge runs on into the side wall's front edge as one straight cut: a segment on
      // y = 0 from the front wall's end (inside the corner) past the corner, nothing above that line there
      const segs = out.map((q, i) => [q, out[(i + 1) % out.length]] as const);
      const run = segs.filter(([a, z]) => Math.abs(a.y) < 1e-6 && Math.abs(z.y) < 1e-6 && Math.min(a.x, z.x) < 160 - 1e-6 && Math.max(a.x, z.x) > 160 + 1e-6);
      expect(run).toHaveLength(1);
      expect(out.some((q) => q.x > 150 && q.x < 160 + 1e-6 && q.y > 1e-6 && q.y < 6)).toBe(false);
    });

  it('corrugated tab-and-slot corners: the slots are open notches at the receiver\'s end, no web past the corner', () => {
    const { d } = tray(CORR4);
    const corners = Object.values(d.connections).filter((c) => !c.grown && c.kind === 'tabslot' && c.trayId);
    expect(corners).toHaveLength(4);
    for (const c of corners) {
      expect(c.geom!.holes).toHaveLength(0);
      expect(c.geom!.edges.some((e) => e.notches.every((n) => n.depth >= 0))).toBe(true);
      for (const e of c.geom!.edges) for (const n of e.notches) expect(n.depth).toBeGreaterThan(-1e-9);
    }
  });
});

describe('a glue flap folds about the middle of its corner too', () => {
  it('card: the flap\'s score is half a thickness inside the wall\'s end', () => {
    const { d } = tray(CARD);
    const glue = Object.values(d.connections).find((c) => c.kind === 'glue' && !c.grown)!;
    const s = glue.geom!.scores[0];
    const owner = d.panels[s.panelId];
    // the owner's end (cut back to the other wall's inner face) is at t, or w − t, from its side
    const x = s.a.x;
    expect(Math.min(Math.abs(x - 1.5 * CARD.thickness), Math.abs(owner.w - 1.5 * CARD.thickness - x))).toBeCloseTo(0, 9);
    expect(s.toward).toBe(1);
  });
});

describe('a lid folds its rims the other way: perforated, not mirrored', () => {
  const pentagon = { kind: 'regular' as const, x0: 0, z0: 0, x1: 120, z1: 120, sides: 5 };
  for (const m of FOLDING)
    it(`${m.id}: the box's folds are scored, the lid's are perforated`, () => {
      const d = createDesign(m);
      boxRecipe(d, pentagon, 50, 'lid');
      solve(d);
      autoConnect(d);
      const lidTray = Object.values(d.trays).find((x) => x.lidOf)!;
      const pieces = buildPieces(d);
      const lid = pieces.find((p) => p.panels.some((q) => q.panelId === lidTray.baseId))!;
      const box = pieces.find((p) => p.panels.some((q) => q.panelId === d.trays[lidTray.lidOf!].baseId))!;
      expect(lid.contours.filter((c) => c.op === 'score')).toHaveLength(0);
      expect(lid.contours.filter((c) => c.op === 'cut' && c.role === 'line').length).toBeGreaterThan(10);
      expect(box.contours.filter((c) => c.op === 'score').length).toBeGreaterThan(0);
      expect(box.contours.filter((c) => c.op === 'cut' && c.role === 'line')).toHaveLength(0);
      // the lid's board lies with its material on the sheet's other face
      expect(faceOf(d, lidTray.baseId, IDENTITY)).toBe(-1);
      expect(faceOf(d, d.trays[lidTray.lidOf!].baseId, IDENTITY)).toBe(1);
    });

  it('the lid\'s outline is the box base\'s, grown, the same way round (it fits once its rims fold outwards)', () => {
    const d = createDesign(CARD);
    const r = boxRecipe(d, { kind: 'regular', x0: 0, z0: 0, x1: 120, z1: 120, sides: 5 }, 50, 'lid')!;
    solve(d);
    const lid = d.panels[Object.values(d.trays).find((x) => x.lidOf)!.baseId];
    const B = d.panels[r.baseId];
    const pb = B.sketch.kind === 'poly' ? B.sketch.pts : [], pl = lid.sketch.kind === 'poly' ? lid.sketch.pts : [];
    // the same turn at every corner: the lid's outline is not mirrored
    const turns = (ps: P2[]) => ps.map((q, i) => {
      const a = ps[(i + ps.length - 1) % ps.length], c = ps[(i + 1) % ps.length];
      return Math.sign((q.x - a.x) * (c.y - q.y) - (q.y - a.y) * (c.x - q.x));
    });
    expect(turns(pl)).toEqual(turns(pb));
    const edges = (ps: P2[]) => ps.map((q, i) => Math.hypot(ps[(i + 1) % ps.length].x - q.x, ps[(i + 1) % ps.length].y - q.y));
    const eb = edges(pb), el = edges(pl);
    // grown by the same gap all round: the edges keep their order (a mirror would reverse it)
    const k = el.map((x, i) => x - eb[i]);
    for (const x of k) expect(x).toBeCloseTo(k[0], 6);
  });

  it('the student can still ask for a score (or anything else) on a lid\'s fold', () => {
    const d = createDesign(CARD);
    boxRecipe(d, { kind: 'rect', x0: 0, z0: 0, x1: 120, z1: 80 }, 40, 'lid');
    solve(d);
    autoConnect(d);
    const lidTray = Object.values(d.trays).find((x) => x.lidOf)!;
    const fold = Object.values(d.connections).find((c) => c.grown && c.trayId === lidTray.id)!;
    expect(creaseOf(d, fold, IDENTITY)).toBe('perf');
    setConnection(d, fold.id, { crease: 'score' });
    expect(creaseOf(d, d.connections[fold.id], IDENTITY)).toBe(null);
    setConnection(d, fold.id, { crease: 'cutcrease' });
    expect(creaseOf(d, d.connections[fold.id], IDENTITY)).toBe('cutcrease');
    setConnection(d, fold.id, { crease: undefined });
    expect(creaseOf(d, d.connections[fold.id], IDENTITY)).toBe('perf');
  });
});

describe('older files', () => {
  it('a built-in material takes its new fold allowance; a custom one keeps what it had beyond one thickness', () => {
    const d = createDesign(CARD);
    const b = addRootPanel(d, 0, 0, 100, 80);
    solve(d);
    addTray(d, b, 40);
    const raw = JSON.parse(JSON.stringify(d));
    raw.schemaVersion = 10;
    raw.material.foldAllowance = 0.6;
    expect(migrateDesign(raw).material.foldAllowance).toBe(0);
    raw.material = { ...CORR4, id: 'mine', nameKey: 'Mine', foldAllowance: 5.5 };
    expect(migrateDesign(raw).material.foldAllowance).toBe(1.5);
  });
});
