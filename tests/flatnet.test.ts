// Milestone 35: nets that lie flat.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { addDetail, addRootPanel, addTray, autoConnect, createDesign, setTrayFlat, setTrayHeight, setTrayPin, solve, trayFlatInfo } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { buildPieces, netOverlaps } from '../src/model/pieces';
import { validate } from '../src/model/validate';
import { minFlap, trayWallOn } from '../src/model/flatnet';
import { foldDisplay } from '../src/views/foldView';
import { toWorld } from '../src/model/frame';
import { maxOverlap } from './solid';
import type { Design, P2 } from '../src/model/types';

const MATS = [MATERIALS[0], MATERIALS[1], MATERIALS[2]];
const ngon = (n: number, r: number, rot = 0): P2[] => Array.from({ length: n }, (_, i) => ({ x: r + r * Math.cos((2 * i * Math.PI) / n + rot), y: r + r * Math.sin((2 * i * Math.PI) / n + rot) }));
const BASES: Record<string, P2[]> = {
  rectangle: [ { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 } ],
  triangle: [ { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 } ],
  hexagon: ngon(6, 50),
  octagon: ngon(8, 50, Math.PI / 8),
  // a 60 mm notch at the inside corner (60, 60)
  L: [ { x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 60 }, { x: 60, y: 60 }, { x: 60, y: 120 }, { x: 0, y: 120 } ],
};

function tray(pts: P2[], m = MATERIALS[0], h = 40) {
  const d = createDesign(m);
  const b = addRootPanel(d, 0, 0, 100, 100);
  const mx = Math.min(...pts.map((q) => q.x)), my = Math.min(...pts.map((q) => q.y));
  d.panels[b].sketch = { kind: 'poly', pts: pts.map((q) => ({ x: q.x - mx, y: q.y - my })), edgeIds: pts.map((_, i) => `e${i}`) };
  solve(d);
  const t = addTray(d, b, h)!;
  autoConnect(d);
  return { d, b, t };
}

describe('every tray net lies flat', () => {
  for (const [name, pts] of Object.entries(BASES))
    for (const m of MATS)
      for (const h of [20, 40, 80])
        it(`${name}, ${m.id}, ${h} mm walls`, () => {
          const { d } = tray(pts, m, h);
          expect(netOverlaps(d)).toEqual([]);
          expect(Object.values(d.connections).some((c) => c.broken)).toBe(false);
          expect(validate(d).filter((i) => i.key === 'val.netOverlap')).toEqual([]);
        });
});

