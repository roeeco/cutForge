// Milestone 46 (CURVED_WALLS.md §3.1, §3.2, §3.4, §4.3, §6.2): walls bent along curve runs.
import { describe, expect, it } from 'vitest';
import { addDividerLine, addFoldOver, addLid, setRoundShape, addRoundedRect, addRoundPanel, addTray, autoConnect, canFoldOver, createDesign, deleteConnection, growPanel, setTrayKinds, setCornerRadius, solve } from '../src/model/ops';
import { fixIssue } from '../src/easy/fix';
import { boxRecipe, reachR } from '../src/easy/recipes';
import { rng } from './fuzz/gen';
import { curveRuns, findRun, panelEdges } from '../src/model/edges';
import { MATERIALS, bendOf } from '../src/model/materials';
import { facetsOf, inlineId, panelToLocal, panelToWorld, runPoint, unbendPanel } from '../src/model/bent';
import { FACE } from '../src/model/edges';
import { validate } from '../src/model/validate';
import { parseProject, serializeProject } from '../src/model/serialize';
import { prepareExport } from '../src/export/prepare';
import { sheetsToSvg } from '../src/export/svg';
import { panelExtras, panelOutline, panelNotches } from '../src/model/geometry';
import { pointInPolygon } from '../src/geom/vec';
import { v3len, v3sub } from '../src/geom/v3';
import type { Design } from '../src/model/types';

const [CARD, CORR16, , PLY] = MATERIALS;

const wallsOf = (d: Design, baseId: string) => Object.values(d.connections).filter((c) => c.grown && c.a.panelId === baseId);
const bentOf = (d: Design, baseId: string) => wallsOf(d, baseId).filter((c) => d.panels[c.b.panelId].bent);
const blocking = (d: Design) => validate(d).filter((i) => !['val.split', 'val.bevel'].includes(i.key));

describe('curve runs', () => {
  it('a rounded rectangle has four open runs, each tangent to its straight neighbours; a circle one closed run starting at the back left', () => {
    const d = createDesign(PLY);
    const rr = addRoundedRect(d, 0, 0, 100, 60, 15)!;
    const runs = curveRuns(d.panels[rr]);
    expect(runs.map((r) => r.key).sort()).toEqual(['e0^~', 'e1^~', 'e2^~', 'e3^~']);
    for (const r of runs) {
      expect(r.closed).toBe(false);
      expect(r.tanStart && r.tanEnd).toBe(true);
      expect(r.length).toBeCloseTo((Math.PI / 2) * 15, 1);
      expect(r.minR).toBeCloseTo(15, 6);
    }
    expect(findRun(d.panels[rr], 'e1^~')).toMatchObject({ prev: 'e0', next: 'e1' });
    const c = addRoundPanel(d, 300, 0, 80, 80, { shape: 'circle' })!;
    const [run] = curveRuns(d.panels[c]);
    expect(run.closed).toBe(true);
    expect(run.key).toBe('e0^~');
    // the back left of the circle (135°), where no divider on the box's grid meets it
    expect(run.segs[0].a.x).toBeCloseTo(40 - 40 / Math.SQRT2, 9);
    expect(run.segs[0].a.y).toBeCloseTo(40 + 40 / Math.SQRT2, 9);
  });

  it('a stadium has two runs of half a turn each', () => {
    const d = createDesign(PLY);
    const s = addRoundPanel(d, 0, 0, 120, 60, { shape: 'stadium' })!;
    const runs = curveRuns(d.panels[s]);
    expect(runs).toHaveLength(2);
    for (const r of runs) expect(r.length).toBeCloseTo(Math.PI * 30, 1);
  });
});

