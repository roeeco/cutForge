// Milestone 18: divider sets (automatic), dragged dividers, a divider between two faces.
import { describe, expect, it } from 'vitest';
import {
  addDividerBetween,
  addRootPanel,
  autoConnect,
  createDesign,
  growPanel,
  parentConnection,
  planDividerBetween,
  releaseDivider,
  respaceDividers,
  setDividerOffset,
  setDividerSet,
  setPanelSize,
  solve,
  type FacePick,
} from '../src/model/ops';
import { clearBox, memberOf } from '../src/model/dividers';
import { MATERIALS } from '../src/model/materials';
import { validate } from '../src/model/validate';
import { maxOverlap } from './solid';
import { toWorld } from '../src/model/frame';
import { parseProject, serializeProject } from '../src/model/serialize';
import type { Design, MaterialProfile } from '../src/model/types';

const [CARD, CORR16, CORR4, PLY] = MATERIALS;

function box(m: MaterialProfile, w = 160, h = 110, H = 50) {
  const d = createDesign(m);
  const base = addRootPanel(d, 0, 0, w, h);
  const kind = m.kind === 'plywood' ? 'finger' : 'fold';
  const walls = [0, 1, 2, 3].map((e) => growPanel(d, base, e, { height: H, angle: 90, dir: 'up', kind })!.panelId);
  autoConnect(d);
  return { d, base, walls };
}
const edit = (d: Design, f: (d: Design) => unknown) => {
  f(d);
  solve(d);
  autoConnect(d);
};
const members = (d: Design, axis: 'a' | 'l') => d.order.filter((id) => memberOf(d, id)?.axis === axis).sort((x, y) => memberOf(d, x)!.n - memberOf(d, y)!.n);
const offsets = (d: Design, ids: string[]) => ids.map((id) => parentConnection(d, id)!.offset);
const conns = (d: Design, a: string, b: string) => Object.values(d.connections).filter((c) => (c.a.panelId === a && c.b.panelId === b) || (c.a.panelId === b && c.b.panelId === a));
/** Compartment widths between consecutive slabs (walls' inner faces and dividers). */
function compartments(d: Design, base: string, axis: 'a' | 'l', extra: string[] = []) {
  const t = d.material.thickness;
  const box = clearBox(d, base)!;
  const ids = [...members(d, axis), ...extra];
  const offs = offsets(d, ids).sort((x, y) => x - y);
  const [lo, hi] = axis === 'a' ? [box.x0, box.x1] : [box.y0, box.y1];
  const out: number[] = [];
  let cur = lo;
  for (const o of offs) {
    out.push(o - cur);
    cur = o + t;
  }
  out.push(hi - cur);
  return out;
}

