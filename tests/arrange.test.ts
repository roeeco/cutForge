// Milestone 31: selecting and arranging boards.
import { describe, expect, it } from 'vitest';
import { addDivider, addPlacedPanel, addRootPanel, createDesign, growPanel, parentConnection } from '../src/model/ops';
import { MATERIALS, tOf } from '../src/model/materials';
import { alignPanels, commonPlane, distributeDividers, distributePanels } from '../src/model/arrange';
import { toWorld } from '../src/model/frame';
import type { Design } from '../src/model/types';

const PLY = MATERIALS[3];
const minX = (d: Design, id: string) => Math.min(...[[0, 0], [d.panels[id].w, 0], [d.panels[id].w, d.panels[id].h], [0, d.panels[id].h]].map(([x, y]) => toWorld(d.panels[id].frame, x, y)[0]));
const maxX = (d: Design, id: string) => Math.max(...[[0, 0], [d.panels[id].w, 0], [d.panels[id].w, d.panels[id].h], [0, d.panels[id].h]].map(([x, y]) => toWorld(d.panels[id].frame, x, y)[0]));
const top = (d: Design, id: string) => Math.min(...[[0, 0], [d.panels[id].w, 0], [d.panels[id].w, d.panels[id].h], [0, d.panels[id].h]].map(([x, y]) => toWorld(d.panels[id].frame, x, y)[2]));

describe('align and distribute boards', () => {
  it('floor panels: align left, align tops, distribute with equal gaps', () => {
    const d = createDesign(PLY);
    const a = addRootPanel(d, 0, 0, 40, 30), b = addRootPanel(d, 70, 25, 20, 50), c = addRootPanel(d, 200, -10, 30, 30);
    expect(commonPlane(d, [a, b, c])).toEqual({ surface: { kind: 'floor' } });
    expect(distributePanels(d, [a, b, c], 'hgap')).toBe(true);
    const g1 = minX(d, b) - maxX(d, a), g2 = minX(d, c) - maxX(d, b);
    expect(g1).toBeCloseTo(g2, 9);
    expect(minX(d, a)).toBeCloseTo(0, 9);
    expect(maxX(d, c)).toBeCloseTo(230, 9);
    // the floor's "top" is world −Z (seen from above)
    alignPanels(d, [a, b, c], 'top');
    expect(new Set([a, b, c].map((id) => top(d, id).toFixed(6))).size).toBe(1);
    alignPanels(d, [a, b, c], 'left');
    expect(new Set([a, b, c].map((id) => minX(d, id).toFixed(6))).size).toBe(1);
  });

  it('panels placed on one face move in its plane; a mix is refused with the reason', () => {
    const d = createDesign(PLY);
    const base = addRootPanel(d, 0, 0, 200, 100);
    const p1 = addPlacedPanel(d, { host: base, face: 1, x: 10, y: 10, rot: 0, pose: 'flat' }, 20, 20)!;
    const p2 = addPlacedPanel(d, { host: base, face: 1, x: 80, y: 50, rot: 0, pose: 'flat' }, 30, 20)!;
    const p3 = addPlacedPanel(d, { host: base, face: 1, x: 150, y: 30, rot: 0, pose: 'flat' }, 20, 40)!;
    expect(commonPlane(d, [p1, p2, p3])).toEqual({ surface: { kind: 'face', host: base, face: 1 } });
    alignPanels(d, [p1, p2, p3], 'bottom');
    expect([p1, p2, p3].map((id) => d.panels[id].place!.y)).toEqual([10, 10, 10]);
    distributePanels(d, [p1, p2, p3], 'hcenter');
    const cx = (id: string) => d.panels[id].place!.x + d.panels[id].w / 2;
    expect(cx(p2) - cx(p1)).toBeCloseTo(cx(p3) - cx(p2), 9);
    const floor = addRootPanel(d, 300, 0, 20, 20);
    expect(commonPlane(d, [p1, floor])).toEqual({ why: 'notSameSurface' });
    expect(alignPanels(d, [p1, floor], 'left')).toBe(false);
  });
});

describe('dividers', () => {
  it('three dividers on one base get equal compartments between the walls', () => {
    const d = createDesign(PLY);
    const b = addRootPanel(d, 0, 0, 160, 100);
    for (const e of [0, 1, 2, 3]) growPanel(d, b, e, { height: 50, angle: 90, dir: 'up', kind: 'finger' });
    const ids = [20, 35, 120].map((x) => addDivider(d, b, 3, x, 40)!);
    expect(distributeDividers(d, ids)).toBe(true);
    const t = tOf(d, b);
    const offs = ids.map((id) => parentConnection(d, id)!.offset).sort((x, y) => x - y);
    // the clear inside runs from the left wall's inner face (t) to the right wall's (160 − t)
    const gaps = [offs[0] - t, offs[1] - offs[0] - t, offs[2] - offs[1] - t, 160 - t - offs[2] - t];
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 3);
  });
});