describe('a round box', () => {
  it('corrugated 1.6, R 40: one closed wall of length 2π(R − t + k·t) at its outer face, tabs and slots matching, the export check clean', () => {
    const d = createDesign(CORR16);
    const base = addRoundPanel(d, 0, 0, 80, 80, { shape: 'circle' })!;
    addTray(d, base, 50);
    autoConnect(d);
    const [c] = bentOf(d, base);
    expect(wallsOf(d, base)).toHaveLength(1);
    expect(c.kind).toBe('tabslot');
    const W = d.panels[c.b.panelId];
    const t = CORR16.thickness, k = bendOf(CORR16).k;
    // the wall stands a web in (its slots need material outside them): its outer face is at R − offset
    const R = 40 - c.offset;
    expect(W.w).toBeCloseTo(2 * Math.PI * (R - t + k * t), 2);
    expect(W.bent?.closed).toBe(true);
    // its outer face lies on the circle R all round (each facet's ends)
    const ctr = d.panels[base].frame.o;
    for (const f of facetsOf(W)) {
      const p = panelToWorld(W, f.s0, 0, 0);
      expect(Math.hypot(p[0] - (ctr[0] + 40), p[2] - (ctr[2] - 40))).toBeCloseTo(R, 6);
    }
    // tabs: as many as slots, each slot as long as its tab along the curve plus the clearance
    const tabs = c.geom!.edges.find((e) => e.panelId === W.id)!.notches;
    expect(tabs.length).toBeGreaterThan(2);
    expect(c.geom!.holes).toHaveLength(tabs.length);
    const outline = panelOutline(d.panels[base], panelNotches(d, d.panels[base]));
    for (const h of c.geom!.holes) expect(h.poly.every((q) => pointInPolygon(q, outline))).toBe(true);
    for (const n of tabs) expect(n.depth).toBeCloseTo(-d.material.thickness, 9);
    // the closing seam: a glue flap past the strip's end
    expect(c.geom!.adds.filter((a) => a.panelId === W.id)).toHaveLength(1);
    expect(blocking(d)).toEqual([]);
    expect(() => sheetsToSvg(prepareExport(d).sheets)).not.toThrow();
  });

  it('a card circle has glue teeth folded onto the base, tapered round the curve; plywood wraps round its base (cut back under the wall)', () => {
    const d = createDesign(CARD);
    const base = addRoundPanel(d, 0, 0, 80, 80, { shape: 'circle' })!;
    addTray(d, base, 40);
    autoConnect(d);
    const [c] = bentOf(d, base);
    expect(c.kind).toBe('teeth');
    const teeth = c.geom!.adds.filter((a) => a.panelId === c.b.panelId && a.poly.some((q) => q.y < 0));
    expect(teeth.length).toBeGreaterThan(5);
    // a tooth's tip is narrower than its root
    for (const tth of teeth) {
      const root = Math.abs(tth.poly[1].x - tth.poly[0].x), tip = Math.abs(tth.poly[2].x - tth.poly[3].x);
      expect(tip).toBeLessThan(root);
    }
    expect(c.geom!.flaps3d.filter((f) => f.panelId === base)).toHaveLength(teeth.length);

    const p = createDesign(PLY);
    const pb = addRoundPanel(p, 0, 0, 160, 160, { shape: 'circle' })!;
    addTray(p, pb, 40);
    autoConnect(p);
    const [pc] = bentOf(p, pb);
    expect(pc.kind).toBe('wrap');
    // the wall is full height, standing on nothing: the base sits inside it
    expect(p.panels[pc.b.panelId].h).toBe(40);
    expect(panelExtras(p, p.panels[pb]).cuts.length).toBeGreaterThan(0);
    // its length at the neutral line, half way through
    expect(p.panels[pc.b.panelId].w).toBeCloseTo(2 * Math.PI * (80 - 1.5), 2);
    // a plywood strip edge to edge: no closing flap
    expect(pc.geom!.adds).toHaveLength(0);
  });

  it('save and load: the bend is derived, not saved, and comes back the same', () => {
    const d = createDesign(CORR16);
    const base = addRoundPanel(d, 0, 0, 80, 80, { shape: 'circle' })!;
    addTray(d, base, 50);
    autoConnect(d);
    const text = serializeProject(d);
    expect(text).not.toContain('"facets"');
    const back = parseProject(text);
    const [c] = bentOf(back, base);
    const W = back.panels[c.b.panelId], W0 = d.panels[c.b.panelId];
    expect(W.w).toBeCloseTo(W0.w, 9);
    expect(W.bent?.facets.length).toBe(W0.bent?.facets.length);
    expect(sheetsToSvg(prepareExport(back).sheets)).toBe(sheetsToSvg(prepareExport(d).sheets));
  });

  it('panelToLocal undoes panelToWorld on a bent wall', () => {
    const d = createDesign(CORR16);
    const base = addRoundPanel(d, 0, 0, 80, 80, { shape: 'circle' })!;
    addTray(d, base, 50);
    const W = d.panels[bentOf(d, base)[0].b.panelId];
    for (const x of [3, W.w / 3, W.w / 2, W.w - 4])
      for (const y of [5, 30]) {
        const l = panelToLocal(W, panelToWorld(W, x, y, 0.8), 1.6);
        expect(l.x).toBeCloseTo(x, 1);
        expect(l.y).toBeCloseTo(y, 6);
      }
  });
});