describe('the fixes', () => {
  it('the L tray hinges the closing wall at 20 mm and cuts it as its own piece at 80 mm', () => {
    for (const m of MATS) {
      const a = tray(BASES.L, m, 20);
      expect(a.d.trays[a.t].fixes).toEqual({ e3: 'hinge' });
      expect(buildPieces(a.d)).toHaveLength(1);
      const hinged = Object.values(a.d.connections).find((c) => c.hingeOf);
      expect(hinged?.kind).toBe('fold');
      expect(hinged?.hingeOf).toBe(trayWallOn(a.d, a.d.trays[a.t], 'e3'));
      const b = tray(BASES.L, m, 80);
      expect(b.d.trays[b.t].fixes).toEqual({ e3: 'own' });
      expect(buildPieces(b.d)).toHaveLength(2);
      // a wall cut as its own piece is joined to the base (not folded)
      const w = trayWallOn(b.d, b.d.trays[b.t], 'e3')!;
      const c = Object.values(b.d.connections).find((x) => x.grown && x.b.panelId === w)!;
      expect(c.kind).not.toBe('fold');
      expect(c.pref).toBe('fold');
    }
  });

  it('the octagon’s card corner flaps are trimmed and stay at least the minimum width', () => {
    const { d, t } = tray(BASES.octagon, MATERIALS[0], 20);
    expect(Object.values(d.trays[t].fixes ?? {}).every((f) => f === 'trim')).toBe(true);
    expect(d.trays[t].fixPlan?.trim).toHaveLength(8);
    for (const id of d.trays[t].fixPlan!.trim!) {
      const g = d.connections[id].geom!;
      const area = g.adds.reduce((s, a) => s + Math.abs(a.poly.reduce((x, p, i) => x + p.x * a.poly[(i + 1) % a.poly.length].y - a.poly[(i + 1) % a.poly.length].x * p.y, 0)) / 2, 0);
      const L = g.scores.reduce((s, sc) => s + Math.hypot(sc.b.x - sc.a.x, sc.b.y - sc.a.y), 0);
      expect(area / L).toBeGreaterThanOrEqual(minFlap(d, d.connections[id].a.panelId) - 1e-6);
      // the folded flap is trimmed the same way: it has as many corners as the flat one
      expect(g.flaps3d[0].poly.length).toBe(g.adds[0].poly.length);
    }
    expect(buildPieces(d)).toHaveLength(1);
  });

  it('a hinged or separate wall does not overlap anything in 3D, and keeps its shapes', () => {
    for (const h of [20, 80]) {
      const { d, t } = tray(BASES.L, MATERIALS[1], h);
      const w = trayWallOn(d, d.trays[t], 'e3')!;
      addDetail(d, w, 'circle', 'cut', 30, h / 2, 6, 6);
      solve(d);
      expect(d.panels[w].details).toHaveLength(1);
      expect(maxOverlap(d, [-2, -2, -122], [122, h + 2, 2], 0.9)).toBe(1);
      expect(validate(d)).toEqual([]);
    }
  });

  it('in the fold view, a hinged wall unfolds with its neighbour and lies flat', () => {
    const { d, t } = tray(BASES.L, MATERIALS[0], 30);
    const w = trayWallOn(d, d.trays[t], 'e3')!;
    const { xf } = foldDisplay(d, 0);
    const p = d.panels[w];
    const ys = [[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]].map(([x, y]) => new THREE.Vector3(...toWorld(p.frame, x, y, 0)).applyMatrix4(xf.get(w)!).y);
    for (const y of ys) expect(Math.abs(y)).toBeLessThan(2);
    // folded, it stands where it is
    const up = foldDisplay(d, 1).xf.get(w)!;
    expect(up.equals(new THREE.Matrix4())).toBe(true);
  });

  it('the student can pin a wall: cut as its own piece, or let the other wall give way', () => {
    const { d, t } = tray(BASES.L, MATERIALS[0], 20);
    setTrayPin(d, t, 'e3', 'own');
    expect(d.trays[t].fixes).toEqual({ e3: 'own' });
    setTrayPin(d, t, 'e3', null);
    setTrayPin(d, t, 'e3', 'other');
    // the incoming wall gives way (it now closes the corner); the other stays on the base
    expect(d.trays[t].fixes).toEqual({ e2: 'hinge' });
    expect(buildPieces(d)).toHaveLength(1);
    expect(netOverlaps(d)).toEqual([]);
  });

  it('kept in one piece: the overlap stays and the export check reports it', () => {
    const { d, t } = tray(BASES.L, MATERIALS[0], 40);
    setTrayFlat(d, t, 'off');
    expect(d.trays[t].fixes).toBeUndefined();
    expect(netOverlaps(d).length).toBeGreaterThan(0);
    const v = validate(d).filter((i) => i.key === 'val.netOverlap');
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].pair).toHaveLength(2);
    setTrayFlat(d, t, 'auto');
    expect(netOverlaps(d)).toEqual([]);
  });
});

describe('flat height', () => {
  it('convex bases: any height; the L base: its notch less the hinged wall’s glue flap', () => {
    for (const m of MATS) {
      const d = createDesign(m);
      const b = addRootPanel(d, 0, 0, 100, 60);
      expect(trayFlatInfo(d, b, 40)!.flatHeight).toBe(Infinity);
    }
    const { d, b, t } = tray(BASES.L, MATERIALS[0], 80);
    const fh = trayFlatInfo(d, b, 80)!.flatHeight;
    // the notch is 60 mm, the card glue flap 10 mm
    expect(fh).toBeGreaterThanOrEqual(49);
    expect(fh).toBeLessThanOrEqual(60);
    expect(trayFlatInfo(d, b, 80)!.fixes).toEqual({ e3: 'own' });
    // lowering to it keeps the net in one piece
    setTrayHeight(d, t, fh);
    expect(Object.values(d.trays[t].fixes ?? {})).not.toContain('own');
    expect(buildPieces(d as Design)).toHaveLength(1);
    setTrayHeight(d, t, fh + 3);
    expect(Object.values(d.trays[t].fixes ?? {})).toContain('own');
  });
});
