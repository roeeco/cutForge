// Splitting nets into pieces (milestone 69, PACKAGING_PLAN.md §9.1).
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/model/materials';
import { addRootPanel, addTray, applySavePlan, autoConnect, createDesign, setAllJoints, solve } from '../src/model/ops';
import { boxPlan, joints, measureYield, planSaveMaterial } from '../src/model/split';
import { pieceCopies, quantityRoot } from '../src/model/pack';
import { buildPieces, pieceKeyOf } from '../src/model/pieces';
import { validate } from '../src/model/validate';
import type { Design } from '../src/model/types';
import { idempotence, roundTrip } from './harness';
import { roundedTray } from './goldenDesigns';

const CARD = MATERIALS[0]; // 500 x 300 sheet, 5 mm margin

/** Every piece fits inside its sheet's margin (turned where the grain allows). */
function allFit(d: Design): boolean {
  return pieceCopies(d).every((c) => {
    const W = d.material.sheetW - 2 * d.sheetMargin, H = d.material.sheetH - 2 * d.sheetMargin;
    const turn = d.material.grain === 'none' || !!d.allowRotate;
    return (c.w <= W + 1e-6 && c.h <= H + 1e-6) || (turn && c.h <= W + 1e-6 && c.w <= H + 1e-6);
  });
}

function bigTray() {
  const d = createDesign(CARD);
  const b = addRootPanel(d, 0, 0, 200, 180);
  const t = addTray(d, b, 55)!;
  return { d, b, t };
}

describe('splitting when it must', () => {
  it('a card tray net taller than the sheet is cut at a fold into pieces that fit', () => {
    const { d } = bigTray();
    expect(buildPieces(d).length).toBeGreaterThan(1);
    expect(allFit(d)).toBe(true);
    const cut = Object.values(d.connections).filter((c) => c.autoCut);
    expect(cut.length).toBeGreaterThan(0);
    for (const c of cut) {
      expect(c.split).toBe(true);
      expect(c.kind).not.toBe('fold');
    }
    expect(validate(d).some((i) => i.key === 'val.tooBig')).toBe(false);
  });

  it('a tray that fits is not cut', () => {
    const d = createDesign(CARD);
    const b = addRootPanel(d, 0, 0, 100, 80);
    addTray(d, b, 40);
    expect(buildPieces(d)).toHaveLength(1);
    expect(Object.values(d.connections).some((c) => c.autoCut || c.split)).toBe(false);
  });

  it('never: the net stays whole and is reported too big', () => {
    const { d } = bigTray();
    d.split = 'never';
    solve(d);
    expect(buildPieces(d)).toHaveLength(1);
    expect(Object.values(d.connections).some((c) => c.autoCut || c.split)).toBe(false);
    expect(validate(d).some((i) => i.key === 'val.tooBig' || i.key === 'val.tooBigGrain')).toBe(true);
  });

  it('a cut the app made goes once the net fits whole again', () => {
    const { d, t } = bigTray();
    d.trays[t].height = 30;
    solve(d);
    expect(buildPieces(d)).toHaveLength(1);
    expect(Object.values(d.connections).some((c) => c.autoCut || c.split)).toBe(false);
  });

  it('pins are obeyed: kept folds are never cut, a cut fold is cut whatever the size', () => {
    const { d } = bigTray();
    const first = Object.values(d.connections).filter((c) => c.autoCut).map((c) => c.id);
    for (const id of first) d.connections[id].cut = 'keep';
    solve(d);
    for (const id of first) expect(d.connections[id].split).toBeUndefined();
    expect(allFit(d)).toBe(true);
    // a small tray with one fold pinned to cut
    const s = createDesign(CARD);
    const b = addRootPanel(s, 0, 0, 100, 80);
    addTray(s, b, 40);
    const wall = Object.values(s.connections).find((c) => c.grown && c.kind === 'fold')!;
    wall.cut = 'cut';
    solve(s);
    expect(s.connections[wall.id].split).toBe(true);
    expect(s.connections[wall.id].kind).toBe('glue');
    expect(buildPieces(s)).toHaveLength(2);
    // the part cut off keeps the net's number of copies
    s.pieces[b] = { ...(s.pieces[b] ?? {}), quantity: 3 } as Design['pieces'][string];
    expect(pieceCopies(s)).toHaveLength(6);
  });

  it('split designs solve to themselves and save and reopen', () => {
    const { d } = bigTray();
    expect(idempotence(d)).toBeNull();
    expect(roundTrip(d)).toBeNull();
  });
});