describe('a rounded-rectangle tray', () => {
  it('card: straight walls fold from the base, the corners are bent walls with teeth, glued in line to their neighbours', () => {
    const d = createDesign(CARD);
    const base = addRoundedRect(d, 0, 0, 100, 60, 15)!;
    addTray(d, base, 40);
    autoConnect(d);
    const straight = wallsOf(d, base).filter((c) => !d.panels[c.b.panelId].bent);
    expect(straight).toHaveLength(4);
    expect(straight.every((c) => c.kind === 'fold')).toBe(true);
    const bent = bentOf(d, base);
    expect(bent).toHaveLength(4);
    expect(bent.every((c) => c.kind === 'teeth')).toBe(true);
    // each corner is glued at both ends to the straight wall beside it (a flap behind it)
    for (const c of bent) {
      for (const at of ['s', 'e'] as const) {
        const s = d.connections[inlineId(c.b.panelId, at)];
        expect(s?.kind).toBe('glue');
        expect(s.geom!.adds).toHaveLength(1);
        expect(s.geom!.flaps3d[0].panelId).toBe(s.b.panelId);
      }
    }
    // the corner's ends meet its neighbours' ends: in line at the tangent points
    const c = bent.find((x) => x.a.edge === 'e1^~')!;
    const W = d.panels[c.b.panelId];
    const right = d.panels[wallsOf(d, base).find((x) => x.a.edge === 'e1')!.b.panelId];
    const below = d.panels[wallsOf(d, base).find((x) => x.a.edge === 'e0')!.b.panelId];
    expect(v3len(v3sub(panelToWorld(W, 0, 10), panelToWorld(below, below.w, 10)))).toBeLessThan(1e-6);
    expect(v3len(v3sub(panelToWorld(W, W.w, 10), panelToWorld(right, 0, 10)))).toBeLessThan(0.05);
    expect(blocking(d)).toEqual([]);
    expect(() => sheetsToSvg(prepareExport(d).sheets)).not.toThrow();
  });

  it('the tray card’s curved joint changes every bent wall; an unjoined in-line seam stays unjoined', () => {
    const d = createDesign(CORR16);
    const base = addRoundedRect(d, 0, 0, 120, 80, 30)!;
    addTray(d, base, 40);
    autoConnect(d);
    const tray = Object.values(d.trays)[0];
    expect(bentOf(d, base).every((c) => c.kind === 'teeth')).toBe(true);
    setTrayKinds(d, tray.id, { curveKind: 'wrap' });
    expect(bentOf(d, base).every((c) => c.kind === 'wrap')).toBe(true);
    const W = bentOf(d, base)[0].b.panelId;
    deleteConnection(d, inlineId(W, 's'));
    autoConnect(d);
    expect(d.connections[inlineId(W, 's')]).toBeUndefined();
    expect(d.connections[inlineId(W, 'e')]).toBeDefined();
  });

  it('plywood: a glue edge (the base inside the wall), and a check that names the missing living hinge', () => {
    const d = createDesign(PLY);
    const base = addRoundedRect(d, 0, 0, 160, 120, 40)!;
    addTray(d, base, 40);
    autoConnect(d);
    const bent = bentOf(d, base);
    expect(bent.every((c) => c.kind === 'wrap')).toBe(true);
    // fingers on the straight walls, which stand like the bent ones (outer faces flush with the base's edge)
    expect(wallsOf(d, base).filter((c) => !d.panels[c.b.panelId].bent).every((c) => c.kind === 'finger')).toBe(true);
    const keys = validate(d).map((i) => i.key);
    expect(keys.filter((k) => k === 'val.bendHinge')).toHaveLength(4);
    // tighter than a living hinge reaches: named as impossible
    setCornerRadius(d, base, 15);
    expect(validate(d).filter((i) => i.key === 'val.bendTight')).toHaveLength(4);
  });

  it('runPoint follows the base outline: the wall’s outer face at offset 0 is the outline itself', () => {
    const d = createDesign(CARD);
    const base = addRoundedRect(d, 0, 0, 100, 60, 15)!;
    addTray(d, base, 40);
    const W = d.panels[bentOf(d, base)[0].b.panelId];
    const ring = panelEdges(d.panels[base]);
    const p = runPoint(W.bent!, 0, 0);
    expect(ring.some((e) => Math.hypot(e.a.x - p.x, e.a.y - p.y) < 1e-9)).toBe(true);
  });
});

