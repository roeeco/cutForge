// Milestone 154 (DIELINE_GENERATOR_ANALYSIS.md §3.3): the gusset corner. A card or corrugated tray with gusset corners
// cuts as one net whose corners are not cut (its outline is the whole rectangle round the base), creased along the
// walls' sides and the squares' diagonals, and folds with each gusset flat against a wall; the corner rule is a slot
// of the record.
import { describe, expect, it } from 'vitest';
import '../src/templates/registry';
import { MATERIALS } from '../src/model/materials';
import { createDesign, setTrayKinds, solve } from '../src/model/ops';
import { boxRecipe } from '../src/easy/recipes';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/fix';
import { prepareExport } from '../src/export/prepare';
import { flattenContour, polygonArea } from '../src/geom/vec';
import { seamKinds } from '../src/model/seams';
import { pairKinds } from '../src/model/jointDefaults';
import { recordOf } from '../src/templates/records';
import { recognise } from '../src/templates/catalogue';
import type { Design } from '../src/model/types';

const CARD = MATERIALS.find((m) => m.id === 'card-0.5')!;
const C16 = MATERIALS.find((m) => m.id === 'corr-1.6')!;
const PLY = MATERIALS.find((m) => m.id === 'ply-3')!;
const blocking = (d: Design) => validate(d).filter((i) => !NOTE_KEYS.has(i.key)).map((i) => i.key);

function gussetTray(m: typeof CARD, w = 120, dep = 80, h = 35): Design {
  const d = createDesign(m);
  boxRecipe(d, { kind: 'rect', x0: -w / 2, z0: -dep / 2, x1: w / 2, z1: dep / 2 }, h);
  const t = Object.values(d.trays)[0];
  setTrayKinds(d, t.id, { cornerKind: 'gusset' });
  solve(d);
  return d;
}

describe('gusset corners (milestone 154)', () => {
  it('are offered on card and corrugated corners, not plywood', () => {
    expect(seamKinds(CARD, 'corner')).toContain('gusset');
    expect(seamKinds(C16, 'corner')).toContain('gusset');
    expect(seamKinds(PLY, 'corner')).not.toContain('gusset');
  });

  for (const m of [CARD, C16])
    it(`a tray in ${m.id}: one net, corners uncut, four gussets folded, nothing blocking`, () => {
      const d = gussetTray(m);
      const t = Object.values(d.trays)[0];
      const corners = Object.values(d.connections).filter((c) => !c.grown && c.kind === 'gusset');
      expect(corners.length).toBe(4);
      for (const c of corners) expect(c.broken, c.id).toBeFalsy();
      expect(blocking(d)).toEqual([]);
      const prep = prepareExport(d);
      const outers = prep.sheets.flatMap((s) => s.contours.filter((c) => c.role === 'outer'));
      // one piece: the base, its walls and their gussets
      expect(outers.length).toBe(1);
      // its outline is the whole rectangle round the base: no corner cut away
      const pts = flattenContour(outers[0].contour, 0.05);
      const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
      const bbox = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
      expect(Math.abs(polygonArea(pts)) / bbox).toBeGreaterThan(0.97);
      // creases: the four walls' folds, two sides and a diagonal at each corner
      const scores = prep.sheets.flatMap((s) => s.contours.filter((c) => c.op === 'score'));
      expect(scores.length).toBeGreaterThanOrEqual(4 + 4 * 3);
      // folded in 3D: a doubled triangle on a wall at each corner
      expect(corners.reduce((n, c) => n + (c.geom?.flaps3d.length ?? 0), 0)).toBe(4);
      expect(t.cornerKind).toBe('gusset');
    });

  it('is refused where the walls cannot meet in an uncut square (a hexagon: its walls meet at 120°)', () => {
    const d = createDesign(CARD);
    boxRecipe(d, { kind: 'regular', x0: -50, z0: -50, x1: 50, z1: 50, sides: 6 }, 35);
    const t = Object.values(d.trays)[0];
    const corners = Object.values(d.connections).filter((c) => !c.grown && c.trayId === t.id);
    expect(corners.length).toBe(6);
    for (const c of corners) c.kind = c.pref = 'gusset';
    solve(d);
    // not offered there, so each corner falls back to a joint it can have
    for (const c of corners) {
      expect(pairKinds(d, c), c.id).not.toContain('gusset');
      expect(d.connections[c.id].kind, c.id).not.toBe('gusset');
      expect(d.connections[c.id].broken, c.id).toBeFalsy();
    }
  });

  it('is a slot of the record; a gusset tray is still an open box', () => {
    const d = gussetTray(CARD);
    expect(recordOf(d)).toMatchObject({ body: 'cross', corner: 'gusset' });
    expect(recognise(d)?.card.id).toBe('openBox');
  });
});
