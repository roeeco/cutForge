// Milestone 83 (LIDS_LINES_PROJECTS_PLAN.md §5): lines drawn on a board, their types, clipping, dashes, checks, the file.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/model/materials';
import { addDetail, addLine, addRootPanel, createDesign, deleteLine, findLine, solve, updateLine } from '../src/model/ops';
import { bulgeArc, clippedLine, dashes, lineDashes, linePolyline } from '../src/model/lines';
import { buildPieces } from '../src/model/pieces';
import { validate } from '../src/model/validate';
import { prepareExport } from '../src/export/prepare';
import { sheetsToSvg } from '../src/export/svg';
import { idempotence, roundTrip } from './harness';

const [CARD, CORR16, , PLY] = MATERIALS;
const len = (pl: { x: number; y: number }[]) => pl.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - pl[i].x, q.y - pl[i].y), 0);

describe('dashes', () => {
  it('a perforation starts with a cut, a cut-crease with a tie; cut and tie lengths; the last dash ends at the line', () => {
    const pl = [{ x: 0, y: 0 }, { x: 20, y: 0 }];
    const p = dashes(pl, 3, 1, true);
    expect(p[0][0].x).toBeCloseTo(0, 9);
    expect(len(p[0])).toBeCloseTo(3, 9);
    expect(p[1][0].x).toBeCloseTo(4, 9);
    expect(p[p.length - 1][p[p.length - 1].length - 1].x).toBeLessThanOrEqual(20 + 1e-9);
    const c = dashes(pl, 3, 1, false);
    expect(c[0][0].x).toBeCloseTo(1, 9);
    // shorter than one dash: one dash (a perforation), nothing (a cut-crease)
    expect(dashes([{ x: 0, y: 0 }, { x: 2, y: 0 }], 3, 1, true)).toHaveLength(1);
    expect(dashes([{ x: 0, y: 0 }, { x: 2, y: 0 }], 3, 1, false)).toHaveLength(0);
  });
  it('round corners: dashes follow a polyline round its turns', () => {
    const pl = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    const ds = dashes(pl, 5, 2, true);
    expect(ds.reduce((s, k) => s + len(k), 0)).toBeCloseTo(15, 6);
    expect(ds.some((k) => k.length === 3)).toBe(true); // the one across the corner keeps it
  });
  it('dash lengths per material', () => {
    expect(lineDashes(CARD).perf).toEqual([1.5, 0.7]);
    expect(lineDashes(PLY).crease).toEqual([10, 5]);
    expect(lineDashes({ ...CORR16, lines: { perf: [2, 2], crease: [5, 5] } }).perf).toEqual([2, 2]);
  });
});

describe('arcs', () => {
  it('a bulge of 1 is a half circle; the polyline follows it', () => {
    const a = bulgeArc({ x: 0, y: 0 }, { x: 20, y: 0 }, 1)!;
    expect(a.r).toBeCloseTo(10, 9);
    expect(a.sweep).toBeCloseTo(Math.PI, 9);
    const pl = linePolyline({ pts: [{ x: 0, y: 0, bulge: 1 }, { x: 20, y: 0 }] });
    expect(len(pl)).toBeCloseTo(Math.PI * 10, 1);
    for (const q of pl) expect(Math.hypot(q.x - a.c.x, q.y - a.c.y)).toBeCloseTo(10, 6);
  });
});