describe('dividers in round boxes', () => {
  const roundBox = (m = CORR16, D = 120) => {
    const d = createDesign(m);
    const base = addRoundPanel(d, 0, 0, D, D, { shape: 'circle' })!;
    addTray(d, base, 50);
    autoConnect(d);
    return { d, base, W: bentOf(d, base)[0].b.panelId };
  };
  const endJoints = (d: Design, id: string, W: string) => Object.values(d.connections).filter((c) => c.a.panelId === id && c.b.panelId === W && c.b.edge === FACE);

  it('a divider across a corrugated circle ends on the curved wall at both ends and is joined there with tabs through slots in it', () => {
    const { d, base, W } = roundBox();
    const id = addDividerLine(d, base, { x: 10, y: 60 }, { x: 110, y: 60 }, 40)!;
    autoConnect(d);
    const ends = endJoints(d, id, W);
    expect(ends.map((c) => c.a.edge).sort()).toEqual(['e1', 'e3']);
    for (const c of ends) {
      expect(c.kind).toBe('tabslot');
      expect(c.broken).toBeFalsy();
      // the slots are in the wall, in its flat coordinates (inside its outline)
      expect(c.geom!.holes.length).toBeGreaterThan(0);
      const wall = d.panels[W];
      const out = panelOutline(wall, panelNotches(d, wall));
      for (const h of c.geom!.holes) expect(h.poly.every((q) => pointInPolygon(q, out))).toBe(true);
    }
    expect(blocking(d)).toEqual([]);
  });

  it('plywood dividers on a curved wall get a slide fit', () => {
    const { d, base, W } = roundBox(PLY, 160);
    const id = addDividerLine(d, base, { x: 10, y: 80 }, { x: 150, y: 80 }, 30)!;
    autoConnect(d);
    const ends = endJoints(d, id, W);
    expect(ends).toHaveLength(2);
    expect(ends.every((c) => c.kind === 'slide' && !c.broken)).toBe(true);
  });

  it('pie compartments: a line across, then one from the rim ending on it', () => {
    const { d, base, W } = roundBox();
    const a = addDividerLine(d, base, { x: 10, y: 60 }, { x: 110, y: 60 }, 40)!;
    autoConnect(d);
    const b = addDividerLine(d, base, { x: 60, y: 110 }, { x: 60, y: 70 }, 40)!;
    autoConnect(d);
    expect(d.panels[b]).toBeDefined();
    // it runs from the wall to the first divider, not across it
    const joined = Object.values(d.connections).filter((c) => !c.grown && c.a.panelId === b).map((c) => c.b.panelId);
    expect(joined).toContain(a);
    expect(joined).toContain(W);
    expect(d.panels[b].w).toBeLessThan(60);
  });
});

