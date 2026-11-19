// Milestone 75 (UI_CLEANUP_PLAN.md Part 2): one Shapes tool, footprint × operator, over the existing ops.
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore, type ShapeFoot } from '../src/store/store';
import { shapeOf } from '../src/ui/Toolbar';
import { addPlacedOutline, addRootPanel, createDesign } from '../src/model/ops';
import { toWorld } from '../src/model/frame';
import { MATERIALS } from '../src/model/materials';
import { tOf } from '../src/model/materials';

const s = () => useStore.getState();
beforeEach(() => {
  s().replaceDesign(createDesign());
  s().setView('3d');
  s().setTool('select');
  useStore.setState({ shapeBoard: true, shapeFoot: 'rect' });
});

describe('the Shapes tool', () => {
  const cases: [ShapeFoot, boolean, string, string?][] = [
    ['rect', true, 'panel'],
    ['rounded', true, 'polygon', 'rounded'],
    ['circle', true, 'polygon', 'round'],
    ['polygon', true, 'polygon', 'click'],
    ['regular', true, 'polygon', 'ngon'],
    ['rect', false, 'rect'],
    ['rounded', false, 'roundrect'],
    ['circle', false, 'circle'],
    ['polygon', false, 'polygon', 'click'],
    ['regular', false, 'polygon', 'ngon'],
  ];
  it('Line (milestone 84) draws with the polygon tool, open', () => {
    s().chooseShape('line');
    expect(s().tool).toBe('polygon');
    expect(s().polyMode).toBe('line');
    expect(shapeOf(s().tool, s().polyMode, s().shapeBoard)).toEqual({ foot: 'line', board: false });
  });
  it.each(cases)('%s with Board %s draws with the %s tool', (foot, board, tool, mode) => {
    s().chooseShape(foot, board);
    expect(s().tool).toBe(tool);
    if (mode) expect(s().polyMode).toBe(mode);
    // and the rail reads it back
    expect(shapeOf(s().tool, s().polyMode, s().shapeBoard)).toEqual({ foot, board });
  });

  it('a fresh session starts on Board; the footprint keeps the operator and the operator keeps the footprint', () => {
    expect(s().shapeBoard).toBe(true);
    s().chooseShape('circle');
    expect(s().tool).toBe('polygon');
    s().chooseShape(undefined, false);
    expect(s().tool).toBe('circle');
    s().chooseShape('rounded');
    expect(s().tool).toBe('roundrect');
  });

  it('on the cut plan there is no Board and no polygon', () => {
    s().setView('2d');
    s().chooseShape('circle', true);
    expect(s().tool).toBe('circle');
    s().chooseShape('polygon');
    expect(s().tool).toBe('circle');
  });
});

describe('a board of any footprint lying on a board', () => {
  it.each(['poly', 'round', 'rounded'] as const)('%s: placed on the host face, flush, and part of the design', (kind) => {
    const d = createDesign(MATERIALS[3]);
    const host = addRootPanel(d, 0, 0, 200, 150);
    const shape =
      kind === 'poly'
        ? { kind, pts: [{ x: 20, y: 20 }, { x: 90, y: 30 }, { x: 60, y: 90 }] }
        : kind === 'round'
          ? { kind, x: 30, y: 40, w: 60, h: 60, round: { shape: 'circle' as const } }
          : { kind, x: 30, y: 40, w: 80, h: 50, r: 10 };
    const id = addPlacedOutline(d, host, 1, shape)!;
    expect(id).toBeTruthy();
    const p = d.panels[id];
    expect(p.place).toMatchObject({ host, face: 1, pose: 'flat' });
    expect(p.sketch.kind).toBe('poly');
    if (kind === 'round') expect(p.sketch.kind === 'poly' && p.sketch.round?.shape).toBe('circle');
    // its origin lies on the host's top face at the drawn corner
    const H = d.panels[host];
    const want = kind === 'poly' ? toWorld(H.frame, 20, 20, tOf(d, host)) : toWorld(H.frame, 30, 40, tOf(d, host));
    p.frame.o.forEach((v, i) => expect(v).toBeCloseTo(want[i], 6));
    expect(d.order).toContain(id);
  });

  it('refuses a polygon that crosses itself', () => {
    const d = createDesign();
    const host = addRootPanel(d, 0, 0, 200, 150);
    expect(addPlacedOutline(d, host, 1, { kind: 'poly', pts: [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 50, y: 0 }, { x: 0, y: 50 }] })).toBeNull();
  });
});
