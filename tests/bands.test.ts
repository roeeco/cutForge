// Milestone 63 (PACKAGING_PLAN.md §4.2, §4.3, §5): folds with a radius, and bend patterns.
import { describe, expect, it } from 'vitest';
import { addRootPanel, addTray, autoConnect, createDesign, growPanel, setConnection, solve } from '../src/model/ops';
import { MATERIALS, bendOf } from '../src/model/materials';
import { allBands, bandChildMove, bandOf, bandPose, bandWorld, foldRadius } from '../src/model/bands';
import { bandPattern, patternWhy, slitSpacing } from '../src/model/bendPatterns';
import { buildPieces, netOverlaps } from '../src/model/pieces';
import { panelNotches } from '../src/model/geometry';
import { validate } from '../src/model/validate';
import { prepareExport } from '../src/export/prepare';
import { sheetsToSvg } from '../src/export/svg';
import { toWorld } from '../src/model/frame';
import type { Connection, Design } from '../src/model/types';
import { idempotence, roundTrip, sweepBack } from './harness';
import { fixIssue } from '../src/easy/fix';
import { bendTestSheet, testRadii } from '../src/export/bendTest';
import { sheetToSvg } from '../src/export/svg';

const [CARD, CORR16, , PLY] = MATERIALS;

/** A box (tray) with a lid grown from its back wall's top edge by a fold. */
function lidBox(m: typeof CARD, radius?: number, h = 60) {
  const d = createDesign(m);
  const base = addRootPanel(d, 0, 0, 120, 80);
  addTray(d, base, h);
  autoConnect(d);
  // the back wall: the tray wall on the base's far edge (e2)
  const back = Object.values(d.connections).find((c) => c.grown && c.a.panelId === base && c.a.edge === 'e2')!.b.panelId;
  const g = growPanel(d, back, 'e2', { height: 80, angle: 90, dir: 'up', kind: 'fold' })!;
  const c = d.connections[g.connectionId];
  if (radius !== undefined) setConnection(d, c.id, { radius });
  solve(d);
  return { d, base, back, lid: g.panelId, cid: g.connectionId };
}

