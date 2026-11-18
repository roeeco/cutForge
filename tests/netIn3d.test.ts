// Milestone 74 (ROADMAP.md, UI_CLEANUP_PLAN.md §1.4): the net and 3D in step.
// Whatever a joint adds to a board's outline on the cut plan is drawn in 3D:
// either in the board's own plane (`flat`) or folded with a glue flap (`flaps3d`).
import { describe, expect, it } from 'vitest';
import { cartonDesign, lockTray, closedBox, roundBoxDesign, roundedTray, bandLidBox, cardTray, corrDividers, plyBox, plyLean, v6CardGable, v6CorrFoldover, v6PlyHexThrough } from './goldenDesigns';
import { MATERIALS } from '../src/model/materials';
import { defaults, generate, templateById, TEMPLATES } from '../src/templates/registry';
import { addDividerLine, addRootPanel, addRoundedRect, addRoundPanel, addTray, autoConnect, createDesign, solve } from '../src/model/ops';
import type { Design, P2 } from '../src/model/types';

const area = (pts: P2[]) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0)) / 2;

export const DESIGNS: { name: string; make: () => Design }[] = [];
for (const m of MATERIALS) {
  for (const t of TEMPLATES) DESIGNS.push({ name: `${t.id}-${m.id}`, make: () => generate(t, m, defaults(t)) });
  DESIGNS.push({ name: `organiser-lid-${m.id}`, make: () => generate(templateById('organiser')!, m, { ...defaults(templateById('organiser')!), lid: 'liftoff' }) });
  DESIGNS.push({ name: `rounded-${m.id}`, make: () => roundedTray(m, m.kind === 'plywood' ? 32 : 15) });
  DESIGNS.push({ name: `round-${m.id}`, make: () => roundBoxDesign(m, 'circle', 100, 100) });
  DESIGNS.push({ name: `oval-${m.id}`, make: () => roundBoxDesign(m, 'oval', 140, 90) });
  DESIGNS.push({ name: `bandlid-${m.id}`, make: () => bandLidBox(m) });
  DESIGNS.push({ name: `closed-${m.id}`, make: () => closedBox(m) });
  // dividers whose ends meet a band (milestone 70): across a round box, and corner to corner in a rounded one
  DESIGNS.push({ name: `round-divider-${m.id}`, make: () => { const d = createDesign(m); const b = addRoundPanel(d, 0, 0, 120, 120, { shape: 'circle' })!; addTray(d, b, 45); autoConnect(d); expect(addDividerLine(d, b, { x: 10, y: 60 }, { x: 110, y: 60 }, 35)).toBeTruthy(); autoConnect(d); return d; } });
  DESIGNS.push({ name: `rounded-divider-${m.id}`, make: () => { const d = createDesign(m); const b = addRoundedRect(d, 0, 0, 150, 100, 30)!; addTray(d, b, 45); autoConnect(d); expect(addDividerLine(d, b, { x: 10, y: 10 }, { x: 140, y: 90 }, 35)).toBeTruthy(); autoConnect(d); return d; } });
  if (m.kind !== 'plywood') {
    DESIGNS.push({ name: `carton-${m.id}`, make: () => cartonDesign(m, 'tuck', 'snap') });
    DESIGNS.push({ name: `lock-${m.id}`, make: () => { const d = createDesign(m); const b = addRootPanel(d, 0, 0, 100, 70); addTray(d, b, 40, { cornerKind: 'lock' }); autoConnect(d); return d; } });
  }
}
for (const [name, make] of Object.entries({ lockTray, cardTray, corrDividers, plyBox, plyLean, v6CardGable, v6CorrFoldover, v6PlyHexThrough })) DESIGNS.push({ name, make });

describe('the net and 3D in step', () => {
  it.each(DESIGNS)('$name: every joint addition is drawn in 3D', ({ make }) => {
    const d = make();
    solve(d);
    const bad: string[] = [];
    for (const c of Object.values(d.connections)) {
      const g = c.geom;
      if (!g) continue;
      // each addition in the net is matched by a folded flap of about its area (a tooth folded in round a curve loses a little)
      const free = g.flaps3d.map((f) => area(f.poly));
      for (const a of g.adds) {
        if (a.flat || a.band) continue;
        const A = area(a.poly);
        if (A < 1) continue;
        const i = free.findIndex((F) => F > 0 && Math.abs(F / A - 1) < 0.25);
        if (i < 0) bad.push(`${c.id} ${c.kind}: ${a.poly.length}-gon of ${A.toFixed(1)} mm² on ${a.panelId} is not drawn`);
        else free[i] = 0;
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('slits in 3D', () => {
  it('a card slit-lock tray: each tongue folds with its flap, and each slit is drawn on the other wall', async () => {
    const { faceSlits } = await import('../src/views/three-geom');
    const d = lockTray();
    solve(d);
    const locks = Object.values(d.connections).filter((c) => c.kind === 'lock');
    expect(locks.length).toBe(4);
    for (const c of locks) {
      const tongues = c.geom!.adds.filter((a) => a.poly.length === 6);
      expect(tongues.length).toBeGreaterThan(0);
      // as many folded 6-gons as tongues
      expect(c.geom!.flaps3d.filter((f) => f.poly.length === 6).length).toBe(tongues.length);
      for (const l of c.geom!.lines ?? []) expect(faceSlits(d, d.panels[l.panelId]).some((s) => s.a.x === l.a.x && s.b.y === l.b.y)).toBe(true);
    }
  });
});

describe('dividers on bands', () => {
  it.each(MATERIALS.filter((m) => m.kind !== 'plywood'))('$id: a divider across a round box has a glue flap at each end, folded in 3D', (m) => {
    const d = DESIGNS.find((x) => x.name === `round-divider-${m.id}`)!.make();
    solve(d);
    const ends = Object.values(d.connections).filter((c) => c.bandEnd);
    expect(ends.length).toBe(2);
    for (const c of ends) {
      expect(c.geom!.flaps3d.length).toBe(1);
      const f = c.geom!.flaps3d[0], p = d.panels[c.a.panelId];
      // the folded flap's plane is square to the divider's
      const n = (fr: typeof p.frame) => { const [u, v] = [fr.u, fr.v]; return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; };
      const a = n(p.frame), b = n(f.frame!);
      expect(Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2])).toBeLessThan(1e-6);
    }
  });
});

describe('dividers on the cut plan (UI_CLEANUP_PLAN.md §1.3)', () => {
  it.each(DESIGNS.filter((x) => /organiser|divider|corrDividers|plyBox/.test(x.name)))('$name: each divider\'s piece is as long as its board, give or take its end joints', async ({ make }) => {
    const { buildPieces } = await import('../src/model/pieces');
    const { flattenContour } = await import('../src/geom/vec');
    const d = make();
    solve(d);
    const pcs = buildPieces(d);
    let n = 0;
    for (const p of Object.values(d.panels)) {
      if (!p.divider && !p.id.includes('div')) continue;
      const pc = pcs.find((q) => q.panels.some((x) => x.panelId === p.id));
      expect(pc).toBeTruthy();
      const pts = pc!.contours.filter((k) => k.role === 'outer').flatMap((k) => flattenContour(k.contour, 0.05));
      const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
      const long = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      const flap = 25;
      expect(long).toBeGreaterThan(Math.max(p.w, p.h) - 0.5);
      expect(long).toBeLessThan(Math.max(p.w, p.h) + 2 * flap);
      n++;
    }
    expect(n).toBeGreaterThan(0);
  });
});
