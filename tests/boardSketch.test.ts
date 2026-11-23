// Sketching on a board's face in Workshop (src/sketch/boardSketch.ts): what Finish makes, and which way round.
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../src/store/store';
import { addRootPanel, createDesign } from '../src/model/ops';
import { boardSketchBlock, boardUnderlay, mirroredFrom, writeBoardSketch, type BoardSketch } from '../src/sketch/boardSketch';
import { MATERIALS } from '../src/model/materials';
import type { Design, SketchGraph } from '../src/model/types';

const PLY = MATERIALS[3];
const s = () => useStore.getState();

/** A closed rectangle in sketch coordinates. */
function rect(x0: number, y0: number, x1: number, y1: number): SketchGraph {
  const P = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const g: SketchGraph = { pts: {}, segs: {}, order: [] };
  P.forEach(([x, y], i) => (g.pts[`q${i}`] = { x, y }));
  for (let i = 0; i < 4; i++) {
    g.segs[`s${i}`] = { a: `q${i}`, b: `q${(i + 1) % 4}`, k: 'line' };
    g.order.push(`s${i}`);
  }
  return g;
}
const both = (a: SketchGraph, b: SketchGraph): SketchGraph => {
  const g: SketchGraph = JSON.parse(JSON.stringify(a));
  for (const [k, v] of Object.entries(b.pts)) g.pts[`b${k}`] = v;
  for (const id of b.order) {
    const sg = b.segs[id];
    g.segs[`b${id}`] = { ...sg, a: `b${sg.a}`, b: `b${sg.b}` };
    g.order.push(`b${id}`);
  }
  return g;
};

let d: Design, base: string;
beforeEach(() => {
  d = createDesign(PLY);
  base = addRootPanel(d, 0, 0, 200, 120);
});
const sk = (o: Partial<BoardSketch> = {}): BoardSketch => ({ panelId: base, side: 1, mirror: false, op: 'cut', through: false, ...o });

describe('a sketch on a board’s face', () => {
  it('makes a shape of the kind chosen where it was drawn, keeping the sketch editable', () => {
    for (const op of ['cut', 'engrave', 'score', 'add'] as const) {
      const r = writeBoardSketch(d, sk({ op }), rect(20, 30, 60, 50))!;
      expect(r.kind).toBe('detail');
      const dt = d.panels[base].details.find((x) => x.id === r.id)!;
      expect([dt.op, dt.cx, dt.cy, dt.w, dt.h]).toEqual([op, 40, 40, 40, 20]);
      expect(dt.sketch).toBeTruthy();
    }
  });

  it('seen mirrored, is written back the right way round', () => {
    const r = writeBoardSketch(d, sk({ mirror: true }), rect(-60, 30, -20, 50))!;
    const dt = d.panels[base].details.find((x) => x.id === r.id)!;
    expect([dt.cx, dt.cy]).toEqual([40, 40]);
    // and the board under it is shown mirrored
    const xs = boardUnderlay(d, { panelId: base, mirror: true })[0].map((p) => p.x);
    expect(Math.max(...xs)).toBeCloseTo(0, 6);
    expect(Math.min(...xs)).toBeCloseTo(-200, 6);
  });

  it('a face reads left to right when its side and the frame’s agree', () => {
    expect(mirroredFrom(1, 1)).toBe(false);
    expect(mirroredFrom(-1, -1)).toBe(false);
    expect(mirroredFrom(1, -1)).toBe(true);
    expect(mirroredFrom(-1, 1)).toBe(true);
  });

  it('a cut through the whole design when asked', () => {
    const r = writeBoardSketch(d, sk({ through: true }), rect(20, 30, 60, 50))!;
    expect(d.panels[base].details.find((x) => x.id === r.id)!.through).toBe(true);
  });

  it('a board of its own lying on the face, from one outline only', () => {
    const r = writeBoardSketch(d, sk({ op: 'board' }), rect(20, 30, 60, 50))!;
    expect(r.kind).toBe('panel');
    const p = d.panels[r.id];
    expect([p.place?.host, p.place?.face, Math.round(p.w), Math.round(p.h)]).toEqual([base, 1, 40, 20]);
    expect(boardSketchBlock(both(rect(0, 0, 10, 10), rect(20, 0, 30, 10)), 'board')).toBe('oneOutline');
    expect(boardSketchBlock(both(rect(0, 0, 10, 10), rect(20, 0, 30, 10)), 'cut')).toBeNull();
    expect(boardSketchBlock({ pts: {}, segs: {}, order: [] }, 'cut')).toBe('empty');
  });

  it('through the store: Finish makes it, selects it and goes back to 3D; one undo takes it away', () => {
    s().setPrefs({ mode: 'workshop' });
    s().replaceDesign(d);
    s().setView('3d');
    s().openBoardSketch(base, 1);
    expect(s().view).toBe('sketch');
    expect(s().sketch?.board?.panelId).toBe(base);
    s().sketchEdit((g) => void Object.assign(g, rect(20, 30, 60, 50)));
    expect(s().finishSketch()).toBe(true);
    expect(s().view).toBe('3d');
    expect(s().selection?.kind).toBe('detail');
    expect(s().design.panels[base].details).toHaveLength(1);
    s().undo();
    expect(s().design.panels[base].details).toHaveLength(0);
  });
});
