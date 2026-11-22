// Milestone 161 (GROW_ENDINGS_PLAN.md): the edge endings of a grown board. Every edge but the one it hinges on ends in
// something; a free edge in nothing, a flap or a fold-over, an edge that meets another board in a lip (offered
// first) or the seam's other joints. Each starts at an automatic length that follows its board until one is set, and
// a flap folds with a grown fold's numbers.
import { describe, expect, it } from 'vitest';
import { addEdgeFlap, addRootPanel, autoConnect, createDesign, growPanel, setEdgeFlap, setEnding, setEndingHinge, setEndingJoint, setEndingLength, setPanelSize } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { boardEnding, boardEndings, ENDINGS, flapHinge, hingeToFlap, takesEndings, type FreeEnding, type MeetEnding } from '../src/model/endings';
import { edgeFeatures, flapDefaultLen, flapSpec } from '../src/model/edgeFeatures';
import { findEdge } from '../src/model/edges';
import { checkDesign } from '../src/model/check';
import { validate } from '../src/model/validate';
import { buildPieces } from '../src/model/pieces';
import { parseProject, serializeProject } from '../src/model/serialize';
import type { Design, V3 } from '../src/model/types';
import { endingHandles, handleModelPt } from '../src/model/endingHandles';
import { matDir } from '../src/model/frame';
import { v3dot, v3len, v3norm, v3sub } from '../src/geom/v3';

const CARD = MATERIALS.find((m) => m.kind === 'card')!;
const CORR = MATERIALS.find((m) => m.kind === 'corrugated')!;
const PLY = MATERIALS.find((m) => m.kind === 'plywood')!;
const t = CARD.thickness;

/** A 100 × 60 base with a 50 mm wall folded up off its front edge (e0). */
function wall(m = CARD): { d: Design; base: string; w: string } {
  const d = createDesign(m);
  const base = addRootPanel(d, 0, 0, 100, 60);
  const g = growPanel(d, base, 'e0', { height: 50, angle: 90, dir: 'up', kind: 'fold' })!;
  return { d, base, w: g.panelId };
}
/** And a second wall off the base's right edge, meeting the first at the corner. */
function corner(m = CARD) {
  const r = wall(m);
  const g = growPanel(r.d, r.base, 'e1', { height: 50, angle: 90, dir: 'up', kind: 'fold' })!;
  autoConnect(r.d);
  return { ...r, w2: g.panelId };
}
const free = (d: Design, id: string, e: string) => boardEnding(d, id, e) as FreeEnding;
const meets = (d: Design, id: string) => boardEndings(d, id).filter((r): r is MeetEnding => r.kind === 'meets');

