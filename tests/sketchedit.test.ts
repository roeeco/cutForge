// Milestone 59: selecting and editing in the sketch.
import { describe, expect, it } from 'vitest';
import { addPt, addSeg, bounds, cloneSketch, emptySketch, selPts, type Sketch, type SkSel } from '../src/sketch/model';
import { align, setCorner, setLength, setAngle, setLock, setSmooth, stamp } from '../src/sketch/ops';
import { copySel, deleteSel, frameScale, outlineAt, outlinesIn, pasteClip, pasteOffset, scaleSelection, snapTurn, typedSize } from '../src/sketch/select';
import { initTool, step, type Env, type ToolState } from '../src/sketch/tools';
import { cornerAngle, segLength } from '../src/sketch/dims';
import { sketchState } from '../src/sketch/regions';
import { evalNumber } from '../src/ui/NumField';

const box = (sk: Sketch, sel: SkSel) => bounds(sk, selPts(sk, sel))!;
const W = (b: { min: { x: number }; max: { x: number } }) => b.max.x - b.min.x;
const H = (b: { min: { y: number }; max: { y: number } }) => b.max.y - b.min.y;

describe('the frame', () => {
  it('a corner drag with Keep proportions scales both directions alike; a side drag changes one', () => {
    const sk = emptySketch();
    const r = stamp(sk, 'rect', { x: 20, y: 10 }, { w: 40, h: 20 });
    const b = box(sk, r);
    // the top-right corner to x = 80 (twice as wide), proportions kept
    const f = frameScale(b, { x: 1, y: 1 }, { x: 80, y: 25 }, { ratio: true, centre: false });
    scaleSelection(sk, r, f);
    let nb = box(sk, r);
    expect(W(nb)).toBeCloseTo(80, 9);
    expect(H(nb)).toBeCloseTo(40, 9);
    // the bottom-left corner stayed
    expect(nb.min.x).toBeCloseTo(0, 9);
    expect(nb.min.y).toBeCloseTo(0, 9);
    // a side handle: one direction only
    const g = frameScale(nb, { x: 0, y: 1 }, { x: 999, y: 60 }, { ratio: false, centre: false });
    scaleSelection(sk, r, g);
    nb = box(sk, r);
    expect(W(nb)).toBeCloseTo(80, 9);
    expect(H(nb)).toBeCloseTo(60, 9);
    // Alt: about the middle
    const c = frameScale(nb, { x: 1, y: 0 }, { x: 60, y: 0 }, { ratio: false, centre: true });
    expect(c.anchor.x).toBeCloseTo(40, 9);
    expect(c.sx).toBeCloseTo(40 / 80, 9);
  });

  it('a typed 150% width with proportions kept changes the height too', () => {
    const sk = emptySketch();
    const r = stamp(sk, 'rect', { x: 0, y: 0 }, { w: 40, h: 20 });
    const b = box(sk, r);
    const v = evalNumber('150%', W(b))!;
    scaleSelection(sk, r, typedSize(b, 'w', v, true));
    const nb = box(sk, r);
    expect(W(nb)).toBeCloseTo(60, 9);
    expect(H(nb)).toBeCloseTo(30, 9);
    // without: the height stays
    scaleSelection(sk, r, typedSize(nb, 'h', 10, false));
    expect(W(box(sk, r))).toBeCloseTo(60, 9);
    expect(H(box(sk, r))).toBeCloseTo(10, 9);
  });

  it('turns snap: 22.5° inside the ring, whole degrees outside, 15° with Shift', () => {
    expect(snapTurn(30, { insideRing: true, shift: false })).toBe(22.5);
    expect(snapTurn(30.4, { insideRing: false, shift: false })).toBe(30);
    expect(snapTurn(38, { insideRing: false, shift: true })).toBe(45);
  });
});

describe('selecting', () => {
  it("a click inside a ring's hole selects the inner outline only", () => {
    const sk = emptySketch();
    const outer = stamp(sk, 'circle', { x: 0, y: 0 }, { size: 60 });
    const inner = stamp(sk, 'circle', { x: 0, y: 0 }, { size: 20 });
    expect(outlineAt(sk, { x: 2, y: 3 })).toEqual({ pts: expect.arrayContaining(inner.pts), segs: expect.arrayContaining(inner.segs) });
    const ring = outlineAt(sk, { x: 20, y: 0 })!;
    expect(ring.segs.sort()).toEqual([...outer.segs].sort());
    expect(outlineAt(sk, { x: 100, y: 0 })).toBeNull();
  });

  it('the Select tool: a click inside an outline selects it; Shift-click adds; a drag moves; a box selects', () => {
    const sk = emptySketch();
    const a = stamp(sk, 'rect', { x: 0, y: 0 }, { size: 20 });
    const b = stamp(sk, 'triangle', { x: 50, y: 0 }, { size: 20 });
    let cur = sk;
    let sel: SkSel = { pts: [], segs: [] };
    let txn: Sketch | null = null;
    const env: Env = {
      sk: () => cur,
      edit: (fn) => fn(cur),
      preview: (fn) => {
        txn ??= cloneSketch(cur);
        cur = cloneSketch(txn);
        fn(cur);
      },
      commit: () => void (txn = null),
      cancel: () => void ((cur = txn ?? cur), (txn = null)),
      undo: () => {},
      mmPerPx: 0.1,
      grid: (x) => Math.round(x),
      smart: true,
      cons: false,
      sel: () => sel,
      setSel: (x) => void (sel = x),
    };
    let s: ToolState = initTool('select');
    const go = (e: Parameters<typeof step>[1]) => (s = step(s, e, env));
    go({ t: 'down', p: { x: 1, y: 1 } });
    go({ t: 'click', p: { x: 1, y: 1 } });
    expect(sel.segs.sort()).toEqual([...a.segs].sort());
    go({ t: 'down', p: { x: 50, y: 0 }, mods: { shift: true, alt: false } });
    expect(sel.segs).toHaveLength(7);
    // dragging the square moves both
    go({ t: 'down', p: { x: 1, y: 1 } });
    go({ t: 'drag', p: { x: 11, y: 1 } });
    go({ t: 'up', p: { x: 11, y: 1 } });
    expect(bounds(cur, a.pts)!.min.x).toBeCloseTo(0, 9);
    expect(bounds(cur, b.pts)!.min.x).toBeGreaterThan(45);
    // a box on empty space selects what it covers
    go({ t: 'down', p: { x: -30, y: -30 } });
    expect(sel.pts).toHaveLength(0);
    go({ t: 'drag', p: { x: 25, y: 25 } });
    go({ t: 'up', p: { x: 25, y: 25 } });
    expect(sel.pts.sort()).toEqual([...a.pts].sort());
  });
});

