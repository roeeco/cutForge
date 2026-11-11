// Milestone 44: dividers find their own ends (DIVIDERS_PLAN.md). A divider is a line drawn on a box's
// base; each end runs to the first board beyond where the line reached, passing (half-lapping) the
// dividers it crosses; the ends are found again on every edit.
import { describe, expect, it } from 'vitest';
import { addDividerLine, addPolygonPanel, addRootPanel, addTray, regularPolygon, autoConnect, baseJointOf, createDesign, deletePanel, growPanel, movePlaced, rotatePlaced, solve } from '../src/model/ops';
import { dividerEnds, dividerGrid, dividerSpanOf, snapDividerLine, stepDividerEnd } from '../src/model/dividers';
import { compartments } from '../src/easy/objects';
import { panelEdges } from '../src/model/edges';
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

describe('dividers at an angle', () => {
  /** The extent of a slot along its board's x (where the divider passes along the wall). */
  const slotWidths = (d: Design, cid: string, on: string) => (d.connections[cid].geom?.holes ?? []).filter((h) => h.panelId === on).map((h) => Math.max(...h.poly.map((q) => q.x)) - Math.min(...h.poly.map((q) => q.x)));
  const ends = (d: Design, id: string, walls: string[]) => Object.values(d.connections).filter((c) => !c.grown && c.a.panelId === id && walls.includes(c.b.panelId));

  for (const deg of [45, 60])
    it(`${deg}°: its slots in the walls are widened for the angle (t / sin α + t_wall · cot α + clearance)`, () => {
      const { d, base, walls } = box();
      const a = (deg * Math.PI) / 180;
      const b = edit(d, () => addDividerLine(d, base, { x: 80 - 20 * Math.cos(a), y: 55 - 20 * Math.sin(a) }, { x: 80 + 20 * Math.cos(a), y: 55 + 20 * Math.sin(a) }, 35))!;
      const t = PLY.thickness, cl = PLY.clearance;
      const want = t / Math.sin(a) + t * Math.cos(a) / Math.sin(a) + cl;
      const es = ends(d, b, walls);
      expect(es.map((c) => c.kind)).toEqual(['tabslot', 'tabslot']);
      for (const c of es) {
        const ws = slotWidths(d, c.id, c.b.panelId);
        expect(ws.length).toBeGreaterThan(0);
        for (const w of ws) expect(w).toBeCloseTo(want, 6);
      }
      expect(validate(d)).toEqual([]);
    });

  it('45°: crossing a divider, both half-lap slots are widened by the same rule', () => {
    const { d, base } = box();
    const a = edit(d, () => addDividerLine(d, base, { x: 10, y: 55 }, { x: 150, y: 55 }, 35))!;
    const b = edit(d, () => addDividerLine(d, base, { x: 50, y: 35 }, { x: 90, y: 75 }, 35))!;
    const hl = joined(d, a, b);
    expect(hl.map((c) => c.kind)).toEqual(['halflap']);
    const t = PLY.thickness, cl = PLY.clearance, s = Math.SQRT1_2;
    const want = t / s + t * 1 + cl;
    for (const e of hl[0].geom!.edges) for (const n of e.notches) expect(n.s1 - n.s0).toBeCloseTo(want, 6);
    expect(validate(d)).toEqual([]);
  });

  it('a hexagon box: a divider from one slanted wall to the opposite one is joined at both ends', () => {
    const d = createDesign(PLY);
    const base = edit(d, () => addPolygonPanel(d, 0, 0, regularPolygon(6, 80))!);
    edit(d, () => addTray(d, base, 50));
    // across the hexagon, 20 mm off its centre (through the centre it would end in two corners): it meets two walls at 60°
    const xs = panelEdges(d.panels[base]).map((e) => e.a.x), ys = panelEdges(d.panels[base]).map((e) => e.a.y);
    const c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 + 20 };
    const id = edit(d, () => addDividerLine(d, base, { x: c.x - 20, y: c.y }, { x: c.x + 20, y: c.y }, 30))!;
    expect(id).toBeTruthy();
    const ends2 = Object.values(d.connections).filter((x) => !x.grown && (x.a.panelId === id || x.b.panelId === id) && x.id !== baseJointOf(d, id)?.id);
    expect(ends2.filter((x) => !x.broken)).toHaveLength(2);
    expect(validate(d).filter((i) => i.pair)).toEqual([]);
  });

  it('a line meeting a board at less than 30° is refused: no laser-cut joint can hold it', () => {
    const { d, base } = box();
    edit(d, () => addDividerLine(d, base, { x: 10, y: 55 }, { x: 150, y: 55 }, 35));
    const a = (20 * Math.PI) / 180;
    // a short line above the first divider, heading down onto it at 20°
    const n = d.order.length;
    expect(addDividerLine(d, base, { x: 80, y: 70 }, { x: 80 + 20 * Math.cos(a), y: 70 + 20 * Math.sin(a) }, 35)).toBeNull();
    expect(d.order.length).toBe(n);
  });
});