describe('the edge endings of a board', () => {
  it('a grown wall: every edge but its hinge, all free and ending in nothing', () => {
    const { d, base, w } = wall();
    const rows = boardEndings(d, w);
    expect(rows.map((r) => r.edge).sort()).toEqual(['e1', 'e2', 'e3']);
    expect(rows.every((r) => r.kind === 'free' && r.ending === 'none' && r.len === 0)).toBe(true);
    // the base was not grown: no endings; nor a plywood wall
    expect(takesEndings(d, base)).toBe(false);
    expect(boardEndings(d, base)).toEqual([]);
    expect(boardEndings(wall(PLY).d, wall(PLY).w)).toEqual([]);
  });

  it('an edge a child board grows from is not an ending', () => {
    const { d, w } = wall();
    growPanel(d, w, 'e2', { height: 30, angle: 90, dir: 'up', kind: 'fold' });
    expect(boardEndings(d, w).map((r) => r.edge).sort()).toEqual(['e1', 'e3']);
  });

  it('every ending goes on the top edge at its automatic length, each in one edit taking the last off', () => {
    const { d, w } = wall();
    const p = () => d.panels[w];
    for (const k of ENDINGS) {
      expect(setEnding(d, w, 'e2', k)).toBe(true);
      const r = free(d, w, 'e2');
      expect(r.ending).toBe(k);
      // one ending per edge (rule 1)
      expect((p().edgeFlaps ?? []).length + (p().foldOvers ?? []).length).toBe(k === 'none' ? 0 : 1);
      if (k === 'foldover') {
        expect(r.len).toBeCloseTo(50 - t, 6);
        expect(r.auto).toBe(true);
        expect(r.hinge).toBeNull();
      } else if (k !== 'none') {
        expect(r.auto).toBe(true);
        expect(r.len).toBeCloseTo(flapDefaultLen(d, p(), findEdge(p(), 'e2')!, k), 6);
        expect(r.hinge).not.toBeNull();
      }
      // a file keeps it as it is (check.ts accepts every field)
      const raw = JSON.parse(JSON.stringify(d));
      expect(() => checkDesign(raw)).not.toThrow();
      expect(raw.panels[w].edgeFlaps).toEqual(p().edgeFlaps);
      expect(raw.panels[w].foldOvers).toEqual(p().foldOvers);
    }
  });

  it('a fold-over only on the top edge; the reason is given', () => {
    const { d, w } = wall();
    expect(free(d, w, 'e1').why.foldover).toBe('endings.why.foldTop');
    expect(setEnding(d, w, 'e1', 'foldover')).toBe(false);
    expect(d.panels[w].foldOvers).toBeUndefined();
    expect(free(d, w, 'e2').why.foldover).toBeUndefined();
  });

  it('an automatic length follows the board; a set one stays; null makes it automatic again (rule 2)', () => {
    const { d, w } = wall();
    setEnding(d, w, 'e1', 'dust');
    const at = () => free(d, w, 'e1');
    const dust = (h: number) => Math.max(12, Math.min(0.45 * h, 40));
    expect(at().len).toBeCloseTo(dust(50), 6);
    setPanelSize(d, w, undefined, 70);
    expect(at().len).toBeCloseTo(dust(70), 6);
    setEndingLength(d, w, 'e1', 18);
    expect(at()).toMatchObject({ len: 18, auto: false });
    setPanelSize(d, w, undefined, 40);
    expect(at().len).toBe(18);
    setEndingLength(d, w, 'e1', null);
    expect(at()).toMatchObject({ auto: true });
    expect(at().len).toBeCloseTo(dust(40), 6);
    // a new shape starts automatic, whatever the last one was
    setEndingLength(d, w, 'e1', 22);
    setEnding(d, w, 'e1', 'tuck');
    expect(at().auto).toBe(true);
  });

  it('a fold-over set to a hem, then back to full depth', () => {
    const { d, w } = wall();
    setEnding(d, w, 'e2', 'foldover');
    setEndingLength(d, w, 'e2', 20);
    expect(free(d, w, 'e2')).toMatchObject({ len: 20, auto: false });
    setEndingLength(d, w, 'e2', null);
    expect(free(d, w, 'e2')).toMatchObject({ len: 50 - t, auto: true });
  });

  it("a flap's fold is a grown fold's number (rule 3)", () => {
    expect(hingeToFlap(180)).toEqual({ angle: 0, dir: 'in' });
    expect(hingeToFlap(90)).toEqual({ angle: 90, dir: 'in' });
    expect(hingeToFlap(270)).toEqual({ angle: 90, dir: 'out' });
    expect(hingeToFlap(-30)).toEqual({ angle: 150, dir: 'out' });
    for (const h of [0, 45, 90, 135, 180, 200, 270, 330]) {
      const f = hingeToFlap(h);
      expect(flapHinge({ shape: 'tuck', ...f }, t)).toBeCloseTo(h, 6);
    }
    const { d, w } = wall();
    setEnding(d, w, 'e2', 'tuck');
    // a tuck starts square, folded in
    expect(free(d, w, 'e2').hinge).toBe(90);
    setEndingHinge(d, w, 'e2', 300);
    const f = d.panels[w].edgeFlaps![0];
    expect(flapSpec(f, t)).toMatchObject({ angle: 120, dir: 'out' });
    expect(free(d, w, 'e2').hinge).toBe(300);
  });

  it('a plain flap lies flat until it is turned, then folds like the others', () => {
    const { d, w } = wall();
    setEnding(d, w, 'e2', 'plain');
    expect(free(d, w, 'e2').hinge).toBe(180);
    expect(edgeFeatures(d, w).find((h) => h.kind === 'flap')!.out.hinged).toEqual([]);
    setEndingHinge(d, w, 'e2', 90);
    expect(d.panels[w].edgeFlaps![0]).toMatchObject({ angle: 90 });
    expect(d.panels[w].edgeFlaps![0].shape).toBeUndefined();
    const hit = edgeFeatures(d, w).find((h) => h.kind === 'flap')!;
    expect(hit.out.hinged).toHaveLength(1);
    // flat again: milestone 67's flap, as stored before
    setEndingHinge(d, w, 'e2', 180);
    expect(d.panels[w].edgeFlaps![0].angle).toBeUndefined();
    expect(d.panels[w].edgeFlaps![0].dir).toBeUndefined();
  });

  it('where two edges meet a lip is offered automatically, at the automatic width, and can be set', () => {
    const { d, w, w2 } = corner();
    const a = meets(d, w), b = meets(d, w2);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    // card: the corner is a lip (a glue flap) from the start, cut on one of the two walls
    expect(a[0]).toMatchObject({ joint: 'glue', auto: true, other: w2 });
    expect(a[0].owner).toBe(b[0].owner);
    expect(a[0].width).toBeGreaterThan(0);
    expect(a[0].options[0]).toBe('glue');
    setEndingLength(d, w, a[0].edge, 14);
    expect(meets(d, w2)[0]).toMatchObject({ width: 14, auto: false });
    setEndingLength(d, w2, b[0].edge, null);
    expect(meets(d, w)[0].auto).toBe(true);
    // another joint, and the lip back
    expect(setEndingJoint(d, w, a[0].edge, 'lock')).toBe(true);
    expect(meets(d, w)[0]).toMatchObject({ joint: 'lock', width: null });
    expect(setEndingLength(d, w, a[0].edge, 10)).toBe(false);
    setEndingJoint(d, w, a[0].edge, 'glue');
    expect(meets(d, w)[0].joint).toBe('glue');
    // a meeting edge takes no flap
    expect(setEnding(d, w, a[0].edge, 'tuck')).toBe(false);
  });

  it('corrugated: the lip is offered where the corner can be one, after tabs', () => {
    const { d, w } = corner(CORR);
    const m = meets(d, w)[0];
    expect(m.options).toContain('glue');
    setEndingJoint(d, w, m.edge, 'glue');
    expect(meets(d, w)[0].width).toBeGreaterThan(0);
  });

  it('a design with endings exports clean, saves and opens the same', () => {
    const { d, w, w2 } = corner();
    setEnding(d, w, 'e2', 'tuck');
    setEnding(d, w2, 'e2', 'foldover');
    const free1 = boardEndings(d, w).find((r) => r.kind === 'free' && r.edge !== 'e2')!;
    setEnding(d, w, free1.edge, 'dust');
    expect(validate(d).map((i) => i.key)).toEqual([]);
    expect(buildPieces(d).length).toBeGreaterThan(0);
    const back = parseProject(serializeProject(d));
    expect(boardEndings(back, w)).toEqual(boardEndings(d, w));
    expect(boardEndings(back, w2)).toEqual(boardEndings(d, w2));
  });

  it('flaps added before milestone 161 are unchanged: no auto, their length kept', () => {
    const { d, w } = wall();
    addEdgeFlap(d, w, 'e2', 15);
    expect(d.panels[w].edgeFlaps![0].auto).toBeUndefined();
    setPanelSize(d, w, undefined, 80);
    expect(d.panels[w].edgeFlaps![0].len).toBe(15);
    // a length set through the old call stays the student's
    setEdgeFlap(d, w, 'e2', { shape: 'tuck' });
    setEdgeFlap(d, w, 'e2', 20);
    expect(free(d, w, 'e2')).toMatchObject({ len: 20, auto: false });
  });
});