describe('growing, fold-overs and the fold view', () => {
  it('a wall grows on a curve run at 90° as a bent wall; nothing grows from a bent wall; no fold-over on it', () => {
    const d = createDesign(CARD);
    const base = addRoundedRect(d, 0, 0, 100, 60, 15)!;
    const g = growPanel(d, base, 'e1^~', { height: 30, angle: 60, dir: 'up', kind: 'fold' })!;
    expect(g).toBeTruthy();
    const W = d.panels[g.panelId];
    expect(W.bent).toBeTruthy();
    expect(d.connections[g.connectionId]).toMatchObject({ kind: 'teeth', angle: 90 });
    expect(growPanel(d, g.panelId, 'e2', { height: 30, angle: 90, dir: 'up', kind: 'fold' })).toBeNull();
    expect(canFoldOver(d, g.panelId, 'e2')).toBe(false);
    expect(addFoldOver(d, g.panelId)).toBeNull();
  });

  it('the fold slider unrolls a bent wall: at 0 a flat strip as long as the wall, at 1 as it stands', () => {
    const d = createDesign(CORR16);
    const base = addRoundPanel(d, 0, 0, 80, 80, { shape: 'circle' })!;
    addTray(d, base, 50);
    const W = d.panels[bentOf(d, base)[0].b.panelId];
    expect(unbendPanel(W, 1)).toBe(W);
    const flat = unbendPanel(W, 0);
    const a = panelToWorld(flat, 0, 0), b = panelToWorld(flat, W.w, 0), m = panelToWorld(flat, W.w / 2, 0);
    // straight: its ends and middle in one line, as far apart as it is long
    expect(v3len(v3sub(a, b))).toBeCloseTo(v3len(v3sub(a, m)) + v3len(v3sub(m, b)), 6);
    expect(v3len(v3sub(a, b))).toBeGreaterThan(W.w - 1);
    // half way: still bent, less than as it stands
    const half = unbendPanel(W, 0.5);
    expect(v3len(v3sub(panelToWorld(half, 0, 0), panelToWorld(half, W.w, 0)))).toBeGreaterThan(v3len(v3sub(panelToWorld(W, 0, 0), panelToWorld(W, W.w, 0))));
  });
});

describe('fixes', () => {
  it('a curve tighter than the material bends is made rounder by its Fix: rounded corners, and a round base made bigger', () => {
    const d = createDesign(PLY);
    const base = addRoundedRect(d, 0, 0, 160, 120, 15)!;
    addTray(d, base, 40);
    autoConnect(d);
    const tight = validate(d).filter((i) => i.key === 'val.bendTight');
    expect(tight).toHaveLength(4);
    expect(fixIssue(d, tight[0])).toBe(true);
    solve(d);
    expect(validate(d).filter((i) => i.key === 'val.bendTight')).toHaveLength(0);
    const c = createDesign(PLY);
    const cb = addRoundPanel(c, 0, 0, 40, 40, { shape: 'circle' })!;
    addTray(c, cb, 40);
    const i = validate(c).find((x) => x.key === 'val.bendTight')!;
    expect(fixIssue(c, i)).toBe(true);
    expect(c.panels[cb].w).toBeGreaterThanOrEqual(2 * bendOf(PLY).patternR);
  });
});

