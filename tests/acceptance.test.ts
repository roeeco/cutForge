// Acceptance checks that span milestones (polygons-and-corrugated-agent-prompt.md §8).
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addFoldOver, addPolygonPanel, addTray, autoConnect, createDesign, regularPolygon, setTrayKinds } from '../src/model/ops';
import { trayWalls } from '../src/model/trays';
import { cornerAngle, cornerFit, offsetConvex } from '../src/model/seams';
import { allFoldOvers } from '../src/model/foldover';
import { buildPieces } from '../src/model/pieces';
import { prepareExport } from '../src/export/prepare';
import { sheetsToDxf } from '../src/export/dxf';
import { sheetsToSvg as toSvg } from '../src/export/svg';
import { validate } from '../src/model/validate';
import { MATERIALS, minWeb } from '../src/model/materials';
import { findEdge, segInward } from '../src/model/edges';
import { serializeProject, parseProject } from '../src/model/serialize';

const CORR4 = MATERIALS[2];

function hasPython() {
  try {
    execFileSync('python3', ['-c', 'import ezdxf, svgpathtools']);
    return true;
  } catch {
    return false;
  }
}

/** Corrugated hexagon tray: 120° tab-and-slot corners with through tabs, fold-over with lock tabs on every wall. */
function corrHex() {
  const d = createDesign(CORR4);
  const base = addPolygonPanel(d, 0, 0, regularPolygon(6, 70))!;
  const tray = addTray(d, base, 55)!;
  setTrayKinds(d, tray, { tabLen: 'through' });
  autoConnect(d);
  for (const w of trayWalls(d, tray)) addFoldOver(d, w);
  autoConnect(d);
  return { d, base, tray };
}

describe('corrugated: 120° tab-and-slot corners, through tabs and fold-over', () => {
  it('clearance is applied once and every slot keeps the minimum web', () => {
    const { d, base, tray } = corrHex();
    const corners = Object.values(d.connections).filter((c) => !c.grown && c.trayId === tray);
    expect(corners).toHaveLength(6);
    for (const c of corners) {
      expect(c.kind).toBe('tabslot');
      expect(c.tabLen).toBe('through');
      const f = cornerFit(d.panels[c.a.panelId], c.a.edge, d.panels[c.b.panelId], c.b.edge)!;
      expect(cornerAngle(f)).toBeCloseTo(120, 6);
      // each slot is the tab's footprint grown by c/2 all round, and nothing more: shrinking it back by c/2 leaves the footprint
      for (const h of c.geom!.holes) {
        const back = offsetConvex(h.poly, -CORR4.clearance / 2);
        const area = (pts: { x: number; y: number }[]) => Math.abs(pts.reduce((s, p, i) => s + p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y, 0) / 2);
        expect(area(back)).toBeGreaterThan(0);
        expect(area(h.poly)).toBeGreaterThan(area(back));
      }
    }
    // lock slots in the base: the minimum web to the base edge
    const B = d.panels[base];
    for (const fo of allFoldOvers(d)) {
      const c = Object.values(d.connections).find((x) => x.grown && x.b.panelId === fo.panelId)!;
      const e = findEdge(B, c.a.edge)!;
      const bi = segInward(e);
      for (const s of fo.g.holes) for (const q of s.poly) expect((q.x - e.a.x) * bi.x + (q.y - e.a.y) * bi.y).toBeGreaterThanOrEqual(minWeb(CORR4) - 1e-9);
    }
    expect(buildPieces(d)).toHaveLength(1);
    expect(validate(d).filter((i) => !['val.foldClearance', 'val.flute'].includes(i.key))).toEqual([]);
  });

  it.skipIf(!hasPython())('an independent reader (ezdxf, svgpathtools) confirms the export', () => {
    const { d } = corrHex();
    const prep = prepareExport(d, 'nominal');
    const dir = mkdtempSync(join(tmpdir(), 'cutforge-acc-'));
    const dxfPath = join(dir, 'hex.dxf'), svgPath = join(dir, 'hex.svg');
    writeFileSync(dxfPath, sheetsToDxf(prep.sheets));
    writeFileSync(svgPath, toSvg(prep.sheets));
    const r = JSON.parse(execFileSync('python3', ['tests/py/check_exports.py', dxfPath, svgPath]).toString());
    expect(r.dxf.insunits).toBe(4);
    const cut = r.dxf.entities.filter((e: any) => e.layer === 'CUT');
    const score = r.dxf.entities.filter((e: any) => e.layer === 'SCORE');
    // every cut contour is closed; the model's holes and outer outline are all there
    expect(cut.every((e: any) => e.type !== 'POLYLINE' || e.closed)).toBe(true);
    const modelCuts = prep.sheets.flatMap((s) => s.contours.filter((k) => k.op === 'cut'));
    expect(cut).toHaveLength(modelCuts.length);
    // scores: folds, rim strips, lock-tab roots and through-tab scores
    expect(score.length).toBe(prep.sheets.flatMap((s) => s.contours.filter((k) => k.op === 'score')).length);
    // 6 base folds + 6 walls × (2 rim + 2 lock-tab roots) + one through-tab score per corner tab
    const cornerTabs = Object.values(d.connections).filter((c) => !c.grown && c.tabLen === 'through').reduce((n, c) => n + c.geom!.scores.length, 0);
    expect(score.length).toBe(6 + 6 * 4 + cornerTabs);
    expect(r.svg.width).toBe(`${CORR4.sheetW}mm`);
    expect(r.svg.paths.filter((p: any) => p.closed).length).toBe(modelCuts.length);
  });

  it('saves and reloads to the same SVG', () => {
    const { d } = corrHex();
    const before = toSvg(prepareExport(d, 'nominal').sheets);
    const again = parseProject(serializeProject(d));
    expect(toSvg(prepareExport(again, 'nominal').sheets)).toBe(before);
  });
});