describe('lines on a board', () => {
  function board() {
    const d = createDesign(CARD);
    const p = addRootPanel(d, 0, 0, 100, 60);
    solve(d);
    return { d, p };
  }
  it('clipped at the outline and at holes', () => {
    const { d, p } = board();
    addDetail(d, p, 'rect', 'cut', 50, 30, 20, 20);
    const id = addLine(d, p, [{ x: -10, y: 30 }, { x: 110, y: 30 }], 'crease')!;
    const parts = clippedLine(d.panels[p], findLine(d, id)!.line);
    expect(parts).toHaveLength(2);
    expect(parts[0][0].x).toBeCloseTo(0, 6);
    expect(parts[0][parts[0].length - 1].x).toBeCloseTo(40, 6);
    expect(parts[1][0].x).toBeCloseTo(60, 6);
    expect(parts[1][parts[1].length - 1].x).toBeCloseTo(100, 6);
  });
  it('each type lands on its layer in the file: cut and dashes on CUT, crease on SCORE, guide on GUIDE', () => {
    const { d, p } = board();
    addLine(d, p, [{ x: 10, y: 10 }, { x: 40, y: 10 }], 'cut');
    addLine(d, p, [{ x: 10, y: 20 }, { x: 90, y: 20 }], 'crease');
    addLine(d, p, [{ x: 10, y: 30 }, { x: 90, y: 30 }], 'perf');
    addLine(d, p, [{ x: 10, y: 40 }, { x: 90, y: 40 }], 'cutcrease');
    addLine(d, p, [{ x: 10, y: 50 }, { x: 90, y: 50 }], 'guide');
    const cs = buildPieces(d)[0].contours.filter((k) => k.ref?.detailId);
    const by = (op: string) => cs.filter((k) => k.op === op).length;
    // 80 mm: card perforation 1.5 / 0.7 → 37 dashes; cut-crease 4 / 2, starting with a tie → 13
    expect(by('score')).toBe(1);
    expect(by('guide')).toBe(1);
    expect(by('cut')).toBe(1 + 37 + 13);
    expect(validate(d).map((i) => i.key)).toEqual([]);
    const svg = sheetsToSvg(prepareExport(d, 'compensated').sheets);
    expect(svg).toContain('GUIDE');
    expect(idempotence(d)).toBeNull();
    expect(roundTrip(d)).toBeNull();
  });
  it('a cut from edge to edge is refused by the check; a perforation is not; a line off the board is named', () => {
    const { d, p } = board();
    const id = addLine(d, p, [{ x: 50, y: -5 }, { x: 50, y: 65 }], 'cut')!;
    expect(validate(d).map((i) => i.key)).toContain('val.lineSplits');
    updateLine(d, id, { type: 'perf' });
    expect(validate(d).map((i) => i.key)).not.toContain('val.lineSplits');
    deleteLine(d, id);
    expect(d.panels[p].lines).toBeUndefined();
    addLine(d, p, [{ x: 200, y: 5 }, { x: 220, y: 5 }], 'crease');
    expect(validate(d).map((i) => i.key)).toContain('val.lineOutside');
  });
  it('kerf compensation leaves open lines where they are', () => {
    const { d, p } = board();
    addLine(d, p, [{ x: 10, y: 10 }, { x: 40, y: 10 }], 'cut');
    const a = prepareExport(d, 'nominal').sheets, b = prepareExport(d, 'compensated').sheets;
    // not offset sideways like an outline: the same line, its ends pulled in by half the kerf so the burn ends where it is drawn
    const open = (s: typeof a) => s.flatMap((x) => x.contours.filter((k) => !k.contour.closed && k.op === 'cut')).map((k) => k.contour.segs.reduce((n, g) => n + Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y), 0));
    expect(open(a)).toHaveLength(1);
    expect(open(a)[0]).toBeCloseTo(30, 6);
    expect(30 - open(b)[0]).toBeGreaterThanOrEqual(0);
    expect(30 - open(b)[0]).toBeLessThanOrEqual(CARD.kerf + 1e-9);
  });
});

describe('how a fold is made (milestone 85)', () => {
  it('a card tray fold as a perforation or a cut-crease: dashes on CUT and no score; back to a score', async () => {
    const { addTray, autoConnect, setConnection } = await import('../src/model/ops');
    const d = createDesign(CARD);
    const b = addRootPanel(d, 0, 0, 100, 70);
    addTray(d, b, 40);
    autoConnect(d);
    const fold = Object.values(d.connections).find((c) => c.grown && c.kind === 'fold')!;
    const of = () => buildPieces(d).flatMap((p) => p.contours.filter((k) => k.ref?.foldId === fold.id));
    expect(of().every((k) => k.op === 'score')).toBe(true);
    setConnection(d, fold.id, { crease: 'perf' });
    expect(of().length).toBeGreaterThan(5);
    expect(of().every((k) => k.op === 'cut')).toBe(true);
    setConnection(d, fold.id, { crease: 'cutcrease' });
    const cc = of();
    expect(cc.every((k) => k.op === 'cut')).toBe(true);
    setConnection(d, fold.id, { crease: undefined });
    expect(of().every((k) => k.op === 'score')).toBe(true);
    expect(roundTrip(d)).toBeNull();
  });
});