describe('divider sets', () => {
  it('a 2 × 3 set in a plywood box: even spacing, half-laps where they cross, no overlap, a clean check', () => {
    const { d, base } = box(PLY);
    let set = '';
    edit(d, (x) => void (set = setDividerSet(x, base, { across: 2, along: 3 })!));
    expect(members(d, 'a')).toEqual([`${set}/a1`, `${set}/a2`]);
    expect(members(d, 'l')).toHaveLength(3);
    for (const c of compartments(d, base, 'a')) expect(c).toBeCloseTo(compartments(d, base, 'a')[0], 9);
    for (const c of compartments(d, base, 'l')) expect(c).toBeCloseTo(compartments(d, base, 'l')[0], 9);
    const laps = Object.values(d.connections).filter((c) => c.kind === 'halflap');
    expect(laps).toHaveLength(6);
    expect(Object.values(d.connections).some((c) => c.broken)).toBe(false);
    expect(validate(d)).toEqual([]);
    expect(maxOverlap(d, [-1, 0, -111], [161, 51, 1], 0.9)).toBeLessThanOrEqual(1);
    // the set is saved with the project
    const back = parseProject(serializeProject(d));
    expect(back.dividerSets![set].across).toBe(2);
    expect(members(back, 'l')).toHaveLength(3);
  });

  it('changing the box width re-spaces the set; changing a count re-spaces it', () => {
    const { d, base } = box(PLY);
    edit(d, (x) => void setDividerSet(x, base, { across: 2, along: 1 }));
    const before = compartments(d, base, 'a');
    edit(d, (x) => setPanelSize(x, base, 220, undefined));
    const after = compartments(d, base, 'a');
    expect(after[0]).toBeGreaterThan(before[0] + 15);
    for (const c of after) expect(c).toBeCloseTo(after[0], 9);
    edit(d, (x) => void setDividerSet(x, base, { across: 4 }));
    expect(members(d, 'a')).toHaveLength(4);
    const four = compartments(d, base, 'a');
    for (const c of four) expect(c).toBeCloseTo(four[0], 9);
    expect(validate(d)).toEqual([]);
  });

  it('by compartment size: compartments of the size, the last takes the rest', () => {
    const { d, base } = box(PLY, 160, 110);
    edit(d, (x) => void setDividerSet(x, base, { across: 1, along: 0, mode: 'size', size: 40 }));
    const cs = compartments(d, base, 'a');
    // clear 154 mm: 40 + 3 + 40 + 3 + 40 + 3 + 25 (the last takes the rest)
    expect(cs.slice(0, -1).every((c) => Math.abs(c - 40) < 1e-9)).toBe(true);
    expect(cs[cs.length - 1]).toBeGreaterThanOrEqual(0);
    expect(members(d, 'a')).toHaveLength(3);
  });

  it('dragging one divider takes it out of the set, the rest re-space; Space evenly again brings it back', () => {
    const { d, base } = box(PLY);
    let set = '';
    edit(d, (x) => void (set = setDividerSet(x, base, { across: 3, along: 0 })!));
    const [a1, a2, a3] = members(d, 'a');
    void a1;
    void a3;
    let loose = '';
    edit(d, (x) => {
      loose = releaseDivider(x, a2, 'p_dragged');
      setDividerOffset(x, loose, 30);
    });
    expect(d.panels['p_dragged']).toBeTruthy();
    expect(parentConnection(d, 'p_dragged')!.offset).toBe(30);
    expect(d.dividerSets![set].across).toBe(2);
    expect(d.dividerSets![set].loose).toEqual(['p_dragged']);
    // the other two are evenly spaced (the dragged one is not part of the spacing)
    const two = compartments(d, base, 'a');
    expect(two).toHaveLength(3);
    for (const c of two) expect(c).toBeCloseTo(two[0], 9);
    expect(Object.values(d.connections).some((c) => c.broken)).toBe(false);
    edit(d, (x) => respaceDividers(x, set));
    expect(members(d, 'a')).toHaveLength(3);
    expect(d.panels['p_dragged']).toBeUndefined();
    const three = compartments(d, base, 'a');
    for (const c of three) expect(c).toBeCloseTo(three[0], 9);
  });

  for (const m of [CARD, CORR16, CORR4])
    it(`${m.id}: dividers slide in with clearance, no wall slots, half-laps where they cross`, () => {
      const { d, base, walls } = box(m);
      edit(d, (x) => void setDividerSet(x, base, { across: 2, along: 1 }));
      const divs = [...members(d, 'a'), ...members(d, 'l')];
      for (const w of walls) for (const v of divs) for (const c of conns(d, w, v)) expect(c.kind).toBe('slide');
      // no slots in the walls from the dividers' joints
      const wallHoles = Object.values(d.connections)
        .filter((c) => divs.includes(c.a.panelId) || divs.includes(c.b.panelId))
        .flatMap((c) => c.geom?.holes ?? [])
        .filter((h) => walls.includes(h.panelId));
      expect(wallHoles).toHaveLength(0);
      expect(Object.values(d.connections).filter((c) => c.kind === 'halflap')).toHaveLength(2);
      expect(Object.values(d.connections).some((c) => c.broken)).toBe(false);
      expect(validate(d).filter((i) => i.pair)).toEqual([]);
    });
});