describe('the band of a fold with a radius', () => {
  it('a crease stays a crease: radius 0 (card, corrugated) has no band, and the net is as before', () => {
    const { d, cid } = lidBox(CARD);
    expect(foldRadius(d, d.connections[cid])).toBe(0);
    expect(bandOf(d, d.connections[cid])).toBeNull();
  });

  it('a quarter turn: developed width π/2 (r + k t), each panel cut back by its tangent length', () => {
    const { d, cid, back, lid } = lidBox(CARD, 8);
    const b = bandOf(d, d.connections[cid])!;
    const t = CARD.thickness, k = bendOf(CARD).k;
    expect(b.phi).toBeCloseTo(Math.PI / 2, 9);
    expect(b.lb).toBeCloseTo((Math.PI / 2) * (8 + k * t), 9);
    // the outer faces meet at the box's corner; at 90° each tangent point is Ro from it
    expect(b.fits).toBe(true);
    // the arc's outer points are all Ro from its centre, from one tangent point to the other
    const pose = bandPose(b, 1, 8);
    for (const q of pose.outer) expect(Math.hypot(q.x - b.C.x, q.y - b.C.y)).toBeCloseTo(b.Ro, 9);
    expect(Math.hypot(pose.end.x - b.T2.x, pose.end.y - b.T2.y)).toBeLessThan(1e-9);
    // the cuts are in the panels' outlines
    expect(panelNotches(d, d.panels[back]).e2.some((n) => Math.abs(n.depth - b.trimP) < 1e-9)).toBe(true);
    expect(panelNotches(d, d.panels[lid]).e0.some((n) => Math.abs(n.depth - b.trimC) < 1e-9)).toBe(true);
    // the child's cut-back bottom edge lies on the arc's end (its outer face, in 3D)
    const L = d.panels[lid];
    const p = toWorld(L.frame, 10, b.trimC, 0), q = bandWorld(b, b.T2, 10);
    expect(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])).toBeLessThan(1e-6);
  });

  it('the fold view: fully folded the child stays put; flat, it lands where the net puts it', () => {
    const { d, cid } = lidBox(CARD, 8);
    const b = bandOf(d, d.connections[cid])!;
    const id = bandChildMove(b, 1);
    expect(id.map((x, i) => Math.abs(x - [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1][i])).every((e) => e < 1e-9)).toBe(true);
    const flat = bandPose(b, 0);
    // flat: the band is a straight strip of its developed width along the parent's outer face
    expect(Math.hypot(flat.end.x - (b.T1.x - b.lb), flat.end.y - b.T1.y)).toBeLessThan(1e-9);
  });

  it('card at radius 8: one piece, scores across the band at the calculated spacing, export clean', () => {
    // 50 high: at 60 the net is too big for a card sheet, and the app cuts it in two (it used to stay whole, too big)
    const { d, cid } = lidBox(CARD, 8, 50);
    const b = bandOf(d, d.connections[cid])!;
    expect(b.pattern.id).toBe('score');
    expect(b.pattern.why).toBeNull();
    const lim = bendOf(CARD);
    const sp = Math.min(2 * lim.pitch, Math.max(0.5 * lim.pitch, (8 + lim.k * CARD.thickness) * (lim.pitch / lim.patternR)));
    expect(b.pattern.count).toBe(Math.ceil(b.lb / sp - 1e-9));
    expect(b.pattern.lines.scores).toHaveLength(b.pattern.count);
    const pieces = buildPieces(d);
    expect(pieces).toHaveLength(1);
    const scores = pieces[0].contours.filter((x) => x.op === 'score' && x.ref?.foldId === cid);
    expect(scores).toHaveLength(b.pattern.count);
    expect(netOverlaps(d)).toEqual([]);
    expect(validate(d).filter((i) => i.key.startsWith('val.bend') || i.key === 'val.tooBig')).toEqual([]);
    expect(() => sheetsToSvg(prepareExport(d).sheets)).not.toThrow();
  });

  it('card at radius 8 on a box too big for one sheet: cut in two so it fits, not left whole and too big', () => {
    const { d } = lidBox(CARD, 8);
    expect(buildPieces(d)).toHaveLength(2);
    expect(validate(d).map((i) => i.key)).not.toContain('val.tooBig');
  });

  it('card at radius 12 bends smoothly (no lines); at radius 2 nothing reaches, and the check says so', () => {
    const a = lidBox(CARD, 12);
    expect(bandOf(a.d, a.d.connections[a.cid])!.pattern.id).toBe('smooth');
    const z = lidBox(CARD, 2);
    const b = bandOf(z.d, z.d.connections[z.cid])!;
    expect(b.pattern.why?.key).toBe('radius');
    expect(validate(z.d).some((i) => i.key === 'val.bendTight')).toBe(true);
  });

  it('a plywood lid hinged on a living hinge is one piece with its box wall, and folds', () => {
    const { d, cid, back, lid } = lidBox(PLY);
    const c = d.connections[cid];
    expect(c.kind).toBe('fold');
    expect(foldRadius(d, c)).toBe(bendOf(PLY).patternR);
    const b = bandOf(d, c)!;
    expect(b.pattern.id).toBe('slits');
    expect(b.pattern.why).toBeNull();
    // slits alternate in columns across the band, a bridge from its edges
    expect(b.pattern.count).toBeGreaterThan(10);
    for (const s of b.pattern.lines.cuts) {
      expect(Math.min(s.a.y, s.b.y)).toBeGreaterThanOrEqual(3 - 1e-9);
      expect(Math.max(s.a.y, s.b.y)).toBeLessThanOrEqual(b.span[1] - b.span[0] - 3 + 1e-9);
    }
    const piece = buildPieces(d).find((p) => p.panels.some((n) => n.panelId === lid))!;
    expect(piece.panels.map((n) => n.panelId)).toContain(back);
    expect(piece.contours.filter((x) => x.op === 'cut' && x.role === 'line')).toHaveLength(b.pattern.lines.cuts.length);
    expect(validate(d).filter((i) => i.key.startsWith('val.bend'))).toEqual([]);
    expect(() => sheetsToSvg(prepareExport(d, 'compensated').sheets)).not.toThrow();
    // compensated, each slit is shorter by exactly the kerf (half at each end), and closed outlines still grow
    const nominal = prepareExport(d).sheets.flatMap((x) => x.contours).filter((x) => x.op === 'cut' && !x.contour.closed);
    const comp = prepareExport(d, 'compensated').sheets.flatMap((x) => x.contours).filter((x) => x.op === 'cut' && !x.contour.closed);
    const l = (x: (typeof nominal)[number]) => x.contour.segs.reduce((t, s) => t + Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), 0);
    expect(comp).toHaveLength(nominal.length);
    comp.forEach((x, i) => expect(l(nominal[i]) - l(x)).toBeCloseTo(PLY.kerf, 9));
  });

  it('designs with bands solve to themselves, save and reopen, and a radius swept and back returns', () => {
    for (const m of [CARD, PLY]) {
      const { d, cid } = lidBox(m, m.kind === 'plywood' ? 40 : 8);
      expect(idempotence(d)).toBeNull();
      expect(roundTrip(d)).toBeNull();
      expect(sweepBack(d, (x, v) => setConnection(x, cid, { radius: v }), m.kind === 'plywood' ? 40 : 8, [20, 60, 0, 5, 30])).toBeNull();
    }
  });
});

