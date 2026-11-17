// Milestone 67 (PACKAGING_PLAN.md §7): lids that seal their box get a closure.
import { describe, expect, it } from 'vitest';
import { addEdgeFlap, addRootPanel, addTray, autoConnect, createDesign, growPanel, setClosure, setEdgeFlap, setPanelSize, solve } from '../src/model/ops';
import { panelExtras } from '../src/model/geometry';
import { MATERIALS } from '../src/model/materials';
import { closureId, closureOf, sealOf, lipLength } from '../src/model/closures';
import { findOpenSeams } from '../src/model/seams';
import { buildPieces, netOverlaps } from '../src/model/pieces';
import { validate } from '../src/model/validate';
import { prepareExport } from '../src/export/prepare';
import { sheetsToSvg } from '../src/export/svg';
import type { Design } from '../src/model/types';
import { idempotence, roundTrip } from './harness';

const [CARD, CORR16, , PLY] = MATERIALS;

/** A tray and a lid folded off its back wall's top, `depth` deep (null: to the front wall's inside face). */
function lidded(m: typeof CARD, depth: number | null = null) {
  const d = createDesign(m);
  const base = addRootPanel(d, 0, 0, 120, 80);
  addTray(d, base, 50);
  autoConnect(d);
  const back = Object.values(d.connections).find((c) => c.grown && c.a.panelId === base && c.a.edge === 'e2')!.b.panelId;
  const kind = m.kind === 'plywood' ? 'fold' : 'fold';
  const g = growPanel(d, back, 'e2', { height: 60, angle: 90, dir: 'up', kind })!;
  solve(d);
  // where the front wall's inside face is, along the lid
  const probe = sealOf(d, g.panelId) ?? sealOfAt(d, g.panelId);
  setPanelSize(d, g.panelId, undefined, depth ?? probe!.yIn);
  autoConnect(d);
  return { d, base, back, lid: g.panelId };
}
/** The seal a lid would have at the front wall's inside face (for sizing it). */
function sealOfAt(d: Design, lid: string) {
  const L = d.panels[lid];
  for (const h of [40, 60, 70, 76, 78, 80]) {
    L.h = h;
    const s = sealOf(d, lid);
    if (s) return s;
  }
  return null;
}
const issues = (d: Design) => validate(d).filter((i) => i.key !== 'val.split');

