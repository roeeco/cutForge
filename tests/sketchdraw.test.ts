// Milestone 58: the drawing tools, run as reducers on a plain sketch (no browser).
import { describe, expect, it } from 'vitest';
import { cloneSketch, emptySketch, degree, segsAt, type Sketch } from '../src/sketch/model';
import { initTool, step, type Env, type SkToolId, type ToolEv, type ToolState } from '../src/sketch/tools';
import { openEnds, sketchState } from '../src/sketch/regions';
import { tangentAt, arcOf } from '../src/sketch/flatten';
import { stamp } from '../src/sketch/ops';
import type { P2 } from '../src/model/types';

/** A sketch with its own history, as the store keeps it. */
function harness(sk: Sketch = emptySketch(), o: Partial<Env> = {}) {
  let cur = sk;
  const past: Sketch[] = [];
  let txn: Sketch | null = null;
  const env: Env = {
    sk: () => cur,
    edit: (fn) => {
      past.push(cloneSketch(cur));
      return fn(cur);
    },
    preview: (fn) => {
      txn ??= cloneSketch(cur);
      cur = cloneSketch(txn);
      fn(cur);
    },
    commit: () => {
      if (txn) past.push(txn);
      txn = null;
    },
    cancel: () => {
      if (txn) cur = txn;
      txn = null;
    },
    undo: () => {
      if (past.length) cur = past.pop()!;
    },
    mmPerPx: 0.1,
    grid: (x, alt) => (alt ? Math.round(x * 100) / 100 : Math.round(x)),
    smart: true,
    cons: false,
    ...o,
  };
  let s: ToolState = initTool('line');
  const api = {
    env,
    get sk() {
      return cur;
    },
    get s() {
      return s;
    },
    tool(t: SkToolId) {
      s = initTool(t);
    },
    ev(e: ToolEv) {
      s = step(s, e, env);
      return api;
    },
    click(x: number, y: number, mods = { shift: false, alt: false }) {
      api.ev({ t: 'move', p: { x, y }, mods });
      return api.ev({ t: 'click', p: { x, y }, mods });
    },
    key(k: string) {
      return api.ev({ t: 'key', key: k });
    },
    type(text: string) {
      for (const ch of text) api.key(ch);
      return api;
    },
  };
  return api;
}

const last = (sk: Sketch): P2 => {
  const ends = Object.keys(sk.pts).filter((p) => degree(sk, p) === 1);
  return sk.pts[ends[ends.length - 1]];
};