describe('round bases, random (auto-connection fuzz)', () => {
  it('every bent wall and every divider in it is joined, nothing broken, the export runs', () => {
    const fails: string[] = [];
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(seed);
      const m = r.pick([CARD, CORR16, PLY]);
      const d = createDesign(m);
      const shape = r.pick(['circle', 'oval', 'stadium', 'rounded'] as const);
      const W = r.int(90, 200), H = r.int(70, 160);
      const base = shape === 'rounded' ? addRoundedRect(d, 0, 0, W, H, r.int(10, 40))! : addRoundPanel(d, 0, 0, W, H, shape === 'oval' ? { shape, rEnd: r.int(15, 40) } : { shape })!;
      addTray(d, base, r.int(25, 70));
      autoConnect(d);
      const bw = d.panels[base];
      for (let k = r.int(0, 2); k > 0; k--) {
        const y = r.num(0.3, 0.7) * bw.h;
        addDividerLine(d, base, { x: 2, y }, { x: bw.w - 2, y }, r.int(15, 40));
        autoConnect(d);
      }
      try {
        const keys = validate(d).map((i) => i.key);
        if (keys.includes('val.broken') || keys.includes('val.littleContact')) fails.push(`${seed} ${m.id} ${shape}: ${keys.join(',')}`);
        for (const c of bentOf(d, base)) if (c.broken || !c.geom) fails.push(`${seed}: bent wall ${c.b.panelId} not joined`);
        for (const id of d.order.filter((x) => d.panels[x].divider)) {
          // both ends on a wall (bent or straight; a divider it ends on in the middle counts too)
          const ends = Object.values(d.connections).filter((c) => !c.grown && c.a.panelId === id && c.b.edge === FACE && c.b.panelId !== base);
          if (ends.length < 2) fails.push(`${seed} ${m.id} ${shape}: divider ${id} joined at ${ends.length} ends`);
        }
        sheetsToSvg(prepareExport(d).sheets);
      } catch (e) {
        fails.push(`${seed}: THROWS ${(e as Error).message.slice(0, 100)}`);
      }
    }
    expect(fails).toEqual([]);
  }, 120_000);
});

describe('Quick build: Round and Rounded boxes', () => {
  it('Round: a square drag is a circle, a long one an oval whose ends reach the material’s radius; walls rise bent', () => {
    const d = createDesign(CORR16);
    const c = boxRecipe(d, { kind: 'round', x0: 0, z0: 0, x1: 80, z1: 80 }, 50)!;
    expect(d.panels[c.baseId].sketch).toMatchObject({ round: { shape: 'circle' } });
    expect(bentOf(d, c.baseId)).toHaveLength(1);
    const o = boxRecipe(d, { kind: 'round', x0: 200, z0: 0, x1: 340, z1: 60 }, 40)!;
    const r = (d.panels[o.baseId].sketch as { round?: { shape: string; rEnd?: number } }).round!;
    expect(['oval', 'stadium']).toContain(r.shape);
    if (r.shape === 'oval') expect(r.rEnd!).toBeGreaterThanOrEqual(bendOf(CORR16).patternR);
    // a circle smaller than the material bends is made that big (plywood: 2 × 30)
    const p = createDesign(PLY);
    const s = boxRecipe(p, { kind: 'round', x0: 0, z0: 0, x1: 30, z1: 30 }, 40)!;
    expect(p.panels[s.baseId].w).toBe(2 * reachR(p));
    expect(validate(p).some((i) => i.key === 'val.bendTight')).toBe(false);
  });

  it('Rounded: a rectangle with rounded corners, clamped to the material’s radius; straight walls and bent corners', () => {
    const d = createDesign(PLY);
    const b = boxRecipe(d, { kind: 'rounded', x0: 0, z0: 0, x1: 160, z1: 100, r: 15 }, 45)!;
    const pts = (d.panels[b.baseId].sketch as { pts: { r?: number }[] }).pts;
    expect(pts.every((q) => q.r === reachR(d))).toBe(true);
    expect(bentOf(d, b.baseId)).toHaveLength(4);
    expect(wallsOf(d, b.baseId)).toHaveLength(8);
    const c = createDesign(CARD);
    const cb = boxRecipe(c, { kind: 'rounded', x0: 0, z0: 0, x1: 100, z1: 60, r: 15 }, 40)!;
    expect((c.panels[cb.baseId].sketch as { pts: { r?: number }[] }).pts[0].r).toBe(15);
    expect(blocking(c)).toEqual([]);
  });
});

