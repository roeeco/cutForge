// Milestone 119 (R0, SHAPES_TO_DIELINES_PLAN.md): the face graph and the unfolder on fixtures, timed.
// Hand-written graphs and kernel-built solids (manifold-3d 3.5.4); for each: extraction time, the
// first greedy pass, the unfold at a 400 ms budget, islands, overlaps and sheet fit. The numbers are
// printed (SPIKE_LOG=1) and recorded in PROGRESS.md; the test asserts no overlaps and a fit.
import { describe, expect, it } from 'vitest';
import { cube, diamond, fromTriangles, house, lPrism, prism, pyramid, type SGraph } from './facegraph';
import { unfoldSpike, verify } from './unfoldSpike';

type V3 = [number, number, number];
// the card sheet less its margins
const SHEET = { w: 490, h: 290 };
const BUDGET = Number(process.env.SPIKE_BUDGET ?? 400);

async function kernelSolids(): Promise<{ name: string; make: () => SGraph }[]> {
  const { default: Module } = await import('manifold-3d');
  const wasm = await Module();
  wasm.setup();
  const { Manifold, CrossSection } = wasm;
  const graph = (m: InstanceType<typeof Manifold>, name: string): SGraph => {
    const mesh = m.getMesh();
    mesh.merge();
    const np = mesh.numProp;
    const V: V3[] = [];
    for (let i = 0; i < mesh.vertProperties.length / np; i++) V.push([mesh.vertProperties[i * np], mesh.vertProperties[i * np + 1], mesh.vertProperties[i * np + 2]]);
    const T: [number, number, number][] = [];
    for (let i = 0; i < mesh.triVerts.length; i += 3) T.push([mesh.triVerts[i], mesh.triVerts[i + 1], mesh.triVerts[i + 2]]);
    return fromTriangles(V, T, name);
  };
  return [
    { name: 'cylinder, 12 facets (r 30, h 60)', make: () => graph(Manifold.cylinder(60, 30, 30, 12), 'cyl') },
    { name: 'box with a through-hole (80 × 60 × 40, hole r 12, 16 facets)', make: () => graph(Manifold.cube([80, 60, 40]).subtract(Manifold.cylinder(60, 12, 12, 16).translate([40, 30, -10])), 'hole') },
    { name: 'sphere, 8 facets (r 40)', make: () => graph(Manifold.sphere(40, 8), 'sph') },
    { name: 'torus 12 × 8 (R 40, r 12)', make: () => graph(Manifold.revolve(CrossSection.circle(12, 8).translate([40, 0]), 12), 'tor') },
    { name: 'torus 16 × 12 (R 50, r 14): ~200 faces', make: () => graph(Manifold.revolve(CrossSection.circle(14, 12).translate([50, 0]), 16), 'tor2') },
  ];
}

describe('R0 spike: face graph and unfolder', () => {
  it('every fixture unfolds with no overlap and fits the sheet; the numbers are recorded', async () => {
    const hand: { name: string; make: () => SGraph }[] = [
      { name: 'cube 60', make: () => cube(60) },
      { name: 'hexagonal prism (r 40, h 60)', make: () => prism(6, 40, 60) },
      { name: 'square pyramid (base 80, h 60)', make: () => pyramid(4, 56.6, 60) },
      { name: 'diamond, 8 sides (r 40)', make: () => diamond(8, 40, 15, 40) },
      { name: 'L-prism (80 × 70, h 50)', make: () => lPrism() },
      { name: 'house (80 × 60 × 50, roof 30)', make: () => house() },
    ];
    const rows: string[] = [];
    for (const fx of [...hand, ...(await kernelSolids())]) {
      const t0 = performance.now();
      const g = fx.make();
      const tx = performance.now() - t0;
      const t1 = performance.now();
      const u = unfoldSpike(g, { sheetW: SHEET.w, sheetH: SHEET.h, budgetMs: BUDGET, seed: 1 });
      const tu = performance.now() - t1;
      const v = verify(g, u, SHEET.w, SHEET.h);
      const concave = g.edges.filter((e) => e.dihedral > 180.01).length;
      rows.push(`| ${fx.name} | ${g.faces.length} | ${g.edges.length} | ${concave} | ${tx.toFixed(1)} | ${u.firstPassMs.toFixed(1)} | ${tu.toFixed(0)} | ${u.restarts} | ${u.islands.length} | ${v.overlapFree ? 'yes' : 'NO'} | ${v.fit ? 'yes' : 'NO'} |`);
      if (process.env.SPIKE_LOG) console.log('VERIFY', fx.name, JSON.stringify(v));
      expect(v.overlapFree, fx.name).toBe(true);
      expect(v.fit, fx.name).toBe(true);
      // the same seed gives the same net
      const again = unfoldSpike(g, { sheetW: SHEET.w, sheetH: SHEET.h, budgetMs: 0, seed: 1 });
      expect([...again.folds].sort()).toEqual([...unfoldSpike(g, { sheetW: SHEET.w, sheetH: SHEET.h, budgetMs: 0, seed: 1 }).folds].sort());
    }
    if (process.env.SPIKE_LOG)
      console.log(['| Fixture | Faces | Edges | Concave | Extract ms | First pass ms | Unfold ms (budget ' + BUDGET + ') | Restarts | Islands | No overlap | Fits |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |', ...rows].join('\n'));
  }, 120_000);
});
