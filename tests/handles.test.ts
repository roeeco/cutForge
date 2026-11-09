// Milestone 15: an edge's grow target never covers a push-pull arrow.
import { describe, expect, it } from 'vitest';
import { addPolygonPanel, addRootPanel, addTray, addWallInsert, autoConnect, createDesign, edgeConnection, growPanel, MIN_PANEL, regularPolygon } from '../src/model/ops';
import { panelEdges, segLength } from '../src/model/edges';
import { clampToRanges, EDGE_GAP_PX, EDGE_MIN_HIT_PX, edgeGaps, edgeHitRanges, pushPullAnchors } from '../src/views/edgeGaps';
import { MATERIALS } from '../src/model/materials';
import type { Design } from '../src/model/types';

const PLY = MATERIALS[3];

/** At 1 mm per pixel: every push-pull anchor stays at least the gap away from every hit piece, on every free edge. */
function checkPanel(d: Design, id: string, mmPerPx = 1) {
  const p = d.panels[id];
  const g = EDGE_GAP_PX * mmPerPx;
  const pp = pushPullAnchors(p);
  const anchors = [pp.width, pp.height];
  let checked = 0;
  for (const seg of panelEdges(p)) {
    if (segLength(seg) < MIN_PANEL || edgeConnection(d, id, seg.key)) continue;
    const L = segLength(seg);
    const dx = (seg.b.x - seg.a.x) / L, dy = (seg.b.y - seg.a.y) / L;
    const ranges = edgeHitRanges(L, edgeGaps(p, seg), g, EDGE_MIN_HIT_PX * mmPerPx);
    for (const q of anchors) {
      const rx = q.x - seg.a.x, ry = q.y - seg.a.y;
      if (Math.abs(rx * dy - ry * dx) > 0.5) continue; // not on this edge
      const s = rx * dx + ry * dy;
      if (s < -g || s > L + g) continue;
      checked++;
      for (const [a, b] of ranges) expect(s <= a - g + 1e-9 || s >= b + g - 1e-9, `${id} ${seg.key} anchor at ${s} vs [${a}, ${b}]`).toBe(true);
    }
    // the midpoint is always clear, and the pill never lands in a gap
    for (const [a, b] of ranges) expect(L / 2 <= a - g + 1e-9 || L / 2 >= b + g - 1e-9).toBe(true);
    for (let s = 0; s <= L; s += L / 17) {
      const c = clampToRanges(s, ranges);
      if (c === null) continue;
      for (const gc of edgeGaps(p, seg)) expect(Math.abs(c - gc)).toBeGreaterThanOrEqual(g - 1e-9);
    }
  }
  return checked;
}

describe('edge hit targets and push-pull arrows', () => {
  it('a plain wall: the right and top midpoints are gaps', () => {
    const d = createDesign(PLY);
    const base = addRootPanel(d, 0, 0, 120, 80);
    const w = growPanel(d, base, 'e0', { height: 60, angle: 90, dir: 'up', kind: 'finger' })!.panelId;
    expect(checkPanel(d, w)).toBe(2);
    expect(checkPanel(d, base)).toBe(2);
    // seen from far away the gap is wider than half of a short edge: no target at all (the arrow wins)
    const L = 40;
    expect(edgeHitRanges(L, [L / 2], EDGE_GAP_PX * 1.2, EDGE_MIN_HIT_PX * 1.2)).toEqual([]);
  });

  it('a gable wall: the height arrow at the apex is clear of both sloped edges', () => {
    const d = createDesign(PLY);
    const base = addRootPanel(d, 0, 0, 120, 80);
    const w = growPanel(d, base, 'e0', { height: 50, angle: 90, dir: 'up', kind: 'finger' })!.panelId;
    addWallInsert(d, w, 'e2', 0.5, 30);
    // right edge midpoint + apex on both slopes
    expect(checkPanel(d, w)).toBe(3);
    expect(checkPanel(d, w, 0.4)).toBe(3);
  });

  it('tray walls: every wall of a hexagon tray', () => {
    const d = createDesign(PLY);
    const base = addPolygonPanel(d, 0, 0, regularPolygon(6, 60))!;
    const tray = addTray(d, base, 40)!;
    autoConnect(d);
    const walls = d.order.filter((id) => id.startsWith(tray + '/'));
    expect(walls).toHaveLength(6);
    for (const w of walls) checkPanel(d, w, 0.5);
  });
});