describe('telescoping lids', () => {
  it('a corrugated round box’s lid fits over its wall with the clearance, sits on top, and follows the box', () => {
    const d = createDesign(CORR16);
    const base = addRoundPanel(d, 0, 0, 80, 80, { shape: 'circle' })!;
    const tray = addTray(d, base, 50)!;
    autoConnect(d);
    const lt = addLid(d, tray)!;
    autoConnect(d);
    expect(lt).toBeTruthy();
    expect(addLid(d, tray)).toBeNull();
    const lid = d.trays[lt];
    const lb = d.panels[lid.baseId];
    expect(lb.w).toBeCloseTo(80 + 2 * (CORR16.thickness + CORR16.clearance), 9);
    const box = d.panels[bentOf(d, base)[0].b.panelId], rim = d.panels[bentOf(d, lid.baseId)[0].b.panelId];
    // the centre's world position
    const ctr = (id: string) => {
      const p = d.panels[id];
      return [p.frame.o[0] + (p.frame.u[0] * p.w) / 2 + (p.frame.v[0] * p.h) / 2, p.frame.o[2] + (p.frame.u[2] * p.w) / 2 + (p.frame.v[2] * p.h) / 2];
    };
    const [cx, cz] = ctr(base);
    const [lx, lz] = ctr(lid.baseId);
    expect(lx).toBeCloseTo(cx, 6);
    expect(lz).toBeCloseTo(cz, 6);
    const rad = (q: number[]) => Math.hypot(q[0] - cx, q[2] - cz);
    const outerBox = rad(panelToWorld(box, box.w / 3, 10, 0));
    const innerLid = rad(panelToWorld(rim, rim.w / 3, 5, CORR16.thickness));
    expect(innerLid - outerBox).toBeCloseTo(CORR16.clearance, 1);
    // upside down, its top above the box
    expect(lb.frame.o[1]).toBeGreaterThan(50);
    expect(Math.min(...[0, 0.25, 0.5].map((k) => panelToWorld(rim, rim.w * k, rim.h, 0)[1]))).toBeLessThan(50);
    // the box grows: the lid follows
    setRoundShape(d, base, { w: 100 });
    expect(d.panels[lid.baseId].w).toBeCloseTo(100 + 2 * (CORR16.thickness + CORR16.clearance), 9);
    expect(blocking(d)).toEqual([]);
    expect(() => sheetsToSvg(prepareExport(d).sheets)).not.toThrow();
  });

  it('a card rounded box’s lid: rounded corners grown by the gap', () => {
    const d = createDesign(CARD);
    const b = boxRecipe(d, { kind: 'rounded', x0: 0, z0: 0, x1: 100, z1: 60, r: 15 }, 40)!;
    const tray = Object.values(d.trays).find((t) => t.baseId === b.baseId)!;
    const lt = addLid(d, tray.id)!;
    const g = CARD.thickness + CARD.clearance;
    const lb = d.panels[d.trays[lt].baseId];
    expect(lb.w).toBeCloseTo(100 + 2 * g, 9);
    expect(lb.h).toBeCloseTo(60 + 2 * g, 9);
    expect((lb.sketch as { pts: { r?: number }[] }).pts.every((q) => Math.abs(q.r! - (15 + g)) < 1e-9)).toBe(true);
  });
});