describe('drawing a divider: a regular grid, Shift for 30° steps, Alt for any angle', () => {
  const ang = (l: { a: { x: number; y: number }; b: { x: number; y: number } }) => (Math.atan2(l.b.y - l.a.y, l.b.x - l.a.x) * 180) / Math.PI;

  it('with no divider yet, the line snaps along or across the box', () => {
    const { d, base } = box();
    expect(dividerGrid(d, base)).toEqual({ grid: 0, box: 0 });
    // drawn 10° off: along the box; 80°: across it
    expect(ang(snapDividerLine(d, base, { x: 40, y: 40 }, { x: 40 + 40 * Math.cos(0.17), y: 40 + 40 * Math.sin(0.17) }, 'grid', 0))).toBeCloseTo(0, 9);
    expect(ang(snapDividerLine(d, base, { x: 40, y: 20 }, { x: 40 + 40 * Math.cos(1.4), y: 20 + 40 * Math.sin(1.4) }, 'grid', 0))).toBeCloseTo(90, 9);
  });

  it('the first divider sets the grid: the next ones follow it, even at 30°', () => {
    const { d, base } = box();
    const a30 = Math.PI / 6;
    // the first one with Shift: 30° steps from the box's axis
    const l1 = snapDividerLine(d, base, { x: 60, y: 30 }, { x: 60 + 50 * Math.cos(0.55), y: 30 + 50 * Math.sin(0.55) }, 'steps30', 0);
    expect(ang(l1)).toBeCloseTo(30, 9);
    edit(d, () => addDividerLine(d, base, l1.a, l1.b, 35));
    expect(dividerGrid(d, base).grid).toBeCloseTo(30, 9);
    // the next one, drawn about square to it, snaps square to it (120°)
    const l2 = snapDividerLine(d, base, { x: 100, y: 30 }, { x: 100 + 40 * Math.cos(a30 + 1.5), y: 30 + 40 * Math.sin(a30 + 1.5) }, 'grid', 0);
    expect(ang(l2)).toBeCloseTo(120, 9);
    // Shift overrides it: back onto the box's axes
    const l3 = snapDividerLine(d, base, { x: 30, y: 80 }, { x: 70, y: 82 }, 'steps30', 0);
    expect(ang(l3)).toBeCloseTo(0, 9);
    // Alt: as drawn
    const l4 = snapDividerLine(d, base, { x: 30, y: 80 }, { x: 70, y: 87 }, 'free', 0);
    expect(ang(l4)).toBeCloseTo((Math.atan2(7, 40) * 180) / Math.PI, 9);
  });

  it('its position snaps to the middle of its compartment and in line with a parallel divider', () => {
    const { d, base } = box();
    const t = PLY.thickness;
    // 3 mm off the middle of the box (inside 3 … 107), within reach: it lands on the middle
    const l = snapDividerLine(d, base, { x: 30, y: 58 }, { x: 120, y: 58 }, 'grid', 5);
    expect(l.a.y).toBeCloseTo(55, 6);
    // a divider across the box splits it; a short one in the left part lines up with a parallel one in the right part
    edit(d, () => addDividerLine(d, base, { x: 80, y: 10 }, { x: 80, y: 100 }, 35));
    edit(d, () => addDividerLine(d, base, { x: 100, y: 40 }, { x: 140, y: 40 }, 35));
    const m = snapDividerLine(d, base, { x: 20, y: 42 }, { x: 60, y: 42 }, 'grid', 3);
    expect(m.a.y).toBeCloseTo(40, 6);
    void t;
  });
});

describe('a divider’s ends on its card', () => {
  it('‹ › stop an end a board sooner or let it reach a board further', () => {
    const { d, base, walls } = box();
    const [, , back] = walls;
    const a = edit(d, () => addDividerLine(d, base, { x: 10, y: 55 }, { x: 150, y: 55 }, 35))!;
    const b = edit(d, () => addDividerLine(d, base, { x: 80, y: 70 }, { x: 80, y: 95 }, 35))!;
    const ends = dividerEnds(d, b)!;
    // its low end meets the first divider (it could reach past it); its high end the back wall (it cannot)
    const lowEnd = ends.findIndex((e) => e.board === a) as 0 | 1;
    expect(ends[lowEnd]).toEqual({ board: a, less: false, more: true });
    expect(ends[1 - lowEnd]).toEqual({ board: back, less: false, more: false });
    edit(d, () => stepDividerEnd(d, b, lowEnd, 1));
    expect(dividerSpanOf(d, b)!.crosses).toEqual([a]);
    expect(joined(d, a, b).map((c) => c.kind)).toEqual(['halflap']);
    const after = dividerEnds(d, b)!;
    expect(after[lowEnd].less).toBe(true);
    edit(d, () => stepDividerEnd(d, b, lowEnd, -1));
    expect(dividerEnds(d, b)![lowEnd].board).toBe(a);
    expect(joined(d, a, b).map((c) => c.kind)).toEqual(['tabslot']);
  });
});