describe('the line tool', () => {
  it('four clicks and a click on the first point give a closed outline with four segments and a region', () => {
    const h = harness();
    h.click(0, 0).click(40, 0).click(40, 30).click(0, 30);
    expect(h.sk.order).toHaveLength(3);
    // within 12 px of the first point: it closes
    h.click(0.6, -0.5);
    expect(h.sk.order).toHaveLength(4);
    expect(h.s.chain).toBeNull();
    expect(openEnds(h.sk)).toHaveLength(0);
    expect(sketchState(h.sk).area).toBeCloseTo(1200, 6);
    // the tool stays on Line
    expect(h.s.tool).toBe('line');
  });

  it('Enter closes the chain the same way', () => {
    const h = harness();
    h.click(0, 0).click(40, 0).click(40, 30).key('Enter');
    expect(h.sk.order).toHaveLength(3);
    expect(sketchState(h.sk).area).toBeCloseTo(600, 6);
  });

  it('a right-click leaves it open with two open ends', () => {
    const h = harness();
    h.click(0, 0).click(40, 0).click(40, 30).ev({ t: 'right' });
    expect(h.s.chain).toBeNull();
    expect(openEnds(h.sk)).toHaveLength(2);
    expect(sketchState(h.sk).empty).toBe(true);
  });

  it('Esc ends the chain open, a second Esc asks for Select; Backspace removes the last point', () => {
    const h = harness();
    h.click(0, 0).click(40, 0).click(40, 30).click(0, 30);
    h.key('Backspace');
    expect(h.sk.order).toHaveLength(2);
    expect(Object.keys(h.sk.pts)).toHaveLength(3);
    h.key('Escape');
    expect(h.s.chain).toBeNull();
    expect(h.sk.order).toHaveLength(2);
    h.key('Escape');
    expect(h.s.done).toBe(true);
  });

  it('typed 50<30 puts the point at (43.30, 25.00) from the last one', () => {
    const h = harness();
    h.click(10, 5);
    h.type('50<30').key('Enter');
    const p = last(h.sk);
    expect(p.x - 10).toBeCloseTo(43.30, 2);
    expect(p.y - 5).toBeCloseTo(25.0, 6);
    // a sum, and the angle following the pointer when none is typed
    h.ev({ t: 'move', p: { x: p.x, y: p.y + 100 } });
    h.type('20+5').key('Enter');
    const q = last(h.sk);
    expect(q.x).toBeCloseTo(p.x, 6);
    expect(q.y - p.y).toBeCloseTo(25, 6);
  });

  it('Shift gives multiples of 15°; under Alt the point is not on the grid', () => {
    const h = harness();
    h.click(0, 0);
    h.click(50, 24, { shift: true, alt: false });
    const p = last(h.sk);
    const ang = (Math.atan2(p.y, p.x) * 180) / Math.PI;
    expect(Math.abs(ang / 15 - Math.round(ang / 15))).toBeLessThan(1e-9);
    const g = harness();
    g.click(0.37, 0.41, { shift: false, alt: true });
    g.click(20.33, 7.77, { shift: false, alt: true });
    const q = last(g.sk);
    expect(q.x).toBeCloseTo(20.33, 9);
    expect(q.y).toBeCloseTo(7.77, 9);
    expect(Number.isInteger(q.x)).toBe(false);
  });

  it('a line across a rectangle makes two points on its sides', () => {
    const sk = emptySketch();
    stamp(sk, 'rect', { x: 0, y: 0 }, { w: 40, h: 20 });
    const h = harness(sk);
    h.click(-5, -30).click(-5, 30).ev({ t: 'right' });
    const shared = Object.keys(h.sk.pts).filter((p) => degree(h.sk, p) === 4);
    expect(shared).toHaveLength(2);
    expect(shared.map((p) => h.sk.pts[p].y).sort((a, b) => a - b)).toEqual([-10, 10]);
  });

  it('construction lines', () => {
    const h = harness(emptySketch(), { cons: true });
    h.click(0, 0).click(30, 0).ev({ t: 'right' });
    expect(h.sk.segs[h.sk.order[0]].cons).toBe(true);
  });

  it('a click on another existing point joins it and ends the chain', () => {
    const sk = emptySketch();
    stamp(sk, 'rect', { x: 0, y: 0 }, { size: 20 });
    const h = harness(sk);
    h.click(50, 50).click(10, 10);
    expect(h.s.chain).toBeNull();
    const corner = Object.keys(h.sk.pts).find((p) => h.sk.pts[p].x === 10 && h.sk.pts[p].y === 10)!;
    expect(degree(h.sk, corner)).toBe(3);
  });
});

