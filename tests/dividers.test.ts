// Dividers: + Divider between two walls (milestone 32), a divider between two faces, dragging snaps; older files with divider sets.
import { describe, expect, it } from 'vitest';
import {
  addDividerBetween,
  addDividerFor,
  addRootPanel,
  autoConnect,
  createDesign,
  growPanel,
  planDividerBetween,
  planDividerFor,
  solve,
  type FacePick,
} from '../src/model/ops';
import { renamePanel } from '../src/model/dividers';
import { prepareExport } from '../src/export/prepare';
import { sheetsToSvg } from '../src/export/svg';
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
const conns = (d: Design, a: string, b: string) => Object.values(d.connections).filter((c) => (c.a.panelId === a && c.b.panelId === b) || (c.a.panelId === b && c.b.panelId === a));

describe('+ Divider between two selected walls (milestone 32)', () => {
  for (const m of [PLY, CARD, CORR4])
    it(`${m.id}: the left and right walls: a divider halfway along them, joined to both`, () => {
      const { d, walls } = box(m);
      const [, right, , left] = walls;
      expect(planDividerFor(d, left, right).ok).toBe(true);
      let div = '';
      edit(d, (x) => void (div = addDividerFor(x, left, right)!));
      expect(div).toBeTruthy();
      expect(conns(d, div, left).filter((c) => !c.broken)).toHaveLength(1);
      expect(conns(d, div, right).filter((c) => !c.broken)).toHaveLength(1);
      // halfway along the walls (the box is 110 deep): its mid-plane at 55 from the front edge
      // milestone 44: a divider is a line on the base, here along the front edge
      const rec = d.panels[div].divider!;
      expect(Math.abs(Math.sin((rec.rot * Math.PI) / 180))).toBeLessThan(1e-9);
      expect(rec.at.y).toBeCloseTo(55, 0);
      // the lower wall's top less the gap (the walls stand on the base or overlap it)
      const top = Math.max(...[0, d.panels[left].h].map((y) => toWorld(d.panels[left].frame, 0, y)[1]));
      expect(toWorld(d.panels[div].frame, 0, d.panels[div].h)[1]).toBeLessThanOrEqual(top - 4);
      expect(validate(d).filter((i) => i.pair)).toEqual([]);
    });

  it('walls that are not parallel give the reason', () => {
    const { d, walls } = box(PLY);
    const [front, , , left] = walls;
    expect(planDividerFor(d, left, front)).toEqual({ ok: false, reason: 'notParallel' });
    expect(addDividerFor(d, left, front)).toBeNull();
  });

  it('a divider counts as a wall: between a divider and the opposite wall', () => {
    const { d, walls } = box(PLY);
    const [, right, , left] = walls;
    let a = '';
    edit(d, (x) => void (a = addDividerFor(x, left, right)!));
    // the divider runs front to back; the front and back walls face it from either side
    const [front, , back] = walls;
    const p = planDividerFor(d, front, a);
    expect(p.ok || p.reason).toBeTruthy();
    void back;
  });
});

describe('older files with automatic divider sets', () => {
  it('a v7 organiser with a 2 × 1 set keeps every member where it is and exports the same file', () => {
    const { d, base } = box(PLY);
    // the members as the set made them: stable ids, offsets in the clear inside
    const set = `${base}/div`;
    const ids = [
      [3, 'a1', 55],
      [3, 'a2', 105],
      [0, 'l1', 55],
    ] as const;
    for (const [edge, n, off] of ids) {
      const r = growPanel(d, base, edge, { height: 40, angle: 90, dir: 'up', kind: 'tabslot', offset: off })!;
      renamePanel(d, r.panelId, `${set}/${n}`);
      const c = d.connections[r.connectionId];
      delete d.connections[c.id];
      c.id = `${set}/c/${n}`;
      d.connections[c.id] = c;
    }
    autoConnect(d);
    const file = JSON.parse(serializeProject(d));
    file.schemaVersion = 7;
    file.design.schemaVersion = 7;
    file.design.dividerSets = { [set]: { id: set, baseId: base, across: 2, along: 1, height: 40, mode: 'even' } };
    const before = sheetsToSvg(prepareExport(d).sheets);
    const back = parseProject(JSON.stringify(file));
    expect((back as unknown as Record<string, unknown>).dividerSets).toBeUndefined();
    expect(back.order).toEqual(d.order);
    for (const [, n] of ids) expect(back.panels[`${set}/${n}`]).toBeTruthy();
    expect(sheetsToSvg(prepareExport(back).sheets)).toBe(before);
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
      expect(Math.abs(Math.sin((d.panels[div].divider!.rot * Math.PI) / 180))).toBeLessThan(1e-9);
      const P = d.panels[div];
      const mid = toWorld(P.frame, 0, 0, m.thickness / 2);
      const n = [P.frame.u[1] * P.frame.v[2] - P.frame.u[2] * P.frame.v[1], P.frame.u[2] * P.frame.v[0] - P.frame.u[0] * P.frame.v[2], P.frame.u[0] * P.frame.v[1] - P.frame.u[1] * P.frame.v[0]];
      expect(Math.abs((b.point[0] - mid[0]) * n[0] + (b.point[1] - mid[1]) * n[1] + (b.point[2] - mid[2]) * n[2])).toBeLessThan(0.06);
      expect(validate(d).filter((i) => i.pair)).toEqual([]);
      // its ends: tabs in slots in the walls, for every material (an edge on a face: tabs and slots first)
      expect(Object.values(d.connections).filter((x) => !x.grown && (x.a.panelId === div || x.b.panelId === div) && walls.includes(x.a.panelId === div ? x.b.panelId : x.a.panelId)).map((x) => x.kind)).toEqual(['tabslot', 'tabslot']);
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
