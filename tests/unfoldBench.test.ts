// The unfolder's benchmark (milestone 190): shapes that split, eight seeds each, through Make's own
// reassembly with automatic faces: the pieces each gives, the fewest there can be (faces joined only
// by a hole's rim never fold together), the time. Opt-in: `BENCH=1 npx vitest run tests/unfoldBench.test.ts --silent=false`.
import { it } from 'vitest';
import { kernel } from '../src/sculpt/kernel';
import { addShape, createWaffleDesign, groupShapes, primitiveShape } from '../src/sculpt/ops';
import { shapePolyhedron } from '../src/sculpt/polyhedron';
import { reassemble } from '../src/model/reassemble';
import { facetsFor } from '../src/make/run';
import { netGroups } from '../src/model/pieces';
import { validate } from '../src/model/validate';
import { MATERIALS } from '../src/model/materials';
import type { Quat, Shape3 } from '../src/model/types';
import { seamFoldable } from '../src/model/foldRules';

type S = Omit<Shape3, 'id' | 'name'>;
const P = (kind: any, w: number, h: number, d: number, extra: Partial<S> = {}, at: [number, number, number] = [0, 0, 0]): S => ({ ...primitiveShape(kind, { x: at[0], z: at[2], y: at[1], w, d }, h), ...extra });
const q = (ax: number[], deg: number): Quat => { const a = (deg * Math.PI) / 360, s = Math.sin(a); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(a)] as Quat; };
const H = (s: S): S => ({ ...s, hole: true });
const CASES: [string, number, S[], boolean][] = [
  ['tallcyl', 0, [P('cylinder', 60, 150, 60)], false],
  ['cylinder', 0, [P('cylinder', 80, 100, 80)], false],
  ['twocyl', 0, [P('cylinder', 40, 120, 40, { q: q([1, 0, 0], 90) }, [0, 20, 60]), P('cylinder', 40, 120, 40, { q: q([0, 0, 1], 90) }, [60, 20, 0])], true],
  ['ring', 0, [P('torus', 120, 20, 120)], false],
  ['crossholes', 0, [P('box', 80, 80, 80), H(P('cylinder', 40, 90, 40, {}, [0, -5, 0])), H(P('cylinder', 40, 90, 40, { q: q([1, 0, 0], 90) }, [0, 40, 45])), H(P('cylinder', 40, 90, 40, { q: q([0, 0, 1], 90) }, [45, 40, 0]))], true],
  ['hole', 0, [P('box', 100, 60, 100), H(P('cylinder', 40, 60, 40))], true],
  ['tray', 0, [P('box', 120, 40, 80), H(P('box', 110, 40, 70, {}, [0, 3, 0]))], true],
  ['dent', 0, [P('box', 100, 50, 100), H(P('sphere', 60, 60, 60, {}, [0, 25, 0]))], true],
  ['gemhole', 0, [P('gem', 90, 60, 90), H(P('cylinder', 20, 80, 20, {}, [0, -10, 0]))], true],
  ['squaredonut', 0, [P('box', 100, 30, 100), H(P('box', 40, 40, 40, {}, [0, -5, 0]))], true],
  ['sphere', 0, [P('sphere', 100, 100, 100)], false],
  ['cyl corr4', 2, [P('cylinder', 80, 100, 80)], false],
  ['cone corr4', 2, [P('cone', 80, 100, 80)], false],
  ['twocyl corr4', 2, [P('cylinder', 40, 120, 40, { q: q([1, 0, 0], 90) }, [0, 20, 60]), P('cylinder', 40, 120, 40, { q: q([0, 0, 1], 90) }, [60, 20, 0])], true],
];
it.skipIf(!process.env.BENCH)('bench', async () => {
  const k = await kernel();
  const rows: string[] = [];
  let total = 0;
  for (const [name, mi, shapes, group] of CASES) {
    const m = MATERIALS[mi];
    const d0 = createWaffleDesign(m);
    const ids = shapes.map((s) => addShape(d0, s));
    if (group) groupShapes(d0, ids);
    const f = facetsFor({ as: 'fold' }, m);
    const poly = shapePolyhedron(k, d0.sculpt!, f.n, f.byShape);
    const parent = new Map(Object.keys(poly.faces).map((x) => [x, x]));
    const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
    for (const e of Object.values(poly.edges)) if (!e.ea.ring && !e.eb.ring && seamFoldable(e.dihedral)) parent.set(find(e.a), find(e.b));
    const least = new Set(Object.keys(poly.faces).map(find)).size;
    const pcs: number[] = [];
    let bad = 0;
    const t0 = performance.now();
    for (let s = 0; s < 8; s++) {
      const d = createWaffleDesign(m);
      d.id = `bench-${s}`;
      reassemble(d, poly, { as: 'fold' });
      pcs.push(netGroups(d).filter((g) => d.panels[g[0].panelId]?.src).length);
      if (validate(d).some((i) => i.key === 'val.netOverlap')) bad++;
    }
    const ms = (performance.now() - t0) / 8;
    total += pcs.reduce((a, b) => a + b, 0);
    rows.push(`${name.padEnd(14)} faces ${String(Object.keys(poly.faces).length).padStart(3)} least ${least} pieces ${pcs.join(',')} avg ${(pcs.reduce((a, b) => a + b, 0) / 8).toFixed(2)} ${Math.round(ms)}ms${bad ? ' OVERLAP×' + bad : ''}`);
  }
  console.log('BENCH\n' + rows.join('\n') + '\nTOTAL pieces ' + total);
}, 600000);