describe('the handles of the edge endings (milestone 163)', () => {
  const span = (h: ReturnType<typeof endingHandles>[number]): V3 => v3sub(handleModelPt(h, h.far), handleModelPt(h, h.crease));
  it('a flat flap: its arrow a length out from its crease, in the wall\'s plane, away from the wall', () => {
    const { d, w } = wall();
    setEnding(d, w, 'e2', 'plain');
    const [h] = endingHandles(d, w);
    expect(h).toMatchObject({ edge: 'e2', kind: 'free', spot: { panel: w } });
    expect(v3len(span(h))).toBeCloseTo(h.value, 6);
    const p = d.panels[w];
    // up the wall (its v) and not out of its plane
    expect(v3dot(v3norm(span(h)), p.frame.v)).toBeCloseTo(1, 6);
    expect(h.hinge?.value).toBe(180);
  });

  it('a folded tuck: the arrow along the flap as it is folded (square to the wall, to its material side)', () => {
    const { d, w } = wall();
    setEnding(d, w, 'e2', 'tuck');
    const [h] = endingHandles(d, w);
    expect('flap' in h.spot).toBe(true);
    expect(v3len(span(h))).toBeCloseTo(h.value, 6);
    expect(v3dot(v3norm(span(h)), matDir(d.panels[w].frame))).toBeCloseTo(1, 6);
    // turned out past flat: the other side
    setEndingHinge(d, w, 'e2', 270);
    const [h2] = endingHandles(d, w);
    expect(v3dot(v3norm(span(h2)), matDir(d.panels[w].frame))).toBeCloseTo(-1, 6);
    expect(h2.hinge?.value).toBe(270);
  });

  it('a fold-over: its arrow at the liner\'s end, down the wall, no ring', () => {
    const { d, w } = wall();
    setEnding(d, w, 'e2', 'foldover');
    setEndingLength(d, w, 'e2', 20);
    const [h] = endingHandles(d, w);
    expect(h.value).toBe(20);
    expect(h.hinge).toBeUndefined();
    expect(v3dot(v3norm(span(h)), d.panels[w].frame.v)).toBeCloseTo(-1, 6);
  });

  it('a lip: its arrow a width along the face it is glued to, on both walls\' handles', () => {
    const { d, w, w2 } = corner();
    for (const id of [w, w2]) {
      const hs = endingHandles(d, id).filter((h) => h.kind === 'meets');
      expect(hs).toHaveLength(1);
      expect(v3len(span(hs[0]))).toBeCloseTo(hs[0].value, 1);
      expect(hs[0].hinge).toBeUndefined();
    }
    // a joint that is not a lip has no arrow
    const e = meets(d, w)[0].edge;
    setEndingJoint(d, w, e, 'lock');
    expect(endingHandles(d, w).filter((h) => h.kind === 'meets')).toEqual([]);
  });

  it('no ending, no handle', () => {
    const { d, w } = wall();
    expect(endingHandles(d, w)).toEqual([]);
  });
});
