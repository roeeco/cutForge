// The templates fuzzer, given the sentence builder's box (milestone 95) with free parameters, reported
// "oversized piece not reported" and "contour count changed (nominal / compensated)". Neither was an engine
// bug, and both are reachable by hand in Workshop (a rounded rectangle and Add tray, on corrugated 1.6):
// - a base that fits the sheet only turned against the flutes IS reported, as val.tooBigGrain (BUGFIX_PLAN
//   B15), but the fuzzer's pipeline check counted only val.tooBig and val.offSheet;
// - a piece with kiss-scored bends is cut inside up with a THIS SIDE UP note on the guide layer
//   (milestone 66), so its sheet holds more contours than the piece; the check expected exactly the piece's.
// The check (tests/fuzz/pipecheck.ts) now accepts val.tooBigGrain and allows that note, and only that note,
// on a kiss-scored piece; validate and prepareExport are unchanged.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadFonts } from '../fuzz/gen';
import { checkPipeline, type Fail } from '../fuzz/pipecheck';
import { MATERIALS } from '../../src/model/materials';
import { addRoundedRect, addTray, autoConnect, createDesign } from '../../src/model/ops';
import { validate } from '../../src/model/validate';
import { pieceCopies } from '../../src/model/pack';
import { kissPanels, prepareExport } from '../../src/export/prepare';
import type { Design } from '../../src/model/types';

beforeAll(loadFonts);

const CORR16 = MATERIALS.find((m) => m.id === 'corr-1.6')!; // sheet 600 x 400, flutes along y, allowRotate off

function roundedTray(w: number, h: number, r: number, height: number): { d: Design; base: string } {
  const d = createDesign(CORR16);
  const base = addRoundedRect(d, 0, 0, w, h, r)!;
  addTray(d, base, height);
  autoConnect(d);
  return { d, base };
}

function pipelineFails(d: Design): string[] {
  const fails: Fail[] = [];
  checkPipeline(d, 0, [], fails, {});
  return fails.map((f) => `${f.cls}: ${f.msg.split('\n')[0]}`);
}

describe('repro: fuzz check on a rounded corrugated tray', () => {
  it('a base that fits only turned against the flutes is reported as val.tooBigGrain, and the check accepts it', () => {
    const { d, base } = roundedTray(321.3, 580, 40, 43.1);
    const copy = pieceCopies(d).find((c) => c.pieceKey === base)!;
    // 580 > 400 - 2 * 5, but turned: 580 <= 590 and 321.3 <= 390
    expect(copy.h).toBeGreaterThan(CORR16.sheetH - 2 * d.sheetMargin);
    expect(copy.h).toBeLessThanOrEqual(CORR16.sheetW - 2 * d.sheetMargin);
    expect(validate(d).filter((i) => i.key === 'val.tooBigGrain').map((i) => i.target.id)).toEqual([base]);
    expect(pipelineFails(d)).toEqual([]);
  });

  it('a kiss-scored piece carries its THIS SIDE UP note: the sheet holds its contours plus guide-layer text, and the check accepts it', () => {
    const { d } = roundedTray(140, 100, 14, 45);
    const kissed = kissPanels(d);
    expect(kissed.size).toBeGreaterThan(0);
    const copies = pieceCopies(d);
    const own = copies.reduce((s, c) => s + c.contours.length, 0);
    for (const mode of ['nominal', 'compensated'] as const) {
      const sheets = prepareExport(d, mode).sheets;
      const all = sheets.flatMap((s) => s.contours);
      expect(all.length).toBeGreaterThan(own);
      for (const c of copies) {
        const mine = all.filter((x) => x.ref?.pieceKey === c.key);
        const extra = mine.slice(c.contours.length);
        if (c.panels.some((n) => kissed.has(n.panelId))) {
          expect(extra.length).toBeGreaterThan(0);
          expect(extra.every((x) => x.op === 'guide' && !x.ref?.panelId)).toBe(true);
        } else expect(extra).toEqual([]);
      }
    }
    expect(pipelineFails(d)).toEqual([]);
  });

  it('both at once (the fuzzer case: a large rounded tray on corrugated 1.6)', () => {
    const { d } = roundedTray(321.3, 580, 14, 43.1);
    expect(kissPanels(d).size).toBeGreaterThan(0);
    expect(validate(d).some((i) => i.key === 'val.tooBigGrain')).toBe(true);
    expect(pipelineFails(d)).toEqual([]);
  });
});