describe('the bar', () => {
  it('align centre both ways puts two circles on one centre', () => {
    const sk = emptySketch();
    const a = stamp(sk, 'circle', { x: 0, y: 0 }, { size: 40 });
    const b = stamp(sk, 'circle', { x: 70, y: 25 }, { size: 10 });
    const outs = outlinesIn(sk, { pts: [...a.pts, ...b.pts], segs: [...a.segs, ...b.segs] });
    expect(outs).toHaveLength(2);
    align(sk, outs, 'hcenter');
    align(sk, outs, 'vcenter');
    const ca = bounds(sk, a.pts)!, cb = bounds(sk, b.pts)!;
    expect((ca.min.x + ca.max.x) / 2).toBeCloseTo((cb.min.x + cb.max.x) / 2, 9);
    expect((ca.min.y + ca.max.y) / 2).toBeCloseTo((cb.min.y + cb.max.y) / 2, 9);
  });

  it("setLength and setAngle through the pills' handlers; a locked corner is worked around", () => {
    const sk = emptySketch();
    // an open run a — b — c — d
    const p = [addPt(sk, { x: 0, y: 0 }), addPt(sk, { x: 30, y: 0 }), addPt(sk, { x: 30, y: 20 }), addPt(sk, { x: 50, y: 20 })];
    const g = [addSeg(sk, { a: p[0], b: p[1], k: 'line' }), addSeg(sk, { a: p[1], b: p[2], k: 'line' }), addSeg(sk, { a: p[2], b: p[3], k: 'line' })];
    // typed 45 on the first line, its end b selected: b moves, with what hangs on it
    const v = evalNumber('40+5', segLength(sk, g[0]))!;
    expect(setLength(sk, g[0], v, { fixed: p[0] })).toBe(true);
    expect(sk.pts[p[1]].x).toBeCloseTo(45, 9);
    expect(sk.pts[p[3]].x).toBeCloseTo(65, 9);
    // c locked: lengthening b–c moves c? no: c is the moving end and locked, so it is refused
    setLock(sk, [p[2]], true);
    expect(setLength(sk, g[1], 30, { fixed: p[1] })).toBe(false);
    // ... but from the other side, b moves (and a with it) while c stays
    expect(setLength(sk, g[1], 30, { fixed: p[2] })).toBe(true);
    expect(sk.pts[p[1]].y).toBeCloseTo(-10, 9);
    expect(sk.pts[p[2]].y).toBeCloseTo(20, 9);
    // the angle at b, turning the line to a
    expect(cornerAngle(sk, p[1])).toBeCloseTo(90, 6);
    expect(setAngle(sk, p[1], 120, g[0])).toBe(true);
    expect(cornerAngle(sk, p[1])).toBeCloseTo(120, 6);
  });

  it('fillet on a selected rectangle rounds four corners alike; with a smooth point it reports one skipped', () => {
    const sk = emptySketch();
    const r = stamp(sk, 'rect', { x: 0, y: 0 }, { w: 40, h: 30 });
    expect(setCorner(sk, r.pts, { r: 5 })).toBe(0);
    expect(r.pts.map((p) => sk.pts[p].r)).toEqual([5, 5, 5, 5]);
    expect(sketchState(sk).area).toBeCloseTo(1200 - 4 * (1 - Math.PI / 4) * 25, 0);
    const s2 = emptySketch();
    const r2 = stamp(s2, 'rect', { x: 0, y: 0 }, { w: 40, h: 30 });
    setSmooth(s2, [r2.pts[2]], true);
    expect(setCorner(s2, [r2.pts[0], r2.pts[2]], { r: 5 })).toBe(1);
  });

  it('paste lands clear of existing geometry and the copy can be deleted', () => {
    const sk = emptySketch();
    const a = stamp(sk, 'rect', { x: 0, y: 0 }, { size: 20 });
    stamp(sk, 'rect', { x: 15, y: -15 }, { size: 20 });
    const clip = copySel(sk, a)!;
    const d = pasteOffset(sk, clip);
    expect(Math.hypot(d.x, d.y)).toBeGreaterThan(10);
    const made = pasteClip(sk, clip, d);
    const mb = bounds(sk, made.pts)!;
    for (const other of [a.pts]) {
      const ob = bounds(sk, other)!;
      const touch = mb.min.x <= ob.max.x && ob.min.x <= mb.max.x && mb.min.y <= ob.max.y && ob.min.y <= mb.max.y;
      expect(touch).toBe(false);
    }
    expect(sketchState(sk).area).toBeGreaterThan(1000);
    expect(deleteSel(sk, made)).toBe(true);
    expect(Object.keys(sk.pts)).toHaveLength(8);
  });
});
