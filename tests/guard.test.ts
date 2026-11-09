// Quick build's guardrails and one-click fixes (milestone 39).
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FONTS, registerFont } from '../src/text/fonts';
import { addDetail, addRootPanel, addText, autoConnect, createDesign, setMaterial, solve } from '../src/model/ops';
import { MATERIALS, minWeb } from '../src/model/materials';
import { validate, type Issue } from '../src/model/validate';
import { minTextSize, quickGuard, shapeAllowed } from '../src/easy/guard';
import { blocking, canFix, fixIssue } from '../src/easy/fix';
import { boxRecipe } from '../src/easy/recipes';
import { pieceKeyOf } from '../src/model/pieces';
import type { Design } from '../src/model/types';

beforeAll(() => {
  const buf = (f: string) => {
    const b = readFileSync(`public/fonts/${f}`);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  };
  for (const f of FONTS) registerFont(f.id, buf(`${f.file}-hebrew-400-normal.woff`), buf(`${f.file}-latin-400-normal.woff`));
});

const PLY = MATERIALS.find((m) => m.id === 'ply-3')!;
const ply = () => {
  const d = createDesign();
  setMaterial(d, PLY);
  return d;
};
const clone = (d: Design): Design => JSON.parse(JSON.stringify(d));
/** One edit as Quick build makes it. */
function quick(d: Design, fn: (x: Design) => void) {
  const base = clone(d);
  fn(d);
  return quickGuard(base, d);
}
const det = (d: Design, id: string) => d.order.flatMap((p) => d.panels[p].details).find((x) => x.id === id)!;
const MIN = minWeb(PLY);

describe('keep-out zones during edits', () => {
  it('a circle dragged toward the edge stops a web away from it, and says why', () => {
    const d = ply();
    const p = addRootPanel(d, 0, 0, 100, 60);
    const id = addDetail(d, p, 'circle', 'cut', 50, 30, 10, 10)!;
    const note = quick(d, (x) => void (det(x, id).cx = 130));
    expect(det(d, id).cx).toBeCloseTo(100 - MIN - 5, 2);
    expect(note).toMatchObject({ detailId: id, why: 'edge' });
    expect(shapeAllowed(d, id)).toBe(true);
    expect(validate(d).filter(blocking)).toEqual([]);
  });

  it('on a box base, a hole stops short of the finger joints', () => {
    const d = ply();
    const base = boxRecipe(d, { kind: 'rect', x0: 0, z0: 0, x1: 120, z1: 90 }, 40)!.baseId;
    solve(d);
    const id = addDetail(d, base, 'rect', 'cut', 60, 45, 20, 10)!;
    const note = quick(d, (x) => void (det(x, id).cy = 8));
    expect(det(d, id).cy).toBeGreaterThan(5 + MIN);
    expect(note?.why).toBe('joint');
    expect(validate(d).filter(blocking)).toEqual([]);
  });

  it('a group keeps its formation when one of it reaches the edge', () => {
    const d = ply();
    const p = addRootPanel(d, 0, 0, 100, 60);
    const a = addDetail(d, p, 'circle', 'cut', 30, 30, 10, 10)!, b = addDetail(d, p, 'circle', 'cut', 50, 30, 10, 10)!;
    quick(d, (x) => {
      det(x, a).cx += 60;
      det(x, b).cx += 60;
    });
    expect(det(d, b).cx - det(d, a).cx).toBeCloseTo(20, 6);
    expect(det(d, b).cx).toBeCloseTo(100 - MIN - 5, 2);
  });

  it('cut-outs keep apart; an engraving may come close to the edge', () => {
    const d = ply();
    const p = addRootPanel(d, 0, 0, 100, 60);
    const a = addDetail(d, p, 'circle', 'cut', 30, 30, 10, 10)!, b = addDetail(d, p, 'circle', 'cut', 60, 30, 10, 10)!;
    const note = quick(d, (x) => void (det(x, b).cx = 30));
    expect(note?.why).toBe('shape');
    expect(det(d, b).cx - det(d, a).cx).toBeGreaterThanOrEqual(10 + MIN - 1e-3);
    const e = addDetail(d, p, 'rect', 'engrave', 50, 50, 10, 6)!;
    quick(d, (x) => void (det(x, e).cy = 56));
    expect(det(d, e).cy).toBeGreaterThan(55);
  });

  it('a new shape across the edge is shrunk to fit; one outside the panel is not made', () => {
    const d = ply();
    const p = addRootPanel(d, 0, 0, 100, 60);
    let id = '';
    quick(d, (x) => void (id = addDetail(x, p, 'rect', 'cut', 95, 30, 20, 20)!));
    expect(det(d, id).w).toBeLessThan(20);
    expect(shapeAllowed(d, id)).toBe(true);
    quick(d, (x) => void addDetail(x, p, 'rect', 'cut', 140, 30, 20, 20));
    expect(d.panels[p].details).toHaveLength(1);
  });

  it('text keeps a readable size', () => {
    const d = ply();
    const p = addRootPanel(d, 0, 0, 100, 60);
    let id = '';
    const note = quick(d, (x) => void (id = addText(x, p, 50, 30, 'Hi', 'engrave', 'rubik', 1.5)!));
    expect(det(d, id).text!.size).toBe(minTextSize(d, p, 'engrave'));
    expect(note?.why).toBe('text');
  });

  it('Workshop edits are not guarded (the editor only guards in Quick build)', () => {
    // guardEdit is only called by the store in Quick build; the unguarded edit stays as made
    const d = ply();
    const p = addRootPanel(d, 0, 0, 100, 60);
    const id = addDetail(d, p, 'circle', 'cut', 98, 30, 10, 10)!;
    expect(shapeAllowed(d, id)).toBe(false);
  });
});

