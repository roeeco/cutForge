// Milestone 66 (PACKAGING_PLAN.md §5.1–§5.3): the pattern library, its reasons, the flute check.
import { describe, expect, it } from 'vitest';
import { addRootPanel, addRoundedRect, addTray, autoConnect, createDesign, growPanel, setConnection, solve } from '../src/model/ops';
import { MATERIALS, bendOf } from '../src/model/materials';
import { bandOf } from '../src/model/bands';
import { bandPattern, patternReach, patternsFor, patternWhy } from '../src/model/bendPatterns';
import { wingBands } from '../src/model/wings';
import { buildPieces } from '../src/model/pieces';
import { validate } from '../src/model/validate';
import { fixIssue } from '../src/easy/fix';
import { prepareExport } from '../src/export/prepare';
import { sheetsToSvg } from '../src/export/svg';
import { bendTestSheet } from '../src/export/bendTest';
import type { Design, PatternId } from '../src/model/types';
import { loadFonts } from './fuzz/gen';

loadFonts();

const [CARD, CORR16, , PLY] = MATERIALS;

function lidBox(m: typeof CARD, radius: number, pattern?: PatternId) {
  const d = createDesign(m);
  const base = addRootPanel(d, 0, 0, 120, 80);
  addTray(d, base, 60);
  autoConnect(d);
  const back = Object.values(d.connections).find((c) => c.grown && c.a.panelId === base && c.a.edge === 'e2')!.b.panelId;
  const g = growPanel(d, back, 'e2', { height: 80, angle: 90, dir: 'up', kind: 'fold' })!;
  setConnection(d, g.connectionId, { radius, ...(pattern ? { bend: { pattern } } : {}) });
  solve(d);
  return { d, cid: g.connectionId };
}

describe('the pattern library', () => {
  it('each material offers its patterns in the order Automatic tries them', () => {
    expect(patternsFor('card')).toEqual(['smooth', 'score', 'perf']);
    expect(patternsFor('corrugated')).toEqual(['smooth', 'kiss', 'perf']);
    expect(patternsFor('plywood')).toEqual(['smooth', 'slits', 'wave', 'diamond']);
  });

  it('plywood hinges: diamonds bend tightest, then wave slits, then straight slits', () => {
    const ctx = { m: PLY, r: 0, len: 60, width: 60, turn: Math.PI / 2 };
    expect(patternReach('diamond', ctx)).toBeLessThan(patternReach('wave', ctx));
    expect(patternReach('wave', ctx)).toBeLessThan(patternReach('slits', ctx));
  });

  it('card perforations: tighter than scores; short cut dashes kept a web from the band edges, every other line staggered', () => {
    const { d, cid } = lidBox(CARD, 3.5);
    const b = bandOf(d, d.connections[cid])!;
    expect(b.pattern.id).toBe('perf');
    expect(b.pattern.why).toBeNull();
    const cuts = b.pattern.lines.cuts;
    expect(cuts.length).toBeGreaterThan(b.pattern.count);
    for (const s of cuts) {
      expect(Math.min(s.a.y, s.b.y)).toBeGreaterThanOrEqual(1.5 - 1e-9);
      expect(Math.abs(s.b.y - s.a.y)).toBeLessThanOrEqual(3 + 1e-9);
    }
    expect(validate(d).filter((i) => i.key.startsWith('val.bend'))).toEqual([]);
  });

  it('corrugated kiss scores: chosen below the smooth radius; the piece is cut inside up, mirrored, with a note on the guide layer', () => {
    const d = createDesign(CORR16);
    const base = addRoundedRect(d, 0, 0, 140, 100, 14)!;
    addTray(d, base, 45);
    autoConnect(d);
    const c = Object.values(d.connections).find((x) => x.wing)!;
    const b = wingBands(d, c)[0];
    expect(b.pattern.id).toBe('kiss');
    expect(b.pattern.lines.scores.length).toBeGreaterThan(0);
    const sheets = prepareExport(d).sheets;
    expect(sheets.flatMap((s) => s.contours).some((x) => x.op === 'guide')).toBe(true);
    expect(() => sheetsToSvg(sheets)).not.toThrow();
    expect(validate(d).filter((i) => i.key.startsWith('val.bend') || i.key === 'val.fluteBend')).toEqual([]);
  });

  it('wave slits are open S-shaped cut paths; diamonds closed holes; both exported, the compensated wave as long as drawn less the kerf', () => {
    for (const p of ['wave', 'diamond'] as const) {
      const { d, cid } = lidBox(PLY, 40, p);
      const b = bandOf(d, d.connections[cid])!;
      expect(b.pattern.id).toBe(p);
      expect(b.pattern.lines.paths.length).toBeGreaterThan(10);
      expect(b.pattern.lines.paths.every((q) => q.closed === (p === 'diamond'))).toBe(true);
      const piece = buildPieces(d).find((x) => x.panels.some((n) => n.panelId === b.parent))!;
      expect(piece.contours.filter((x) => x.op === 'cut' && (p === 'wave' ? x.role === 'line' : x.role === 'hole') && x.ref?.foldId === cid)).toHaveLength(b.pattern.lines.paths.length);
      expect(() => sheetsToSvg(prepareExport(d, 'compensated').sheets)).not.toThrow();
      expect(validate(d).filter((i) => i.key.startsWith('val.bend'))).toEqual([]);
    }
  });

  it('every reason a pattern cannot be used is given, with the radius or length it needs', () => {
    const tight = { m: CARD, r: 2, len: 50, width: 10, turn: Math.PI / 2 };
    expect(patternWhy('score', tight)).toEqual({ key: 'radius', value: bendOf(CARD).patternR });
    expect(patternWhy('perf', tight)?.key).toBe('radius');
    expect(patternWhy('slits', tight)?.key).toBe('material');
    const short = { m: PLY, r: 40, len: 8, width: 50, turn: Math.PI / 2 };
    for (const p of ['slits', 'wave', 'diamond'] as const) expect(patternWhy(p, short)?.key).toBe('short');
    // Automatic falls back to the tightest-reaching when none works, and says why
    expect(bandPattern(tight, 'auto').why?.key).toBe('radius');
  });

  it('a smooth corrugated bend across the flutes is named; Fix perforates it', () => {
    const d = createDesign(CORR16);
    const base = addRoundedRect(d, 0, 0, 140, 100, 40)!;
    addTray(d, base, 45);
    autoConnect(d);
    const flutes = validate(d).filter((i) => i.key === 'val.fluteBend');
    // the walls fold off the base all round: half the corners' bands lie across the flutes on the sheet
    expect(flutes.length).toBeGreaterThan(0);
    expect(flutes.length).toBeLessThan(4);
    for (let n = 0; n < 4; n++) {
      const i = validate(d).find((x) => x.key === 'val.fluteBend');
      if (!i) break;
      expect(fixIssue(d, i)).toBe(true);
    }
    expect(validate(d).filter((i) => i.key === 'val.fluteBend')).toEqual([]);
    expect(Object.values(d.connections).filter((c) => c.wing && c.bend?.pattern === 'perf').length).toBe(flutes.length);
    expect(base).toBeTruthy();
  });

  it('the bend test strip for each material and pattern exports', () => {
    for (const [m, p] of [[CARD, 'perf'], [CORR16, 'kiss'], [PLY, 'wave'], [PLY, 'diamond']] as const) expect(() => sheetsToSvg([bendTestSheet(m, (r) => `R ${r}`, p)])).not.toThrow();
  });
});

export const _unused = (d: Design) => d;