describe('a divider between two faces', () => {
  /** Pick the inner face of a wall at a point (its material side faces the box's inside). */
  const pick = (d: Design, id: string, x: number, y: number): FacePick => {
    const p = d.panels[id];
    return { panelId: id, side: 1, point: toWorld(p.frame, x, y, d.material.thickness) };
  };

  for (const m of [PLY, CARD, CORR4])
    it(`${m.id}: two opposite inner wall faces make a divider joined at both ends`, () => {
      const { d, walls } = box(m);
      const [, right, , left] = walls;
      const a = pick(d, left, 40, 20), b = pick(d, right, 70, 20);
      const plan = planDividerBetween(d, a, b);
      expect(plan.ok).toBe(true);
      let div = '';
      edit(d, (x) => void (div = addDividerBetween(x, a, b)!));
      expect(div).toBeTruthy();
      expect(conns(d, div, left).filter((c) => !c.broken)).toHaveLength(1);
      expect(conns(d, div, right).filter((c) => !c.broken)).toHaveLength(1);
      // square to both walls (from the front or back edge), its mid-plane through the second click
      const c = parentConnection(d, div)!;
      expect(['e0', 'e2']).toContain(c.a.edge);
      const P = d.panels[div];
      const mid = toWorld(P.frame, 0, 0, m.thickness / 2);
      const n = [P.frame.u[1] * P.frame.v[2] - P.frame.u[2] * P.frame.v[1], P.frame.u[2] * P.frame.v[0] - P.frame.u[0] * P.frame.v[2], P.frame.u[0] * P.frame.v[1] - P.frame.u[1] * P.frame.v[0]];
      expect(Math.abs((b.point[0] - mid[0]) * n[0] + (b.point[1] - mid[1]) * n[1] + (b.point[2] - mid[2]) * n[2])).toBeLessThan(0.06);
      expect(validate(d).filter((i) => i.pair)).toEqual([]);
      if (m.kind !== 'plywood')
        expect(Object.values(d.connections).filter((x) => x.a.panelId === div || x.b.panelId === div).flatMap((x) => x.geom?.holes ?? []).filter((h) => walls.includes(h.panelId))).toHaveLength(0);
    });

  it('faces that are not parallel, not facing, or not on the same base are refused with the reason', () => {
    const { d, walls } = box(PLY);
    const [front, right, back, left] = walls;
    expect(planDividerBetween(d, pick(d, left, 40, 20), pick(d, front, 40, 20))).toEqual({ ok: false, reason: 'notParallel' });
    // the outer face of the left wall and the inner face of the right: same direction, not facing each other
    const outer = { ...pick(d, left, 40, 20), side: -1 as const, point: toWorld(d.panels[left].frame, 40, 20, 0) };
    expect(planDividerBetween(d, outer, pick(d, right, 40, 20))).toEqual({ ok: false, reason: 'notFacing' });
    // a wall of another box
    const other = addRootPanel(d, 300, 0, 100, 100);
    const ow = growPanel(d, other, 1, { height: 50, angle: 90, dir: 'up', kind: 'finger' })!.panelId;
    void back;
    const r = planDividerBetween(d, pick(d, left, 40, 20), { panelId: ow, side: 1, point: toWorld(d.panels[ow].frame, 40, 20, 3) });
    expect(r.ok).toBe(false);
  });
});

describe('emptying a set', () => {
  it('counts of 0 and 0 remove the set and its dividers; hand-placed ones stay', () => {
    const d = createDesign(PLY);
    const base = addRootPanel(d, 0, 0, 160, 110);
    for (const e of [0, 1, 2, 3]) growPanel(d, base, e, { height: 50, angle: 90, dir: 'up', kind: 'finger' });
    autoConnect(d);
    let set = '';
    edit(d, (x) => void (set = setDividerSet(x, base, { across: 2, along: 1 })!));
    edit(d, (x) => void releaseDivider(x, `${set}/a1`, 'p_hand'));
    edit(d, (x) => void setDividerSet(x, base, { across: 0, along: 0 }));
    expect(d.dividerSets?.[set]).toBeUndefined();
    expect(d.order.filter((id) => id.startsWith(set + '/'))).toEqual([]);
    expect(d.panels['p_hand']).toBeTruthy();
    expect(validate(d)).toEqual([]);
  });
});

describe('dragging a divider snaps', () => {
  it('to equal compartments either side, even spacing of the row, and a neighbouring compartment width', async () => {
    const { snapDividerOffset } = await import('../src/model/dividers');
    const row = { lo: 3, hi: 157, others: [60] };
    // between the left wall (3) and the other divider (60): equal halves at (3 + 60 − 3) / 2 = 30
    expect(snapDividerOffset(row, 31, 3, 2)).toBeCloseTo(30, 9);
    // even spacing of two dividers (this one and one at 100) in 154 mm: 3 + 49.33 = 52.33 (and 104.67)
    expect(snapDividerOffset({ lo: 3, hi: 157, others: [100] }, 53, 3, 1)).toBeCloseTo(3 + 148 / 3, 9);
    // nothing near
    expect(snapDividerOffset(row, 20, 3, 1)).toBeNull();
  });
});