describe('closures', () => {
  it('a card lid that reaches the front wall seals the box: a tuck lip, dust flaps on both side walls, no other joints with them', () => {
    const { d, lid } = lidded(CARD);
    const s = sealOf(d, lid)!;
    expect(s).toBeTruthy();
    expect(s.sides).toHaveLength(2);
    const c = d.connections[closureId(lid)];
    expect(c.kind).toBe('closure');
    expect(closureOf(d, lid).style).toBe('tuck');
    const g = c.geom!;
    // the lip on the lid, the dust flaps on the two side walls, each folded in 3D
    expect(g.adds.filter((a) => a.panelId === lid)).toHaveLength(1);
    expect(g.adds.filter((a) => s.sides.some((x) => x.panelId === a.panelId))).toHaveLength(2);
    expect(g.flaps3d).toHaveLength(3);
    // no joint the editor would have made between the lid and the walls it covers
    for (const w of [s.front, ...s.sides.map((x) => x.panelId)]) {
      expect(Object.values(d.connections).filter((x) => x.kind !== 'closure' && ((x.a.panelId === lid && x.b.panelId === w) || (x.b.panelId === lid && x.a.panelId === w)))).toEqual([]);
      expect(findOpenSeams(d).filter((x) => [x.a.panelId, x.b.panelId].includes(lid) && [x.a.panelId, x.b.panelId].includes(w))).toEqual([]);
    }
    expect(issues(d)).toEqual([]);
    expect(netOverlaps(d)).toEqual([]);
    expect(buildPieces(d)).toHaveLength(1);
    expect(() => sheetsToSvg(prepareExport(d).sheets)).not.toThrow();
  });

  it('pulled short it no longer seals and its closure goes; pushed back, it returns with its settings', () => {
    const { d, lid } = lidded(CARD);
    setClosure(d, lid, { style: 'tuckLock', thumb: true, lip: 15 });
    const full = d.panels[lid].h;
    setPanelSize(d, lid, undefined, full - 30);
    autoConnect(d);
    expect(d.connections[closureId(lid)]).toBeUndefined();
    setPanelSize(d, lid, undefined, full);
    autoConnect(d);
    expect(d.connections[closureId(lid)]).toBeTruthy();
    expect(closureOf(d, lid)).toEqual({ style: 'tuckLock', thumb: true, lip: 15 });
    // slit locks at the ends of the lip's fold, a thumb notch in the front wall
    const g = d.connections[closureId(lid)].geom!;
    expect(g.lines).toHaveLength(2);
    expect(g.cuts?.some((x) => x.panelId === sealOf(d, lid)!.front)).toBe(true);
    expect(issues(d)).toEqual([]);
  });

  it('corrugated: a tab lock, its tongue through a slot in the front wall where the lip ends', () => {
    const { d, lid } = lidded(CORR16);
    expect(closureOf(d, lid).style).toBe('tab');
    const g = d.connections[closureId(lid)].geom!;
    const s = sealOf(d, lid)!;
    expect(g.holes.filter((h) => h.panelId === s.front)).toHaveLength(1);
    expect(g.adds.filter((a) => a.panelId === lid)).toHaveLength(2);
    expect(issues(d)).toEqual([]);
  });

  it('a lid that rests or is glued: no flaps on the walls; the lid joined only by its closure', () => {
    for (const style of ['rest', 'glued'] as const) {
      const { d, lid } = lidded(CARD);
      setClosure(d, lid, { style });
      const g = d.connections[closureId(lid)].geom!;
      const s = sealOf(d, lid)!;
      expect(g.adds.filter((a) => s.sides.some((x) => x.panelId === a.panelId))).toEqual([]);
      expect(g.adds.filter((a) => a.panelId === lid)).toHaveLength(style === 'glued' ? 1 : 0);
      expect(issues(d)).toEqual([]);
    }
  });

  it('a plywood lid on a living hinge rests on its walls', () => {
    const { d, lid } = lidded(PLY);
    expect(closureOf(d, lid).style).toBe('rest');
    expect(d.connections[closureId(lid)]).toBeTruthy();
    expect(issues(d).filter((i) => i.key.startsWith('val.notJoined') || i.key === 'val.overlap')).toEqual([]);
  });

  it('the lip is 30% of the lid’s depth, 12 to 22 mm, unless set; designs with closures are stable and reopen', () => {
    expect(lipLength({ style: 'tuck' }, 30)).toBe(12);
    expect(lipLength({ style: 'tuck' }, 60)).toBe(18);
    expect(lipLength({ style: 'tuck' }, 100)).toBe(22);
    expect(lipLength({ style: 'tuck', lip: 9 }, 100)).toBe(9);
    const { d, lid } = lidded(CARD);
    setClosure(d, lid, { thumb: true });
    expect(idempotence(d)).toBeNull();
    expect(roundTrip(d)).toBeNull();
  });

  it('a plain flap on a free edge: a scored, tapered lip in the net; none on plywood; removed again', () => {
    const d = createDesign(CARD);
    const p = addRootPanel(d, 0, 0, 80, 50);
    expect(addEdgeFlap(d, p, 'e2', 15)).toBeTruthy();
    const ex = panelExtras(d, d.panels[p]);
    expect(ex.adds).toHaveLength(1);
    expect(ex.scores).toHaveLength(1);
    expect(Math.max(...ex.adds[0].map((q) => q.y))).toBeCloseTo(65, 6);
    expect(buildPieces(d)[0].contours.filter((c) => c.op === 'score')).toHaveLength(1);
    setEdgeFlap(d, p, 'e2', null);
    expect(panelExtras(d, d.panels[p]).adds).toEqual([]);
    const w = createDesign(PLY);
    expect(addEdgeFlap(w, addRootPanel(w, 0, 0, 80, 50), 'e2')).toBeNull();
  });
});
