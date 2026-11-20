// Milestone 111 (D3a): fold-overs and plain flaps behind one registry; the output of `extrasByPanel` is unchanged.
import { describe, expect, it } from 'vitest';
import { edgeFeatures, featuresOnEdge } from '../src/model/edgeFeatures';
import { edgeFlapGeom, extrasByPanel, type PanelExtras } from '../src/model/geometry';
import { allFoldOvers } from '../src/model/foldover';
import { addEdgeFlap, addRootPanel, createDesign, growPanel } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { cardTray, closedBox, plainFlapBoard, v6CorrFoldover } from './goldenDesigns';
import type { Design } from '../src/model/types';

// the function as it was before the registry (milestone 111), kept to compare against
const noExtras = (): PanelExtras => ({ holes: [], adds: [], scores: [], cuts: [], linerHoles: [], lines: [], paths: [] });
function oldExtrasByPanel(d: Design, only?: string): Map<string, PanelExtras> {
  const out = new Map<string, PanelExtras>();
  const at = (id: string) => {
    let x = out.get(id);
    if (!x) out.set(id, (x = noExtras()));
    return x;
  };
  const want = (id: string) => !only || id === only;
  // fold-overs: rim and liner on their wall, lock slots in the base
  for (const fo of allFoldOvers(d)) {
    for (const h of fo.g.holes) if (want(h.panelId)) at(h.panelId).holes.push(h.poly);
    if (want(fo.panelId)) {
      const x = at(fo.panelId);
      for (const a of fo.g.adds) x.adds.push(a.poly);
      for (const s of fo.g.scores) x.scores.push(s);
      x.linerHoles.push(...fo.g.linerHoles);
    }
  }
  // plain flaps on free edges (milestone 67)
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p?.edgeFlaps?.length || !want(id)) continue;
    for (const f of p.edgeFlaps) {
      const g = edgeFlapGeom(d, p, f);
      if (!g) continue;
      at(id).adds.push(g.poly);
      at(id).scores.push(g.score);
    }
  }
  for (const c of Object.values(d.connections)) {
    if (!c.geom) continue;
    for (const k of c.geom.cuts ?? []) if (want(k.panelId)) at(k.panelId).cuts.push(k.poly);
    for (const h of c.geom.holes) if (want(h.panelId)) at(h.panelId).holes.push(h.poly);
    for (const a of c.geom.adds) if (want(a.panelId)) at(a.panelId).adds.push(a.poly);
    for (const s of c.geom.scores) if (want(s.panelId)) at(s.panelId).scores.push(s);
    for (const l of c.geom.lines ?? []) if (want(l.panelId)) at(l.panelId).lines.push(l);
    for (const q of c.geom.cutPaths ?? []) if (want(q.panelId)) at(q.panelId).paths.push({ pts: q.pts, closed: q.closed });
  }
  return out;
}

describe('the edge-feature registry', () => {
  it('fold-over hits are allFoldOvers, field for field (scores keep toward, slots are in the base)', () => {
    const d = v6CorrFoldover();
    const hits = edgeFeatures(d).filter((h) => h.kind === 'foldover');
    const fos = allFoldOvers(d);
    expect(hits.length).toBe(fos.length);
    expect(hits.length).toBeGreaterThan(0);
    hits.forEach((h, i) => {
      const g = fos[i].g;
      expect(h.panelId).toBe(fos[i].panelId);
      expect(g.adds.every((a) => a.panelId === h.panelId)).toBe(true);
      expect(h.out.adds).toEqual(g.adds.map((a) => a.poly));
      expect(h.out.scores).toEqual(g.scores);
      expect(h.out.holes).toEqual(g.holes);
      expect(h.out.linerHoles).toEqual(g.linerHoles);
      expect(h.out.hinged).toEqual([]);
    });
    expect(hits.some((h) => h.out.scores.some((s) => s.toward !== undefined))).toBe(true);
  });

  it('flap hits are edgeFlapGeom per flap', () => {
    const d = plainFlapBoard();
    const p = d.panels[d.order[0]];
    const hits = edgeFeatures(d).filter((h) => h.kind === 'flap');
    expect(hits.length).toBe(2);
    hits.forEach((h, i) => {
      const g = edgeFlapGeom(d, p, p.edgeFlaps![i])!;
      expect(h.out.adds).toEqual([g.poly]);
      expect(h.out.scores).toEqual([g.score]);
    });
    expect(featuresOnEdge(d, p.id, 'e2').map((h) => h.kind)).toEqual(['flap']);
    expect(featuresOnEdge(d, p.id, 'e0')).toEqual([]);
  });

  it('extrasByPanel is unchanged, whole and per board', () => {
    const designs: Design[] = [v6CorrFoldover(), plainFlapBoard(), cardTray(), closedBox(MATERIALS[0])];
    for (const d of designs) {
      expect(extrasByPanel(d)).toEqual(oldExtrasByPanel(d));
      for (const id of d.order) expect(extrasByPanel(d, id)).toEqual(oldExtrasByPanel(d, id));
    }
  });

  it("the base's extras still hold the fold-over's lock slots", () => {
    const d = v6CorrFoldover();
    const fo = allFoldOvers(d)[0];
    const baseId = fo.g.holes[0].panelId;
    expect(baseId).not.toBe(fo.panelId);
    expect(extrasByPanel(d, baseId).get(baseId)!.holes.length).toBeGreaterThanOrEqual(fo.g.holes.length);
  });

  it('a flap on a joined edge gives no hit', () => {
    const d = createDesign(MATERIALS[0]);
    const p = addRootPanel(d, 0, 0, 80, 50);
    growPanel(d, p, 'e2', { height: 30, angle: 90, dir: 'up', kind: 'fold' });
    addEdgeFlap(d, p, 'e2', 12);
    expect(edgeFeatures(d).filter((h) => h.kind === 'flap')).toEqual([]);
  });
});