describe('one-click fixes', () => {
  const sig = (i: Issue) => `${i.key}|${i.target.kind}|${i.target.id}`;
  /** Fix the first issue with this key: it is gone and every other issue is unchanged. */
  function fixes(d: Design, key: string) {
    const before = validate(d);
    const i = before.find((x) => x.key === key)!;
    expect(i, key).toBeTruthy();
    expect(canFix(i)).toBe(true);
    expect(fixIssue(d, i)).toBe(true);
    solve(d);
    autoConnect(d);
    const after = validate(d).map(sig);
    expect(after).not.toContain(sig(i));
    // nothing new; issues about the same part may go with it (a panel shrunk to the sheet also fits on it)
    const was = before.map(sig);
    expect(after.filter((x) => !was.includes(x))).toEqual([]);
    expect(before.filter((x) => sig(x) !== sig(i) && !after.includes(sig(x)) && x.target.id !== i.target.id).map(sig)).toEqual([]);
  }
  it('a shape outside the panel or too near its edge moves inside', () => {
    const d = ply();
    const p = addRootPanel(d, 0, 0, 100, 60);
    addDetail(d, p, 'circle', 'cut', 106, 30, 10, 10);
    addDetail(d, p, 'rect', 'cut', 20, 2.5, 10, 2);
    solve(d);
    fixes(d, 'val.holeOutside');
    fixes(d, 'val.tooThin');
  });
  it('overlapping cut-outs are moved apart', () => {
    const d = ply();
    const p = addRootPanel(d, 0, 0, 100, 60);
    addDetail(d, p, 'circle', 'cut', 40, 30, 16, 16);
    addDetail(d, p, 'circle', 'cut', 48, 30, 16, 16);
    solve(d);
    fixes(d, 'val.shapesOverlap');
  });
  it('cut-out text with closed middles is engraved instead', () => {
    const d = ply();
    const p = addRootPanel(d, 0, 0, 120, 60);
    addText(d, p, 60, 30, 'ABO', 'cut', 'rubik', 16);
    solve(d);
    fixes(d, 'val.stencil');
  });
  it('a panel bigger than the sheet is shrunk to it', () => {
    const d = ply();
    addRootPanel(d, 0, 0, PLY.sheetW + 50, 100);
    solve(d);
    fixes(d, 'val.tooBig');
  });
  it('a piece moved off its sheet is packed again', () => {
    const d = ply();
    const p = addRootPanel(d, 0, 0, 100, 60);
    solve(d);
    d.placements[`${pieceKeyOf(d, p)}#0`] = { sheet: 0, x: -40, y: 10, rot: 0, manual: true };
    fixes(d, 'val.offSheet');
  });
});
