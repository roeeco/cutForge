// Milestone 12: through-cuts.
import { describe, expect, it } from 'vitest';
import { addDetail, addDivider, addPolygonShape, addRootPanel, autoConnect, createDesign, deleteDetail, growPanel, solve, updateDetail } from '../src/model/ops';
import { panelsCutBy, removedByCut, throughHits, throughRegions } from '../src/model/through';
import { buildPieces } from '../src/model/pieces';
import { validate } from '../src/model/validate';
import { MATERIALS } from '../src/model/materials';
import { ownOutline } from '../src/model/outline';
import { maxOverlap } from './solid';
import polygonClipping from 'polygon-clipping';
import type { Design, P2 } from '../src/model/types';

const PLY = MATERIALS[3];
const t = PLY.thickness;

function box() {
  const d = createDesign(PLY);
  const base = addRootPanel(d, 0, 0, 120, 80);
  const walls = [0, 1, 2, 3].map((e) => growPanel(d, base, e, { height: 50, angle: 90, dir: 'up', kind: 'finger' })!.panelId);
  autoConnect(d);
  return { d, base, walls };
}

/** Area of a panel's own outline minus its through-cut regions. */
function materialArea(d: Design, id: string): number {
  const ring = (pts: P2[]) => pts.map((q) => [q.x, q.y] as [number, number]);
  const own = ownOutline(d.panels[id]).rings.map((r) => [ring(r.map((e) => e.a))]);
  const regions = throughRegions(d, id).map((r) => [ring(r)]);
  const left = regions.length ? polygonClipping.difference(own as any, ...(regions as any)) : own;
  let a = 0;
  for (const poly of left as any)
    poly.forEach((r: [number, number][], i: number) => {
      let s = 0;
      for (let k = 0; k < r.length - 1; k++) s += r[k][0] * r[k + 1][1] - r[k + 1][0] * r[k][1];
      a += (i ? -1 : 1) * Math.abs(s / 2);
    });
  return a;
}

const seam = (d: Design, x: string, y: string) => Object.values(d.connections).find((c) => !c.grown && [c.a.panelId, c.b.panelId].includes(x) && [c.a.panelId, c.b.panelId].includes(y))!;

describe('the chamfer through-cut (POLYGONS_AND_CUTS.md §1)', () => {
  it('chamfers the front and back walls and trims the left wall; the left/front seam re-lays', () => {
    const { d, walls } = box();
    const [front, right, back, left] = walls;
    const before = {
      front: materialArea(d, front),
      back: materialArea(d, back),
      left: materialArea(d, left),
      right: materialArea(d, right),
      seam: JSON.stringify(seam(d, front, left).geom),
    };
    // a triangle over the front wall's top-left corner, cut through the whole design
    const id = addPolygonShape(d, front, [{ x: -5, y: 55 }, { x: 20, y: 55 }, { x: 20, y: 50 }, { x: -5, y: 25 }], 'cut')!;
    d.panels[front].details.find((x) => x.id === id)!.through = true;
    solve(d);
    autoConnect(d);
    // front: its own cut (a notch at the corner); back: the same triangle (parallel panel)
    const tri = 0.5 * 20 * 20;
    expect(before.front - materialArea(d, front)).toBeCloseTo(tri, 0);
    expect(before.back - materialArea(d, back)).toBeCloseTo(tri, 0);
    // left wall lies edge-on in the path: everything above 30 mm goes, across its whole length
    expect(before.left - materialArea(d, left)).toBeCloseTo(20 * 80, 0);
    expect(materialArea(d, right)).toBeCloseTo(before.right, 6);
    expect(panelsCutBy(d, id).sort()).toEqual([back, left].sort());
    // the left/front finger seam re-lays over the contact that is left, and nothing overlaps
    const s = seam(d, front, left);
    expect(s.broken).toBe(false);
    expect(JSON.stringify(s.geom)).not.toBe(before.seam);
    expect(maxOverlap(d, [-1, 0, -82], [10, 52, 2], 0.45)).toBe(1);
    expect(maxOverlap(d, [-1, 0, -82], [10, 52, 2], 0.45)).toBe(1);
    // the edge-on trim approximates a bevel: flagged
    expect(validate(d).some((i) => i.key === 'val.bevel')).toBe(true);

    // moving the source updates every panel; deleting it restores every panel
    updateDetail(d, id, { cx: d.panels[front].details.find((x) => x.id === id)!.cx + 40 });
    solve(d);
    expect(panelsCutBy(d, id)).toEqual([back]);
    expect(materialArea(d, left)).toBeCloseTo(before.left, 6);
    deleteDetail(d, id);
    solve(d);
    autoConnect(d);
    for (const [k, w] of [['front', front], ['back', back], ['left', left]] as const) expect(materialArea(d, w)).toBeCloseTo(before[k], 6);
    expect(throughHits(d).size).toBe(0);
  });
});

describe('through-cuts that split or remove a panel', () => {
  it('a through-cut that splits a wall gives two pieces and a warning', () => {
    const { d, walls } = box();
    const [front, , back] = walls;
    const id = addDetail(d, front, 'rect', 'cut', 60, 25, 10, 80)!; // a full-height slot through the front wall ... and the back
    d.panels[front].details[0].through = true;
    solve(d);
    autoConnect(d);
    expect(panelsCutBy(d, id)).toContain(back);
    const pieces = buildPieces(d).filter((p) => p.key === back || p.key.startsWith(back + '@'));
    expect(pieces).toHaveLength(2);
    expect(validate(d).some((i) => i.key === 'val.split' && i.target.id === back)).toBe(true);
  });

  it('a through-cut covering a whole panel removes it (flagged, kept); deleting the cut restores it', () => {
    const d = createDesign(PLY);
    const a = addRootPanel(d, 0, 0, 100, 60);
    const b = addRootPanel(d, 0, 0, 40, 30);
    // stack b above a: lift it 50 mm
    d.panels[b].frame = { ...d.panels[b].frame, o: [10, 50, -10] };
    const id = addDetail(d, a, 'rect', 'cut', 30, 25, 50, 40)!;
    d.panels[a].details[0].through = true;
    solve(d);
    expect(panelsCutBy(d, id)).toEqual([b]);
    expect(removedByCut(d, b)).toBe(true);
    expect(buildPieces(d).map((p) => p.key)).toEqual([a]);
    expect(validate(d).some((i) => i.key === 'val.removed')).toBe(true);
    expect(d.panels[b]).toBeTruthy();
    deleteDetail(d, id);
    solve(d);
    expect(removedByCut(d, b)).toBe(false);
    expect(buildPieces(d).map((p) => p.key).sort()).toEqual([a, b].sort());
  });
});

describe('base hole through a divider', () => {
  it('a round through-hole in a base cuts a full-height slot in the divider standing over it, known before commit', () => {
    const { d, base } = box();
    const div = addDivider(d, base, 0, 40, 35)!; // parallel to the front edge, 40 mm in
    autoConnect(d);
    const id = addDetail(d, base, 'circle', 'cut', 60, 40, 12, 12)!;
    d.panels[base].details[0].through = true;
    solve(d);
    // the live preview counts the panels it hits (the divider, edge-on)
    expect(panelsCutBy(d, id)).toEqual([div]);
    const before = 120 * 35;
    expect(materialArea(d, div)).toBeLessThan(before - 12 * 30);
    const pieces = buildPieces(d).filter((p) => p.key === div || p.key.startsWith(div + '@'));
    expect(pieces).toHaveLength(2);
  });
});