describe('Save material', () => {
  function classSet() {
    const d = createDesign(CARD);
    const b = addRootPanel(d, 0, 0, 60, 60);
    addTray(d, b, 50);
    d.pieces[b].quantity = 4;
    solve(d);
    return d;
  }

  it('finds the cuts that take fewer sheets, and the gain it reports is the one measured once applied', () => {
    const d = classSet();
    const before = measureYield(d, boxPlan);
    expect(before.sheets).toBe(2);
    const plan = planSaveMaterial(d, solve, (x) => measureYield(x, boxPlan))!;
    expect(plan).not.toBeNull();
    expect(plan.before).toEqual(before);
    expect(plan.after.sheets).toBeLessThan(plan.before.sheets);
    expect(plan.after.pieces).toBeGreaterThan(plan.before.pieces);
    expect(plan.after.glue).toBeGreaterThan(plan.before.glue);
    applySavePlan(d, plan.cuts);
    expect(measureYield(d, boxPlan)).toEqual(plan.after);
    for (const id of plan.cuts) expect(d.connections[id].cut).toBe('cut');
    expect(idempotence(d)).toBeNull();
  });

  it('nothing to save: no plan', () => {
    // no folds to cut
    const d = createDesign(CARD);
    addRootPanel(d, 0, 0, 100, 80);
    expect(planSaveMaterial(d, solve, (x) => measureYield(x, boxPlan))).toBeNull();
    // a shallow tray: its walls cut off take less of its sheet (the band its pieces fill)
    const s = createDesign(CARD);
    addTray(s, addRootPanel(s, 0, 0, 100, 80), 30);
    const p = planSaveMaterial(s, solve, (x) => measureYield(x, boxPlan))!;
    expect(p.after.sheets).toBe(1);
    expect(p.after.area).toBeLessThan(p.before.area);
  });

  it('kept folds are never in the plan', () => {
    const d = classSet();
    for (const c of Object.values(d.connections)) if (c.grown && c.kind === 'fold') c.cut = 'keep';
    solve(d);
    expect(planSaveMaterial(d, solve, (x) => measureYield(x, boxPlan))).toBeNull();
  });
});

describe('glue joints in the yield report', () => {
  const tray = (m: (typeof MATERIALS)[number]) => {
    const d = createDesign(m);
    const base = addRootPanel(d, 0, 0, 120, 80);
    addTray(d, base, 50);
    autoConnect(d);
    return { d, base };
  };
  it('counts joints held by glue, once per copy: not finger joints, not slit locks; glued rounded corners do count', () => {
    // plywood fingers hold without glue (it said 4)
    expect(joints(tray(MATERIALS[3]).d)).toBe(0);
    // card corners: four glue flaps
    const card = tray(MATERIALS[0]);
    expect(joints(card.d)).toBe(4);
    // three copies cut: twelve joints to glue (it said 4)
    card.d.pieces[quantityRoot(card.d, pieceKeyOf(card.d, card.base))] = { quantity: 3 };
    expect(joints(card.d)).toBe(12);
    // slit locks: no glue (it said 4)
    const lock = tray(MATERIALS[0]);
    setAllJoints(lock.d, 'corner', 'lock');
    autoConnect(lock.d);
    expect(joints(lock.d)).toBe(0);
    // a card tray on a rounded rectangle: its corners glued with a lip (it said 0)
    expect(joints(roundedTray(MATERIALS[0], 15))).toBe(4);
  });
});
