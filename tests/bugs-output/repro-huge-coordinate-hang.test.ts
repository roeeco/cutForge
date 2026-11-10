// parseProject accepts a project file (fixtures/huge-coordinate.json: a random corrugated design,
// one point of a cut flower sticker on a heptagon tray base set to x = 1e308; the shape scaled by its
// 41.8 mm size goes to Infinity). It loads with Infinity in the base outline and tray walls
// `tr_…/x12`, `x13` of width Infinity and NaN frames; validate() on it never returns (contact.ts
// samples every edge in 1.5 mm steps, n = ceil(Infinity / 1.5)). The class server
// (worker/index.ts) accepts the same file since it only runs parseProject.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ProjectError, parseProject } from '../../src/model/serialize';
import { panelEdges } from '../../src/model/edges';

describe('repro: huge coordinate in a loaded file', () => {
  it('is refused, or loads with finite geometry', () => {
    const text = readFileSync('tests/bugs-output/fixtures/huge-coordinate.json', 'utf8');
    let d;
    try {
      d = parseProject(text);
    } catch (e) {
      expect(e).toBeInstanceOf(ProjectError);
      return;
    }
    const bad = Object.values(d.panels)
      .filter((p) => !Number.isFinite(p.w) || p.frame.o.some((v) => !Number.isFinite(v)) || panelEdges(p).some((s) => !Number.isFinite(s.a.x) || !Number.isFinite(s.b.x)))
      .map((p) => p.id);
    expect(bad).toEqual([]); // actual: base and two tray walls with non-finite geometry; validate(d) then hangs
  });
});
