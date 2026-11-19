// Milestone 103 (DIELINE_DNA_PLAN.md D0c): the transform frame's maths.
import { describe, expect, it } from 'vitest';
import { frameDrag, typedSize, fromOwn, type FrameBox } from '../src/views/frameScale';

const b: FrameBox = { cx: 50, cy: 40, w: 40, h: 20 };
const close = (a: FrameBox, e: Partial<FrameBox>) => {
  for (const [k, v] of Object.entries(e)) expect((a as Record<string, number>)[k], k).toBeCloseTo(v as number, 6);
};

describe('the transform frame', () => {
  it('a corner changes both directions and keeps the far corner', () => {
    // top-right corner (70, 50) dragged to (80, 60): the bottom-left (30, 30) stays
    const r = frameDrag(b, { kind: 'corner', at: { x: 20, y: 10 } }, { x: 80, y: 60 }, {});
    close(r, { w: 50, h: 30, cx: 55, cy: 45 });
  });
  it('with proportions kept, both scale alike by the direction moved furthest', () => {
    const r = frameDrag(b, { kind: 'corner', at: { x: 20, y: 10 } }, { x: 110, y: 52 }, { keep: true });
    close(r, { w: 80, h: 40 });
    // the far corner still stays
    close({ cx: r.cx - r.w / 2, cy: r.cy - r.h / 2, w: 0, h: 0 }, { cx: 30, cy: 30 });
  });
  it('a side changes one direction, centred across', () => {
    const r = frameDrag(b, { kind: 'side', at: { x: 20, y: 0 } }, { x: 90, y: 77 }, {});
    close(r, { w: 60, h: 20, cx: 60, cy: 40 });
    const k = frameDrag(b, { kind: 'side', at: { x: 20, y: 0 } }, { x: 90, y: 77 }, { keep: true });
    close(k, { w: 60, h: 30 });
  });
  it('Alt scales about the middle', () => {
    const r = frameDrag(b, { kind: 'corner', at: { x: 20, y: 10 } }, { x: 80, y: 60 }, { alt: true });
    close(r, { cx: 50, cy: 40, w: 60, h: 40 });
  });
  it('a turned shape scales along its own axes', () => {
    const t: FrameBox = { ...b, rot: 90 };
    // its own +x side is the board's +y direction
    const handle = fromOwn(t, { x: 20, y: 0 });
    expect(handle.x).toBeCloseTo(50, 6);
    expect(handle.y).toBeCloseTo(60, 6);
    const r = frameDrag(t, { kind: 'side', at: { x: 20, y: 0 } }, { x: 50, y: 70 }, {});
    close(r, { w: 50, h: 20, cx: 50, cy: 45 });
  });
  it('a circle keeps its proportions', () => {
    const c: FrameBox = { cx: 0, cy: 0, w: 20, h: 20 };
    const r = frameDrag(c, { kind: 'side', at: { x: 10, y: 0 } }, { x: 20, y: 0 }, { circle: true });
    close(r, { w: 30, h: 30 });
  });
  it('a typed 150% with and without proportions', () => {
    close(typedSize(b, 'w', 60, false), { w: 60, h: 20 });
    close(typedSize(b, 'w', 60, true), { w: 60, h: 30 });
  });
});