describe('bend patterns', () => {
  it('slit spacing follows the formula: sqrt(C ℓ ρ) while it is under t', () => {
    expect(slitSpacing(PLY, 30, 8.5)).toBeCloseTo(Math.sqrt(0.016 * 8.5 * 30), 9);
    expect(slitSpacing(PLY, 30, 8.5)).toBeCloseTo(2.02, 2);
    // tighter: closer
    expect(slitSpacing(PLY, 15, 8.5)).toBeLessThan(slitSpacing(PLY, 30, 8.5));
  });

  it('a pattern that cannot work says why', () => {
    const ctx = { m: PLY, r: 30, len: 8, width: 50, turn: Math.PI / 2 };
    expect(patternWhy('slits', ctx)?.key).toBe('short');
    expect(patternWhy('score', ctx)?.key).toBe('material');
    expect(patternWhy('smooth', { ...ctx, len: 100 })).toEqual({ key: 'radius', value: bendOf(PLY).smoothR });
  });

  it('denser on request: more lines, never fewer', () => {
    const ctx = { m: PLY, r: 40, len: 60, width: 70, turn: Math.PI / 2 };
    const auto = bandPattern(ctx, 'auto'), dense = bandPattern(ctx, 'slits', 0.5);
    expect(dense.count).toBeGreaterThan(auto.count);
  });
});

describe('checks and fixes', () => {
  it('a crease in plywood (radius 0) is named and fixed with the radius it needs', () => {
    const { d, cid } = lidBox(PLY, 0);
    const i = validate(d).find((x) => x.key === 'val.bendTight')!;
    expect(i).toBeTruthy();
    expect(fixIssue(d, i)).toBe(true);
    expect(foldRadius(d, d.connections[cid])).toBe(bendOf(PLY).patternR);
  });

  it('too tight for any pattern: Fix sets the radius the pattern needs', () => {
    const { d, cid } = lidBox(CARD, 2);
    const i = validate(d).find((x) => x.key === 'val.bendTight')!;
    expect(fixIssue(d, i)).toBe(true);
    expect(bandOf(d, d.connections[cid])!.pattern.why).toBeNull();
  });

  it('a chosen pattern that does not reach: Fix goes back to Automatic', () => {
    const { d, cid } = lidBox(CARD, 6);
    setConnection(d, cid, { bend: { pattern: 'smooth' } });
    const i = validate(d).find((x) => x.key === 'val.bendStyle')!;
    expect(i).toBeTruthy();
    expect(fixIssue(d, i)).toBe(true);
    expect(d.connections[cid].bend).toBeUndefined();
  });

  it('a radius too large for its boards: Fix brings it down until it fits', () => {
    const { d, cid } = lidBox(PLY, 70);
    const i = validate(d).find((x) => x.key === 'val.bendRoom')!;
    expect(i).toBeTruthy();
    expect(fixIssue(d, i)).toBe(true);
    expect(bandOf(d, d.connections[cid])!.fits).toBe(true);
  });

  it('the bend test: five labelled zones of the material pattern, at radii round its reach', () => {
    for (const m of [CARD, PLY]) {
      const sheet = bendTestSheet(m, (r) => `R ${r}`);
      const lines = sheet.contours.filter((c) => c.role === 'line' && c.op !== 'guide');
      expect(lines.length).toBeGreaterThan(10);
      expect(testRadii(m)).toHaveLength(5);
      expect(() => sheetToSvg(sheet)).not.toThrow();
    }
  });
});
