// Milestone 44: dividers find their own ends (DIVIDERS_PLAN.md). A divider is a line drawn on a box's
// base; each end runs to the first board beyond where the line reached, passing (half-lapping) the
// dividers it crosses; the ends are found again on every edit.
import { describe, expect, it } from 'vitest';
import { addDividerLine, addRootPanel, addTray, autoConnect, baseJointOf, createDesign, deletePanel, growPanel, movePlaced, rotatePlaced, solve } from '../src/model/ops';
import { dividerSpanOf } from '../src/model/dividers';
import { compartments } from '../src/easy/objects';
import { MATERIALS } from '../src/model/materials';
import { validate } from '../src/model/validate';
import { parseProject, serializeProject } from '../src/model/serialize';
import type { Design, MaterialProfile } from '../src/model/types';

const [CARD, , CORR4, PLY] = MATERIALS;

/** A 160 × 110 box with finger (plywood) or folded (card, corrugated) walls standing on its edges. */
function box(m: MaterialProfile = PLY) {
  const d = createDesign(m);
  const base = addRootPanel(d, 0, 0, 160, 110);
  const kind = m.kind === 'plywood' ? 'finger' : 'fold';
  const walls = [0, 1, 2, 3].map((e) => growPanel(d, base, e, { height: 50, angle: 90, dir: 'up', kind })!.panelId);
  autoConnect(d);
  return { d, base, walls };
}
const edit = <T,>(d: Design, f: () => T): T => {
  const r = f();
  solve(d);
  autoConnect(d);
  return r;
};
/** The boards a divider's two ends meet (null: the base's edge), from its low end to its high end. */
const endsOf = (d: Design, id: string) => dividerSpanOf(d, id)!.ends.map((e) => e.board);
/** Joints between two boards that hold. */
const joined = (d: Design, a: string, b: string) => Object.values(d.connections).filter((c) => !c.broken && ((c.a.panelId === a && c.b.panelId === b) || (c.a.panelId === b && c.b.panelId === a)));

