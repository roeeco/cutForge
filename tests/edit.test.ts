import { describe, expect, it } from 'vitest';
import { addDetail, addRootPanel, createDesign, growPanel } from '../src/model/ops';
import { alignDetails, coplanar, commonSurface, deleteDetails, distributeDetails, duplicateDetails, explodeArray, moveDetails, scaleDetails, setArray } from '../src/model/edit';
import { detailInstances } from '../src/model/geometry';
import { snapBox, snapContext, snapPoint } from '../src/model/snap';
import { buildPieces } from '../src/model/pieces';
import { parseProject, serializeProject } from '../src/model/serialize';
import type { Design } from '../src/model/types';

function panelWith(n: number) {
  const d = createDesign();
  const p = addRootPanel(d, 0, 0, 200, 100);
  const ids = Array.from({ length: n }, (_, i) => addDetail(d, p, 'rect', 'cut', 30 + i * 37, 40 + i * 3, 10 + i * 2, 10)!);
  return { d, p, ids };
}
const dt = (d: Design, id: string) => d.order.map((p) => d.panels[p].details.find((x) => x.id === id)).find(Boolean)!;

describe('group edits', () => {
  it('moves, duplicates and deletes several shapes', () => {
    const { d, p, ids } = panelWith(3);
    moveDetails(d, ids.map((id) => ({ id, dx: 5, dy: -2 })));
    expect(dt(d, ids[0])).toMatchObject({ cx: 35, cy: 38 });
    const copies = duplicateDetails(d, ids.slice(0, 2));
    expect(copies).toHaveLength(2);
    expect(d.panels[p].details).toHaveLength(5);
    expect(dt(d, copies[0])).toMatchObject({ cx: 40, cy: 33, w: 10 });
    deleteDetails(d, [...copies, ids[2]]);
    expect(d.panels[p].details.map((x) => x.id)).toEqual(ids.slice(0, 2));
  });

  it('resizes about the group box', () => {
    const { d, ids } = panelWith(2);
    // group box: x 25..(67+6)=73, y 35..48
    const base = JSON.parse(JSON.stringify(d));
    scaleDetails(d, ids, { x: 25, y: 35 }, 2, 1, base);
    expect(dt(d, ids[0])).toMatchObject({ cx: 35, w: 20, h: 10 });
    expect(dt(d, ids[1])).toMatchObject({ cx: 25 + (67 - 25) * 2, w: 24 });
  });
});

describe('align and distribute', () => {
  it('aligns edges and centres on one panel', () => {
    const { d, ids } = panelWith(3);
    expect(alignDetails(d, ids, 'left')).toBe(true);
    const lefts = ids.map((id) => dt(d, id).cx - dt(d, id).w / 2);
    expect(new Set(lefts.map((x) => x.toFixed(9))).size).toBe(1);
    alignDetails(d, ids, 'vcenter');
    expect(new Set(ids.map((id) => dt(d, id).cy.toFixed(9))).size).toBe(1);
  });

  it('distributes with equal gaps and equal centre spacing', () => {
    const { d, ids } = panelWith(4);
    moveDetails(d, [{ id: ids[1], dx: 8, dy: 0 }]);
    distributeDetails(d, ids, 'hgap');
    const bx = ids.map((id) => [dt(d, id).cx - dt(d, id).w / 2, dt(d, id).cx + dt(d, id).w / 2]);
    const gaps = bx.slice(1).map((b, i) => b[0] - bx[i][1]);
    gaps.forEach((g) => expect(g).toBeCloseTo(gaps[0], 9));
    distributeDetails(d, ids, 'hcenter');
    const cs = ids.map((id) => dt(d, id).cx);
    cs.slice(1).forEach((c, i) => expect(c - cs[i]).toBeCloseTo(cs[1] - cs[0], 9));
  });

  it('refuses shapes on panels facing different ways', () => {
    const d = createDesign();
    const base = addRootPanel(d, 0, 0, 100, 60);
    const wall = growPanel(d, base, 0, { height: 40, angle: 90, dir: 'up', kind: 'finger' })!.panelId;
    const a = addDetail(d, base, 'rect', 'cut', 20, 30, 10, 10)!;
    const b = addDetail(d, wall, 'rect', 'cut', 50, 20, 10, 10)!;
    expect(coplanar(d.panels[base], d.panels[wall])).toBe(false);
    expect(commonSurface(d, [a, b])).toBeNull();
    expect(alignDetails(d, [a, b], 'left')).toBe(false);
  });

  it('aligns across two separate panels in the same plane', () => {
    const d = createDesign();
    const p1 = addRootPanel(d, 0, 0, 100, 60);
    const p2 = addRootPanel(d, 150, 0, 100, 60);
    const a = addDetail(d, p1, 'rect', 'cut', 20, 30, 10, 10)!;
    const b = addDetail(d, p2, 'rect', 'cut', 50, 10, 10, 10)!;
    expect(alignDetails(d, [a, b], 'top')).toBe(true);
    expect(dt(d, b).cy).toBeCloseTo(30, 9);
  });
});

