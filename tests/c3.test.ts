// Milestone C3 (SENTENCE_STYLES_PLAN.md): the crash-lock (auto) bottom.
import { describe, expect, it } from 'vitest';
import '../src/templates/registry';
import polygonClipping from 'polygon-clipping';
import { MATERIALS } from '../src/model/materials';
import { cartonDesign } from '../src/templates/structures/carton';
import { CRASH_LOCK_OFFERED, backAndFront, endId } from '../src/model/cartons';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/fix';
import { defaults, templateById } from '../src/templates/registry';
import { listOf, chooseStructure } from '../src/sentence/resolve';
import { pieceCopies } from '../src/model/pack';
import { annotations } from '../src/export/annotate';
import { STYLES, styleListed } from '../src/templates/styles';

const CARD = MATERIALS[0], CORR = MATERIALS[1];

describe('C3: the crash-lock bottom', () => {
  const d = cartonDesign(CARD, 'tuck', 'crash', 90, 60, 120);
  const t = Object.values(d.trays)[0];
  const end = d.connections[endId(t, 'bottom')];

  it('builds with nothing blocking', () => {
    expect(validate(d).filter((i) => !NOTE_KEYS.has(i.key)).map((i) => i.key)).toEqual([]);
  });

  it('each major flap has a 45° crease from its hinge corner to the middle: a right isosceles glue triangle with legs half the depth', () => {
    const { back, front } = backAndFront(d, t);
    for (const w of [back!.wall, front!.wall]) {
      const diag = end.geom!.scores.filter((s) => s.panelId === w && Math.abs(s.a.x - s.b.x) > 1 && Math.abs(s.a.y - s.b.y) > 1);
      expect(diag).toHaveLength(1);
      const dx = Math.abs(diag[0].b.x - diag[0].a.x), dy = Math.abs(diag[0].b.y - diag[0].a.y);
      expect(dx).toBeCloseTo(dy, 6);
      // half the inside depth (60), less the flap's 0.5 mm
      expect(dy).toBeGreaterThan(28);
      expect(dy).toBeLessThan(30.5);
    }
    expect(end.geom!.glueAt).toHaveLength(2);
  });

  it('folded, the flaps cover the whole bottom (no gap over 0.5 mm wide)', () => {
    const base = d.panels[t.baseId];
    const polys = end.geom!.flaps3d.filter((f) => f.panelId === base.id).map((f) => [f.poly.map((q) => [q.x, q.y] as [number, number])]);
    const u = polygonClipping.union(...(polys as [polygonClipping.Polygon, ...polygonClipping.Polygon[]]));
    const inner: polygonClipping.Polygon = [[[0.5, 0.5], [base.w - 0.5, 0.5], [base.w - 0.5, base.h - 0.5], [0.5, base.h - 0.5]]];
    const left = polygonClipping.difference(inner, u);
    // what is not covered: at most slivers along the walls
    const area = (mp: polygonClipping.MultiPolygon) => mp.reduce((s, poly) => s + poly.reduce((s2, ring, k) => {
      let a = 0;
      for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
      return s2 + (k === 0 ? 1 : -1) * Math.abs(a / 2);
    }, 0), 0);
    expect(area(left)).toBeLessThan(0.02 * base.w * base.h);
  });

  it('card only, and held back until the patent question is settled: corrugated never offers it; card offers it (and its style) only when released', () => {
    const carton = templateById('carton')!;
    const p = chooseStructure(carton, CARD, defaults(carton)).params;
    const pc = chooseStructure(carton, CORR, defaults(carton)).params;
    expect(listOf(carton, CORR, pc, 'bottom')).not.toContain('crash');
    const style = STYLES.find((s) => s.id === 'autoBottom')!;
    expect(listOf(carton, CARD, p, 'bottom').includes('crash')).toBe(CRASH_LOCK_OFFERED);
    expect(styleListed(style, CARD, p, templateById)).toBe(CRASH_LOCK_OFFERED);
    expect(styleListed(style, CORR, pc, templateById)).toBe(false);
  });

  it('the glue triangles are named on the cut plan', () => {
    const c = pieceCopies(d)[0];
    expect(annotations(d, c, (id) => id).filter((a) => a.kind === 'glue').length).toBeGreaterThanOrEqual(2);
  });
});