describe('the other tools', () => {
  it("an arc's third click gives the expected radius", () => {
    const h = harness();
    h.tool('arc');
    h.click(-20, 0).click(20, 0).click(0, -20);
    expect(h.sk.order).toHaveLength(1);
    const g = h.sk.segs[h.sk.order[0]];
    expect(g.k).toBe('arc');
    const f = arcOf(h.sk.pts[g.a], h.sk.pts[g.b], g.k === 'arc' ? g.bulge : 0);
    expect(f.r).toBeCloseTo(20, 9);
    // a second arc back on the same ends closes a circle
    h.click(20, 0).click(-20, 0).click(0, 20);
    expect(sketchState(h.sk).area).toBeCloseTo(Math.PI * 400, -1);
  });

  it('smooth curve through four clicked points closed on the first has no corner', () => {
    const h = harness();
    h.tool('smooth');
    h.click(0, 0).click(40, 0).click(40, 30).click(0, 30).click(0.3, 0.2);
    expect(h.s.chain).toBeNull();
    expect(h.sk.order).toHaveLength(4);
    for (const p of Object.keys(h.sk.pts)) {
      const [a, b] = segsAt(h.sk, p);
      const u = tangentAt(h.sk, a, p), v = tangentAt(h.sk, b, p);
      expect(u.x * v.x + u.y * v.y).toBeCloseTo(-1, 9);
    }
  });

  it('bezier: a drag sets the handle (mirrored in), a plain click a corner', () => {
    const h = harness();
    h.tool('bezier');
    h.ev({ t: 'down', p: { x: 0, y: 0 } }).ev({ t: 'click', p: { x: 0, y: 0 } });
    h.ev({ t: 'down', p: { x: 40, y: 0 } }).ev({ t: 'drag', p: { x: 50, y: 10 } }).ev({ t: 'up', p: { x: 50, y: 10 } });
    const g = h.sk.segs[h.sk.order[0]];
    expect(g.k).toBe('bez');
    if (g.k === 'bez') {
      expect(g.ha).toEqual({ x: 0, y: 0 });
      expect(g.hb).toEqual({ x: -10, y: -10 });
    }
    h.ev({ t: 'down', p: { x: 40, y: 40 } }).ev({ t: 'click', p: { x: 40, y: 40 } });
    const g2 = h.sk.segs[h.sk.order[1]];
    // the out-handle at (40, 0) continues the drag
    expect(g2.k === 'bez' && g2.ha).toEqual({ x: 10, y: 10 });
  });

  it('add/remove points: a click on a segment adds one, on a point removes it', () => {
    const sk = emptySketch();
    stamp(sk, 'rect', { x: 0, y: 0 }, { w: 40, h: 20 });
    const h = harness(sk);
    h.tool('points');
    h.click(5, -10);
    expect(Object.keys(h.sk.pts)).toHaveLength(5);
    h.click(5, -10);
    expect(Object.keys(h.sk.pts)).toHaveLength(4);
    expect(sketchState(h.sk).area).toBeCloseTo(800, 6);
  });

  it('erase: a point with its segments, a segment, and a box', () => {
    const sk = emptySketch();
    stamp(sk, 'rect', { x: 0, y: 0 }, { w: 40, h: 20 });
    stamp(sk, 'triangle', { x: 100, y: 0 });
    const h = harness(sk);
    h.tool('erase');
    h.click(20, 10);
    expect(Object.keys(h.sk.pts)).toHaveLength(6);
    h.click(0, -10);
    expect(h.sk.order).toHaveLength(4);
    h.ev({ t: 'down', p: { x: 80, y: -20 } }).ev({ t: 'drag', p: { x: 120, y: 20 } }).ev({ t: 'up', p: { x: 120, y: 20 } });
    expect(h.sk.order).toHaveLength(1);
  });

  it('tape measure changes nothing', () => {
    const h = harness();
    h.tool('tape');
    h.click(0, 0).click(30, 40);
    expect(h.s.tape.b).toEqual({ x: 30, y: 40 });
    expect(h.sk.order).toHaveLength(0);
  });

  it('select: an open end dragged onto another point is joined to it', () => {
    const h = harness();
    h.click(0, 0).click(40, 0).click(40, 30).click(0, 30).ev({ t: 'right' });
    expect(openEnds(h.sk)).toHaveLength(2);
    h.tool('select');
    h.ev({ t: 'down', p: { x: 0, y: 30 } }).ev({ t: 'drag', p: { x: 0.4, y: 0.3 } }).ev({ t: 'up', p: { x: 0.4, y: 0.3 } });
    // the dragged end and the first point are one now: a closed triangle
    expect(openEnds(h.sk)).toHaveLength(0);
    expect(Object.keys(h.sk.pts)).toHaveLength(3);
    expect(sketchState(h.sk).area).toBeCloseTo(600, 6);
  });
});
