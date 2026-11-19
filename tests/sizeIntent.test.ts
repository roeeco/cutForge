// Milestone 93 (DIELINE_DNA_PLAN.md D5a): a box's sizes stated outside, inside or crease to crease.
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { MATERIALS } from '../src/model/materials';
import { addDividerLine, addRootPanel, addTray, autoConnect, createDesign, setMaterial, solve } from '../src/model/ops';
import { boxSize, outsideFor, setBoxSize, type SizeAs } from '../src/model/boxSize';
import { clearSpans } from '../src/model/measure';
import { boxRecipe } from '../src/easy/recipes';
import { applySize } from '../src/model/sizes';
import { checkDesign } from '../src/model/check';
import { dividersOn } from '../src/model/dividers';
import type { Design } from '../src/model/types';

const [CARD, CORR16, CORR4, PLY] = MATERIALS;
function openBox(m: (typeof MATERIALS)[number]) {
  const d = createDesign(m);
  const base = addRootPanel(d, 0, 0, 120, 80);
  const tray = addTray(d, base, 50)!;
  autoConnect(d);
  solve(d);
  return { d, tray, base };
}

describe.each([CARD, CORR16, CORR4, PLY])('a box in $id', (m) => {
  it('inside sizes are the clear space between the walls', () => {
    const { d, tray, base } = openBox(m);
    const s = boxSize(d, tray, 'inside')!;
    const c = clearSpans(d, base)!;
    expect(s.w).toBeCloseTo(c.x[0], 6);
    expect(s.d).toBeCloseTo(c.y[0], 6);
    expect(s.h).toBeCloseTo(50 - m.thickness, 6);
  });

  it.each(['outside', 'inside', 'crease'] as SizeAs[])('%s round-trips', (as) => {
    const { d, tray } = openBox(m);
    const after = produce(d, (x) => void setBoxSize(x, tray, { w: 90, d: 70, h: 40 }, as));
    const s = boxSize(after, tray, as)!;
    expect(s.w).toBeCloseTo(90, 6);
    expect(s.d).toBeCloseTo(70, 6);
    expect(s.h).toBeCloseTo(40, 6);
    expect(outsideFor(after, tray, s, as).w).toBeCloseTo(after.panels[after.trays[tray].baseId].w, 6);
  });
});

describe('a change of board keeps the stated size', () => {
  it('inside: card 0.5 to corrugated 4 keeps the inside; the outside grows by twice the difference', () => {
    const { d, tray, base } = openBox(CARD);
    const stated = produce(d, (x) => void (x.sizeAs = 'inside'));
    const before = boxSize(stated, tray, 'inside')!;
    const after = produce(stated, (x) => void setMaterial(x, CORR4));
    const s = boxSize(after, tray, 'inside')!;
    expect(s.w).toBeCloseTo(before.w, 6);
    expect(s.d).toBeCloseTo(before.d, 6);
    expect(s.h).toBeCloseTo(before.h, 6);
    expect(after.panels[base].w - d.panels[base].w).toBeCloseTo(2 * (4 - 0.5), 6);
  });

  it('outside: only the thickness changes', () => {
    const { d, tray, base } = openBox(CARD);
    const after = produce(d, (x) => void setMaterial(x, CORR4));
    expect(after.panels[base].w).toBe(d.panels[base].w);
    expect(after.trays[tray].height).toBe(d.trays[tray].height);
  });

  it('crease to crease keeps the creases', () => {
    const { d, tray } = openBox(CARD);
    const stated = produce(d, (x) => void (x.sizeAs = 'crease'));
    const before = boxSize(stated, tray, 'crease')!;
    const after = produce(stated, (x) => void setMaterial(x, CORR16));
    expect(boxSize(after, tray, 'crease')!.w).toBeCloseTo(before.w, 6);
  });
});

describe('cartons, sleeves and dividers', () => {
  it('a carton (open base, bottom flaps, tuck top) loses a thickness under and over its inside', () => {
    const d = createDesign(CARD);
    const r = boxRecipe(d, { kind: 'rect', x0: 0, z0: 0, x1: 100, z1: 60 } as never, 40, 'carton')!;
    const tray = Object.values(d.trays).find((t) => t.baseId === r.baseId)!;
    expect(tray.base).toBe('open');
    const s = boxSize(d, tray.id, 'inside')!;
    expect(s.h).toBeCloseTo(40 - (tray.bottom ? 0.5 : 0) - (tray.top ? 0.5 : 0), 6);
  });

  it('a divider keeps its distance from the left side when the box gets wider', () => {
    const { d, tray, base } = openBox(PLY);
    const with1 = produce(d, (x) => void addDividerLine(x, base, { x: 40, y: 5 }, { x: 40, y: 75 }, 30));
    const div = dividersOn(with1, base)[0];
    expect(div).toBeTruthy();
    const at0 = with1.panels[div].divider!.at.x;
    const wider = produce(with1, (x) => void setBoxSize(x, tray, { w: 150 }, 'inside'));
    expect(wider.panels[div].divider!.at.x).toBeCloseTo(at0, 6);
  });

  it("milestone 88's size rows are read in the design's intent", () => {
    const { d, tray } = openBox(PLY);
    const stated = produce(d, (x) => void (x.sizeAs = 'inside'));
    const sized = applySize(stated, { id: 's', name: 'S', w: 100, d: 60, h: 30 });
    const s = boxSize(sized, tray, 'inside')!;
    expect(s.w).toBeCloseTo(100, 6);
    expect(s.d).toBeCloseTo(60, 6);
    expect(s.h).toBeCloseTo(30, 6);
  });

  it('a file with a bad intent opens as outside', () => {
    const { d } = openBox(PLY);
    const raw = JSON.parse(JSON.stringify({ ...d, sizeAs: 'sideways' })) as Design;
    checkDesign(raw);
    expect(raw.sizeAs).toBeUndefined();
    const good = JSON.parse(JSON.stringify({ ...d, sizeAs: 'inside' })) as Design;
    checkDesign(good);
    expect(good.sizeAs).toBe('inside');
  });
});
