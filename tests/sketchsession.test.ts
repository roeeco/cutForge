// Milestone 57: the sketch view's session (its own history; the design changes only on Finish).
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../src/store/store';
import { kernel } from '../src/sculpt/kernel';
import { buildShape } from '../src/sculpt/build';
import { addShape, createWaffleDesign } from '../src/sculpt/ops';
import { sketchShape } from '../src/sculpt/sketch';
import { stamp, movePts, addLine } from '../src/sketch/ops';

const s = () => useStore.getState();
beforeAll(async () => {
  await kernel();
});

let ex = '';
beforeEach(() => {
  const d = createWaffleDesign();
  ex = addShape(d, sketchShape({ kind: 'floor' }, [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }], 'extrude', 10));
  s().replaceDesign(d);
});

describe('the sketch session', () => {
  it('open on a shape, edit, undo, redo, finish: one new step in the design\'s history, and the body changed', async () => {
    const k = await kernel();
    const before = s().design;
    const v0 = buildShape(k, before.sculpt!, ex).volume();
    s().openSketch(ex);
    expect(s().view).toBe('sketch');
    expect(s().sketch!.shapeId).toBe(ex);
    expect(Object.keys(s().sketch!.draft.pts)).toHaveLength(4);
    // moving a corner out: the design is untouched while sketching
    s().sketchEdit((sk) => void movePts(sk, ['p2'], 20, 0));
    s().sketchEdit((sk) => void movePts(sk, ['p1'], 20, 0));
    expect(s().design).toBe(before);
    expect(s().sketch!.past).toHaveLength(2);
    s().sketchUndo();
    expect(s().sketch!.draft.pts.p1.x).toBe(40);
    s().sketchRedo();
    expect(s().sketch!.draft.pts.p1.x).toBe(60);
    // a gesture's previews are one step
    s().sketchEdit((sk) => void movePts(sk, ['p3'], 1, 0), { preview: true });
    s().sketchEdit((sk) => void movePts(sk, ['p3'], 2, 0), { preview: true });
    s().sketchCommit();
    expect(s().sketch!.draft.pts.p3.x).toBe(2);
    expect(s().sketch!.past).toHaveLength(3);
    const pastLen = s().past.length;
    expect(s().finishSketch()).toBe(true);
    expect(s().view).toBe('3d');
    expect(s().sketch).toBeNull();
    expect(s().past.length).toBe(pastLen + 1);
    expect(s().past[s().past.length - 1]).toBe(before);
    const v1 = buildShape(k, s().design.sculpt!, ex).volume();
    expect(v1).toBeGreaterThan(v0);
    expect(s().selection).toMatchObject({ kind: 'shape', id: ex });
  });

  it('cancel leaves the design object identical', () => {
    const before = s().design;
    s().openSketch(ex);
    s().sketchEdit((sk) => void stamp(sk, 'circle', { x: 100, y: 0 }));
    s().cancelSketch();
    expect(s().design).toBe(before);
    expect(s().sketch).toBeNull();
    expect(s().view).toBe('3d');
  });

  it('a new sketch on an upright plane becomes a revolve only when chosen', async () => {
    const k = await kernel();
    s().setSculpt({ plane: { kind: 'upright', o: [0, 0, 50], ang: 0 } });
    s().openSketch(null);
    expect(s().sketch!.mode).toBe('extrude');
    expect(s().sketch!.tool).toBe('line');
    // nothing drawn: Finish is refused
    expect(s().finishSketch()).toBe(false);
    s().sketchEdit((sk) => void stamp(sk, 'rect', { x: 20, y: 15 }, { w: 20, h: 30 }));
    const n = Object.keys(s().design.sculpt!.shapes).length;
    expect(s().finishSketch()).toBe(true);
    const shapes = Object.values(s().design.sculpt!.shapes);
    expect(shapes).toHaveLength(n + 1);
    const made = shapes.find((x) => x.id !== ex)!;
    expect(made.kind).toBe('extrude');
    // again, as a revolve
    s().openSketch(null);
    s().sketchEdit((sk) => void stamp(sk, 'rect', { x: 20, y: 15 }, { w: 20, h: 30 }));
    s().setSketch({ mode: 'revolve' });
    expect(s().finishSketch()).toBe(true);
    const rv = Object.values(s().design.sculpt!.shapes).find((x) => x.kind === 'revolve')!;
    // a ring of square section about the plane's axis
    const want = Math.PI * (30 * 30 - 10 * 10) * 30;
    expect(Math.abs(buildShape(k, s().design.sculpt!, rv.id).volume() - want) / want).toBeLessThan(0.002);
  });

  it('a revolve that crosses its axis cannot be finished', () => {
    s().setSculpt({ plane: { kind: 'upright', o: [0, 0, 0], ang: 0 } });
    s().openSketch(null);
    s().sketchEdit((sk) => void stamp(sk, 'rect', { x: 0, y: 15 }, { w: 20, h: 30 }));
    s().setSketch({ mode: 'revolve' });
    expect(s().finishSketch()).toBe(false);
    expect(s().view).toBe('sketch');
  });

  it("the design's undo, a stage change and a new design close the session", () => {
    s().openSketch(ex);
    s().undo();
    expect(s().sketch).toBeNull();
    expect(s().view).toBe('3d');
    s().openSketch(ex);
    s().setSculpt({ stage: 'waffle' });
    expect(s().sketch).toBeNull();
    s().setSculpt({ stage: 'shape' });
    s().openSketch(ex);
    s().replaceDesign(createWaffleDesign());
    expect(s().sketch).toBeNull();
    expect(s().view).toBe('3d');
  });

  it('segments added through the session keep crossings shared', () => {
    s().openSketch(null);
    s().sketchEdit((sk) => void stamp(sk, 'rect', { x: 0, y: 0 }, { size: 20 }));
    s().sketchEdit((sk) => void addLine(sk, { x: 0, y: -20 }, { x: 0, y: 20 }));
    expect(Object.keys(s().sketch!.draft.pts)).toHaveLength(8);
  });
});
