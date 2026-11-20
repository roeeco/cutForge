// Milestone 128 (Shapes R9): Guided's pyramid and diamond, folded from card with no kernel.
import { describe, expect, it } from 'vitest';
import { SHAPE_THINGS, startSolid, thingsFor } from '../src/guided/things';
import { kindOf } from '../src/guided/box';
import { MATERIALS } from '../src/model/materials';
import { buildPieces, netOverlaps } from '../src/model/pieces';
import { reassemble } from '../src/model/reassemble';
import { solidPoly, SOLID_LIMITS } from '../src/model/solids';
import { assemblySteps } from '../src/model/assembly';
import { parseProject, serializeProject } from '../src/model/serialize';
import { validate } from '../src/model/validate';
import { foldDisplay } from '../src/views/foldView';

describe("Guided's ready shapes", () => {
  it('the gallery offers a pyramid and a diamond', () => {
    expect(thingsFor().map((t) => t.id)).toEqual(expect.arrayContaining(['pyramid', 'diamond']));
    expect(SHAPE_THINGS.every((t) => t.can(MATERIALS[3]))).toBe(true);
  });

  it.each([['pyramid', 5], ['diamond', 17]] as const)('a %s is folded from card, in one material, with nothing to fix', (kind, faces) => {
    // even started from plywood: always card
    const d = startSolid(kind, MATERIALS[3]);
    expect(d.material.kind).toBe('card');
    expect(d.order).toHaveLength(faces);
    expect(kindOf(d)).toBe('solid');
    expect(Object.values(d.connections).every((c) => !c.broken)).toBe(true);
    expect(buildPieces(d).length).toBeGreaterThanOrEqual(1);
    expect(netOverlaps(d)).toEqual([]);
    expect(validate(d).filter((i) => !/^val\.(sheet|small)/.test(i.key))).toEqual([]);
    // the folded preview closes
    const shut = foldDisplay(d, 1).xf;
    for (const m of shut.values()) expect(m.toArray().every((v, i) => Math.abs(v - [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1][i]) < 1e-9)).toBe(true);
    // seams numbered for Send's printed plan
    expect(assemblySteps(d).length).toBeGreaterThan(0);
  });

  it('a change of size makes it again and keeps a decoration by face', () => {
    const d = startSolid('diamond', MATERIALS[0]);
    d.panels['f:diamond:table'].details.push({ id: 'n', shape: 'circle', op: 'engrave', cx: 20, cy: 20, w: 8, h: 8 });
    const next = { ...d.make!.solid!, w: 140, n: 10 };
    reassemble(d, solidPoly(next), { ...d.make!, solid: next });
    expect(d.order).toHaveLength(21);
    expect(d.panels['f:diamond:table'].details.map((x) => x.id)).toEqual(['n']);
  });

  it('survives a save and load', () => {
    const d = startSolid('pyramid', MATERIALS[0]);
    expect(parseProject(serializeProject(d)).make!.solid).toEqual({ kind: 'pyramid', w: 100, h: 80, n: 4 });
  });

  it('every size the sliders offer folds with no overlap, so the guard never refuses one (a sweep)', () => {
    const bad: string[] = [];
    for (const kind of ['pyramid', 'diamond'] as const) {
      const lim = SOLID_LIMITS[kind];
      for (let n = lim.n[0]; n <= lim.n[1]; n++)
        for (const w of [lim.w[0], 100, lim.w[1]])
          for (const h of [lim.h[0], 80, lim.h[1]]) {
            const d = startSolid(kind, MATERIALS[0]);
            const next = { kind, w, h, n };
            reassemble(d, solidPoly(next), { ...d.make!, solid: next });
            const keys = validate(d).map((i) => i.key).filter((k) => k === 'val.netOverlap');
            if (keys.length) bad.push(`${kind} n${n} w${w} h${h}`);
          }
    }
    expect(bad).toEqual([]);
  }, 60_000);
});