describe('a divider line finds its ends', () => {
  for (const m of [PLY, CARD, CORR4])
    it(`${m.id}: a line across the box runs wall to wall, joined to both and to the base`, () => {
      const { d, base, walls } = box(m);
      const [front, right, back, left] = walls;
      // drawn short of both walls: the ends still find them
      const a = edit(d, () => addDividerLine(d, base, { x: 30, y: 55 }, { x: 120, y: 55 }, 35))!;
      expect(a).toBeTruthy();
      expect(endsOf(d, a).sort()).toEqual([left, right].sort());
      // through to the walls' outer faces, so its tabs pass through them as before (the walls stand on the base's edges)
      expect(d.panels[a].w).toBeCloseTo(160, 6);
      expect(joined(d, a, left)).toHaveLength(1);
      expect(joined(d, a, right)).toHaveLength(1);
      expect(baseJointOf(d, a)).toBeTruthy();
      expect(validate(d).filter((i) => i.pair)).toEqual([]);
      void front;
      void back;
    });

  it('a short line in one compartment fills it and meets the divider as a T', () => {
    const { d, base, walls } = box();
    const [, , back] = walls;
    const a = edit(d, () => addDividerLine(d, base, { x: 10, y: 55 }, { x: 150, y: 55 }, 35))!;
    // above the first divider, stopping well short of both it and the back wall
    const b = edit(d, () => addDividerLine(d, base, { x: 80, y: 70 }, { x: 80, y: 95 }, 35))!;
    expect(endsOf(d, b).sort()).toEqual([a, back].sort());
    expect(joined(d, b, a).map((c) => c.kind)).toEqual(['tabslot']);
    expect(joined(d, b, back)).toHaveLength(1);
    // the two compartments above the first divider, and the one below
    expect(compartments(d, base)).toHaveLength(3);
    expect(validate(d).filter((i) => i.pair)).toEqual([]);
  });

  it('a line crossing a divider passes it with a half-lap and reaches the next board', () => {
    const { d, base, walls } = box();
    const [front, , back] = walls;
    const a = edit(d, () => addDividerLine(d, base, { x: 10, y: 55 }, { x: 150, y: 55 }, 35))!;
    const b = edit(d, () => addDividerLine(d, base, { x: 60, y: 40 }, { x: 60, y: 70 }, 35))!;
    expect(endsOf(d, b).sort()).toEqual([front, back].sort());
    expect(dividerSpanOf(d, b)!.crosses).toEqual([a]);
    expect(joined(d, a, b).map((c) => c.kind)).toEqual(['halflap']);
    expect(compartments(d, base)).toHaveLength(4);
    expect(validate(d).filter((i) => i.pair)).toEqual([]);
  });

  it('afterwards: moving the divider a T ends on stretches the T; deleting it runs the T on to the next wall', () => {
    const { d, base, walls } = box();
    const [front, , back] = walls;
    const a = edit(d, () => addDividerLine(d, base, { x: 10, y: 55 }, { x: 150, y: 55 }, 35))!;
    const b = edit(d, () => addDividerLine(d, base, { x: 80, y: 70 }, { x: 80, y: 95 }, 35))!;
    const w0 = d.panels[b].w;
    edit(d, () => movePlaced(d, a, 0, -10));
    expect(d.panels[b].w).toBeCloseTo(w0 + 10, 6);
    expect(joined(d, b, a)).toHaveLength(1);
    edit(d, () => deletePanel(d, a));
    expect(endsOf(d, b).sort()).toEqual([front, back].sort());
    expect(joined(d, b, front)).toHaveLength(1);
    expect(validate(d).filter((i) => i.pair)).toEqual([]);
  });

  it('turning a divider finds both ends again', () => {
    const { d, base, walls } = box();
    const [front, right, back, left] = walls;
    const a = edit(d, () => addDividerLine(d, base, { x: 40, y: 55 }, { x: 120, y: 55 }, 35))!;
    expect(endsOf(d, a).sort()).toEqual([left, right].sort());
    edit(d, () => rotatePlaced(d, a, 90));
    expect(endsOf(d, a).sort()).toEqual([front, back].sort());
    expect(d.panels[a].w).toBeCloseTo(110, 6);
  });

  it('a line off the base, or too short to stand, makes nothing', () => {
    const { d, base } = box();
    expect(addDividerLine(d, base, { x: -40, y: 55 }, { x: -10, y: 55 }, 35)).toBeNull();
    const n = d.order.length;
    expect(addDividerLine(d, base, { x: 1, y: 55 }, { x: 1.5, y: 55 }, 35)).toBeNull();
    expect(d.order.length).toBe(n);
  });

  it('an open side of a tray: the end stops at the base edge, unjoined there', () => {
    const d = createDesign(PLY);
    const base = addRootPanel(d, 0, 0, 160, 110);
    const t = edit(d, () => addTray(d, base, 50))!;
    // open the right side
    const right = Object.values(d.connections).find((c) => c.trayId === t && c.grown && c.a.edge === 'e1')!.b.panelId;
    edit(d, () => deletePanel(d, right));
    const a = edit(d, () => addDividerLine(d, base, { x: 30, y: 55 }, { x: 120, y: 55 }, 35))!;
    const ends = endsOf(d, a);
    expect(ends.filter((x) => x === null)).toHaveLength(1);
    expect(d.panels[a].w).toBeCloseTo(160, 6);
  });

  it('save and load keep what was drawn, and the same ends', () => {
    const { d, base } = box();
    const a = edit(d, () => addDividerLine(d, base, { x: 10, y: 55 }, { x: 150, y: 55 }, 35))!;
    const b = edit(d, () => addDividerLine(d, base, { x: 80, y: 70 }, { x: 80, y: 95 }, 35))!;
    const back = parseProject(serializeProject(d));
    expect(back.panels[b].divider).toEqual(d.panels[b].divider);
    expect(endsOf(back, b)).toEqual(endsOf(d, b));
    expect(back.panels[a].w).toBeCloseTo(d.panels[a].w, 9);
  });

  it('deleting the base takes its dividers with it', () => {
    const { d, base } = box();
    const a = edit(d, () => addDividerLine(d, base, { x: 10, y: 55 }, { x: 150, y: 55 }, 35))!;
    edit(d, () => deletePanel(d, base));
    expect(d.panels[a]).toBeUndefined();
  });
});