describe('live arrays', () => {
  it('rectangular array stays live and survives save/reopen; explode makes independent shapes', () => {
    const { d, p, ids } = panelWith(1);
    setArray(d, ids[0], { nx: 4, ny: 2, dx: 20, dy: 15 });
    expect(detailInstances(dt(d, ids[0]))).toHaveLength(8);
    expect(buildPieces(d)[0].contours.filter((c) => c.role === 'hole')).toHaveLength(8);
    setArray(d, ids[0], { nx: 3, ny: 2, dx: 25, dy: 15 });
    expect(detailInstances(dt(d, ids[0]))[2].cx).toBeCloseTo(30 + 50, 9);
    const back = parseProject(serializeProject(d));
    expect(back.panels[p].details[0].array).toEqual({ nx: 3, ny: 2, dx: 25, dy: 15 });
    const all = explodeArray(d, ids[0]);
    expect(all).toHaveLength(6);
    expect(d.panels[p].details).toHaveLength(6);
    expect(d.panels[p].details.every((x) => !x.array)).toBe(true);
  });
});

describe('smart snapping', () => {
  it('snaps a moving shape to the panel centre and to other shapes, excluding itself', () => {
    const { d, p, ids } = panelWith(2);
    const ctx = snapContext(d, p, new Set([ids[0]]))!;
    // box centred near the panel centre (100, 50)
    const r = snapBox(ctx, { minX: 93, maxX: 103.5, minY: 44, maxY: 54.5 }, 2);
    expect(r.dx).toBeCloseTo(100 - 98.25, 9);
    expect(r.dy).toBeCloseTo(50 - 49.25, 9);
    expect(r.guides.length).toBeGreaterThan(0);
    // nothing in range: no snap
    expect(snapBox(ctx, { minX: 140, maxX: 147, minY: 70, maxY: 77 }, 1)).toMatchObject({ dx: 0, dy: 0 });
    // its own old position is not a target
    const own = d.panels[p].details[0];
    const r2 = snapPoint(ctx, { x: own.cx - own.w / 2 + 0.3, y: 90 }, 0.5);
    expect(r2.dx).toBe(0);
  });

  it('offers equal spacing between neighbours', () => {
    const d = createDesign();
    const p = addRootPanel(d, 0, 0, 300, 100);
    addDetail(d, p, 'rect', 'cut', 20, 50, 10, 10); // 15..25
    addDetail(d, p, 'rect', 'cut', 50, 50, 10, 10); // 45..55, gap 20
    const ctx = snapContext(d, p, new Set())!;
    // moving 10-wide box near x 75..85 (gap 20 repeats)
    const r = snapBox(ctx, { minX: 76.5, maxX: 86.5, minY: 45, maxY: 55 }, 2);
    expect(r.dx).toBeCloseTo(-1.5, 9);
    expect(r.guides.some((g) => g.kind === 'gap')).toBe(true);
  });
});
